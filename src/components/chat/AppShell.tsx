import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, LogOut, Mail, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOnline, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProfileDialog } from "./ProfileDialog";
import { Logo, UserAvatar, UserName } from "./user-bits";

export function useUnreadCount() {
  const { profile } = useSession();
  return useQuery({
    queryKey: ["pm-unread", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { count } = await supabase
        .from("private_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profile!.id)
        .is("read_at", null);
      return count ?? 0;
    },
  });
}

/** Listens for new private messages anywhere in the app. */
function usePrivateMessageAlerts() {
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const search = location.search as { with?: string };
  const viewing = location.pathname === "/messages" ? search.with : undefined;

  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`pm-alerts-${profile.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${profile.id}` }, async (p) => {
        const row = p.new as { sender_id: string; body: string };
        void queryClient.invalidateQueries({ queryKey: ["pm-unread"] });
        void queryClient.invalidateQueries({ queryKey: ["pm"] });
        if (row.sender_id === viewing) return;
        const { data } = await supabase.from("profiles").select("username").eq("id", row.sender_id).maybeSingle();
        toast(`رسالة خاصة من ${data?.username ?? "عضو"}`, {
          description: row.body.slice(0, 80),
          action: { label: "فتح", onClick: () => navigate({ to: "/messages", search: { with: row.sender_id } }) },
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [profile, viewing, queryClient, navigate]);
}

export function AppShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { profile, signOut } = useSession();
  const { users } = useOnline();
  const unread = useUnreadCount();
  const [profileOpen, setProfileOpen] = useState(false);
  usePrivateMessageAlerts();

  const navCls = "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent/60 hover:text-foreground";

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className={cn("mx-auto flex h-14 items-center gap-2 px-3 sm:px-5", !wide && "max-w-6xl")}>
          <Link to="/rooms" className="me-2 text-xl sm:text-2xl">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/rooms" className={navCls} activeProps={{ className: "bg-accent text-foreground" }}>
              <DoorOpen className="size-4" />
              <span className="hidden sm:inline">الغرف</span>
            </Link>
            <Link to="/messages" search={{ with: undefined }} className={cn(navCls, "relative")} activeProps={{ className: "bg-accent text-foreground" }}>
              <Mail className="size-4" />
              <span className="hidden sm:inline">الخاص</span>
              {!!unread.data && (
                <span className="absolute -top-0.5 -start-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[0.7rem] font-bold text-destructive-foreground">
                  {unread.data}
                </span>
              )}
            </Link>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              <span className="size-2 rounded-full bg-success" />
              <Users className="size-3.5" />
              {users.length}
              <span className="hidden sm:inline">متصل</span>
            </span>
            {profile && (
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger className="rounded-full outline-none ring-ring focus-visible:ring-2">
                  <UserAvatar user={profile} size="sm" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2 py-1.5">
                    <UserName user={profile} />
                    <p className="truncate text-xs text-muted-foreground">{profile.status || "بدون حالة"}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
                    <UserRound className="size-4" /> ملفي
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void signOut()} className="text-destructive focus:text-destructive">
                    <LogOut className="size-4" /> خروج
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
