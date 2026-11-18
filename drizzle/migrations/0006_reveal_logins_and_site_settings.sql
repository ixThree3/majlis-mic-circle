CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  device text NOT NULL DEFAULT '',
  os text NOT NULL DEFAULT '',
  browser text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_events_user_created ON public.login_events (user_id, created_at DESC);
CREATE INDEX login_events_ip ON public.login_events (ip);
CREATE INDEX login_events_created ON public.login_events (created_at DESC);
GRANT SELECT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Revealers read sign-in records" ON public.login_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'reveal_users'));

CREATE TABLE public.site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  announcement text NOT NULL DEFAULT '',
  guests_enabled boolean NOT NULL DEFAULT true,
  signups_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.site_settings (id) VALUES (true);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads site settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;

CREATE OR REPLACE FUNCTION public.admin_update_settings(_announcement text, _guests boolean, _signups boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.rank_level(auth.uid()) < 1000 OR public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.site_settings SET announcement = left(coalesce(_announcement, ''), 300), guests_enabled = _guests, signups_enabled = _signups, updated_at = now() WHERE id;
  PERFORM public.log_admin('settings', NULL, '');
END $$;

CREATE OR REPLACE FUNCTION public.admin_clear_room(_room uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer; _name text;
BEGIN
  IF public.rank_level(auth.uid()) < 1000 OR public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT name INTO _name FROM public.rooms WHERE id = _room;
  DELETE FROM public.room_messages WHERE room_id = _room;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM public.log_admin('room_clear', NULL, coalesce(_name, '') || ' (' || _n || ')');
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.admin_update_settings(text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clear_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_settings(text, boolean, boolean), public.admin_clear_room(uuid) TO authenticated;

-- registration / guest switches
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text := btrim(coalesce(NEW.raw_user_meta_data->>'username', ''));
  _guest boolean := coalesce(NEW.is_anonymous, false);
  _colors text[] := ARRAY['gold','coral','teal','sky','rose','lime','violet','pearl'];
  _s public.site_settings;
BEGIN
  SELECT * INTO _s FROM public.site_settings WHERE id;
  IF _guest AND _s.guests_enabled IS FALSE THEN RAISE EXCEPTION 'GUESTS_DISABLED'; END IF;
  IF NOT _guest AND _s.signups_enabled IS FALSE
     AND coalesce((NEW.raw_app_meta_data->>'staff_created')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SIGNUPS_DISABLED';
  END IF;
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

-- ranks may now carry the reveal permission
CREATE OR REPLACE FUNCTION public.admin_save_rank(_id uuid, _name text, _color text, _icon text, _level integer, _permissions text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _my integer := public.rank_level(auth.uid());
  _old public.ranks;
  _new uuid;
  _all text[] := ARRAY['manage_ranks','manage_members','ban_users','moderate_mics','delete_messages','manage_rooms','view_log','reveal_users'];
BEGIN
  IF NOT public.has_permission(_me, 'manage_ranks') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _name := btrim(coalesce(_name, ''));
  IF char_length(_name) < 2 OR char_length(_name) > 24 THEN RAISE EXCEPTION 'RANK_NAME_INVALID'; END IF;
  IF _color NOT IN ('gold','coral','teal','sky','rose','lime','violet','pearl') THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF _icon NOT IN ('crown','shield','star','gem','flame','award','sparkles','heart','zap','badge') THEN RAISE EXCEPTION 'INVALID'; END IF;
  _permissions := coalesce(_permissions, '{}');
  IF _id IS NOT NULL THEN
    SELECT * INTO _old FROM public.ranks WHERE id = _id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF _old.is_owner THEN
      IF _my < 1000 THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
      UPDATE public.ranks SET name = _name, color = _color, icon = _icon WHERE id = _id;
      PERFORM public.log_admin('rank_edit', NULL, _name);
      RETURN _id;
    END IF;
    IF _old.level >= _my THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  IF _level IS NULL OR _level < 1 OR _level > 999 OR _level >= _my THEN RAISE EXCEPTION 'RANK_LEVEL_INVALID'; END IF;
  IF NOT (_permissions <@ _all) THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_permissions) p WHERE NOT public.has_permission(_me, p)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.ranks (name, color, icon, level, permissions) VALUES (_name, _color, _icon, _level, _permissions) RETURNING id INTO _new;
    PERFORM public.log_admin('rank_create', NULL, _name);
    RETURN _new;
  END IF;
  UPDATE public.ranks SET name = _name, color = _color, icon = _icon, level = _level, permissions = _permissions WHERE id = _id;
  PERFORM public.log_admin('rank_edit', NULL, _name);
  RETURN _id;
END $$;