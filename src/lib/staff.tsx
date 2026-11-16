import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { effectiveLevel, isAssignmentActive, rankHas, type Permission } from "./permissions";
import { useSession } from "./session";

export type Rank = Tables<"ranks">;
export type Ban = Tables<"bans">;

type StaffState = {
  ranks: Rank[];
  rankOf: (userId: string | undefined) => Rank | null;
  levelOf: (userId: string | undefined) => number;
  myRank: Rank | null;
  myLevel: number;
  can: (perm: Permission) => boolean;
  isStaff: boolean;
  myBan: Ban | null;
  mySilence: Ban | null;
};

const StaffContext = createContext<StaffState | null>(null);

function activeBan(b: Ban | undefined, now: number) {
  if (!b) return null;
  return b.expires_at === null || new Date(b.expires_at).getTime() > now ? b : null;
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useSession();
  const me = profile?.id;
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ranksQ = useQuery({
    queryKey: ["ranks"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("ranks").select("*").order("level", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const assignQ = useQuery({
    queryKey: ["user-ranks"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_ranks").select("*");
      if (error) throw error;
      return data;
    },
  });
  const bansQ = useQuery({
    queryKey: ["my-bans", me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("bans").select("*").eq("user_id", me!);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel(`staff-${me}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ranks" }, () => void qc.invalidateQueries({ queryKey: ["ranks"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "user_ranks" }, () => void qc.invalidateQueries({ queryKey: ["user-ranks"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "bans" }, () => {
        void qc.invalidateQueries({ queryKey: ["my-bans"] });
        void qc.invalidateQueries({ queryKey: ["admin-bans"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${me}` }, () => void refreshProfile())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [me, qc, refreshProfile]);

  const ranks = useMemo(() => ranksQ.data ?? [], [ranksQ.data]);
  const byUser = useMemo(() => {
    const rankById = new Map(ranks.map((r) => [r.id, r]));
    const m = new Map<string, Rank>();
    for (const a of assignQ.data ?? []) {
      const r = rankById.get(a.rank_id);
      if (r && isAssignmentActive(a, now)) m.set(a.user_id, r);
    }
    return m;
  }, [ranks, assignQ.data, now]);

  const myBan = activeBan(bansQ.data?.find((b) => b.kind === "ban"), now);
  const mySilence = activeBan(bansQ.data?.find((b) => b.kind === "mute"), now);

  const rankOf = useCallback((id: string | undefined) => (id ? byUser.get(id) ?? null : null), [byUser]);
  const levelOf = useCallback((id: string | undefined) => effectiveLevel(rankOf(id)), [rankOf]);
  const myRank = rankOf(me);
  const myLevel = effectiveLevel(myRank);
  const can = useCallback((perm: Permission) => !myBan && rankHas(myRank, perm), [myRank, myBan]);

  const value = useMemo<StaffState>(
    () => ({ ranks, rankOf, levelOf, myRank, myLevel, can, isStaff: !!myRank && !myBan, myBan, mySilence }),
    [ranks, rankOf, levelOf, myRank, myLevel, can, myBan, mySilence],
  );
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error("useStaff must be used inside StaffProvider");
  return ctx;
}
