import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NAME_COLORS, nameBgClass } from "@/lib/auth-utils";
import { adminErrorToArabic, PERMISSIONS, RANK_ICONS, type Permission } from "@/lib/permissions";
import { useStaff, type Rank } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RANK_ICON_COMPONENTS, RankBadge } from "@/components/chat/user-bits";

export function RankEditor({ open, onOpenChange, rank }: { open: boolean; onOpenChange: (o: boolean) => void; rank: Rank | null }) {
  const staff = useStaff();
  const [name, setName] = useState("");
  const [color, setColor] = useState("gold");
  const [icon, setIcon] = useState("shield");
  const [level, setLevel] = useState("10");
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isOwnerRank = !!rank?.is_owner;
  const maxLevel = Math.min(999, staff.myLevel - 1);

  useEffect(() => {
    if (!open) return;
    setName(rank?.name ?? "");
    setColor(rank?.color ?? "gold");
    setIcon(rank?.icon ?? "shield");
    setLevel(String(rank?.level ?? Math.min(10, maxLevel)));
    setPerms(rank?.permissions ?? []);
  }, [open, rank, maxLevel]);

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("admin_save_rank", {
      _id: (rank?.id ?? null) as string,
      _name: name,
      _color: color,
      _icon: icon,
      _level: Number(level),
      _permissions: perms,
    });
    setBusy(false);
    if (error) {
      toast.error(adminErrorToArabic(error.message));
      return;
    }
    toast.success(rank ? "تم حفظ الرتبة" : "تم إنشاء الرتبة");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-gradient-panel scrollbar-thin" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display text-2xl">{rank ? "تعديل رتبة" : "رتبة جديدة"}</DialogTitle>
          <DialogDescription>الرتبة الأعلى مستوى تقدر تتحكم بالرتب الأقل منها فقط.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center rounded-xl bg-surface-raised py-4">
          <RankBadge rank={{ name: name || "اسم الرتبة", color, icon }} withName className="text-xl" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rk-name">اسم الرتبة</Label>
          <Input id="rk-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: مراقب، VIP، ملكي" />
        </div>

        <div className="space-y-1.5">
          <Label>اللون</Label>
          <div className="flex flex-wrap gap-2">
            {NAME_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", nameBgClass[c], color === c && "ring-2 ring-ring")}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>الأيقونة</Label>
          <div className="flex flex-wrap gap-2">
            {RANK_ICONS.map((i) => {
              const Icon = RANK_ICON_COMPONENTS[i]!;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  aria-label={i}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg border border-border bg-surface transition hover:border-primary",
                    icon === i && "border-primary bg-accent text-primary",
                  )}
                >
                  <Icon className="size-5" />
                </button>
              );
            })}
          </div>
        </div>

        {!isOwnerRank && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rk-level">المستوى (1 - {maxLevel})</Label>
              <Input id="rk-level" type="number" min={1} max={maxLevel} value={level} onChange={(e) => setLevel(e.target.value)} />
              <p className="text-xs text-muted-foreground">كل ما زاد الرقم زادت قوة الرتبة. رتبتك مستواها {staff.myLevel}.</p>
            </div>

            <div className="space-y-2">
              <Label>الصلاحيات</Label>
              <ul className="space-y-1.5">
                {PERMISSIONS.map((p) => {
                  const allowed = staff.can(p.key as Permission);
                  const checked = perms.includes(p.key);
                  return (
                    <li key={p.key}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition hover:border-primary/60",
                          checked && "border-primary/70 bg-accent/60",
                          !allowed && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!allowed}
                          onCheckedChange={(v) => setPerms((old) => (v ? [...new Set([...old, p.key])] : old.filter((x) => x !== p.key)))}
                        />
                        {p.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
        {isOwnerRank && <p className="text-sm text-muted-foreground">رتبة المالك عندها كل الصلاحيات دائماً، تقدر تغير اسمها وشكلها فقط.</p>}

        <Button variant="gold" onClick={() => void save()} disabled={busy || name.trim().length < 2}>
          {busy ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
