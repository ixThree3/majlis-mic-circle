CREATE POLICY "Chat members view avatars" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND public.is_chat_member());

CREATE POLICY "Members upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.can_post()
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) IS NOT TRUE
  );

CREATE POLICY "Owners or staff delete avatars" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_permission(auth.uid(), 'manage_members'))
  );