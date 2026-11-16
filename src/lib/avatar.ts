import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Photos live in a private bucket, so we fetch short-lived signed links in
// small batches and cache them for the session.
const TTL_SECONDS = 60 * 60 * 24;
const cache = new Map<string, { url: string; at: number }>();
const waiting = new Map<string, ((url: string | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const paths = [...waiting.keys()];
  if (paths.length === 0) return;
  const cbs = new Map(waiting);
  waiting.clear();
  const { data } = await supabase.storage.from("avatars").createSignedUrls(paths, TTL_SECONDS);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  for (const p of paths) {
    const url = byPath.get(p) ?? null;
    if (url) cache.set(p, { url, at: Date.now() });
    for (const cb of cbs.get(p) ?? []) cb(url);
  }
}

function cached(path: string): string | null {
  const c = cache.get(path);
  if (c && Date.now() - c.at < (TTL_SECONDS - 600) * 1000) return c.url;
  return null;
}

export function useAvatarUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? cached(path) : null));
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const hit = cached(path);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    const list = waiting.get(path) ?? [];
    list.push((u) => alive && setUrl(u));
    waiting.set(path, list);
    if (!timer) timer = setTimeout(() => void flush(), 40);
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

/** Crops to a centered square and shrinks to 256px webp before upload. */
export async function prepareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - size) / 2;
  const sy = (bitmap.height - size) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, 256, 256);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
  if (!blob) throw new Error("encode failed");
  return blob;
}

export async function uploadMyAvatar(userId: string, file: File, oldPath: string | null) {
  const blob = await prepareAvatar(file);
  const path = `${userId}/${Date.now().toString(36)}.webp`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp" });
  if (error) throw error;
  const { error: upErr } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (upErr) throw upErr;
  if (oldPath) void supabase.storage.from("avatars").remove([oldPath]);
  return path;
}
