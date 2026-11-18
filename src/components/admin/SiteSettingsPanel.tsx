import { useEffect, useState } from "react";
import { Megaphone, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminErrorToArabic } from "@/lib/permissions";
import { useSiteSettings } from "@/lib/site-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function SiteSettingsPanel() {
  const settings = useSiteSettings();
  const [announcement, setAnnouncement] = useState("");
  const [guests, setGuests] = useState(true);
  const [signups, setSignups] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setAnnouncement(settings.data.announcement);
    setGuests(settings.data.guests_enabled);
    setSignups(settings.data.signups_enabled);
  }, [settings.data]);

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_settings", { _announcement: announcement, _guests: guests, _signups: signups });
    setBusy(false);
    if (error) { toast.error(adminErrorToArabic(error.message)); return; }
    toast.success("تم حفظ إعدادات الموقع");
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-panel">
      <div className="space-y-2">
        <Label htmlFor="ann" className="flex items-center gap-1.5">
          <Megaphone className="size-4 text-primary" /> إعلان أعلى الموقع
        </Label>
        <Textarea id="ann" value={announcement} maxLength={300} onChange={(e) => setAnnouncement(e.target.value)} placeholder="يظهر لكل المتواجدين أعلى الصفحة. اتركه فاضي لإخفائه." />
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3">
        <span className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-primary" /> السماح بدخول الزوار
        </span>
        <Switch checked={guests} onCheckedChange={setGuests} />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3">
        <span className="flex items-center gap-2 text-sm">
          <UserPlus className="size-4 text-primary" /> فتح التسجيل للأعضاء الجدد
        </span>
        <Switch checked={signups} onCheckedChange={setSignups} />
      </label>
      <p className="text-xs text-muted-foreground">لو قفلت التسجيل، تقدر تنشئ عضويات بنفسك من قسم الأعضاء.</p>
      <Button variant="gold" onClick={() => void save()} disabled={busy}>
        {busy ? "جاري الحفظ..." : "حفظ الإعدادات"}
      </Button>
    </section>
  );
}
