import { describe, expect, it } from "vitest";
import { isSeatActive, normalizeUsername, usernameToEmail, validateUsername } from "./auth-utils";

describe("usernames", () => {
  it("treats names case- and space-insensitively", async () => {
    expect(normalizeUsername("  Ahmed   Ali ")).toBe("ahmed ali");
    expect(await usernameToEmail("Ahmed Ali")).toBe(await usernameToEmail(" ahmed  ali"));
  });

  it("gives different names different logins", async () => {
    expect(await usernameToEmail("أحمد")).not.toBe(await usernameToEmail("احمد"));
  });

  it("requires 2 to 20 characters", () => {
    expect(validateUsername("ا")).not.toBeNull();
    expect(validateUsername("حنو")).toBeNull();
    expect(validateUsername("a".repeat(21))).not.toBeNull();
  });
});

describe("mic seats", () => {
  it("frees a seat after 45 seconds without a heartbeat", () => {
    const now = Date.now();
    expect(isSeatActive({ user_id: "u", last_seen: new Date(now - 10_000).toISOString() }, now)).toBe(true);
    expect(isSeatActive({ user_id: "u", last_seen: new Date(now - 46_000).toISOString() }, now)).toBe(false);
    expect(isSeatActive({ user_id: null, last_seen: null }, now)).toBe(false);
  });
});
