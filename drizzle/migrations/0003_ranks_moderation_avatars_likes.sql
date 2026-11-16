-- ===== profile photo + likes =====
ALTER TABLE public.profiles ADD COLUMN avatar_path text;
ALTER TABLE public.profiles ADD COLUMN likes_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.mic_seats ADD COLUMN force_muted boolean NOT NULL DEFAULT false;

-- ===== ranks =====
CREATE TABLE public.ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'gold',
  icon text NOT NULL DEFAULT 'shield',
  level integer NOT NULL CHECK (level BETWEEN 1 AND 1000),
  permissions text[] NOT NULL DEFAULT '{}',
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ranks_single_owner ON public.ranks (is_owner) WHERE is_owner;
GRANT SELECT ON public.ranks TO authenticated;
GRANT ALL ON public.ranks TO service_role;
ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_ranks (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank_id uuid NOT NULL REFERENCES public.ranks(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
GRANT SELECT ON public.user_ranks TO authenticated;
GRANT ALL ON public.user_ranks TO service_role;
ALTER TABLE public.user_ranks ENABLE ROW LEVEL SECURITY;

-- ===== bans / silences =====
CREATE TABLE public.bans (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'ban' CHECK (kind IN ('ban', 'mute')),
  banned_by uuid,
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
GRANT SELECT ON public.bans TO authenticated;
GRANT ALL ON public.bans TO service_role;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;

-- ===== likes =====
CREATE TABLE public.profile_likes (
  liker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (liker_id, target_id)
);
GRANT SELECT ON public.profile_likes TO authenticated;
GRANT ALL ON public.profile_likes TO service_role;
ALTER TABLE public.profile_likes ENABLE ROW LEVEL SECURITY;

-- ===== staff activity log =====
CREATE TABLE public.admin_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  target_id uuid,
  target_name text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_log_created ON public.admin_log (created_at DESC);
GRANT SELECT ON public.admin_log TO authenticated;
GRANT ALL ON public.admin_log TO service_role;
ALTER TABLE public.admin_log ENABLE ROW LEVEL SECURITY;

-- ===== helper functions =====
CREATE OR REPLACE FUNCTION public.is_banned(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bans b WHERE b.user_id = _uid AND b.kind = 'ban' AND (b.expires_at IS NULL OR b.expires_at > now()))
$$;

CREATE OR REPLACE FUNCTION public.is_silenced(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bans b WHERE b.user_id = _uid AND (b.expires_at IS NULL OR b.expires_at > now()))
$$;

CREATE OR REPLACE FUNCTION public.rank_level(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT CASE WHEN r.is_owner THEN 1000 ELSE r.level END
    FROM public.user_ranks ur JOIN public.ranks r ON r.id = ur.rank_id
    WHERE ur.user_id = _uid AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ), 0)
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_uid uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND NOT public.is_banned(_uid) AND EXISTS (
    SELECT 1 FROM public.user_ranks ur JOIN public.ranks r ON r.id = ur.rank_id
    WHERE ur.user_id = _uid AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND (r.is_owner OR _perm = ANY (r.permissions))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_user(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _actor IS NOT NULL AND _target IS NOT NULL AND _actor <> _target
     AND public.rank_level(_actor) > public.rank_level(_target)
$$;

-- caller holds _perm and outranks _target (used by server-side staff actions)
CREATE OR REPLACE FUNCTION public.can_act_on(_target uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(auth.uid(), _perm) AND public.can_manage_user(auth.uid(), _target)
$$;

CREATE OR REPLACE FUNCTION public.is_chat_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
     AND NOT public.is_banned(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.can_post()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_chat_member() AND NOT public.is_silenced(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.log_admin(_action text, _target uuid, _details text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_log (actor_id, actor_name, action, target_id, target_name, details)
  VALUES (
    auth.uid(),
    coalesce((SELECT username FROM public.profiles WHERE id = auth.uid()), ''),
    _action, _target,
    coalesce((SELECT username FROM public.profiles WHERE id = _target), ''),
    left(coalesce(_details, ''), 300)
  );
END $$;

-- ===== profile field protection (clients may only edit status, colour and their own photo) =====
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.username := OLD.username;
    NEW.is_guest := OLD.is_guest;
    NEW.likes_count := OLD.likes_count;
    IF NEW.avatar_path IS DISTINCT FROM OLD.avatar_path AND NEW.avatar_path IS NOT NULL
       AND (OLD.is_guest OR NEW.avatar_path !~ ('^' || OLD.id::text || '/[A-Za-z0-9_-]{1,60}\.(webp|jpg|jpeg|png)$')) THEN
      NEW.avatar_path := OLD.avatar_path;
    END IF;
  END IF;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.status := left(coalesce(NEW.status, ''), 80);
  NEW.likes_count := greatest(NEW.likes_count, 0);
  IF NEW.color NOT IN ('gold','coral','teal','sky','rose','lime','violet','pearl') THEN
    NEW.color := OLD.color;
  END IF;
  RETURN NEW;
END $$;

-- ===== policies =====
CREATE POLICY "Chat members read ranks" ON public.ranks FOR SELECT TO authenticated USING (public.is_chat_member());
CREATE POLICY "Chat members read rank assignments" ON public.user_ranks FOR SELECT TO authenticated USING (public.is_chat_member());
CREATE POLICY "Own or moderators read bans" ON public.bans FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'ban_users'));
CREATE POLICY "Read own likes" ON public.profile_likes FOR SELECT TO authenticated USING (liker_id = auth.uid());
CREATE POLICY "Log readers read staff log" ON public.admin_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'view_log'));

CREATE POLICY "Banned or silenced cannot post room messages" ON public.room_messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_post());
CREATE POLICY "Banned or silenced cannot send private messages" ON public.private_messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_post());
CREATE POLICY "Banned users cannot create rooms" ON public.rooms AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_post());

-- ===== mic functions (ban/silence + force mute aware) =====
CREATE OR REPLACE FUNCTION public.take_mic(_room uuid, _seat smallint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_SIGNED_IN'; END IF;
  IF public.is_silenced(_uid) THEN RETURN false; END IF;
  UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL
    WHERE user_id = _uid AND NOT (room_id = _room AND seat = _seat);
  UPDATE public.mic_seats SET user_id = _uid, muted = false, force_muted = false, last_seen = now()
    WHERE room_id = _room AND seat = _seat
      AND (user_id IS NULL OR user_id = _uid OR last_seen < now() - interval '45 seconds');
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.leave_mic(_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL
    WHERE room_id = _room AND user_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.mic_heartbeat(_room uuid, _muted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_silenced(auth.uid()) THEN
    UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL WHERE user_id = auth.uid();
    RETURN false;
  END IF;
  UPDATE public.mic_seats SET last_seen = now(), muted = (_muted OR force_muted)
    WHERE room_id = _room AND user_id = auth.uid();
  RETURN FOUND;
END $$;

-- ===== likes =====
CREATE OR REPLACE FUNCTION public.toggle_like(_target uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _count integer;
BEGIN
  IF _me IS NULL OR _me = _target THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF NOT public.is_chat_member() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _me AND is_guest) THEN RAISE EXCEPTION 'GUESTS_CANNOT_LIKE'; END IF;
  DELETE FROM public.profile_likes WHERE liker_id = _me AND target_id = _target;
  IF FOUND THEN
    UPDATE public.profiles SET likes_count = greatest(likes_count - 1, 0) WHERE id = _target RETURNING likes_count INTO _count;
  ELSE
    INSERT INTO public.profile_likes (liker_id, target_id) VALUES (_me, _target);
    UPDATE public.profiles SET likes_count = likes_count + 1 WHERE id = _target RETURNING likes_count INTO _count;
  END IF;
  RETURN _count;
END $$;

-- ===== staff actions =====
CREATE OR REPLACE FUNCTION public.admin_save_rank(_id uuid, _name text, _color text, _icon text, _level integer, _permissions text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _my integer := public.rank_level(auth.uid());
  _old public.ranks;
  _new uuid;
  _all text[] := ARRAY['manage_ranks','manage_members','ban_users','moderate_mics','delete_messages','manage_rooms','view_log'];
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

CREATE OR REPLACE FUNCTION public.admin_delete_rank(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.ranks;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_ranks') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO _r FROM public.ranks WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  IF _r.is_owner OR _r.level >= public.rank_level(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.ranks WHERE id = _id;
  PERFORM public.log_admin('rank_delete', NULL, _r.name);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_rank(_user uuid, _rank uuid, _days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _lvl integer; _rname text;
BEGIN
  IF NOT public.has_permission(_me, 'manage_ranks') OR NOT public.can_manage_user(_me, _user) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _rank IS NULL THEN
    DELETE FROM public.user_ranks WHERE user_id = _user;
    PERFORM public.log_admin('rank_remove', _user, '');
    RETURN;
  END IF;
  SELECT CASE WHEN is_owner THEN 1000 ELSE level END, name INTO _lvl, _rname FROM public.ranks WHERE id = _rank;
  IF _lvl IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _lvl >= public.rank_level(_me) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND is_guest) THEN RAISE EXCEPTION 'GUEST'; END IF;
  IF _days IS NOT NULL AND (_days < 1 OR _days > 3650) THEN RAISE EXCEPTION 'INVALID'; END IF;
  INSERT INTO public.user_ranks (user_id, rank_id, assigned_by, expires_at)
  VALUES (_user, _rank, _me, CASE WHEN _days IS NULL THEN NULL ELSE now() + make_interval(days => _days) END)
  ON CONFLICT (user_id) DO UPDATE SET rank_id = EXCLUDED.rank_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now(), expires_at = EXCLUDED.expires_at;
  PERFORM public.log_admin('rank_assign', _user, _rname || CASE WHEN _days IS NULL THEN '' ELSE ' (' || _days || ' يوم)' END);
END $$;

CREATE OR REPLACE FUNCTION public.admin_ban(_user uuid, _kind text, _minutes integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(_me, 'ban_users') OR NOT public.can_manage_user(_me, _user) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _kind NOT IN ('ban', 'mute') THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF _minutes IS NOT NULL AND (_minutes < 1 OR _minutes > 5256000) THEN RAISE EXCEPTION 'INVALID'; END IF;
  INSERT INTO public.bans (user_id, kind, banned_by, reason, expires_at)
  VALUES (_user, _kind, _me, left(coalesce(_reason, ''), 200), CASE WHEN _minutes IS NULL THEN NULL ELSE now() + make_interval(mins => _minutes) END)
  ON CONFLICT (user_id, kind) DO UPDATE SET banned_by = EXCLUDED.banned_by, reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, created_at = now();
  UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL WHERE user_id = _user;
  PERFORM public.log_admin(CASE WHEN _kind = 'ban' THEN 'ban' ELSE 'silence' END, _user,
    CASE WHEN _minutes IS NULL THEN 'دائم' ELSE _minutes || ' دقيقة' END || CASE WHEN coalesce(_reason, '') = '' THEN '' ELSE ' — ' || _reason END);
END $$;

CREATE OR REPLACE FUNCTION public.admin_unban(_user uuid, _kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'ban_users') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.bans WHERE user_id = _user AND kind = _kind;
  PERFORM public.log_admin(CASE WHEN _kind = 'ban' THEN 'unban' ELSE 'unsilence' END, _user, '');
END $$;

CREATE OR REPLACE FUNCTION public.admin_mic_kick(_room uuid, _seat smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _holder uuid;
BEGIN
  IF NOT public.has_permission(_me, 'moderate_mics') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT user_id INTO _holder FROM public.mic_seats WHERE room_id = _room AND seat = _seat;
  IF _holder IS NULL THEN RETURN; END IF;
  IF _holder <> _me AND NOT public.can_manage_user(_me, _holder) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL WHERE room_id = _room AND seat = _seat;
  PERFORM public.log_admin('mic_kick', _holder, '');
END $$;

CREATE OR REPLACE FUNCTION public.admin_mic_mute(_room uuid, _seat smallint, _muted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _holder uuid;
BEGIN
  IF NOT public.has_permission(_me, 'moderate_mics') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT user_id INTO _holder FROM public.mic_seats WHERE room_id = _room AND seat = _seat;
  IF _holder IS NULL THEN RETURN; END IF;
  IF _holder <> _me AND NOT public.can_manage_user(_me, _holder) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.mic_seats SET force_muted = _muted, muted = (muted OR _muted) WHERE room_id = _room AND seat = _seat;
  PERFORM public.log_admin(CASE WHEN _muted THEN 'mic_mute' ELSE 'mic_unmute' END, _holder, '');
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_message(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _author uuid; _body text;
BEGIN
  IF NOT public.has_permission(_me, 'delete_messages') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT user_id, body INTO _author, _body FROM public.room_messages WHERE id = _id;
  IF _author IS NULL THEN RETURN; END IF;
  IF _author <> _me AND NOT public.can_manage_user(_me, _author) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.room_messages WHERE id = _id;
  PERFORM public.log_admin('message_delete', _author, left(_body, 80));
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_room(_room uuid, _name text, _description text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_rooms') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _name := btrim(coalesce(_name, ''));
  IF char_length(_name) < 2 OR char_length(_name) > 30 OR char_length(coalesce(_description, '')) > 120 THEN RAISE EXCEPTION 'INVALID'; END IF;
  UPDATE public.rooms SET name = _name, description = coalesce(_description, '') WHERE id = _room;
  PERFORM public.log_admin('room_edit', NULL, _name);
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_room(_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_rooms') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT name INTO _name FROM public.rooms WHERE id = _room;
  IF _name IS NULL THEN RETURN; END IF;
  DELETE FROM public.rooms WHERE id = _room;
  PERFORM public.log_admin('room_delete', NULL, _name);
END $$;

CREATE OR REPLACE FUNCTION public.admin_rename_user(_user uuid, _name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _old text;
BEGIN
  IF NOT public.has_permission(_me, 'manage_members') OR NOT (_user = _me OR public.can_manage_user(_me, _user)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _name := btrim(coalesce(_name, ''));
  IF char_length(_name) < 2 OR char_length(_name) > 20 THEN RAISE EXCEPTION 'USERNAME_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE NOT p.is_guest AND lower(p.username) = lower(_name) AND p.id <> _user) THEN RAISE EXCEPTION 'USERNAME_TAKEN'; END IF;
  SELECT username INTO _old FROM public.profiles WHERE id = _user;
  UPDATE public.profiles SET username = _name WHERE id = _user;
  PERFORM public.log_admin('rename', _user, _old || ' ← ' || _name);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_likes(_user uuid, _count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(_me, 'manage_members') OR NOT (_user = _me OR public.can_manage_user(_me, _user)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _count IS NULL OR _count < 0 OR _count > 100000000 THEN RAISE EXCEPTION 'INVALID'; END IF;
  UPDATE public.profiles SET likes_count = _count WHERE id = _user;
  PERFORM public.log_admin('likes', _user, _count::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_clear_avatar(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(_me, 'manage_members') OR NOT (_user = _me OR public.can_manage_user(_me, _user)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.profiles SET avatar_path = NULL WHERE id = _user;
  PERFORM public.log_admin('avatar_remove', _user, '');
END $$;

-- ===== function access =====
REVOKE ALL ON FUNCTION public.is_banned(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_silenced(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rank_level(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_user(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_act_on(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_post() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_admin(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_like(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_rank(uuid, text, text, text, integer, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_rank(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_rank(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_ban(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unban(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mic_kick(uuid, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mic_mute(uuid, smallint, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_message(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_room(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_room(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rename_user(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_likes(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clear_avatar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid), public.is_silenced(uuid), public.rank_level(uuid),
  public.has_permission(uuid, text), public.can_manage_user(uuid, uuid), public.can_act_on(uuid, text), public.can_post(),
  public.toggle_like(uuid), public.admin_save_rank(uuid, text, text, text, integer, text[]), public.admin_delete_rank(uuid),
  public.admin_set_user_rank(uuid, uuid, integer), public.admin_ban(uuid, text, integer, text), public.admin_unban(uuid, text),
  public.admin_mic_kick(uuid, smallint), public.admin_mic_mute(uuid, smallint, boolean), public.admin_delete_message(uuid),
  public.admin_update_room(uuid, text, text), public.admin_delete_room(uuid), public.admin_rename_user(uuid, text),
  public.admin_set_likes(uuid, integer), public.admin_clear_avatar(uuid)
  TO authenticated;

-- ===== starter ranks (owner can edit or delete the examples) =====
INSERT INTO public.ranks (name, color, icon, level, permissions, is_owner) VALUES
  ('المالك', 'gold', 'crown', 1000, '{}', true),
  ('أدمن', 'sky', 'gem', 500, ARRAY['manage_members','ban_users','moderate_mics','delete_messages','manage_rooms','view_log'], false),
  ('مشرف', 'teal', 'shield', 100, ARRAY['ban_users','moderate_mics','delete_messages'], false);

-- ===== live updates =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.ranks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ranks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;