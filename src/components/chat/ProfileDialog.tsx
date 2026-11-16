import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { NAME_COLORS, nameBgClass } from "@/lib/auth-utils";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { UserAvatar, UserName } from "./user-bits";

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { profile, refreshProfile } = useSession();
  const [status, setStatus] = useState("");
  const [color, setColor] = useState("gold");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && profile) {
      setStatus(profile.status);
      setColor(profile.color);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-panel" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display text-2xl">ملفي</DialogTitle>
          <DialogDescription>غيّر لون اسمك وحالتك اللي تظهر للجميع</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-xl bg-surface-raised p-3">
          <UserAvatar user={{ ...profile, color }} size="lg" />
          <div className="min-w-0">
            <UserName user={{ ...profile, color }} className="text-lg" />
            <p className="truncate text-sm text-muted-foreground">{status || "بدون حالة"}</p>
          </div>
        </div>
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
      </DialogContent>
    </Dialog>
  );
}
