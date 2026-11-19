ALTER TABLE public.profiles
  ADD COLUMN font text NOT NULL DEFAULT 'default',
  ADD COLUMN name_style text NOT NULL DEFAULT 'plain',
  ADD COLUMN streak_count integer NOT NULL DEFAULT 0,
  ADD COLUMN streak_last_day date,
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN last_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN stealth boolean NOT NULL DEFAULT false;
CREATE INDEX profiles_last_seen ON public.profiles (last_seen_at DESC) WHERE last_seen_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _colors text[] := ARRAY['gold','coral','teal','sky','rose','lime','violet','pearl','crimson','orange','amber','mint','cyan','azure','indigo','purple','magenta','pink','silver','brown'];
  _fonts text[] := ARRAY['default','cairo','tajawal','almarai','amiri','kufi','lalezar','changa','messiri','inter','poppins','roboto','montserrat','playfair','pacifico','lobster','dancing','oswald','comfortaa'];
  _styles text[] := ARRAY['plain','glow','neon','sunset','ocean','aurora','royal','fire','rainbow','pastel','metal','shadow','outline','sparkle'];
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.username := OLD.username;
    NEW.is_guest := OLD.is_guest;
    NEW.likes_count := OLD.likes_count;
    NEW.streak_count := OLD.streak_count;
    NEW.streak_last_day := OLD.streak_last_day;
    NEW.last_seen_at := OLD.last_seen_at;
    NEW.last_room_id := OLD.last_room_id;
    NEW.stealth := OLD.stealth;
    IF NEW.avatar_path IS DISTINCT FROM OLD.avatar_path AND NEW.avatar_path IS NOT NULL
       AND (OLD.is_guest OR NEW.avatar_path !~ ('^' || OLD.id::text || '/[A-Za-z0-9_-]{1,60}\.(webp|jpg|jpeg|png)$')) THEN
      NEW.avatar_path := OLD.avatar_path;
    END IF;
  END IF;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.status := left(coalesce(NEW.status, ''), 80);
  NEW.likes_count := greatest(NEW.likes_count, 0);
  IF NOT (NEW.color = ANY (_colors)) THEN NEW.color := OLD.color; END IF;
  IF NOT (NEW.font = ANY (_fonts)) THEN NEW.font := OLD.font; END IF;
  IF NOT (NEW.name_style = ANY (_styles)) THEN NEW.name_style := OLD.name_style; END IF;
  RETURN NEW;
END $$;

-- ===== posts / comments / likes / notifications =====
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  shared_from uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  share_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_author_created ON public.posts (author_id, created_at DESC);
CREATE INDEX posts_created ON public.posts (created_at);
GRANT SELECT ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read posts of the last month" ON public.posts FOR SELECT TO authenticated
  USING (public.is_chat_member() AND created_at > now() - interval '1 month');

CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own post likes" ON public.post_likes FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_comments_post ON public.post_comments (post_id, created_at);
GRANT SELECT ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read comments" ON public.post_comments FOR SELECT TO authenticated USING (public.is_chat_member());

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('profile_like', 'post_like', 'post_comment')),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX notifications_user_created ON public.notifications (user_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Mark own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;

-- ===== presence + streak =====
CREATE OR REPLACE FUNCTION public.touch_presence(_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  _stealth boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_chat_member() THEN RETURN; END IF;
  SELECT stealth INTO _stealth FROM public.profiles WHERE id = _uid;
  UPDATE public.profiles SET
    last_seen_at = CASE WHEN _stealth THEN last_seen_at ELSE now() END,
    last_room_id = CASE WHEN _stealth THEN last_room_id WHEN EXISTS (SELECT 1 FROM public.rooms WHERE id = _room) THEN _room ELSE NULL END,
    streak_count = CASE
      WHEN streak_last_day = _today THEN streak_count
      WHEN streak_last_day IS NOT NULL AND _today - streak_last_day <= 4 THEN streak_count + 1
      ELSE 1 END,
    streak_last_day = _today
  WHERE id = _uid;
END $$;

CREATE OR REPLACE FUNCTION public.set_stealth(_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'stealth') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.profiles SET stealth = _on, last_room_id = CASE WHEN _on THEN NULL ELSE last_room_id END WHERE id = auth.uid();
  PERFORM public.log_admin(CASE WHEN _on THEN 'stealth_on' ELSE 'stealth_off' END, NULL, '');
END $$;

-- ===== likes with notifications =====
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
    INSERT INTO public.notifications (user_id, actor_id, kind)
    SELECT _target, _me, 'profile_like'
    WHERE NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = _target AND n.actor_id = _me AND n.kind = 'profile_like' AND n.created_at > now() - interval '1 day');
  END IF;
  RETURN _count;
END $$;

-- ===== wall functions =====
CREATE OR REPLACE FUNCTION public.add_post(_body text, _shared uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _id uuid;
BEGIN
  IF _me IS NULL OR NOT public.can_post() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _me AND is_guest) THEN RAISE EXCEPTION 'GUESTS_CANNOT_POST'; END IF;
  _body := btrim(coalesce(_body, ''));
  IF char_length(_body) > 1000 OR (_shared IS NULL AND char_length(_body) < 1) THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF (SELECT count(*) FROM public.posts WHERE author_id = _me AND created_at > now() - interval '1 minute') >= 3 THEN RAISE EXCEPTION 'RATE_LIMIT'; END IF;
  IF _shared IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = _shared AND created_at > now() - interval '1 month') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    UPDATE public.posts SET share_count = share_count + 1 WHERE id = _shared;
  END IF;
  INSERT INTO public.posts (author_id, body, shared_from) VALUES (_me, _body, _shared) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_post(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _author uuid;
BEGIN
  SELECT author_id INTO _author FROM public.posts WHERE id = _id;
  IF _author IS NULL THEN RETURN; END IF;
  IF _author <> _me THEN
    IF NOT public.has_permission(_me, 'delete_messages') OR NOT public.can_manage_user(_me, _author) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    PERFORM public.log_admin('post_delete', _author, '');
  END IF;
  DELETE FROM public.posts WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_post_like(_post uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _author uuid; _count integer;
BEGIN
  IF _me IS NULL OR NOT public.is_chat_member() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _me AND is_guest) THEN RAISE EXCEPTION 'GUESTS_CANNOT_LIKE'; END IF;
  SELECT author_id INTO _author FROM public.posts WHERE id = _post AND created_at > now() - interval '1 month';
  IF _author IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  DELETE FROM public.post_likes WHERE post_id = _post AND user_id = _me;
  IF FOUND THEN
    UPDATE public.posts SET like_count = greatest(like_count - 1, 0) WHERE id = _post RETURNING like_count INTO _count;
  ELSE
    INSERT INTO public.post_likes (post_id, user_id) VALUES (_post, _me);
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = _post RETURNING like_count INTO _count;
    IF _author <> _me THEN
      INSERT INTO public.notifications (user_id, actor_id, kind, post_id)
      SELECT _author, _me, 'post_like', _post
      WHERE NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = _author AND n.actor_id = _me AND n.kind = 'post_like' AND n.post_id = _post);
    END IF;
  END IF;
  RETURN _count;
END $$;

CREATE OR REPLACE FUNCTION public.add_comment(_post uuid, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _author uuid; _id uuid;
BEGIN
  IF _me IS NULL OR NOT public.can_post() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _body := btrim(coalesce(_body, ''));
  IF char_length(_body) < 1 OR char_length(_body) > 500 THEN RAISE EXCEPTION 'INVALID'; END IF;
  SELECT author_id INTO _author FROM public.posts WHERE id = _post AND created_at > now() - interval '1 month';
  IF _author IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  INSERT INTO public.post_comments (post_id, author_id, body) VALUES (_post, _me, _body) RETURNING id INTO _id;
  UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = _post;
  IF _author <> _me THEN
    INSERT INTO public.notifications (user_id, actor_id, kind, post_id) VALUES (_author, _me, 'post_comment', _post);
  END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_comment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _author uuid; _post uuid; _post_author uuid;
BEGIN
  SELECT author_id, post_id INTO _author, _post FROM public.post_comments WHERE id = _id;
  IF _author IS NULL THEN RETURN; END IF;
  SELECT author_id INTO _post_author FROM public.posts WHERE id = _post;
  IF _author <> _me AND _post_author IS DISTINCT FROM _me THEN
    IF NOT public.has_permission(_me, 'delete_messages') OR NOT public.can_manage_user(_me, _author) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  DELETE FROM public.post_comments WHERE id = _id;
  UPDATE public.posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = _post;
END $$;

CREATE OR REPLACE FUNCTION public.purge_old_posts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.posts WHERE created_at < now() - interval '1 month';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.touch_presence(uuid), public.set_stealth(boolean), public.add_post(text, uuid), public.delete_post(uuid),
  public.toggle_post_like(uuid), public.add_comment(uuid, text), public.delete_comment(uuid), public.toggle_like(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_old_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_presence(uuid), public.set_stealth(boolean), public.add_post(text, uuid), public.delete_post(uuid),
  public.toggle_post_like(uuid), public.add_comment(uuid, text), public.delete_comment(uuid), public.toggle_like(uuid) TO authenticated;