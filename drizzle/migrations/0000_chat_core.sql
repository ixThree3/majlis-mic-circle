
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  is_guest boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT 'gold',
  status text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX profiles_member_username_unique ON public.profiles (lower(username)) WHERE NOT is_guest;

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- prevent changing username / guest flag from client
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.username := OLD.username;
  NEW.is_guest := OLD.is_guest;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.status := left(coalesce(NEW.status, ''), 80);
  IF NEW.color NOT IN ('gold','coral','teal','sky','rose','lime','violet','pearl') THEN
    NEW.color := OLD.color;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_protect BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text := btrim(coalesce(NEW.raw_user_meta_data->>'username', ''));
  _guest boolean := coalesce(NEW.is_anonymous, false);
  _colors text[] := ARRAY['gold','coral','teal','sky','rose','lime','violet','pearl'];
BEGIN
  IF char_length(_name) < 2 OR char_length(_name) > 20 THEN
    RAISE EXCEPTION 'USERNAME_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE NOT p.is_guest AND lower(p.username) = lower(_name)) THEN
    RAISE EXCEPTION 'USERNAME_TAKEN';
  END IF;
  INSERT INTO public.profiles (id, username, is_guest, color)
  VALUES (NEW.id, _name, _guest, _colors[1 + floor(random() * 8)::int]);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROOMS
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.rooms TO authenticated;
GRANT SELECT ON public.rooms TO anon;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rooms are viewable by everyone" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Members create rooms" ON public.rooms FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND char_length(btrim(name)) BETWEEN 2 AND 30
    AND char_length(description) <= 120
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND NOT p.is_guest)
  );

INSERT INTO public.rooms (name, description) VALUES
  ('الغرفة العامة', 'الغرفة الرئيسية للجميع — حياكم الله'),
  ('سوالف الخليج', 'سوالف وطرب وضحك'),
  ('ركن الشعر', 'قصيد ونبط وخواطر');

-- ROOM MESSAGES
CREATE TABLE public.room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_messages_room_created ON public.room_messages (room_id, created_at DESC);
GRANT SELECT, INSERT ON public.room_messages TO authenticated;
GRANT ALL ON public.room_messages TO service_role;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in read room messages" ON public.room_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Post own room messages" ON public.room_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND char_length(btrim(body)) BETWEEN 1 AND 500);

-- PRIVATE MESSAGES
CREATE TABLE public.private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX private_messages_pair ON public.private_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX private_messages_recipient ON public.private_messages (recipient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.private_messages TO authenticated;
GRANT ALL ON public.private_messages TO service_role;
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read private messages" ON public.private_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Send own private messages" ON public.private_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND recipient_id <> auth.uid() AND char_length(btrim(body)) BETWEEN 1 AND 1000);
CREATE POLICY "Recipient marks read" ON public.private_messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.protect_private_message()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.body := OLD.body; NEW.sender_id := OLD.sender_id; NEW.recipient_id := OLD.recipient_id; NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
CREATE TRIGGER private_messages_protect BEFORE UPDATE ON public.private_messages FOR EACH ROW EXECUTE FUNCTION public.protect_private_message();

-- MIC SEATS
CREATE TABLE public.mic_seats (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  seat smallint NOT NULL CHECK (seat BETWEEN 1 AND 5),
  user_id uuid,
  muted boolean NOT NULL DEFAULT false,
  last_seen timestamptz,
  PRIMARY KEY (room_id, seat)
);
GRANT SELECT ON public.mic_seats TO authenticated;
GRANT ALL ON public.mic_seats TO service_role;
ALTER TABLE public.mic_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in read mic seats" ON public.mic_seats FOR SELECT TO authenticated USING (true);

INSERT INTO public.mic_seats (room_id, seat) SELECT r.id, s FROM public.rooms r CROSS JOIN generate_series(1,5) s;

CREATE OR REPLACE FUNCTION public.create_room_seats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.mic_seats (room_id, seat) SELECT NEW.id, s FROM generate_series(1,5) s;
  RETURN NEW;
END $$;
CREATE TRIGGER rooms_create_seats AFTER INSERT ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.create_room_seats();

-- seat is considered free if its holder stopped sending heartbeats for 45s
CREATE OR REPLACE FUNCTION public.take_mic(_room uuid, _seat smallint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_SIGNED_IN'; END IF;
  -- leave any other seat first
  UPDATE public.mic_seats SET user_id = NULL, muted = false, last_seen = NULL
    WHERE user_id = _uid AND NOT (room_id = _room AND seat = _seat);
  UPDATE public.mic_seats SET user_id = _uid, muted = false, last_seen = now()
    WHERE room_id = _room AND seat = _seat
      AND (user_id IS NULL OR user_id = _uid OR last_seen < now() - interval '45 seconds');
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.leave_mic(_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.mic_seats SET user_id = NULL, muted = false, last_seen = NULL
    WHERE room_id = _room AND user_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.mic_heartbeat(_room uuid, _muted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.mic_seats SET last_seen = now(), muted = _muted
    WHERE room_id = _room AND user_id = auth.uid();
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.take_mic(uuid, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_mic(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mic_heartbeat(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_mic(uuid, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_mic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mic_heartbeat(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_room_seats() FROM PUBLIC, anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.private_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mic_seats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
