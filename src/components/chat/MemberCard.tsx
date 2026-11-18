import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Heart, ImageOff, KeyRound, Mail, Mic, MicOff, PencilLine, ShieldCheck, Trash2, UserX, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteMember, renameUser, setMemberPassword } from "@/lib/admin.functions";
import { adminErrorToArabic, assignableRanks, BAN_DURATIONS, canManage, effectiveLevel } from "@/lib/permissions";
import { useOnline, useSession } from "@/lib/session";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RankBadge, UserAvatar, UserName } from "./user-bits";

export type MicContext = { roomId: string; seat: number; forceMuted: boolean };

type CardState = { open: (userId: string, mic?: MicContext) => void };
const CardContext = createContext<CardState | null>(null);

export function useMemberCard() {
  return useContext(CardContext);
}

export function MemberCardProvider({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const [target, setTarget] = useState<{ id: string; mic?: MicContext | undefined } | null>(null);
  const open = useCallback((id: string, mic?: MicContext) => setTarget({ id, mic }), []);
  const signedIn = !!profile;
  const value = useMemo(() => (signedIn ? { open } : null), [open, signedIn]);
  return (
    <CardContext.Provider value={value}>
      {children}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto bg-gradient-panel p-0 scrollbar-thin sm:max-w-md" dir="rtl">
          {target && <MemberCardBody key={target.id} userId={target.id} mic={target.mic} onClose={() => setTarget(null)} />}
        </DialogContent>
      </Dialog>
    </CardContext.Provider>
  );
}

export function useProfileCard(userId: string) {
  return useQuery({
    queryKey: ["profile-card", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, color, is_guest, status, avatar_path, likes_count, created_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function MemberCardBody({ userId, mic, onClose }: { userId: string; mic?: MicContext | undefined; onClose: () => void }) {
  const { profile: me } = useSession();
  const { users } = useOnline();
  const staff = useStaff();
  const qc = useQueryClient();
  const card = useProfileCard(userId);
  const p = card.data;
  const isMe = me?.id === userId;
  const rank = staff.rankOf(userId);
  const online = users.find((u) => u.id === userId);

  const liked = useQuery({
    queryKey: ["my-like", userId],
    enabled: !!me && !isMe,
    queryFn: async () => {
      const { data } = await supabase.from("profile_likes").select("target_id").eq("liker_id", me!.id).eq("target_id", userId).maybeSingle();
      return !!data;
    },
  });

  const [liking, setLiking] = useState(false);
  async function toggleLike() {
    if (!me) return;
    if (me.is_guest) { toast("اللايكات للأعضاء المسجلين فقط"); return; }
    setLiking(true);
    const { error } = await supabase.rpc("toggle_like", { _target: userId });
    setLiking(false);
    if (error) { toast.error("ما قدرنا نسجل اللايك"); return; }
    void qc.invalidateQueries({ queryKey: ["my-like", userId] });
    void qc.invalidateQueries({ queryKey: ["profile-card", userId] });
  }

  if (card.isLoading) return <div className="h-64 animate-pulse" />;
  if (!p) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <DialogTitle className="sr-only">الحساب</DialogTitle>
        هذا الحساب غير موجود
      </div>
    );
  }

  const outranks = canManage(staff.myLevel, staff.levelOf(userId), isMe);

  return (
    <div>
      <div className="relative h-24 bg-gradient-night">
        <div className="absolute inset-0 bg-gradient-gold opacity-20" />
      </div>
      <div className="-mt-12 flex flex-col items-center px-5 pb-5 text-center">
        <UserAvatar user={p} size="xl" className="ring-4 ring-surface" />
        <DialogHeader className="mt-2 items-center space-y-1 text-center">
          <DialogTitle className="text-xl">
            <UserName user={p} showRank={false} />
          </DialogTitle>
          {rank && <RankBadge rank={rank} withName className="rounded-full bg-surface-raised px-2.5 py-0.5 text-sm" />}
          <DialogDescription>{p.status || "بدون حالة"}</DialogDescription>
        </DialogHeader>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1">
            <span className={cn("size-2 rounded-full", online ? "bg-success" : "bg-muted-foreground")} />
            {online ? "متصل الآن" : "غير متصل"}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1">
            {p.is_guest ? "زائر" : `عضو منذ ${new Date(p.created_at).toLocaleDateString("ar", { year: "numeric", month: "short" })}`}
          </span>
        </div>

        <div className="mt-4 flex w-full gap-2">
          <Button
            variant={liked.data ? "gold" : "glass"}
            className="flex-1"
            onClick={() => void toggleLike()}
            disabled={isMe || liking}
            aria-pressed={!!liked.data}
          >
            <Heart className={cn(liked.data && "fill-current")} /> {p.likes_count.toLocaleString("ar")}
            <span className="text-xs opacity-80">لايك</span>
          </Button>
          {!isMe && (
            <Button asChild variant="glass" className="flex-1" onClick={onClose}>
              <Link to="/messages" search={{ with: userId }}>
                <Mail /> رسالة خاصة
              </Link>
            </Button>
          )}
        </div>

        {staff.isStaff && (outranks || isMe) && (
          <StaffTools
            userId={userId}
            profile={p}
            isMe={isMe}
            outranks={outranks}
            mic={mic}
            onDone={() => {
              void qc.invalidateQueries({ queryKey: ["profile-card", userId] });
              void qc.invalidateQueries({ queryKey: ["admin-members"] });
            }}
            onDeleted={onClose}
          />
        )}
      </div>
    </div>
  );
}

type CardProfile = NonNullable<ReturnType<typeof useProfileCard>["data"]>;

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-xl border border-border bg-surface/70 p-3 text-start">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function StaffTools({
  userId,
  profile,
  isMe,
  outranks,
  mic,
  onDone,
  onDeleted,
}: {
  userId: string;
  profile: CardProfile;
  isMe: boolean;
  outranks: boolean;
  mic?: MicContext | undefined;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const staff = useStaff();
  const qc = useQueryClient();
  const rename = useServerFn(renameUser);
  const setPassword = useServerFn(setMemberPassword);
  const removeMember = useServerFn(deleteMember);
  const [busy, setBusy] = useState<string | null>(null);

  const currentRank = staff.rankOf(userId);
  const [rankId, setRankId] = useState<string>(currentRank?.id ?? "none");
  const [days, setDays] = useState("");
  const [name, setName] = useState(profile.username);
  const [likes, setLikes] = useState(String(profile.likes_count));
  const [password, setPasswordValue] = useState("");
  const [duration, setDuration] = useState("10");
  const [reason, setReason] = useState("");

  const bans = useQuery({
    queryKey: ["user-bans", userId],
    enabled: staff.can("ban_users") && outranks,
    queryFn: async () => {
      const { data } = await supabase.from("bans").select("*").eq("user_id", userId);
      return (data ?? []).filter((b) => b.expires_at === null || new Date(b.expires_at).getTime() > Date.now());
    },
  });

  async function run(key: string, fn: () => PromiseLike<unknown>, ok: string) {
    setBusy(key);
    try {
      const res = (await fn()) as { error?: { message: string } | null } | undefined;
      if (res && typeof res === "object" && "error" in res && res.error) throw new Error(res.error.message);
      toast.success(ok);
      onDone();
      return true;
    } catch (e) {
      toast.error(adminErrorToArabic(e instanceof Error ? e.message : undefined));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const ranksForMe = assignableRanks(staff.ranks, staff.myLevel);
  const canRanks = staff.can("manage_ranks") && outranks && !profile.is_guest;
  const canMembers = staff.can("manage_members") && (outranks || isMe);
  const canBan = staff.can("ban_users") && outranks;
  const canMic = !!mic && staff.can("moderate_mics") && (outranks || isMe);

  if (!canRanks && !canMembers && !canBan && !canMic) return null;

  return (
    <div className="mt-5 w-full space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" /> أدوات الإشراف
      </p>

      {canMic && mic && (
        <Section title="المايك" icon={<Mic className="size-4" />}>
          <div className="flex gap-2">
            <Button
              variant="glass"
              size="sm"
              className="flex-1"
              disabled={!!busy}
              onClick={() =>
                void run("mic-mute", () => supabase.rpc("admin_mic_mute", { _room: mic.roomId, _seat: mic.seat, _muted: !mic.forceMuted }), mic.forceMuted ? "تم فك كتم المايك" : "تم كتم المايك")
              }
            >
              <MicOff /> {mic.forceMuted ? "فك الكتم" : "كتم المايك"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              disabled={!!busy}
              onClick={() => void run("mic-kick", () => supabase.rpc("admin_mic_kick", { _room: mic.roomId, _seat: mic.seat }), "تم إنزاله من المايك")}
            >
              <UserX /> إنزال من المايك
            </Button>
          </div>
        </Section>
      )}

      {canBan && (
        <Section title="طرد وباند وإسكات" icon={<Ban className="size-4" />}>
          {bans.data?.map((b) => (
            <div key={b.kind} className="flex items-center justify-between gap-2 rounded-lg bg-destructive/15 px-2.5 py-1.5 text-xs">
              <span>
                {b.kind === "ban" ? "محظور" : "مسكت"} {b.expires_at ? `حتى ${new Date(b.expires_at).toLocaleString("ar")}` : "بشكل دائم"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={!!busy}
                onClick={() =>
                  void run("unban", () => supabase.rpc("admin_unban", { _user: userId, _kind: b.kind }), "تم الفك").then(() =>
                    qc.invalidateQueries({ queryKey: ["user-bans", userId] }),
                  )
                }
              >
                فك
              </Button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Select value={duration} onValueChange={setDuration} dir="rtl">
              <SelectTrigger aria-label="المدة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAN_DURATIONS.map((d) => (
                  <SelectItem key={d.label} value={d.minutes === null ? "forever" : String(d.minutes)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="السبب (اختياري)" aria-label="السبب" />
          </div>
          <div className="flex gap-2">
            {(["ban", "mute"] as const).map((kind) => (
              <Button
                key={kind}
                variant={kind === "ban" ? "destructive" : "glass"}
                size="sm"
                className="flex-1"
                disabled={!!busy}
                onClick={() =>
                  void run(
                    kind,
                    () =>
                      supabase.rpc("admin_ban", {
                        _user: userId,
                        _kind: kind,
                        _minutes: (duration === "forever" ? null : Number(duration)) as number,
                        _reason: reason,
                      }),
                    kind === "ban" ? "تم الحظر" : "تم الإسكات",
                  ).then(() => qc.invalidateQueries({ queryKey: ["user-bans", userId] }))
                }
              >
                {kind === "ban" ? <Ban /> : <VolumeX />} {kind === "ban" ? (duration === "10" ? "طرد" : "باند") : "إسكات"}
              </Button>
            ))}
          </div>
          <p className="text-[0.7rem] text-muted-foreground">الباند يمنعه من دخول الموقع، والإسكات يمنعه من الكتابة والمايك فقط.</p>
        </Section>
      )}

      {canRanks && (
        <Section title="الرتبة (المجموعة)" icon={<ShieldCheck className="size-4" />}>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Select value={rankId} onValueChange={setRankId} dir="rtl">
              <SelectTrigger aria-label="الرتبة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون رتبة</SelectItem>
                {ranksForMe.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <RankBadge rank={r} withName />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} placeholder="أيام" aria-label="المدة بالأيام" />
          </div>
          <p className="text-[0.7rem] text-muted-foreground">اترك الأيام فاضية لرتبة دائمة.</p>
          <Button
            variant="gold"
            size="sm"
            className="w-full"
            disabled={!!busy}
            onClick={() =>
              void run(
                "rank",
                () =>
                  supabase.rpc("admin_set_user_rank", {
                    _user: userId,
                    _rank: (rankId === "none" ? null : rankId) as string,
                    _days: (days ? Number(days) : null) as number,
                  }),
                rankId === "none" ? "تم سحب الرتبة" : "تمت الترقية",
              )
            }
          >
            حفظ الرتبة
          </Button>
        </Section>
      )}

      {canMembers && (
        <Section title="بيانات الحساب" icon={<PencilLine className="size-4" />}>
          <div className="space-y-1.5">
            <Label htmlFor="mc-name" className="text-xs">الاسم</Label>
            <div className="flex gap-2">
              <Input id="mc-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
              <Button
                size="sm"
                variant="glass"
                className="h-9"
                disabled={!!busy || name.trim() === profile.username}
                onClick={() => void run("rename", () => rename({ data: { userId, name: name.trim() } }), "تم تغيير الاسم")}
              >
                حفظ
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-likes" className="text-xs">عدد اللايكات</Label>
            <div className="flex gap-2">
              <Input id="mc-likes" type="number" min={0} value={likes} onChange={(e) => setLikes(e.target.value)} />
              <Button
                size="sm"
                variant="glass"
                className="h-9"
                disabled={!!busy || likes === "" || Number(likes) < 0}
                onClick={() => void run("likes", () => supabase.rpc("admin_set_likes", { _user: userId, _count: Math.floor(Number(likes)) }), "تم تعديل اللايكات")}
              >
                حفظ
              </Button>
            </div>
          </div>
          {!profile.is_guest && !isMe && (
            <div className="space-y-1.5">
              <Label htmlFor="mc-pass" className="text-xs">كلمة مرور جديدة</Label>
              <div className="flex gap-2">
                <Input id="mc-pass" type="text" value={password} onChange={(e) => setPasswordValue(e.target.value)} placeholder="6 أحرف على الأقل" autoComplete="off" />
                <Button
                  size="sm"
                  variant="glass"
                  className="h-9"
                  disabled={!!busy || password.length < 6}
                  onClick={() =>
                    void run("pass", () => setPassword({ data: { userId, password } }), "تم تغيير كلمة المرور").then((ok) => ok && setPasswordValue(""))
                  }
                >
                  <KeyRound />
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {profile.avatar_path && (
              <Button
                size="sm"
                variant="glass"
                disabled={!!busy}
                onClick={() =>
                  void run(
                    "avatar",
                    async () => {
                      await supabase.storage.from("avatars").remove([profile.avatar_path!]);
                      return supabase.rpc("admin_clear_avatar", { _user: userId });
                    },
                    "تم حذف الصورة",
                  )
                }
              >
                <ImageOff /> حذف الصورة
              </Button>
            )}
            {!profile.is_guest && !isMe && outranks && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={!!busy}>
                    <Trash2 /> حذف العضوية
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader className="text-start">
                    <AlertDialogTitle>حذف عضوية {profile.username}؟</AlertDialogTitle>
                    <AlertDialogDescription>ينحذف الحساب ورسائله وصوره نهائياً، وما يمكن التراجع.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2">
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() =>
                        void run("delete", () => removeMember({ data: { userId } }), "تم حذف العضوية").then((ok) => {
                          if (ok) {
                            void qc.invalidateQueries({ queryKey: ["admin-members"] });
                            onDeleted();
                          }
                        })
                      }
                    >
                      حذف نهائي
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </Section>
      )}
      {staff.myLevel > 0 && effectiveLevel(currentRank) >= staff.myLevel && !isMe && (
        <p className="text-xs text-muted-foreground">رتبته أعلى أو تساوي رتبتك</p>
      )}
    </div>
  );
}
