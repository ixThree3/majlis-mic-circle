import { useQuery } from "@tanstack/react-query";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMemberCard } from "@/components/chat/MemberCard";
import { UserAvatar, UserName } from "@/components/chat/user-bits";

export function DeviceIcon({ device }: { device: string }) {
  const Icon = device === "جوال" ? Smartphone : device === "تابلت" ? Tablet : Laptop;
  return <Icon className="size-4 shrink-0 text-primary" aria-label={device} />;
}

type LoginRow = { id: string; ip: string; device: string; os: string; browser: string; created_at: string };

export function LoginRows({ rows }: { rows: LoginRow[] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">ما فيه دخول مسجل بعد</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((l) => (
        <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-background/50 px-2.5 py-1.5 text-xs">
          <DeviceIcon device={l.device} />
          <span className="font-mono text-foreground" dir="ltr">{l.ip || "—"}</span>
          <span className="text-muted-foreground">
            {l.device} · {l.os} · {l.browser}
          </span>
          <time className="ms-auto text-muted-foreground">{new Date(l.created_at).toLocaleString("ar")}</time>
        </li>
      ))}
    </ul>
  );
}

/** Sign-ins of one account plus other accounts seen on the same addresses. */
export function RevealForUser({ userId }: { userId: string }) {
  const card = useMemberCard();
  const logins = useQuery({
    queryKey: ["reveal", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("login_events").select("id, ip, device, os, browser, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });
  const ips = [...new Set((logins.data ?? []).map((l) => l.ip).filter(Boolean))];
  const linked = useQuery({
    queryKey: ["reveal-linked", userId, ips.join(",")],
    enabled: ips.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("login_events")
        .select("user_id, ip, profile:profiles!login_events_user_id_fkey(id, username, color, is_guest, avatar_path)")
        .in("ip", ips)
        .neq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Map<string, (typeof data)[number]>();
      for (const r of data) if (r.profile && !seen.has(r.user_id)) seen.set(r.user_id, r);
      return [...seen.values()];
    },
  });

  if (logins.isLoading) return <p className="text-xs text-muted-foreground">جاري الكشف...</p>;
  return (
    <div className="space-y-3">
      <LoginRows rows={logins.data ?? []} />
      {ips.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">حسابات ثانية دخلت من نفس الآيبي ({linked.data?.length ?? 0})</p>
          {linked.data?.length === 0 && <p className="text-xs text-muted-foreground">ما فيه</p>}
          <ul className="flex flex-wrap gap-1.5">
            {linked.data?.map((r) => (
              <li key={r.user_id}>
                <button
                  type="button"
                  onClick={() => card?.open(r.user_id)}
                  className="flex items-center gap-1.5 rounded-full bg-background/50 py-0.5 pe-2.5 ps-0.5 text-xs transition hover:bg-accent"
                  title={r.ip}
                >
                  <UserAvatar user={r.profile!} size="sm" className="size-6 text-[0.6rem]" />
                  <UserName user={r.profile!} className="text-xs" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
