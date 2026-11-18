import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  DoorOpen,
  Heart,
  History,
  LayoutDashboard,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  VolumeX,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createMember } from "@/lib/admin.functions";
import { validateUsername } from "@/lib/auth-utils";
import { adminErrorToArabic, effectiveLevel, LOG_ACTIONS, PERMISSIONS, type Permission } from "@/lib/permissions";
import { useOnline } from "@/lib/session";
import { useStaff, type Rank } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/chat/AppShell";
import { useMemberCard } from "@/components/chat/MemberCard";
import { RankBadge, UserAvatar, UserName } from "@/components/chat/user-bits";
import { RankEditor } from "@/components/admin/RankEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TABS = ["overview", "members", "ranks", "bans", "rooms", "log"] as const;
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
          {current.tab === "rooms" && <Rooms />}
          {current.tab === "log" && <Log />}
        </div>
      </div>
    </AppShell>
  );
}

function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-panel", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title && <h2 className="font-display text-lg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------- overview ---------------- */

function useCount(key: string, build: () => PromiseLike<{ count: number | null }>, enabled = true) {
  return useQuery({ queryKey: ["admin-count", key], enabled, queryFn: async () => (await build()).count ?? 0 });
}

function Overview() {
  const staff = useStaff();
  const { users } = useOnline();
  const members = useCount("members", () => supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_guest", false));
  const guests = useCount("guests", () => supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_guest", true));
  const rooms = useCount("rooms", () => supabase.from("rooms").select("id", { count: "exact", head: true }));
  const bans = useCount(
    "bans",
    () => supabase.from("bans").select("user_id", { count: "exact", head: true }).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    staff.can("ban_users"),
  );
  const assignments = useQuery({
    queryKey: ["admin-staff-list"],
    queryFn: async () => {
      const { data } = await supabase.from("user_ranks").select("user_id, profile:profiles!user_ranks_user_id_fkey(id, username, color, is_guest, avatar_path)");
      return data ?? [];
    },
  });
  const onlineIds = new Set(users.map((u) => u.id));

  const stats = [
    { label: "متصل الآن", value: users.length, icon: Wifi },
    { label: "الأعضاء", value: members.data, icon: Users },
    { label: "حسابات الزوار", value: guests.data, icon: Users },
    { label: "الغرف", value: rooms.data, icon: DoorOpen },
    { label: "الرتب", value: staff.ranks.length, icon: ShieldCheck },
    ...(staff.can("ban_users") ? [{ label: "حظر وإسكات فعّال", value: bans.data, icon: Ban }] : []),
  ];

  return (
    <div className="space-y-5">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <li key={s.label} className="rounded-2xl border border-border bg-gradient-panel p-4">
            <s.icon className="size-5 text-primary" />
            <p className="mt-3 font-display text-3xl">{s.value === undefined ? "…" : s.value.toLocaleString("ar")}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </li>
        ))}
      </ul>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="الطاقم">
          <StaffList rows={assignments.data ?? []} onlineIds={onlineIds} />
        </Panel>
        {staff.can("view_log") && (
          <Panel
            title="آخر الإجراءات"
            action={
              <Link to="/admin" search={{ tab: "log" }} className="text-xs text-primary hover:underline">
                السجل كامل
              </Link>
            }
          >
            <LogList limit={8} />
          </Panel>
        )}
      </div>
    </div>
  );
}

type MiniProfile = { id: string; username: string; color: string; is_guest: boolean; avatar_path: string | null };

function StaffList({ rows, onlineIds }: { rows: { user_id: string; profile: MiniProfile | null }[]; onlineIds: Set<string> }) {
  const staff = useStaff();
  const card = useMemberCard();
  const sorted = [...rows].filter((r) => r.profile && staff.rankOf(r.user_id)).sort((a, b) => staff.levelOf(b.user_id) - staff.levelOf(a.user_id));
  if (sorted.length === 0) return <p className="p-4 text-sm text-muted-foreground">لا يوجد طاقم بعد</p>;
  return (
    <ul className="divide-y divide-border/60">
      {sorted.map((r) => {
        const rank = staff.rankOf(r.user_id)!;
        return (
          <li key={r.user_id}>
            <button type="button" onClick={() => card?.open(r.user_id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-accent/50">
              <span className="relative">
                <UserAvatar user={r.profile!} size="sm" />
                {onlineIds.has(r.user_id) && <span className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-surface bg-success" />}
              </span>
              <UserName user={r.profile!} showRank={false} className="min-w-0 flex-1 text-sm" />
              <RankBadge rank={rank} withName className="text-sm" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- members ---------------- */

function Members() {
  const staff = useStaff();
  const card = useMemberCard();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "members" | "guests" | "staff">("all");
  const list = useQuery({
    queryKey: ["admin-members", q, filter],
    queryFn: async () => {
      let query = supabase.from("profiles").select("id, username, color, is_guest, avatar_path, likes_count, created_at").order("created_at", { ascending: false }).limit(100);
      if (q.trim()) query = query.ilike("username", `%${q.trim().replace(/[%_]/g, "")}%`);
      if (filter === "members") query = query.eq("is_guest", false);
      if (filter === "guests") query = query.eq("is_guest", true);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  const rows = (list.data ?? []).filter((p) => filter !== "staff" || staff.rankOf(p.id));

  const filters = [
    { key: "all", label: "الكل" },
    { key: "members", label: "الأعضاء" },
    { key: "guests", label: "الزوار" },
    { key: "staff", label: "الطاقم" },
  ] as const;

  return (
    <Panel
      title={`الحسابات (${rows.length})`}
      action={staff.can("manage_members") ? <NewMemberDialog /> : undefined}
    >
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم..." className="ps-9" aria-label="بحث" />
        </div>
        <div className="flex gap-1 rounded-lg bg-background/60 p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn("rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition", filter === f.key && "bg-accent text-foreground")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {list.isLoading && <p className="p-4 text-sm text-muted-foreground">جاري التحميل...</p>}
      {!list.isLoading && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">لا توجد نتائج</p>}
      <ul className="divide-y divide-border/60">
        {rows.map((p) => {
          const rank = staff.rankOf(p.id);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => card?.open(p.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-accent/50">
                <UserAvatar user={p} size="md" />
                <div className="min-w-0 flex-1">
                  <UserName user={p} showRank={false} className="flex text-sm" />
                  <p className="text-xs text-muted-foreground">
                    {p.is_guest ? "زائر" : "عضو"} · {new Date(p.created_at).toLocaleDateString("ar")}
                  </p>
                </div>
                {rank && <RankBadge rank={rank} withName className="hidden text-sm sm:inline-flex" />}
                {rank && <RankBadge rank={rank} className="sm:hidden" />}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Heart className="size-3.5 text-name-rose" /> {p.likes_count.toLocaleString("ar")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function NewMemberDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createMember);
  const qc = useQueryClient();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get("username") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const nameErr = validateUsername(username);
    if (nameErr) { toast.error(nameErr); return; }
    if (password.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    setBusy(true);
    try {
      await create({ data: { username, password } });
      toast.success(`تم إنشاء عضوية ${username}`);
      void qc.invalidateQueries({ queryKey: ["admin-members"] });
      void qc.invalidateQueries({ queryKey: ["admin-count"] });
      setOpen(false);
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      toast.error(m.toLowerCase().includes("password") ? "كلمة المرور ضعيفة أو مسربة، اختر كلمة أقوى" : adminErrorToArabic(m));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" size="sm">
          <UserPlus /> عضوية جديدة
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gradient-panel" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display text-2xl">عضوية جديدة</DialogTitle>
          <DialogDescription>أعطِ الاسم وكلمة المرور لصاحب العضوية عشان يدخل فيها.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nm-name">اسم العضو</Label>
            <Input id="nm-name" name="username" maxLength={20} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nm-pass">كلمة المرور</Label>
            <Input id="nm-pass" name="password" type="text" minLength={6} required autoComplete="off" />
          </div>
          <Button type="submit" variant="gold" className="w-full" disabled={busy}>
            {busy ? "جاري الإنشاء..." : "إنشاء العضوية"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- ranks ---------------- */

function Ranks() {
  const staff = useStaff();
  const [editing, setEditing] = useState<Rank | null>(null);
  const [open, setOpen] = useState(false);
  const counts = useQuery({
    queryKey: ["admin-rank-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("user_ranks").select("rank_id");
      const c: Record<string, number> = {};
      for (const r of data ?? []) c[r.rank_id] = (c[r.rank_id] ?? 0) + 1;
      return c;
    },
  });

  async function remove(r: Rank) {
    const { error } = await supabase.rpc("admin_delete_rank", { _id: r.id });
    if (error) { toast.error(adminErrorToArabic(error.message)); return; }
    toast.success("تم حذف الرتبة");
  }

  return (
    <>
      <Panel
        title={`الرتب (${staff.ranks.length})`}
        action={
          <Button variant="gold" size="sm" onClick={() => { setEditing(null); setOpen(true); }} disabled={staff.myLevel <= 1}>
            <Plus /> رتبة جديدة
          </Button>
        }
      >
        <ul className="divide-y divide-border/60">
          {staff.ranks.map((r) => {
            const editable = r.is_owner ? staff.myLevel >= 1000 : effectiveLevel(r) < staff.myLevel;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <RankBadge rank={r} withName className="min-w-28 text-base" />
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">مستوى {effectiveLevel(r)}</span>
                <span className="text-xs text-muted-foreground">{counts.data?.[r.id] ?? 0} عضو</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {r.is_owner ? (
                    <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[0.7rem] text-primary">كل الصلاحيات</span>
                  ) : (
                    r.permissions.map((p) => (
                      <span key={p} className="rounded-md bg-surface-raised px-2 py-0.5 text-[0.7rem] text-muted-foreground">
                        {PERMISSIONS.find((x) => x.key === p)?.label.split(" (")[0] ?? p}
                      </span>
                    ))
                  )}
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil />
                    </Button>
                    {!r.is_owner && (
                      <ConfirmButton title={`حذف رتبة ${r.name}؟`} description="كل من عنده هالرتبة يرجع عضو عادي." onConfirm={() => void remove(r)}>
                        <Button size="icon" variant="ghost" className="text-destructive" aria-label="حذف">
                          <Trash2 />
                        </Button>
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">لترقية عضو: افتح ملفه من قسم الأعضاء أو من أي غرفة واختر الرتبة.</p>
      <RankEditor open={open} onOpenChange={setOpen} rank={editing} />
    </>
  );
}

function ConfirmButton({ title, description, onConfirm, children }: { title: string; description: string; onConfirm: () => void; children: ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader className="text-start">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
            تأكيد
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------- bans ---------------- */

function Bans() {
  const card = useMemberCard();
  const qc = useQueryClient();
  const bans = useQuery({
    queryKey: ["admin-bans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bans")
        .select("user_id, kind, reason, expires_at, created_at, banned_by, profile:profiles!bans_user_id_fkey(id, username, color, is_guest, avatar_path)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.filter((b) => b.expires_at === null || new Date(b.expires_at).getTime() > Date.now());
    },
  });

  async function lift(userId: string, kind: string) {
    const { error } = await supabase.rpc("admin_unban", { _user: userId, _kind: kind });
    if (error) { toast.error(adminErrorToArabic(error.message)); return; }
    toast.success("تم الفك");
    void qc.invalidateQueries({ queryKey: ["admin-bans"] });
  }

  return (
    <Panel title={`الفعّال الآن (${bans.data?.length ?? 0})`}>
      {bans.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">ما فيه أحد محظور أو مسكت حالياً 👌</p>}
      <ul className="divide-y divide-border/60">
        {bans.data?.map((b) => (
          <li key={`${b.user_id}-${b.kind}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => card?.open(b.user_id)}>
              {b.profile && <UserAvatar user={b.profile} size="sm" />}
              <div className="min-w-0">
                {b.profile && <UserName user={b.profile} className="flex text-sm" />}
                <p className="text-xs text-muted-foreground">
                  {b.expires_at ? `حتى ${new Date(b.expires_at).toLocaleString("ar")}` : "دائم"}
                  {b.reason ? ` · ${b.reason}` : ""}
                </p>
              </div>
            </button>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs",
                b.kind === "ban" ? "bg-destructive/20 text-destructive" : "bg-secondary text-secondary-foreground",
              )}
            >
              {b.kind === "ban" ? <Ban className="size-3" /> : <VolumeX className="size-3" />}
              {b.kind === "ban" ? "باند" : "إسكات"}
            </span>
            <Button size="sm" variant="glass" onClick={() => void lift(b.user_id, b.kind)}>
              فك
            </Button>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">للطرد أو الباند أو الإسكات: افتح ملف الشخص من الأعضاء أو من الغرفة.</p>
    </Panel>
  );
}

/* ---------------- rooms ---------------- */

function Rooms() {
  const qc = useQueryClient();
  const { users } = useOnline();
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of users) if (u.room_id) c[u.room_id] = (c[u.room_id] ?? 0) + 1;
    return c;
  }, [users]);

  async function remove(id: string) {
    const { error } = await supabase.rpc("admin_delete_room", { _room: id });
    if (error) { toast.error(adminErrorToArabic(error.message)); return; }
    toast.success("تم حذف الغرفة");
    void qc.invalidateQueries({ queryKey: ["rooms"] });
  }

  return (
    <Panel title={`الغرف (${rooms.data?.length ?? 0})`}>
      <ul className="divide-y divide-border/60">
        {rooms.data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link to="/rooms/$roomId" params={{ roomId: r.id }} className="font-semibold hover:text-primary">
                {r.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{r.description || "بدون وصف"}</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
              <Users className="size-3" /> {counts[r.id] ?? 0}
            </span>
            <RoomEditDialog room={r} />
            <ConfirmButton title={`حذف غرفة ${r.name}؟`} description="تنحذف الغرفة ورسائلها ومايكاتها نهائياً." onConfirm={() => void remove(r.id)}>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label="حذف الغرفة">
                <Trash2 />
              </Button>
            </ConfirmButton>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RoomEditDialog({ room }: { room: { id: string; name: string; description: string } }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_room", {
      _room: room.id,
      _name: String(fd.get("name") ?? ""),
      _description: String(fd.get("description") ?? ""),
    });
    setBusy(false);
    if (error) { toast.error("اسم الغرفة بين 2 و 30 حرف، والوصف 120 حرف كحد أقصى"); return; }
    toast.success("تم حفظ الغرفة");
    void qc.invalidateQueries({ queryKey: ["rooms"] });
    void qc.invalidateQueries({ queryKey: ["room", room.id] });
    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="تعديل الغرفة">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gradient-panel" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display text-2xl">تعديل الغرفة</DialogTitle>
          <DialogDescription>غيّر اسم الغرفة ووصفها</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`rn-${room.id}`}>اسم الغرفة</Label>
            <Input id={`rn-${room.id}`} name="name" defaultValue={room.name} maxLength={30} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`rd-${room.id}`}>الوصف</Label>
            <Input id={`rd-${room.id}`} name="description" defaultValue={room.description} maxLength={120} />
          </div>
          <Button type="submit" variant="gold" className="w-full" disabled={busy}>
            حفظ
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- log ---------------- */

function Log() {
  return (
    <Panel>
      <LogList limit={200} />
    </Panel>
  );
}

function LogList({ limit }: { limit: number }) {
  const log = useQuery({
    queryKey: ["admin-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
    refetchInterval: 20_000,
  });
  if (log.isLoading) return <p className="p-4 text-sm text-muted-foreground">جاري التحميل...</p>;
  if (!log.data?.length) return <p className="p-4 text-sm text-muted-foreground">ما فيه إجراءات مسجلة بعد</p>;
  return (
    <ul className="divide-y divide-border/60">
      {log.data.map((l) => (
        <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 text-sm">
          <span className="font-semibold text-primary">{l.actor_name || "—"}</span>
          <span className="rounded-md bg-surface-raised px-1.5 py-0.5 text-xs">{LOG_ACTIONS[l.action] ?? l.action}</span>
          {l.target_name && <span className="font-medium">{l.target_name}</span>}
          {l.details && <span className="text-xs text-muted-foreground">{l.details}</span>}
          <time className="ms-auto text-[0.7rem] text-muted-foreground">{new Date(l.created_at).toLocaleString("ar")}</time>
        </li>
      ))}
    </ul>
  );
}
