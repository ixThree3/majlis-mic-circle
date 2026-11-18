import { describe, expect, it } from "vitest";
import { assignableRanks, canManage, clientIpFromHeaders, effectiveLevel, isAssignmentActive, parseUserAgent, rankHas } from "./permissions";

const owner = { level: 1000, is_owner: true, permissions: [] as string[] };
const admin = { level: 500, is_owner: false, permissions: ["manage_members", "ban_users"] };
const mod = { level: 100, is_owner: false, permissions: ["ban_users"] };

describe("ranks", () => {
  it("gives the owner every permission", () => {
    expect(rankHas(owner, "manage_ranks")).toBe(true);
    expect(rankHas(mod, "manage_ranks")).toBe(false);
    expect(rankHas(null, "ban_users")).toBe(false);
  });

  it("only lets a higher rank act on a lower one, never on yourself", () => {
    expect(canManage(effectiveLevel(admin), effectiveLevel(mod), false)).toBe(true);
    expect(canManage(effectiveLevel(mod), effectiveLevel(admin), false)).toBe(false);
    expect(canManage(500, 500, false)).toBe(false);
    expect(canManage(1000, 0, true)).toBe(false);
  });

  it("only offers ranks below your own, but owners can also make new owners", () => {
    expect(assignableRanks([owner, admin, mod], 500)).toEqual([mod]);
    expect(assignableRanks([owner, admin, mod], 1000)).toEqual([owner, admin, mod]);
  });

  it("drops a timed rank once its days run out", () => {
    const now = Date.now();
    expect(isAssignmentActive({ expires_at: null }, now)).toBe(true);
    expect(isAssignmentActive({ expires_at: new Date(now + 60_000).toISOString() }, now)).toBe(true);
    expect(isAssignmentActive({ expires_at: new Date(now - 60_000).toISOString() }, now)).toBe(false);
  });
});

describe("reveal", () => {
  it("tells phones, tablets and computers apart", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
    const tab = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
    const pc = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0";
    expect(parseUserAgent(iphone)).toEqual({ device: "جوال", os: "iOS", browser: "Safari" });
    expect(parseUserAgent(tab).device).toBe("تابلت");
    expect(parseUserAgent(pc)).toEqual({ device: "كمبيوتر", os: "Windows", browser: "Edge" });
  });

  it("uses the first forwarded address when Cloudflare's is missing", () => {
    const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
    expect(clientIpFromHeaders(h({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIpFromHeaders(h({}))).toBe("");
  });
});
