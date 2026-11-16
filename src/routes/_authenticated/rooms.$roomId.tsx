import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Headphones, Mic, MicOff, PhoneOff, Send, Trash2, Users, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isSeatActive } from "@/lib/auth-utils";
import { roomQuery } from "@/lib/queries";
import { useOnline, useSession } from "@/lib/session";
import { useStaff } from "@/lib/staff";
import { canManage } from "@/lib/permissions";
import { useMemberCard } from "@/components/chat/MemberCard";
import { useRoomVoice, useSpeakingIds, type RoomMember } from "@/lib/use-room-voice";
import { AppShell } from "@/components/chat/AppShell";
import { MicSeats, type SeatView } from "@/components/chat/MicSeats";
import { OnlineList } from "@/components/chat/OnlineList";
import { RemoteAudio } from "@/components/chat/RemoteAudio";
import { UserAvatar, UserName } from "@/components/chat/user-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/rooms/$roomId")({
  head: () => ({
    meta: [
      { title: "غرفة دردشة — شات الخليج" },
      { name: "description", content: "غرفة دردشة صوتية وكتابية في شات الخليج." },
      { property: "og:title", content: "غرفة دردشة — شات الخليج" },
      { property: "og:description", content: "اصعد على المايك وشارك السوالف." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(roomQuery(params.roomId)),
  component: RoomPage,
});

type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profile: { id: string; username: string; color: string; is_guest: boolean; avatar_path: string | null } | null;
};

const MSG_SELECT = "id, body, created_at, user_id, profile:profiles!room_messages_user_fk(id, username, color, is_guest, avatar_path)";
const SEAT_SELECT = "seat, user_id, muted, force_muted, last_seen, profile:profiles!mic_seats_user_fk(id, username, color, is_guest, avatar_path)";

function RoomPage() {
  const { roomId } = Route.useParams();
  const { data: room } = useSuspenseQuery(roomQuery(roomId));

  if (!room) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg">هذه الغرفة غير موجودة</p>
          <Button asChild variant="gold">
            <Link to="/rooms">رجوع للغرف</Link>
          </Button>
        </div>
      </AppShell>
    );
  }
  return <Room roomId={room.id} roomName={room.name} roomDescription={room.description} />;
}

function Room({ roomId, roomName, roomDescription }: { roomId: string; roomName: string; roomDescription: string }) {
  const { profile } = useSession();
  const { setCurrentRoom } = useOnline();
  const staff = useStaff();
  const card = useMemberCard();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // room renamed or removed by staff
  useEffect(() => {
    const ch = supabase
      .channel(`room-meta-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["room", roomId] });
        void qc.invalidateQueries({ queryKey: ["rooms"] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms" }, (p) => {
        if ((p.old as { id?: string }).id !== roomId) return;
        toast("تم حذف هذه الغرفة");
        void qc.invalidateQueries({ queryKey: ["rooms"] });
        void navigate({ to: "/rooms" });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [roomId, qc, navigate]);

  useEffect(() => {
    setCurrentRoom(roomId);
    return () => setCurrentRoom(null);
  }, [roomId, setCurrentRoom]);

  const me = useMemo<RoomMember | null>(
    () =>
      profile
        ? { id: profile.id, username: profile.username, color: profile.color, status: profile.status, is_guest: profile.is_guest, avatar_path: profile.avatar_path }
        : null,
    [profile],
  );
  const voice = useRoomVoice(roomId, me);
  const { startSpeaking, stopSpeaking, setMuted: setVoiceMuted, keepSpeakers } = voice;
  const speaking = useSpeakingIds(voice.streams);

  /* ---------- mic seats ---------- */
  const seatsQuery = useQuery({
    queryKey: ["seats", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from("mic_seats").select(SEAT_SELECT).eq("room_id", roomId).order("seat");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`seats-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mic_seats", filter: `room_id=eq.${roomId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["seats", roomId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [roomId, qc]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const seats: SeatView[] = useMemo(() => {
    const rows = seatsQuery.data ?? [];
    return [1, 2, 3, 4, 5].map((n) => {
      const row = rows.find((r) => r.seat === n);
      const active = row && isSeatActive(row, now) && row.profile;
      return {
        seat: n,
        user: active
          ? { id: row.profile!.id, username: row.profile!.username, color: row.profile!.color, is_guest: row.profile!.is_guest, avatar_path: row.profile!.avatar_path }
          : null,
        muted: active ? row.muted || row.force_muted : false,
        forceMuted: active ? row.force_muted : false,
      };
    });
  }, [seatsQuery.data, now]);

  const mySeat = seats.find((s) => s.user?.id === me?.id) ?? null;
  const [onMic, setOnMic] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busySeat, setBusySeat] = useState<number | null>(null);

  // only accept audio from people currently on a mic
  useEffect(() => {
    keepSpeakers(new Set(seats.flatMap((s) => (s.user ? [s.user.id] : []))));
  }, [seats, keepSpeakers]);

  const leaveMic = useCallback(async () => {
    stopSpeaking();
    setOnMic(false);
    setMuted(false);
    await supabase.rpc("leave_mic", { _room: roomId });
    void qc.invalidateQueries({ queryKey: ["seats", roomId] });
  }, [stopSpeaking, roomId, qc]);

  async function onSeatClick(seat: SeatView) {
    if (seat.user && seat.user.id !== me?.id) {
      card?.open(seat.user.id, { roomId, seat: seat.seat, forceMuted: seat.forceMuted });
      return;
    }
    if (seat.user?.id === me?.id) {
      if (staff.can("moderate_mics")) {
        card?.open(seat.user.id, { roomId, seat: seat.seat, forceMuted: seat.forceMuted });
        return;
      }
      return toggleMute();
    }
    if (staff.mySilence) {
      toast.error("أنت مسكت حالياً وما تقدر تصعد المايك");
      return;
    }
    setBusySeat(seat.seat);
    try {
      const { data: ok, error } = await supabase.rpc("take_mic", { _room: roomId, _seat: seat.seat });
      if (error || !ok) {
        toast.error("المايك محجوز، جرّب مايك ثاني");
        return;
      }
      try {
        await startSpeaking();
        setVoiceMuted(false);
        setOnMic(true);
        setMuted(false);
      } catch {
        await supabase.rpc("leave_mic", { _room: roomId });
        toast.error("ما قدرنا نشغّل المايك. اسمح للمتصفح باستخدام الميكروفون وحاول مرة ثانية.");
      }
    } finally {
      setBusySeat(null);
      void qc.invalidateQueries({ queryKey: ["seats", roomId] });
    }
  }

  const forceMuted = !!mySeat?.forceMuted;
  // staff muted me: silence my microphone until they lift it
  useEffect(() => {
    if (forceMuted) {
      setMuted(true);
      setVoiceMuted(true);
      toast("قام المشرف بكتم مايكك");
    }
  }, [forceMuted, setVoiceMuted]);

  function toggleMute() {
    if (forceMuted) {
      toast.error("مايكك مكتوم من المشرف");
      return;
    }
    const next = !muted;
    setMuted(next);
    setVoiceMuted(next);
    void supabase.rpc("mic_heartbeat", { _room: roomId, _muted: next });
  }

  // heartbeat keeps my seat; if I lost the seat, stop sending audio
  useEffect(() => {
    if (!onMic) return;
    const beat = async () => {
      const { data } = await supabase.rpc("mic_heartbeat", { _room: roomId, _muted: muted });
      if (data === false) {
        stopSpeaking();
        setOnMic(false);
        toast("نزلت من المايك");
      }
    };
    const t = setInterval(beat, 15_000);
    return () => clearInterval(t);
  }, [onMic, muted, roomId, stopSpeaking]);

  // leave the mic when leaving the room
  const onMicRef = useRef(onMic);
  onMicRef.current = onMic;
  useEffect(() => {
    return () => {
      if (onMicRef.current) void supabase.rpc("leave_mic", { _room: roomId });
    };
  }, [roomId]);

  /* ---------- listening ---------- */
  const [deafened, setDeafened] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioKey, setAudioKey] = useState(0);
  const onBlocked = useCallback(() => setAudioBlocked(true), []);
  const remoteStreams = [...voice.streams].filter(([id]) => id !== me?.id);
  const forceMutedIds = new Set(seats.flatMap((s) => (s.user && s.forceMuted ? [s.user.id] : [])));

  /* ---------- messages ---------- */
  const messagesQuery = useQuery({
    queryKey: ["room-messages", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_messages")
        .select(MSG_SELECT)
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as MessageRow[]).reverse();
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`msgs-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` }, async (p) => {
        const { data } = await supabase.from("room_messages").select(MSG_SELECT).eq("id", (p.new as { id: string }).id).maybeSingle();
        if (!data) return;
        qc.setQueryData<MessageRow[]>(["room-messages", roomId], (old = []) =>
          old.some((m) => m.id === data.id) ? old : [...old, data as unknown as MessageRow].slice(-200),
        );
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_messages" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) qc.setQueryData<MessageRow[]>(["room-messages", roomId], (old = []) => old.filter((m) => m.id !== id));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [roomId, qc]);

  async function deleteMessage(id: string) {
    const { error } = await supabase.rpc("admin_delete_message", { _id: id });
    if (error) {
      toast.error("ما قدرنا نحذف الرسالة");
      return;
    }
    qc.setQueryData<MessageRow[]>(["room-messages", roomId], (old = []) => old.filter((m) => m.id !== id));
  }
  const canDeleteMsg = (authorId: string) =>
    staff.can("delete_messages") && (authorId === me?.id || canManage(staff.myLevel, staff.levelOf(authorId), false));

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messagesQuery.data?.length]);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !me) return;
    setSending(true);
    const { error } = await supabase.from("room_messages").insert({ room_id: roomId, body: body.slice(0, 500), user_id: me.id });
    setSending(false);
    if (error) { toast.error("ما انرسلت الرسالة"); return; }
    setText("");
  }

  const membersPanel = (
    <OnlineList users={voice.members} meId={me?.id} />
  );

  return (
    <AppShell>
      {remoteStreams.map(([id, stream]) => (
        <RemoteAudio key={`${id}-${audioKey}`} stream={stream} muted={deafened || forceMutedIds.has(id)} onBlocked={onBlocked} />
      ))}
      <div className="mx-auto flex h-full max-w-6xl gap-4 px-0 sm:px-4 sm:py-4">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-surface sm:rounded-2xl sm:border">
          {/* room header */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Button asChild variant="ghost" size="icon" aria-label="رجوع للغرف">
              <Link to="/rooms">
                <ArrowRight />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg leading-tight">{roomName}</h1>
              {roomDescription && <p className="truncate text-xs text-muted-foreground">{roomDescription}</p>}
            </div>
            <Button variant="glass" size="sm" onClick={() => setDeafened((d) => !d)} aria-label={deafened ? "تشغيل الصوت" : "كتم الصوت"}>
              {deafened ? <VolumeX /> : <Volume2 />}
              <span className="hidden sm:inline">{deafened ? "الصوت مكتوم" : "الصوت"}</span>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="glass" size="sm" className="lg:hidden">
                  <Users /> {voice.members.length}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-surface p-0" dir="rtl">
                <SheetHeader className="border-b border-border text-start">
                  <SheetTitle className="font-display">في الغرفة ({voice.members.length})</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto scrollbar-thin">{membersPanel}</div>
              </SheetContent>
            </Sheet>
          </div>

          {/* mic strip */}
          <div className="border-b border-border bg-gradient-panel px-2 py-4">
            {seatsQuery.isLoading ? (
              <div className="mx-auto h-20 max-w-md animate-pulse rounded-xl bg-surface-raised" />
            ) : (
              <MicSeats seats={seats} meId={me?.id ?? ""} speaking={speaking} busySeat={busySeat} onSeatClick={onSeatClick} />
            )}
            {onMic && mySeat ? (
              <div className="mt-4 flex justify-center gap-2">
                <Button variant={muted ? "destructive" : "glass"} size="sm" onClick={toggleMute}>
                  {muted ? <MicOff /> : <Mic />} {forceMuted ? "مكتوم من المشرف" : muted ? "المايك مكتوم" : "كتم المايك"}
                </Button>
                <Button variant="glass" size="sm" onClick={() => void leaveMic()}>
                  <PhoneOff /> نزول من المايك
                </Button>
              </div>
            ) : (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <Headphones className="size-3.5" /> اضغط على مايك فاضي عشان تتكلم
              </p>
            )}
            {audioBlocked && (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    setAudioBlocked(false);
                    setAudioKey((k) => k + 1);
                  }}
                >
                  <Volume2 /> اضغط لتشغيل أصوات المايكات
                </Button>
              </div>
            )}
          </div>

          {/* messages */}
          <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3 scrollbar-thin">
            {messagesQuery.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">جاري التحميل...</p>}
            {messagesQuery.data?.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">ما فيه رسائل بعد — ابدأ السالفة 👋</p>
            )}
            {messagesQuery.data?.map((m) => (
              <div
                key={m.id}
                className={`group flex animate-float-in gap-2.5 rounded-xl px-2 py-1.5 ${m.user_id === me?.id ? "bg-bubble-self/40" : ""}`}
              >
                <button type="button" onClick={() => card?.open(m.user_id)} className="shrink-0 self-start rounded-full" aria-label="عرض الملف">
                  <UserAvatar user={m.profile ?? { username: "؟", color: "pearl" }} size="sm" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => card?.open(m.user_id)} className="min-w-0">
                      <UserName user={m.profile ?? { id: m.user_id, username: "عضو", color: "pearl" }} className="text-sm" />
                    </button>
                    <time className="shrink-0 text-[0.7rem] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                    {canDeleteMsg(m.user_id) && (
                      <button
                        type="button"
                        onClick={() => void deleteMessage(m.id)}
                        className="ms-auto rounded p-1 text-muted-foreground opacity-60 transition hover:bg-destructive/20 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="حذف الرسالة"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed">{m.body}</p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-border bg-surface p-2.5">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder={staff.mySilence ? "أنت مسكت حالياً" : "اكتب رسالتك..."}
              className="h-11 flex-1 bg-background/70"
              aria-label="الرسالة"
              disabled={!!staff.mySilence}
            />
            <Button type="submit" variant="gold" size="icon" className="size-11" disabled={sending || !text.trim()} aria-label="إرسال">
              <Send className="-scale-x-100" />
            </Button>
          </form>
        </section>

        <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:flex">
          <h2 className="flex items-center justify-between border-b border-border px-4 py-3 font-display text-lg">
            في الغرفة
            <span className="rounded-full bg-secondary px-2.5 py-0.5 font-sans text-xs">{voice.members.length}</span>
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{membersPanel}</div>
        </aside>
      </div>
    </AppShell>
  );
}
