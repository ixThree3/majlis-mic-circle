CREATE OR REPLACE FUNCTION public.is_chat_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.is_chat_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_member() TO authenticated;

-- Profiles: no longer readable by signed-out visitors; only chat participants.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
CREATE POLICY "Chat members read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_chat_member());

-- Rooms: no longer readable by signed-out visitors; only chat participants.
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON public.rooms;
REVOKE SELECT ON public.rooms FROM anon;
CREATE POLICY "Chat members read rooms" ON public.rooms
  FOR SELECT TO authenticated
  USING (public.is_chat_member());

-- Room messages: only chat participants.
DROP POLICY IF EXISTS "Signed in read room messages" ON public.room_messages;
CREATE POLICY "Chat members read room messages" ON public.room_messages
  FOR SELECT TO authenticated
  USING (public.is_chat_member());

-- Mic seats: only chat participants.
DROP POLICY IF EXISTS "Signed in read mic seats" ON public.mic_seats;
CREATE POLICY "Chat members read mic seats" ON public.mic_seats
  FOR SELECT TO authenticated
  USING (public.is_chat_member());

-- Guests (anonymous sessions) can never create rooms, enforced from the session itself.
CREATE POLICY "Guests cannot create rooms" ON public.rooms
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) IS NOT TRUE);