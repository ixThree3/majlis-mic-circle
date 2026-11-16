import { Award, BadgeCheck, Crown, Flame, Gem, Heart, Shield, Sparkles, Star, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { nameBgClass, nameColorClass } from "@/lib/auth-utils";
import { useAvatarUrl } from "@/lib/avatar";
import { useStaff, type Rank } from "@/lib/staff";

export type Person = { id?: string; username: string; color: string; is_guest?: boolean; avatar_path?: string | null };

export const RANK_ICON_COMPONENTS: Record<string, LucideIcon> = {
  crown: Crown,
  shield: Shield,
  star: Star,
  gem: Gem,
  flame: Flame,
  award: Award,
  sparkles: Sparkles,
  heart: Heart,
  zap: Zap,
  badge: BadgeCheck,
};

export function RankBadge({ rank, withName = false, className }: { rank: Pick<Rank, "name" | "color" | "icon">; withName?: boolean; className?: string }) {
  const Icon = RANK_ICON_COMPONENTS[rank.icon] ?? Shield;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 align-middle", nameColorClass[rank.color] ?? "text-primary", className)}
      title={rank.name}
    >
      <Icon className="size-[1.05em]" aria-hidden />
      {withName ? <span className="text-[0.8em] font-semibold">{rank.name}</span> : <span className="sr-only">{rank.name}</span>}
    </span>
  );
}

export function UserName({ user, className, showRank = true }: { user: Person; className?: string; showRank?: boolean }) {
  const { rankOf } = useStaff();
  const rank = showRank ? rankOf(user.id) : null;
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1 font-semibold", nameColorClass[user.color] ?? "text-foreground", className)}>
      {rank && <RankBadge rank={rank} />}
      <span className="truncate">{user.username}</span>
      {user.is_guest && <span className="shrink-0 text-[0.7em] font-normal text-muted-foreground">(زائر)</span>}
    </span>
  );
}

export function UserAvatar({ user, size = "md", className }: { user: Person; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { sm: "size-8 text-sm", md: "size-10 text-base", lg: "size-14 text-xl", xl: "size-24 text-4xl" };
  const url = useAvatarUrl(user.avatar_path);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        className={cn("shrink-0 rounded-full bg-surface-raised object-cover", sizes[size], className)}
        loading="lazy"
      />
    );
  }
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
