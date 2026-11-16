import { describe, expect, it } from "vitest";
import { assignableRanks, canManage, effectiveLevel, isAssignmentActive, rankHas } from "./permissions";

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

  it("only offers ranks below your own", () => {
    expect(assignableRanks([owner, admin, mod], 500)).toEqual([mod]);
    expect(assignableRanks([owner, admin, mod], 1000)).toEqual([admin, mod]);
  });

  it("drops a timed rank once its days run out", () => {
    const now = Date.now();
    expect(isAssignmentActive({ expires_at: null }, now)).toBe(true);
    expect(isAssignmentActive({ expires_at: new Date(now + 60_000).toISOString() }, now)).toBe(true);
    expect(isAssignmentActive({ expires_at: new Date(now - 60_000).toISOString() }, now)).toBe(false);
  });
});
