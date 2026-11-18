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
