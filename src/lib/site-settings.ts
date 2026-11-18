import { useEffect } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const siteSettingsQuery = queryOptions({
  queryKey: ["site-settings"],
  queryFn: async () => {
    const { data } = await supabase.from("site_settings").select("*").maybeSingle();
    return data ?? { id: true, announcement: "", guests_enabled: true, signups_enabled: true, updated_at: "" };
  },
  staleTime: 60_000,
});

export function useSiteSettings() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`site-settings-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => void qc.invalidateQueries({ queryKey: ["site-settings"] }))
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
  return useQuery(siteSettingsQuery);
}
