import { createFileRoute, Link } from "@tanstack/react-router";
import { Ban, DoorOpen, History, LayoutDashboard, ScanSearch, ShieldCheck, Users } from "lucide-react";
import { z } from "zod";
import type { Permission } from "@/lib/permissions";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/chat/AppShell";
import { RankBadge } from "@/components/chat/user-bits";
import { Bans, Log, Members, Overview, RevealAll, Ranks, Rooms } from "@/components/admin/sections";
import { Button } from "@/components/ui/button";

const TABS = ["overview", "members", "ranks", "bans", "reveal", "rooms", "log"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (s) => z.object({ tab: z.enum(TABS).optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "لوحة التحكم — شات الخليج" },
      { name: "description", content: "إدارة الأعضاء والرتب والغرف والحظر في شات الخليج." },
      { property: "og:title", content: "لوحة التحكم — شات الخليج" },
      { property: "og:description", content: "أدوات الإدارة والإشراف لطاقم شات الخليج." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const NAV: { tab: Tab; label: string; icon: typeof Users; perms: Permission[] | "any" }[] = [
  { tab: "overview", label: "الرئيسية", icon: LayoutDashboard, perms: "any" },
  { tab: "members", label: "الأعضاء", icon: Users, perms: ["manage_members", "manage_ranks", "ban_users"] },
  { tab: "ranks", label: "الرتب والصلاحيات", icon: ShieldCheck, perms: ["manage_ranks"] },
  { tab: "bans", label: "الحظر والإسكات", icon: Ban, perms: ["ban_users"] },
  { tab: "reveal", label: "الكشف", icon: ScanSearch, perms: ["reveal_users"] },
  { tab: "rooms", label: "الغرف", icon: DoorOpen, perms: ["manage_rooms"] },
  { tab: "log", label: "سجل الإشراف", icon: History, perms: ["view_log"] },
];

function AdminPage() {
  const { tab = "overview" } = Route.useSearch();
  const staff = useStaff();
  const allowed = NAV.filter((n) => n.perms === "any" || n.perms.some((p) => staff.can(p)));
  const current = allowed.find((n) => n.tab === tab) ?? allowed[0]!;

  if (!staff.isStaff) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <ShieldCheck className="size-10 text-muted-foreground" />
          <p className="font-display text-2xl">لوحة التحكم للطاقم فقط</p>
          <p className="text-sm text-muted-foreground">تحتاج رتبة إشرافية عشان تدخل هنا.</p>
          <Button asChild variant="gold">
            <Link to="/rooms">رجوع للغرف</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <div className="mx-auto flex h-full max-w-7xl flex-col md:flex-row">
        <aside className="shrink-0 border-b border-border bg-surface md:w-60 md:border-b-0 md:border-e">
          <div className="hidden px-4 pb-2 pt-5 md:block">
            <p className="font-display text-xl">لوحة التحكم</p>
            {staff.myRank && <RankBadge rank={staff.myRank} withName className="mt-1 text-sm" />}
          </div>
          <nav className="flex gap-1 overflow-x-auto p-2 scrollbar-thin md:flex-col md:overflow-visible">
            {allowed.map((n) => (
              <Link
                key={n.tab}
                to="/admin"
                search={{ tab: n.tab }}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent/60 hover:text-foreground",
                  current.tab === n.tab && "bg-accent text-foreground shadow-panel",
                )}
              >
                <n.icon className={cn("size-4", current.tab === n.tab && "text-primary")} />
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6">
          <h1 className="mb-5 flex items-center gap-2 font-display text-2xl sm:text-3xl">
            <current.icon className="size-6 text-primary" /> {current.label}
          </h1>
          {current.tab === "overview" && <Overview />}
          {current.tab === "members" && <Members />}
          {current.tab === "ranks" && <Ranks />}
          {current.tab === "bans" && <Bans />}
          {current.tab === "reveal" && <RevealAll />}
          {current.tab === "rooms" && <Rooms />}
          {current.tab === "log" && <Log />}
        </div>
      </div>
    </AppShell>
  );
}

