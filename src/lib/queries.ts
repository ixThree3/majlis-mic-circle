import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const roomsQuery = queryOptions({
  queryKey: ["rooms"],
  queryFn: async () => {
    const { data, error } = await supabase.from("rooms").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
});

export const roomQuery = (roomId: string) =>
  queryOptions({
    queryKey: ["room", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
