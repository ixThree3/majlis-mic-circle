import { useEffect, useRef } from "react";

/** Plays one person's incoming voice. */
export function RemoteAudio({ stream, muted, onBlocked }: { stream: MediaStream; muted: boolean; onBlocked: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "NotAllowedError") onBlocked();
    });
  }, [stream, onBlocked]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}
