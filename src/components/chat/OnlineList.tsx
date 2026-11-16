import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { OnlineUser } from "@/lib/session";
import { useMemberCard } from "./MemberCard";
import { UserAvatar, UserName } from "./user-bits";

type Row = Pick<OnlineUser, "id" | "username" | "color" | "status" | "is_guest"> & { room_id?: string | null; avatar_path?: string | null };

export function OnlineList({
  users,
  meId,
  roomNames,
  linkToMessages = true,
}: {
  users: Row[];
  meId?: string | undefined;
  roomNames?: Record<string, string>;
  linkToMessages?: boolean;
}) {
  const card = useMemberCard();
  if (users.length === 0) return <p className="px-3 py-6 text-center text-sm text-muted-foreground">لا يوجد أحد متصل الآن</p>;
  return (
    <ul className="divide-y divide-border/60">
      {users.map((u) => {
        const room = u.room_id && roomNames ? roomNames[u.room_id] : undefined;
        const inner = (
          <>
            <UserAvatar user={u} size="sm" />
            <div className="min-w-0 flex-1 text-start">
              <UserName user={u} className="flex text-sm" />
              <p className="truncate text-xs text-muted-foreground">{u.status || (room ? `في ${room}` : "\u00a0")}</p>
            </div>
            <ChevronLeft className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </>
        );
        const cls = "group flex w-full items-center gap-3 px-3 py-2 transition hover:bg-accent/50";
        return (
          <li key={u.id}>
            {card ? (
              <button type="button" onClick={() => card.open(u.id)} className={cls}>
                {inner}
              </button>
            ) : linkToMessages && u.id !== meId ? (
              <Link to="/messages" search={{ with: u.id }} className={cls}>
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
