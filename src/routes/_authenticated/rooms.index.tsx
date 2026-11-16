import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { DoorOpen, Mic, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { roomsQuery } from "@/lib/queries";
import { useOnline, useSession } from "@/lib/session";
import { AppShell } from "@/components/chat/AppShell";
import { OnlineList } from "@/components/chat/OnlineList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/rooms/")({
  head: () => ({
    meta: [
      { title: "الغرف — شات الخليج" },
      { name: "description", content: "اختر غرفة في شات الخليج وانضم للسوالف والمايكات." },
      { property: "og:title", content: "غرف شات الخليج" },
      { property: "og:description", content: "اختر غرفة وانضم للسوالف والمايكات المباشرة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(roomsQuery),
  component: RoomsPage,
});

function RoomsPage() {
  const { data: rooms } = useSuspenseQuery(roomsQuery);
  const { users } = useOnline();
  const { profile } = useSession();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of users) if (u.room_id) c[u.room_id] = (c[u.room_id] ?? 0) + 1;
    return c;
  }, [users]);
  const roomNames = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r.name])), [rooms]);

  return (
    <AppShell>
      <div className="mx-auto grid h-full max-w-6xl gap-6 overflow-y-auto px-4 py-6 scrollbar-thin lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl">الغرف</h1>
              <p className="text-sm text-muted-foreground">اختر غرفتك وخذ مايك</p>
            </div>
            {profile && !profile.is_guest ? (
              <NewRoomDialog />
            ) : (
              <span className="text-xs text-muted-foreground">إنشاء الغرف للأعضاء فقط</span>
            )}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rooms.map((r) => (
              <li key={r.id} className="animate-float-in">
                <Link
                  to="/rooms/$roomId"
                  params={{ roomId: r.id }}
                  className="group flex h-full flex-col rounded-2xl border border-border bg-gradient-panel p-5 transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-gold"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-xl group-hover:text-primary">{r.name}</h2>
                    <DoorOpen className="size-5 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{r.description || "\u00a0"}</p>
                  <div className="mt-4 flex items-center gap-3 text-xs text-secondary-foreground">
                    <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                      <Users className="size-3.5" /> {counts[r.id] ?? 0} داخل الغرفة
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                      <Mic className="size-3.5" /> 5 مايكات
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <aside className="h-fit rounded-2xl border border-border bg-surface">
          <h2 className="flex items-center justify-between border-b border-border px-4 py-3 font-display text-lg">
            المتواجدين
            <span className="rounded-full bg-secondary px-2.5 py-0.5 font-sans text-xs">{users.length}</span>
          </h2>
          <div className="max-h-[32rem] overflow-y-auto scrollbar-thin">
            <OnlineList users={users} meId={profile?.id} roomNames={roomNames} />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function NewRoomDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { profile } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    if (name.length < 2) { toast.error("اسم الغرفة قصير"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("rooms").insert({ name, description, created_by: profile.id }).select().single();
    setBusy(false);
    if (error || !data) { toast.error("ما قدرنا ننشئ الغرفة"); return; }
    await qc.invalidateQueries({ queryKey: ["rooms"] });
    setOpen(false);
    void navigate({ to: "/rooms/$roomId", params: { roomId: data.id } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Plus /> غرفة جديدة
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gradient-panel" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display text-2xl">غرفة جديدة</DialogTitle>
          <DialogDescription>كل غرفة فيها 5 مايكات صوتية</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="room-name">اسم الغرفة</Label>
            <Input id="room-name" name="name" required maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-desc">وصف قصير</Label>
            <Input id="room-desc" name="description" maxLength={120} />
          </div>
          <Button type="submit" variant="gold" className="w-full" disabled={busy}>
            إنشاء
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
