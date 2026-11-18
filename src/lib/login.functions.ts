import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clientIpFromHeaders, parseUserAgent } from "./permissions";

/** Records a sign-in (time, IP, device) for the reveal tool. Read from the request, never from the browser. */
export const recordLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const req = getRequest();
    const ip = clientIpFromHeaders((n) => req.headers.get(n));
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 400);
    const { device, os, browser } = parseUserAgent(ua);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("login_events")
      .select("id")
      .eq("user_id", context.userId)
      .eq("ip", ip)
      .eq("user_agent", ua)
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) return { ok: true };
    await supabaseAdmin.from("login_events").insert({ user_id: context.userId, ip, user_agent: ua, device, os, browser });
    return { ok: true };
  });
