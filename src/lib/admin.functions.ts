import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { usernameToEmail } from "./auth-utils";

const nameSchema = z.string().trim().min(2).max(20);
const passwordSchema = z.string().min(6).max(72);

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string };

async function requirePermission(ctx: Ctx, perm: string) {
  const { data, error } = await ctx.supabase.rpc("has_permission", { _uid: ctx.userId, _perm: perm });
  if (error || !data) throw new Error("FORBIDDEN");
}

async function requireOutrank(ctx: Ctx, target: string, perm: string) {
  const { data, error } = await ctx.supabase.rpc("can_act_on", { _target: target, _perm: perm });
  if (error || !data) throw new Error("FORBIDDEN");
}

async function writeLog(actorId: string, action: string, targetName: string, details = "", targetId: string | null = null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: actor } = await supabaseAdmin.from("profiles").select("username").eq("id", actorId).maybeSingle();
  await supabaseAdmin.from("admin_log").insert({
    actor_id: actorId,
    actor_name: actor?.username ?? "",
    action,
    target_id: targetId,
    target_name: targetName,
    details,
  });
}

async function memberNameTaken(name: string, exceptId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("id, username").eq("is_guest", false).ilike("username", name);
  return (data ?? []).some((p) => p.username.toLowerCase() === name.toLowerCase() && p.id !== exceptId);
}

export const createMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string; password: string }) =>
    z.object({ username: nameSchema, password: passwordSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context, "manage_members");
    if (await memberNameTaken(data.username)) throw new Error("USERNAME_TAKEN");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: await usernameToEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username },
    });
    if (error || !created.user) throw new Error(error?.message?.includes("already") ? "USERNAME_TAKEN" : error?.message ?? "FAILED");
    await writeLog(context.userId, "member_create", data.username, "", created.user.id);
    return { id: created.user.id };
  });

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOutrank(context, data.userId, "manage_members");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("username").eq("id", data.userId).maybeSingle();
    const { data: files } = await supabaseAdmin.storage.from("avatars").list(data.userId);
    if (files?.length) await supabaseAdmin.storage.from("avatars").remove(files.map((f) => `${data.userId}/${f.name}`));
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("FAILED");
    await writeLog(context.userId, "member_delete", prof?.username ?? "");
    return { ok: true };
  });

export const setMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) =>
    z.object({ userId: z.string().uuid(), password: passwordSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOutrank(context, data.userId, "manage_members");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("username, is_guest").eq("id", data.userId).maybeSingle();
    if (!prof || prof.is_guest) throw new Error("GUEST");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    await writeLog(context.userId, "password_reset", prof.username, "", data.userId);
    return { ok: true };
  });

/** Renames someone. Members log in with their name, so their login follows the new name. */
export const renameUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; name: string }) => z.object({ userId: z.string().uuid(), name: nameSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context, "manage_members");
    if (data.userId !== context.userId) await requireOutrank(context, data.userId, "manage_members");
    if (await memberNameTaken(data.name, data.userId)) throw new Error("USERNAME_TAKEN");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("username, is_guest").eq("id", data.userId).maybeSingle();
    if (!prof) throw new Error("NOT_FOUND");
    if (!prof.is_guest) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: await usernameToEmail(data.name),
        email_confirm: true,
      });
      if (error) throw new Error("USERNAME_TAKEN");
    }
    const { error: rpcErr } = await context.supabase.rpc("admin_rename_user", { _user: data.userId, _name: data.name });
    if (rpcErr) {
      if (!prof.is_guest) {
        await supabaseAdmin.auth.admin.updateUserById(data.userId, { email: await usernameToEmail(prof.username), email_confirm: true });
      }
      throw new Error(rpcErr.message);
    }
    return { ok: true };
  });
