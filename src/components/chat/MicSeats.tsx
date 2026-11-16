import { Mic, MicOff, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user-bits";

export type SeatView = {
  seat: number;
  user: { id: string; username: string; color: string; is_guest: boolean; avatar_path: string | null } | null;
  muted: boolean;
  forceMuted: boolean;
};

export function MicSeats({
  seats,
  meId,
  speaking,
  busySeat,
  onSeatClick,
}: {
  seats: SeatView[];
  meId: string;
  speaking: Set<string>;
  busySeat: number | null;
  onSeatClick: (seat: SeatView) => void;
}) {
  return (
    <ul className="flex items-start justify-center gap-3 sm:gap-6">
      {seats.map((s) => {
        const mine = s.user?.id === meId;
        const talking = !!s.user && !s.muted && speaking.has(s.user.id);
        return (
          <li key={s.seat} className="flex w-16 flex-col items-center gap-1.5 sm:w-20">
            <button
              type="button"
              onClick={() => onSeatClick(s)}
              disabled={busySeat !== null}
              aria-label={s.user ? `مايك ${s.seat}: ${s.user.username}` : `اصعد على مايك ${s.seat}`}
              className={cn(
                "relative flex size-14 items-center justify-center rounded-full transition sm:size-16",
                s.user
                  ? "cursor-pointer"
                  : "border-2 border-dashed border-primary/50 bg-surface-raised text-primary hover:border-primary hover:bg-accent",
                mine && "cursor-pointer ring-2 ring-primary ring-offset-2 ring-offset-surface",
                busySeat === s.seat && "animate-pulse",
              )}
            >
              {s.user ? (
                <UserAvatar user={s.user} size="lg" className={cn("size-14 sm:size-16", talking && "animate-speak")} />
              ) : (
                <span className="flex flex-col items-center">
                  <Mic className="size-5" />
                  <Plus className="absolute bottom-1 size-3" />
                </span>
              )}
              {s.user && s.muted && (
                <span className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                  <MicOff className="size-3.5" />
                </span>
              )}
              {talking && (
                <span className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Mic className="size-3.5" />
                </span>
              )}
            </button>
            <span className={cn("w-full truncate text-center text-xs", s.user ? "text-foreground" : "text-muted-foreground")}>
              {s.user ? s.user.username : `مايك ${s.seat}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
