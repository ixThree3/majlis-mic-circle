ALTER TABLE public.rooms
  ADD COLUMN locked boolean NOT NULL DEFAULT false,
  ADD COLUMN quiet boolean NOT NULL DEFAULT false,
  ADD COLUMN mic_limit_seconds integer NOT NULL DEFAULT 0 CHECK (mic_limit_seconds BETWEEN 0 AND 7200);
ALTER TABLE public.mic_seats ADD COLUMN taken_at timestamptz;
ALTER TABLE public.login_events ADD COLUMN device_id text NOT NULL DEFAULT '';
CREATE INDEX login_events_device ON public.login_events (device_id);
ALTER TABLE public.site_settings
  ADD COLUMN block_links boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_last_scan_at timestamptz;

-- ===== word filter =====
CREATE TABLE public.word_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL CHECK (char_length(word) BETWEEN 1 AND 60),
  kind text NOT NULL CHECK (kind IN ('banned', 'watch', 'allowed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX word_filters_unique ON public.word_filters (lower(word), kind);
GRANT SELECT ON public.word_filters TO authenticated;
GRANT ALL ON public.word_filters TO service_role;
ALTER TABLE public.word_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Filter managers read filters" ON public.word_filters FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_filters'));

-- ===== review queue =====
CREATE TABLE public.flagged_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('filter', 'ai')),
  kind text NOT NULL CHECK (kind IN ('room', 'post', 'comment')),
  ref_id uuid NOT NULL,
  room_id uuid,
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'actioned')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flagged_status_created ON public.flagged_messages (status, created_at DESC);
CREATE UNIQUE INDEX flagged_unique_ref ON public.flagged_messages (kind, ref_id, source);
GRANT SELECT ON public.flagged_messages TO authenticated;
GRANT ALL ON public.flagged_messages TO service_role;
ALTER TABLE public.flagged_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviewers read review queue" ON public.flagged_messages FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'ai_review') OR public.has_permission(auth.uid(), 'manage_filters'));

-- ===== network / device bans =====
CREATE TABLE public.ip_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL CHECK (char_length(pattern) BETWEEN 2 AND 64),
  reason text NOT NULL DEFAULT '',
  banned_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ip_bans_pattern ON public.ip_bans (lower(pattern));
CREATE TABLE public.device_bans (
  device_id text PRIMARY KEY CHECK (char_length(device_id) BETWEEN 8 AND 64),
  reason text NOT NULL DEFAULT '',
  banned_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ip_bans, public.device_bans TO authenticated;
GRANT ALL ON public.ip_bans, public.device_bans TO service_role;
ALTER TABLE public.ip_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Moderators read address bans" ON public.ip_bans FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'ban_users'));
CREATE POLICY "Moderators read device bans" ON public.device_bans FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'ban_users'));

-- ===== broadcasts =====
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read broadcasts" ON public.broadcasts FOR SELECT TO authenticated USING (public.is_chat_member());
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flagged_messages;

-- ===== content checks =====
CREATE OR REPLACE FUNCTION public.content_verdict(_body text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.word_filters f
      WHERE f.kind = 'banned' AND position(lower(f.word) IN lower(_body)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.word_filters a
          WHERE a.kind = 'allowed' AND position(lower(a.word) IN lower(_body)) > 0 AND position(lower(f.word) IN lower(a.word)) > 0
        )
    ) THEN 'banned'
    WHEN coalesce((SELECT block_links FROM public.site_settings WHERE id), false)
      AND _body ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|me|app|link|ly|gg|xyz|info|co|sa|iq|kw|ae|tv|to|site|online|store)(/|\s|$))' THEN 'link'
    WHEN EXISTS (SELECT 1 FROM public.word_filters f WHERE f.kind = 'watch' AND position(lower(f.word) IN lower(_body)) > 0) THEN 'watch'
    ELSE 'ok' END
$$;

CREATE OR REPLACE FUNCTION public.moderate_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _author uuid;
  _lvl integer;
  _v text;
  _room public.rooms;
BEGIN
  _author := CASE TG_TABLE_NAME
    WHEN 'room_messages' THEN NEW.user_id
    WHEN 'private_messages' THEN NEW.sender_id
    ELSE NEW.author_id END;
  _lvl := public.rank_level(_author);
  IF TG_TABLE_NAME = 'room_messages' THEN
    SELECT * INTO _room FROM public.rooms WHERE id = NEW.room_id;
    IF _lvl = 0 AND (_room.locked OR _room.quiet) THEN RAISE EXCEPTION 'ROOM_QUIET'; END IF;
  END IF;
  _v := public.content_verdict(NEW.body);
  IF _v = 'banned' AND _lvl < 1000 THEN RAISE EXCEPTION 'BANNED_WORD'; END IF;
  IF _v = 'link' AND _lvl = 0 THEN RAISE EXCEPTION 'LINKS_BLOCKED'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.moderate_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _kind text; _author uuid; _room uuid;
BEGIN
  IF public.content_verdict(NEW.body) <> 'watch' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'room_messages' THEN _kind := 'room'; _author := NEW.user_id; _room := NEW.room_id;
  ELSIF TG_TABLE_NAME = 'posts' THEN _kind := 'post'; _author := NEW.author_id;
  ELSE _kind := 'comment'; _author := NEW.author_id; END IF;
  INSERT INTO public.flagged_messages (source, kind, ref_id, room_id, author_id, body, reason, severity)
  VALUES ('filter', _kind, NEW.id, _room, _author, left(NEW.body, 1000), 'كلمة مراقبة', 'low')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER room_messages_moderate BEFORE INSERT ON public.room_messages FOR EACH ROW EXECUTE FUNCTION public.moderate_before_insert();
CREATE TRIGGER private_messages_moderate BEFORE INSERT ON public.private_messages FOR EACH ROW EXECUTE FUNCTION public.moderate_before_insert();
CREATE TRIGGER posts_moderate BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.moderate_before_insert();
CREATE TRIGGER post_comments_moderate BEFORE INSERT ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.moderate_before_insert();
CREATE TRIGGER room_messages_watch AFTER INSERT ON public.room_messages FOR EACH ROW EXECUTE FUNCTION public.moderate_after_insert();
CREATE TRIGGER posts_watch AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.moderate_after_insert();
CREATE TRIGGER post_comments_watch AFTER INSERT ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.moderate_after_insert();

-- ===== mic: lock + per-turn time limit =====
CREATE OR REPLACE FUNCTION public.take_mic(_room uuid, _seat smallint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_SIGNED_IN'; END IF;
  IF public.is_silenced(_uid) THEN RETURN false; END IF;
  IF public.rank_level(_uid) = 0 AND EXISTS (SELECT 1 FROM public.rooms WHERE id = _room AND locked) THEN RETURN false; END IF;
  UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL, taken_at = NULL
    WHERE user_id = _uid AND NOT (room_id = _room AND seat = _seat);
  UPDATE public.mic_seats SET user_id = _uid, muted = false, force_muted = false, last_seen = now(),
      taken_at = CASE WHEN user_id = _uid THEN coalesce(taken_at, now()) ELSE now() END
    WHERE room_id = _room AND seat = _seat
      AND (user_id IS NULL OR user_id = _uid OR last_seen < now() - interval '45 seconds');
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.mic_heartbeat(_room uuid, _muted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit integer;
BEGIN
  IF public.is_silenced(auth.uid()) THEN
    UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL, taken_at = NULL WHERE user_id = auth.uid();
    RETURN false;
  END IF;
  SELECT mic_limit_seconds INTO _limit FROM public.rooms WHERE id = _room;
  IF coalesce(_limit, 0) > 0 AND public.rank_level(auth.uid()) = 0 THEN
    UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL, taken_at = NULL
      WHERE room_id = _room AND user_id = auth.uid() AND taken_at < now() - make_interval(secs => _limit);
    IF FOUND THEN RETURN false; END IF;
  END IF;
  UPDATE public.mic_seats SET last_seen = now(), muted = (_muted OR force_muted)
    WHERE room_id = _room AND user_id = auth.uid();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.leave_mic(_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.mic_seats SET user_id = NULL, muted = false, force_muted = false, last_seen = NULL, taken_at = NULL
    WHERE room_id = _room AND user_id = auth.uid();
END $$;

-- ===== staff functions =====
CREATE OR REPLACE FUNCTION public.admin_room_controls(_room uuid, _locked boolean, _quiet boolean, _mic_limit integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_rooms') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _mic_limit IS NULL OR _mic_limit < 0 OR _mic_limit > 7200 THEN RAISE EXCEPTION 'INVALID'; END IF;
  UPDATE public.rooms SET locked = _locked, quiet = _quiet, mic_limit_seconds = _mic_limit WHERE id = _room RETURNING name INTO _name;
  PERFORM public.log_admin('room_controls', NULL, coalesce(_name, '') ||
    CASE WHEN _locked THEN ' · مقفلة' ELSE '' END || CASE WHEN _quiet THEN ' · هادئة' ELSE '' END ||
    CASE WHEN _mic_limit > 0 THEN ' · مؤقت ' || _mic_limit || 'ث' ELSE '' END);
END $$;

CREATE OR REPLACE FUNCTION public.admin_add_filter(_word text, _kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_filters') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _word := btrim(coalesce(_word, ''));
  IF char_length(_word) < 1 OR char_length(_word) > 60 OR _kind NOT IN ('banned', 'watch', 'allowed') THEN RAISE EXCEPTION 'INVALID'; END IF;
  INSERT INTO public.word_filters (word, kind, created_by) VALUES (_word, _kind, auth.uid()) ON CONFLICT DO NOTHING;
  PERFORM public.log_admin('filter_add', NULL, _kind || ': ' || _word);
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_filter(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w text;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_filters') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.word_filters WHERE id = _id RETURNING word INTO _w;
  PERFORM public.log_admin('filter_remove', NULL, coalesce(_w, ''));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_link_block(_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_filters') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.site_settings SET block_links = _on WHERE id;
  PERFORM public.log_admin(CASE WHEN _on THEN 'links_blocked' ELSE 'links_allowed' END, NULL, '');
END $$;

CREATE OR REPLACE FUNCTION public.review_flag(_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'ai_review') OR public.has_permission(auth.uid(), 'manage_filters')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('dismissed', 'actioned', 'pending') THEN RAISE EXCEPTION 'INVALID'; END IF;
  UPDATE public.flagged_messages SET status = _status, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.send_broadcast(_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'broadcast') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _body := btrim(coalesce(_body, ''));
  IF char_length(_body) < 1 OR char_length(_body) > 300 THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.broadcasts WHERE created_at > now() - interval '20 seconds') THEN RAISE EXCEPTION 'RATE_LIMIT'; END IF;
  INSERT INTO public.broadcasts (body, created_by) VALUES (_body, auth.uid());
  PERFORM public.log_admin('broadcast', NULL, left(_body, 120));
END $$;

CREATE OR REPLACE FUNCTION public.admin_ban_ip(_pattern text, _minutes integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'ban_users') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _pattern := btrim(coalesce(_pattern, ''));
  IF _pattern !~ '^[0-9a-fA-F.:]{2,63}\*?$' THEN RAISE EXCEPTION 'INVALID'; END IF;
  INSERT INTO public.ip_bans (pattern, reason, banned_by, expires_at)
  VALUES (_pattern, left(coalesce(_reason, ''), 200), auth.uid(), CASE WHEN _minutes IS NULL THEN NULL ELSE now() + make_interval(mins => _minutes) END)
  ON CONFLICT (lower(pattern)) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, expires_at = EXCLUDED.expires_at, created_at = now();
  PERFORM public.log_admin('ip_ban', NULL, _pattern);
END $$;

CREATE OR REPLACE FUNCTION public.admin_unban_ip(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p text;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'ban_users') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.ip_bans WHERE id = _id RETURNING pattern INTO _p;
  PERFORM public.log_admin('ip_unban', NULL, coalesce(_p, ''));
END $$;

CREATE OR REPLACE FUNCTION public.admin_unban_device(_device text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'ban_users') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.device_bans WHERE device_id = _device;
  PERFORM public.log_admin('device_unban', NULL, left(_device, 12));
END $$;

-- account ban plus the devices and addresses it recently used
CREATE OR REPLACE FUNCTION public.admin_ban_footprint(_user uuid, _minutes integer, _reason text, _devices boolean, _ips boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _exp timestamptz := CASE WHEN _minutes IS NULL THEN NULL ELSE now() + make_interval(mins => _minutes) END;
BEGIN
  IF NOT public.has_permission(_me, 'ban_users') OR NOT public.can_manage_user(_me, _user) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.admin_ban(_user, 'ban', _minutes, _reason);
  IF _devices THEN
    INSERT INTO public.device_bans (device_id, reason, banned_by, expires_at)
    SELECT DISTINCT device_id, left(coalesce(_reason, ''), 200), _me, _exp
    FROM (SELECT device_id FROM public.login_events WHERE user_id = _user AND char_length(device_id) >= 8 ORDER BY created_at DESC LIMIT 10) d
    ON CONFLICT (device_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, expires_at = EXCLUDED.expires_at, created_at = now();
  END IF;
  IF _ips THEN
    INSERT INTO public.ip_bans (pattern, reason, banned_by, expires_at)
    SELECT DISTINCT ip, left(coalesce(_reason, ''), 200), _me, _exp
    FROM (SELECT ip FROM public.login_events WHERE user_id = _user AND ip <> '' ORDER BY created_at DESC LIMIT 10) i
    ON CONFLICT (lower(pattern)) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, expires_at = EXCLUDED.expires_at, created_at = now();
  END IF;
  PERFORM public.log_admin('footprint_ban', _user, CASE WHEN _devices THEN 'أجهزة ' ELSE '' END || CASE WHEN _ips THEN 'آيبيات' ELSE '' END);
END $$;

-- called by the server when someone signs in: applies address/device bans (never to staff)
CREATE OR REPLACE FUNCTION public.enforce_network_bans(_user uuid, _ip text, _device text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _hit record;
BEGIN
  IF public.rank_level(_user) > 0 THEN RETURN false; END IF;
  SELECT 'جهاز محظور' AS why, expires_at INTO _hit FROM public.device_bans
    WHERE _device <> '' AND device_id = _device AND (expires_at IS NULL OR expires_at > now()) LIMIT 1;
  IF _hit IS NULL THEN
    SELECT 'آيبي محظور' AS why, expires_at INTO _hit FROM public.ip_bans
      WHERE _ip <> '' AND (expires_at IS NULL OR expires_at > now())
        AND (lower(pattern) = lower(_ip) OR (right(pattern, 1) = '*' AND lower(_ip) LIKE lower(left(pattern, -1)) || '%'))
      LIMIT 1;
  END IF;
  IF _hit IS NULL THEN RETURN false; END IF;
  INSERT INTO public.bans (user_id, kind, reason, expires_at) VALUES (_user, 'ban', _hit.why, _hit.expires_at)
  ON CONFLICT (user_id, kind) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, created_at = now();
  RETURN true;
END $$;

-- ranks may now carry the new permissions
CREATE OR REPLACE FUNCTION public.admin_save_rank(_id uuid, _name text, _color text, _icon text, _level integer, _permissions text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _my integer := public.rank_level(auth.uid());
  _old public.ranks;
  _new uuid;
  _all text[] := ARRAY['manage_ranks','manage_members','ban_users','moderate_mics','delete_messages','manage_rooms','view_log','reveal_users','manage_filters','broadcast','stealth','ai_review'];
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

REVOKE ALL ON FUNCTION public.content_verdict(text), public.enforce_network_bans(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_network_bans(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_room_controls(uuid, boolean, boolean, integer), public.admin_add_filter(text, text), public.admin_remove_filter(uuid),
  public.admin_set_link_block(boolean), public.review_flag(uuid, text), public.send_broadcast(text), public.admin_ban_ip(text, integer, text),
  public.admin_unban_ip(uuid), public.admin_unban_device(text), public.admin_ban_footprint(uuid, integer, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_room_controls(uuid, boolean, boolean, integer), public.admin_add_filter(text, text), public.admin_remove_filter(uuid),
  public.admin_set_link_block(boolean), public.review_flag(uuid, text), public.send_broadcast(text), public.admin_ban_ip(text, integer, text),
  public.admin_unban_ip(uuid), public.admin_unban_device(text), public.admin_ban_footprint(uuid, integer, text, boolean, boolean) TO authenticated;