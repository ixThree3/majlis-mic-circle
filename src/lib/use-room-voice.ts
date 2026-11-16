import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VoiceMesh } from "./voice-mesh";
import type { OnlineUser } from "./session";

export type RoomMember = Pick<OnlineUser, "id" | "username" | "color" | "status" | "is_guest" | "avatar_path">;

/** Joins a room's live channel: who is in the room + voice between mic holders and listeners. */
export function useRoomVoice(roomId: string, me: RoomMember | null) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [streams, setStreams] = useState<Map<string, MediaStream>>(new Map());
  const meshRef = useRef<VoiceMesh | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    const mesh = new VoiceMesh(channel, me.id, setStreams);
    channelRef.current = null;
    meshRef.current = mesh;

    channel
      .on("broadcast", { event: "rtc" }, ({ payload }) => void mesh.handle(payload))
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<RoomMember>();
        const list: RoomMember[] = [];
        for (const metas of Object.values(state)) if (metas[0]?.id) list.push(metas[0]);
        setMembers(list);
        mesh.syncMembers(list.map((m) => m.id));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ id: me.id, username: me.username, color: me.color, status: me.status, is_guest: me.is_guest, avatar_path: me.avatar_path });
          mesh.announce();
          channelRef.current = channel;
        }
      });

    return () => {
      mesh.destroy();
      meshRef.current = null;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, me?.id]);

  // keep my presence card fresh (new photo, status) without reconnecting voice
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !me) return;
    void ch.track({ id: me.id, username: me.username, color: me.color, status: me.status, is_guest: me.is_guest, avatar_path: me.avatar_path });
  }, [me]);

  const startSpeaking = useCallback(async () => {
    if (!meshRef.current) throw new Error("not connected");
    return meshRef.current.startSpeaking();
  }, []);
  const stopSpeaking = useCallback(() => meshRef.current?.stopSpeaking(), []);
  const setMuted = useCallback((m: boolean) => meshRef.current?.setMuted(m), []);
  const keepSpeakers = useCallback((ids: Set<string>) => meshRef.current?.keepSpeakers(ids), []);

  return { members, streams, startSpeaking, stopSpeaking, setMuted, keepSpeakers };
}

/** Which streams currently carry voice above a small threshold. */
export function useSpeakingIds(streams: Map<string, MediaStream>) {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (streams.size === 0) {
      setSpeaking(new Set());
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analysers: [string, AnalyserNode][] = [];
    for (const [id, stream] of streams) {
      if (stream.getAudioTracks().length === 0) continue;
      try {
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        analysers.push([id, an]);
      } catch {
        /* ignore */
      }
    }
    const buf = new Uint8Array(256);
    const timer = setInterval(() => {
      if (ctx.state === "suspended") void ctx.resume();
      const next = new Set<string>();
      for (const [id, an] of analysers) {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = ((buf[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        if (Math.sqrt(sum / buf.length) > 0.04) next.add(id);
      }
      setSpeaking((prev) => (prev.size === next.size && [...next].every((x) => prev.has(x)) ? prev : next));
    }, 180);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [streams]);

  return speaking;
}
