// Members sign in with a username only. Auth needs an email, so we derive a
// deterministic, private address from the normalized username.
export function normalizeUsername(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateUsername(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "الاسم قصير جداً (حرفين على الأقل)";
  if (n.length > 20) return "الاسم طويل جداً (20 حرف كحد أقصى)";
  return null;
}

export async function usernameToEmail(name: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeUsername(name));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
  return `m${hex}@members.alkhaleej-chat.app`;
}

export function authErrorToArabic(message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("USERNAME_TAKEN") || m.includes("already registered"))
    return "هذا الاسم مسجل لعضو آخر، اختر اسماً غيره";
  if (m.includes("USERNAME_INVALID")) return "الاسم يجب أن يكون بين 2 و 20 حرف";
  if (m.includes("Invalid login credentials")) return "الاسم أو كلمة المرور غير صحيحة";
  if (m.toLowerCase().includes("password") && m.toLowerCase().includes("weak"))
    return "كلمة المرور ضعيفة أو مسربة، اختر كلمة أقوى";
  if (m.toLowerCase().includes("password should be at least"))
    return "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
  if (m.includes("Database error")) return "هذا الاسم غير متاح، جرّب اسماً آخر";
  if (m.toLowerCase().includes("rate limit")) return "محاولات كثيرة، انتظر قليلاً ثم حاول مجدداً";
  return "حدث خطأ، حاول مرة أخرى";
}

export const NAME_COLORS = ["gold", "coral", "teal", "sky", "rose", "lime", "violet", "pearl"] as const;
export type NameColor = (typeof NAME_COLORS)[number];

export const nameColorClass: Record<string, string> = {
  gold: "text-name-gold",
  coral: "text-name-coral",
  teal: "text-name-teal",
  sky: "text-name-sky",
  rose: "text-name-rose",
  lime: "text-name-lime",
  violet: "text-name-violet",
  pearl: "text-name-pearl",
};

export const nameBgClass: Record<string, string> = {
  gold: "bg-name-gold",
  coral: "bg-name-coral",
  teal: "bg-name-teal",
  sky: "bg-name-sky",
  rose: "bg-name-rose",
  lime: "bg-name-lime",
  violet: "bg-name-violet",
  pearl: "bg-name-pearl",
};

/** A mic seat counts as taken only while its holder keeps sending heartbeats. */
export const MIC_STALE_MS = 45_000;
export function isSeatActive(seat: { user_id: string | null; last_seen: string | null }, now = Date.now()) {
  if (!seat.user_id || !seat.last_seen) return false;
  return now - new Date(seat.last_seen).getTime() < MIC_STALE_MS;
}
