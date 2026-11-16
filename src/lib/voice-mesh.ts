import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Peer-to-peer voice for a room. Each person on a mic sends their audio
 * directly to every other person in the room; listeners only receive.
 * Signaling (offers/answers/ICE) travels over the room's realtime channel.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

type Signal =
  | { kind: "offer"; from: string; to: string; sid: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sid: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; sid: string; dir: "toListener" | "toSpeaker"; candidate: RTCIceCandidateInit }
  | { kind: "bye"; from: string; to: string | "*" }
  | { kind: "hello"; from: string; to: "*" };

type Link = { pc: RTCPeerConnection; sid: string; pending: RTCIceCandidateInit[]; remoteSet: boolean };

export class VoiceMesh {
  private outgoing = new Map<string, Link>();
  private incoming = new Map<string, Link & { stream: MediaStream | null }>();
  private local: MediaStream | null = null;
  private members = new Set<string>();
  private destroyed = false;

  constructor(
    private channel: RealtimeChannel,
    private myId: string,
    private onStreams: (streams: Map<string, MediaStream>) => void,
  ) {}

  get localStream() {
    return this.local;
  }

  get speaking() {
    return this.local !== null;
  }

  /** Call once the channel is subscribed so speakers send us their audio. */
  announce() {
    this.send({ kind: "hello", from: this.myId, to: "*" });
  }

  async startSpeaking(): Promise<MediaStream> {
    if (this.local) return this.local;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("destroyed");
    }
    this.local = stream;
    for (const id of this.members) if (id !== this.myId) void this.offerTo(id);
    this.emit();
    return stream;
  }

  stopSpeaking() {
    if (!this.local) return;
    this.local.getTracks().forEach((t) => t.stop());
    this.local = null;
    for (const [id, link] of this.outgoing) {
      link.pc.close();
      this.send({ kind: "bye", from: this.myId, to: id });
    }
    this.outgoing.clear();
    this.emit();
  }

  setMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  syncMembers(ids: string[]) {
    const next = new Set(ids);
    // new members
    if (this.local) {
      for (const id of next) if (id !== this.myId && !this.outgoing.has(id)) void this.offerTo(id);
    }
    // departed members
    for (const [id, link] of this.outgoing) if (!next.has(id)) { link.pc.close(); this.outgoing.delete(id); }
    let changed = false;
    for (const [id, link] of this.incoming) if (!next.has(id)) { link.pc.close(); this.incoming.delete(id); changed = true; }
    this.members = next;
    if (changed) this.emit();
  }

  /** Drop incoming audio from people who are no longer on a mic. */
  keepSpeakers(speakerIds: Set<string>) {
    let changed = false;
    for (const [id, link] of this.incoming) {
      if (!speakerIds.has(id)) { link.pc.close(); this.incoming.delete(id); changed = true; }
    }
    if (changed) this.emit();
  }

  async handle(sig: Signal) {
    if (this.destroyed || sig.from === this.myId) return;
    if (sig.to !== "*" && sig.to !== this.myId) return;
    try {
      switch (sig.kind) {
        case "hello": {
          if (!this.local) return;
          const existing = this.outgoing.get(sig.from);
          if (existing && existing.pc.connectionState === "connected") return;
          void this.offerTo(sig.from);
          return;
        }
        case "offer":
          await this.acceptOffer(sig.from, sig.sid, sig.sdp);
          return;
        case "answer": {
          const link = this.outgoing.get(sig.from);
          if (!link || link.sid !== sig.sid) return;
          await link.pc.setRemoteDescription(sig.sdp);
          link.remoteSet = true;
          for (const c of link.pending.splice(0)) await link.pc.addIceCandidate(c).catch(() => {});
          return;
        }
        case "ice": {
          const link = sig.dir === "toSpeaker" ? this.outgoing.get(sig.from) : this.incoming.get(sig.from);
          if (!link || link.sid !== sig.sid) {
            // offer may still be processing; stash on a placeholder queue
            if (sig.dir === "toListener") this.earlyIce(sig.from, sig.sid, sig.candidate);
            return;
          }
          if (link.remoteSet) await link.pc.addIceCandidate(sig.candidate).catch(() => {});
          else link.pending.push(sig.candidate);
          return;
        }
        case "bye": {
          const link = this.incoming.get(sig.from);
          if (link) { link.pc.close(); this.incoming.delete(sig.from); this.emit(); }
          return;
        }
      }
    } catch (err) {
      console.warn("voice signal failed", err);
    }
  }

  destroy() {
    this.destroyed = true;
    this.stopSpeaking();
    for (const link of this.incoming.values()) link.pc.close();
    this.incoming.clear();
    this.emit();
  }

  /* ---------------- internals ---------------- */

  private early = new Map<string, { sid: string; list: RTCIceCandidateInit[] }>();
  private earlyIce(from: string, sid: string, c: RTCIceCandidateInit) {
    const e = this.early.get(from);
    if (!e || e.sid !== sid) this.early.set(from, { sid, list: [c] });
    else e.list.push(c);
  }

  private async offerTo(peerId: string) {
    if (!this.local || this.destroyed) return;
    this.outgoing.get(peerId)?.pc.close();
    const sid = crypto.randomUUID();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link: Link = { pc, sid, pending: [], remoteSet: false };
    this.outgoing.set(peerId, link);
    for (const track of this.local.getAudioTracks()) pc.addTrack(track, this.local);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ kind: "ice", from: this.myId, to: peerId, sid, dir: "toListener", candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && this.outgoing.get(peerId)?.sid === sid) {
        setTimeout(() => {
          if (this.outgoing.get(peerId)?.sid === sid && this.members.has(peerId)) void this.offerTo(peerId);
        }, 2000);
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ kind: "offer", from: this.myId, to: peerId, sid, sdp: offer });
  }

  private async acceptOffer(from: string, sid: string, sdp: RTCSessionDescriptionInit) {
    this.incoming.get(from)?.pc.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link = { pc, sid, pending: [] as RTCIceCandidateInit[], remoteSet: false, stream: null as MediaStream | null };
    this.incoming.set(from, link);
    pc.ontrack = (e) => {
      link.stream = e.streams[0] ?? new MediaStream([e.track]);
      if (this.incoming.get(from) === link) this.emit();
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ kind: "ice", from: this.myId, to: from, sid, dir: "toSpeaker", candidate: e.candidate.toJSON() });
    };
    await pc.setRemoteDescription(sdp);
    link.remoteSet = true;
    const early = this.early.get(from);
    if (early && early.sid === sid) {
      for (const c of early.list) await pc.addIceCandidate(c).catch(() => {});
      this.early.delete(from);
    }
    for (const c of link.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.send({ kind: "answer", from: this.myId, to: from, sid, sdp: answer });
  }

  private send(payload: Signal) {
    void this.channel.send({ type: "broadcast", event: "rtc", payload });
  }

  private emit() {
    const map = new Map<string, MediaStream>();
    for (const [id, link] of this.incoming) if (link.stream) map.set(id, link.stream);
    if (this.local) map.set(this.myId, this.local);
    this.onStreams(map);
  }
}
