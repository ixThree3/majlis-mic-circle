import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { recordLogin } from "./login.functions";

export type Profile = Tables<"profiles">;

type SessionState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void loadProfile(s?.user.id);
        void router.invalidate();
        if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile, router, queryClient]);

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setProfile(null);
    await router.navigate({ to: "/", replace: true });
  }, [queryClient, router]);

  const userId = session?.user.id;

  // one sign-in record per browser tab session (for staff "reveal")
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;
    const key = `login-recorded-${profileId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still record */
    }
    recordLogin().catch(() => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });
  }, [profileId]);

  const refreshProfile = useCallback(() => loadProfile(userId), [loadProfile, userId]);

  const value = useMemo<SessionState>(
    () => ({ session, profile, loading, refreshProfile, signOut }),
    [session, profile, loading, refreshProfile, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/* ---------------- Online presence (whole site) ---------------- */

export type OnlineUser = {
  id: string;
  username: string;
  color: string;
  status: string;
  is_guest: boolean;
  avatar_path: string | null;
  room_id: string | null;
};

type OnlineState = {
  users: OnlineUser[];
  setCurrentRoom: (roomId: string | null) => void;
};

const OnlineContext = createContext<OnlineState | null>(null);

export function OnlineProvider({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    const channel = supabase.channel("online", {
      config: { presence: { key: profile?.id ?? `viewer-${crypto.randomUUID()}` } },
    });
    channelRef.current = channel;
    subscribedRef.current = false;
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<OnlineUser>();
      const list: OnlineUser[] = [];
      for (const metas of Object.values(state)) {
        const m = metas[0];
        if (m && m.id) list.push({ id: m.id, username: m.username, color: m.color, status: m.status, is_guest: m.is_guest, avatar_path: m.avatar_path ?? null, room_id: m.room_id });
      }
      list.sort((a, b) => Number(a.is_guest) - Number(b.is_guest) || a.username.localeCompare(b.username, "ar"));
      setUsers(list);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") subscribedRef.current = true;
    });
    return () => {
      subscribedRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // (Re)track whenever my info or current room changes.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !profile) return;
    const payload: OnlineUser = {
      id: profile.id,
      username: profile.username,
      color: profile.color,
      status: profile.status,
      is_guest: profile.is_guest,
      avatar_path: profile.avatar_path,
      room_id: roomId,
    };
    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      if (subscribedRef.current) void channel.track(payload);
      else setTimeout(attempt, 300);
    };
    attempt();
    return () => {
      cancelled = true;
    };
  }, [profile, roomId]);

  const value = useMemo(() => ({ users, setCurrentRoom: setRoomId }), [users]);
  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline() {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error("useOnline must be used inside OnlineProvider");
  return ctx;
}
