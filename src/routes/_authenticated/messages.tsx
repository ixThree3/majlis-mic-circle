import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Send } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useOnline, useSession } from "@/lib/session";
import { useStaff } from "@/lib/staff";
import { AppShell } from "@/components/chat/AppShell";
import { UserAvatar, UserName } from "@/components/chat/user-bits";
import { useMemberCard } from "@/components/chat/MemberCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ with: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "الرسائل الخاصة — شات الخليج" },
      { name: "description", content: "رسائلك الخاصة مع أعضاء شات الخليج." },
      { property: "og:title", content: "الرسائل الخاصة — شات الخليج" },
      { property: "og:description", content: "تواصل بشكل خاص مع المتواجدين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

type PM = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
type MiniProfile = { id: string; username: string; color: string; is_guest: boolean; status: string; avatar_path: string | null };

function MessagesPage() {
  const { with: withId } = Route.useSearch();
  const { profile } = useSession();
  const { users } = useOnline();
  const meId = profile?.id ?? "";

  // conversations = latest message per other person
  const convos = useQuery({
    queryKey: ["pm", "list", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("private_messages")
        .select("*")
        .or(`sender_id.eq.${meId},recipient_id.eq.${meId}`)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const byOther = new Map<string, { last: PM; unread: number }>();
      for (const m of data as PM[]) {
        const other = m.sender_id === meId ? m.recipient_id : m.sender_id;
        const e = byOther.get(other) ?? { last: m, unread: 0 };
        if (m.recipient_id === meId && !m.read_at) e.unread++;
        byOther.set(other, e);
      }
      const ids = [...byOther.keys()];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, color, is_guest, status, avatar_path").in("id", ids)
        : { data: [] as MiniProfile[] };
      const pmap = new Map((profs ?? []).map((p) => [p.id, p as MiniProfile]));
      return ids.flatMap((id) => {
        const p = pmap.get(id);
        return p ? [{ other: p, ...byOther.get(id)! }] : [];
      });
    },
  });

  const onlineIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const onlineOthers = users.filter((u) => u.id !== meId && !convos.data?.some((c) => c.other.id === u.id));

  return (
    <AppShell>
      <div className="mx-auto flex h-full max-w-6xl gap-4 sm:px-4 sm:py-4">
        <aside
          className={cn(
            "flex w-full shrink-0 flex-col overflow-hidden border-border bg-surface sm:w-80 sm:rounded-2xl sm:border",
            withId && "hidden sm:flex",
          )}
        >
          <h1 className="border-b border-border px-4 py-3 font-display text-xl">الخاص</h1>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {convos.data?.length === 0 && <p className="px-4 py-4 text-sm text-muted-foreground">لا يوجد رسائل خاصة بعد</p>}
            <ul>
              {convos.data?.map(({ other, last, unread }) => (
                <li key={other.id}>
                  <Link
                    to="/messages"
                    search={{ with: other.id }}
                    className={cn("flex items-center gap-3 px-4 py-2.5 transition hover:bg-accent/50", withId === other.id && "bg-accent")}
                  >
                    <span className="relative">
                      <UserAvatar user={other} size="md" />
                      {onlineIds.has(other.id) && <span className="absolute bottom-0 end-0 size-3 rounded-full border-2 border-surface bg-success" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <UserName user={other} className="block truncate text-sm" />
                      <p className="truncate text-xs text-muted-foreground">
                        {last.sender_id === meId ? "أنت: " : ""}
                        {last.body}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{unread}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {onlineOthers.length > 0 && (
              <>
                <h2 className="border-y border-border bg-background/40 px-4 py-2 text-xs font-semibold text-muted-foreground">المتواجدين الآن — ابدأ محادثة</h2>
                <ul>
                  {onlineOthers.map((u) => (
                    <li key={u.id}>
                      <Link to="/messages" search={{ with: u.id }} className="flex items-center gap-3 px-4 py-2 transition hover:bg-accent/50">
                        <UserAvatar user={u} size="sm" />
                        <UserName user={u} className="truncate text-sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>

        <section className={cn("min-w-0 flex-1 flex-col overflow-hidden border-border bg-surface sm:rounded-2xl sm:border", withId ? "flex" : "hidden sm:flex")}>
          {withId ? (
            <Thread key={withId} otherId={withId} meId={meId} online={onlineIds.has(withId)} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <p className="font-display text-2xl text-foreground">اختر مستخدماً</p>
              <p className="text-sm">ابدأ محادثة من قائمة المتواجدين</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Thread({ otherId, meId, online }: { otherId: string; meId: string; online: boolean }) {
  const qc = useQueryClient();
  const card = useMemberCard();
  const silenced = useStaff().mySilence;
  const other = useQuery({
    queryKey: ["profile", otherId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, username, color, is_guest, status, avatar_path").eq("id", otherId).maybeSingle();
      return data as MiniProfile | null;
    },
  });
  const thread = useQuery({
    queryKey: ["pm", "thread", meId, otherId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("private_messages")
        .select("*")
        .or(`and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as PM[]).reverse();
    },
  });

  // mark as read when viewing
  const unreadCount = thread.data?.filter((m) => m.recipient_id === meId && !m.read_at).length ?? 0;
  useEffect(() => {
    if (!unreadCount) return;
    void supabase
      .from("private_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", meId)
      .eq("sender_id", otherId)
      .is("read_at", null)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["pm-unread"] });
        void qc.invalidateQueries({ queryKey: ["pm", "list"] });
      });
  }, [unreadCount, meId, otherId, qc]);

  // live: messages I send in other tabs or receive
  useEffect(() => {
    const ch = supabase
      .channel(`pm-thread-${otherId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages" }, (p) => {
        const m = p.new as PM;
        const inThread = (m.sender_id === otherId && m.recipient_id === meId) || (m.sender_id === meId && m.recipient_id === otherId);
        if (!inThread) return;
        qc.setQueryData<PM[]>(["pm", "thread", meId, otherId], (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
        void qc.invalidateQueries({ queryKey: ["pm", "list"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [otherId, meId, qc]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [thread.data?.length]);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { data, error } = await supabase
      .from("private_messages")
      .insert({ recipient_id: otherId, body: body.slice(0, 1000), sender_id: meId })
      .select()
      .single();
    setSending(false);
    if (error || !data) { toast.error("ما انرسلت الرسالة"); return; }
    setText("");
    qc.setQueryData<PM[]>(["pm", "thread", meId, otherId], (old = []) => (old.some((x) => x.id === data.id) ? old : [...old, data as PM]));
    void qc.invalidateQueries({ queryKey: ["pm", "list"] });
  }

  if (otherId === meId) return <p className="p-6 text-center text-muted-foreground">ما تقدر ترسل لنفسك 🙂</p>;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
        <Button asChild variant="ghost" size="icon" className="sm:hidden" aria-label="رجوع">
          <Link to="/messages" search={{ with: undefined }}>
            <ArrowRight />
          </Link>
        </Button>
        {other.data && (
          <button type="button" onClick={() => card?.open(otherId)} className="flex min-w-0 items-center gap-3 text-start">
            <UserAvatar user={other.data} size="sm" />
            <div className="min-w-0">
              <UserName user={other.data} className="flex" />
              <p className="text-xs text-muted-foreground">{online ? "متصل الآن" : "غير متصل"}</p>
            </div>
          </button>
        )}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 scrollbar-thin">
        {thread.data?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">قل هلا 👋</p>}
        {thread.data?.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[80%] animate-float-in rounded-2xl px-3.5 py-2",
                  mine ? "rounded-ss-sm bg-bubble-self text-bubble-self-foreground" : "rounded-se-sm bg-surface-raised text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <time className="mt-0.5 block text-[0.65rem] opacity-60">
                  {new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-2.5">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="اكتب رسالة خاصة..." disabled={!!silenced} className="h-11 flex-1 bg-background/70" aria-label="رسالة خاصة" />
        <Button type="submit" variant="gold" size="icon" className="size-11" disabled={sending || !text.trim()} aria-label="إرسال">
          <Send className="-scale-x-100" />
        </Button>
      </form>
    </>
  );
}
