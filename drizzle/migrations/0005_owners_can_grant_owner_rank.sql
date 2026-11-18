CREATE OR REPLACE FUNCTION public.admin_set_user_rank(_user uuid, _rank uuid, _days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _lvl integer; _rname text; _owner_rank boolean;
BEGIN
  IF NOT public.has_permission(_me, 'manage_ranks') OR NOT public.can_manage_user(_me, _user) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _rank IS NULL THEN
    DELETE FROM public.user_ranks WHERE user_id = _user;
    PERFORM public.log_admin('rank_remove', _user, '');
    RETURN;
  END IF;
  SELECT CASE WHEN is_owner THEN 1000 ELSE level END, name, is_owner INTO _lvl, _rname, _owner_rank FROM public.ranks WHERE id = _rank;
  IF _lvl IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- owners may hand out the owner rank; everyone else only ranks below their own
  IF _lvl >= public.rank_level(_me) AND NOT (_owner_rank AND public.rank_level(_me) >= 1000) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND is_guest) THEN RAISE EXCEPTION 'GUEST'; END IF;
  IF _days IS NOT NULL AND (_days < 1 OR _days > 3650) THEN RAISE EXCEPTION 'INVALID'; END IF;
  INSERT INTO public.user_ranks (user_id, rank_id, assigned_by, expires_at)
  VALUES (_user, _rank, _me, CASE WHEN _days IS NULL THEN NULL ELSE now() + make_interval(days => _days) END)
  ON CONFLICT (user_id) DO UPDATE SET rank_id = EXCLUDED.rank_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now(), expires_at = EXCLUDED.expires_at;
  PERFORM public.log_admin('rank_assign', _user, _rname || CASE WHEN _days IS NULL THEN '' ELSE ' (' || _days || ' يوم)' END);
END $$;