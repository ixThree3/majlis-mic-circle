import { cn } from "@/lib/utils";
import { nameBgClass, nameColorClass } from "@/lib/auth-utils";

type Person = { username: string; color: string; is_guest?: boolean };

export function UserName({ user, className }: { user: Person; className?: string }) {
  return (
    <span className={cn("font-semibold", nameColorClass[user.color] ?? "text-foreground", className)}>
      {user.username}
      {user.is_guest && <span className="ms-1 text-[0.7em] font-normal text-muted-foreground">(زائر)</span>}
    </span>
  );
}

export function UserAvatar({ user, size = "md", className }: { user: Person; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "size-8 text-sm", md: "size-10 text-base", lg: "size-14 text-xl" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-sans font-bold text-primary-foreground",
        nameBgClass[user.color] ?? "bg-primary",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {Array.from(user.username.trim())[0] ?? "؟"}
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-tight", className)}>
      <span className="text-gradient-gold">شات</span> <span className="text-foreground">الخليج</span>
    </span>
  );
}
