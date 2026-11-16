import { useEffect, useRef, useState } from "react";
import { Camera, Heart, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authErrorToArabic, NAME_COLORS, nameBgClass } from "@/lib/auth-utils";
import { uploadMyAvatar } from "@/lib/avatar";
import { useSession } from "@/lib/session";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { RankBadge, UserAvatar, UserName } from "./user-bits";

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { profile, refreshProfile } = useSession();
  const { myRank } = useStaff();
  const [status, setStatus] = useState("");
  const [color, setColor] = useState("gold");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && profile) {
      setStatus(profile.status);
      setColor(profile.color);
      setPass("");
      setPass2("");
    }
  }, [open, profile]);

  if (!profile) return null;

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ status: status.slice(0, 80), color }).eq("id", profile.id);
    setSaving(false);
    if (error) { toast.error("ما قدرنا نحفظ التعديلات"); return; }
    await refreshProfile();
    toast.success("تم حفظ ملفك");
    onOpenChange(false);
  }

  async function onPickFile(file: File | undefined) {
    if (!file || !profile) return;
    if (!file.type.startsWith("image/")) { toast.error("اختر صورة"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("الصورة كبيرة جداً (8 ميجا كحد أقصى)"); return; }
    setUploading(true);
    try {
      await uploadMyAvatar(profile.id, file, profile.avatar_path);
      await refreshProfile();
      toast.success("تم تحديث صورتك");
    } catch {
      toast.error("ما قدرنا نرفع الصورة");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    if (!profile?.avatar_path) return;
    setUploading(true);
    const old = profile.avatar_path;
    const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", profile.id);
    if (!error) await supabase.storage.from("avatars").remove([old]);
    setUploading(false);
    if (error) { toast.error("ما قدرنا نحذف الصورة"); return; }
    await refreshProfile();
    toast.success("تم حذف الصورة");
  }

  async function changePassword() {
    if (pass.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    if (pass !== pass2) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setSavingPass(false);
    if (error) { toast.error(authErrorToArabic(error.message)); return; }
    setPass("");
    setPass2("");
    toast.success("تم تغيير كلمة المرور");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-gradient-panel scrollbar-thin" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display text-2xl">ملفي</DialogTitle>
          <DialogDescription>صورتك ولون اسمك وحالتك اللي تظهر للجميع</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-4 rounded-xl bg-surface-raised p-3">
          <div className="relative">
            <UserAvatar user={{ ...profile, color }} size="xl" className={cn(uploading && "animate-pulse")} />
            {!profile.is_guest && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -end-1 flex size-9 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold"
                aria-label="تغيير الصورة"
              >
                <Camera className="size-4" />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickFile(e.target.files?.[0])} />
          </div>
          <div className="min-w-0 space-y-1">
            <UserName user={{ ...profile, color }} className="text-lg" />
            {myRank && <RankBadge rank={myRank} withName className="block" />}
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Heart className="size-3.5 fill-current text-name-rose" /> {profile.likes_count.toLocaleString("ar")} لايك
            </p>
            {profile.avatar_path && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => void removePhoto()} disabled={uploading}>
                <Trash2 className="size-3.5" /> حذف الصورة
              </Button>
            )}
          </div>
        </div>
        {profile.is_guest && <p className="text-xs text-muted-foreground">الصور الشخصية للأعضاء المسجلين فقط.</p>}
        <div className="space-y-2">
          <Label>لون الاسم</Label>
          <div className="flex flex-wrap gap-2">
            {NAME_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={cn("size-8 rounded-full ring-offset-2 ring-offset-background transition", nameBgClass[c], color === c && "ring-2 ring-ring")}
              />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">الحالة</Label>
          <Input id="status" value={status} maxLength={80} onChange={(e) => setStatus(e.target.value)} placeholder="اكتب شي يعبر عنك..." />
        </div>
        <Button variant="gold" onClick={save} disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ"}
        </Button>

        {!profile.is_guest && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="size-4 text-primary" /> تغيير كلمة المرور
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="كلمة المرور الجديدة" autoComplete="new-password" aria-label="كلمة المرور الجديدة" />
              <Input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="تأكيدها" autoComplete="new-password" aria-label="تأكيد كلمة المرور" />
            </div>
            <Button variant="glass" className="w-full" onClick={() => void changePassword()} disabled={savingPass || !pass}>
              {savingPass ? "جاري الحفظ..." : "تغيير كلمة المرور"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
