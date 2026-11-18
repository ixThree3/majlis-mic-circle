// Pure helpers for ranks & permissions. The database enforces every rule;
// these only decide what to show in the interface.

export const PERMISSIONS = [
  { key: "manage_ranks", label: "إدارة الرتب والترقيات" },
  { key: "manage_members", label: "إدارة العضويات (إنشاء، حذف، أسماء، صور، لايكات)" },
  { key: "ban_users", label: "الطرد والباند والإسكات" },
  { key: "moderate_mics", label: "إنزال وكتم المايكات" },
  { key: "delete_messages", label: "حذف رسائل الغرف" },
  { key: "manage_rooms", label: "تعديل وحذف الغرف" },
  { key: "view_log", label: "مشاهدة سجل الإشراف" },
  { key: "reveal_users", label: "الكشف (وقت الدخول، الآيبي، نوع الجهاز)" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const RANK_ICONS = ["crown", "shield", "star", "gem", "flame", "award", "sparkles", "heart", "zap", "badge"] as const;
export type RankIcon = (typeof RANK_ICONS)[number];

export const OWNER_LEVEL = 1000;

export type RankLike = { level: number; is_owner: boolean; permissions: string[] };
export type Assignment = { expires_at: string | null };

export function effectiveLevel(rank: RankLike | null | undefined): number {
  if (!rank) return 0;
  return rank.is_owner ? OWNER_LEVEL : rank.level;
}

export function isAssignmentActive(a: Assignment | null | undefined, now = Date.now()): boolean {
  if (!a) return false;
  return a.expires_at === null || new Date(a.expires_at).getTime() > now;
}

export function rankHas(rank: RankLike | null | undefined, perm: Permission): boolean {
  if (!rank) return false;
  return rank.is_owner || rank.permissions.includes(perm);
}

/** You can act on someone only if your rank is strictly higher than theirs. */
export function canManage(myLevel: number, targetLevel: number, isSelf: boolean): boolean {
  return !isSelf && myLevel > targetLevel;
}

/** Ranks you are allowed to hand out: strictly below your own level; owners may also hand out the owner rank. */
export function assignableRanks<T extends RankLike>(ranks: T[], myLevel: number): T[] {
  return ranks.filter((r) => effectiveLevel(r) < myLevel || (r.is_owner && myLevel >= OWNER_LEVEL));
}

export const BAN_DURATIONS = [
  { label: "طرد (10 دقائق)", minutes: 10 },
  { label: "ساعة", minutes: 60 },
  { label: "يوم", minutes: 60 * 24 },
  { label: "أسبوع", minutes: 60 * 24 * 7 },
  { label: "شهر", minutes: 60 * 24 * 30 },
  { label: "دائم", minutes: null },
] as const;

export const LOG_ACTIONS: Record<string, string> = {
  ban: "باند",
  unban: "فك الباند",
  silence: "إسكات",
  unsilence: "فك الإسكات",
  rank_assign: "ترقية",
  rank_remove: "سحب الرتبة",
  rank_create: "إنشاء رتبة",
  rank_edit: "تعديل رتبة",
  rank_delete: "حذف رتبة",
  mic_kick: "إنزال من المايك",
  mic_mute: "كتم المايك",
  mic_unmute: "فك كتم المايك",
  message_delete: "حذف رسالة",
  room_edit: "تعديل غرفة",
  room_delete: "حذف غرفة",
  rename: "تغيير اسم",
  likes: "تعديل اللايكات",
  avatar_remove: "حذف صورة",
  member_create: "إنشاء عضوية",
  member_delete: "حذف عضوية",
  password_reset: "تغيير كلمة مرور",
  settings: "تعديل إعدادات الموقع",
  room_clear: "مسح رسائل غرفة",
};

export function adminErrorToArabic(message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("FORBIDDEN")) return "ما عندك صلاحية لهذا الإجراء";
  if (m.includes("USERNAME_TAKEN")) return "هذا الاسم مستخدم لعضو آخر";
  if (m.includes("USERNAME_INVALID")) return "الاسم يجب أن يكون بين 2 و 20 حرف";
  if (m.includes("RANK_LEVEL_INVALID")) return "مستوى الرتبة لازم يكون أقل من مستوى رتبتك (1 - 999)";
  if (m.includes("RANK_NAME_INVALID")) return "اسم الرتبة بين 2 و 24 حرف";
  if (m.includes("GUEST")) return "ما يمكن ترقية الزوار، لازم عضوية مسجلة";
  return "حدث خطأ، حاول مرة أخرى";
}

export type DeviceInfo = { device: string; os: string; browser: string };

/** Rough, dependency-free reading of a browser's user-agent string for the reveal tool. */
export function parseUserAgent(ua: string): DeviceInfo {
  const u = ua || "";
  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u));
  const mobile = !tablet && /Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(u);
  const device = tablet ? "تابلت" : mobile ? "جوال" : u ? "كمبيوتر" : "غير معروف";
  let os = "غير معروف";
  if (/iPhone|iPad|iPod/i.test(u)) os = "iOS";
  else if (/Android/i.test(u)) os = "Android";
  else if (/Windows/i.test(u)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(u)) os = "macOS";
  else if (/CrOS/i.test(u)) os = "ChromeOS";
  else if (/Linux/i.test(u)) os = "Linux";
  let browser = "غير معروف";
  if (/Edg\//i.test(u)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(u)) browser = "Opera";
  else if (/SamsungBrowser/i.test(u)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/i.test(u)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(u)) browser = "Chrome";
  else if (/Safari/i.test(u)) browser = "Safari";
  return { device, os, browser };
}

/** Picks the visitor's address from proxy headers (Cloudflare first). */
export function clientIpFromHeaders(get: (name: string) => string | null): string {
  const cf = get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (get("x-real-ip") ?? "").trim();
}
