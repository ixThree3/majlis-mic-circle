import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import type { OnlineUser } from "@/lib/session";
import { UserAvatar, UserName } from "./user-bits";

export function OnlineList({
  users,
  meId,
  roomNames,
  linkToMessages = true,
}: {
  users: (Pick<OnlineUser, "id" | "username" | "color" | "status" | "is_guest"> & { room_id?: string | null })[];
  meId?: string | undefined;
  roomNames?: Record<string, string>;
  linkToMessages?: boolean;
}) {
  if (users.length === 0) return <p className="px-3 py-6 text-center text-sm text-muted-foreground">لا يوجد أحد متصل الآن</p>;
  return (
    <ul className="divide-y divide-border/60">
      {users.map((u) => {
        const room = u.room_id && roomNames ? roomNames[u.room_id] : undefined;
        const inner = (
          <>
            <UserAvatar user={u} size="sm" />
            <div className="min-w-0 flex-1">
              <UserName user={u} className="block truncate text-sm" />
              <p className="truncate text-xs text-muted-foreground">{u.status || (room ? `في ${room}` : "\u00a0")}</p>
            </div>
            {linkToMessages && u.id !== meId && <MessageCircle className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
          </>
        );
        return (
          <li key={u.id}>
            {linkToMessages && u.id !== meId ? (
              <Link to="/messages" search={{ with: u.id }} className="group flex items-center gap-3 px-3 py-2 transition hover:bg-accent/50">
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
