import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initialOf } from '@/domain/profile';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: 'size-7 [&_[data-slot=avatar-fallback]]:text-xs',
  lg: 'size-16 [&_[data-slot=avatar-fallback]]:text-xl',
} as const;

/**
 * The photo, or the first initial when there is none (SPEC §4.6). Decorative:
 * every use sits beside the name in text or inside a labelled control, which is
 * the text alternative (§10.1) — so the image is alt="" and the initial is
 * hidden rather than read out as a stray letter.
 */
export function UserAvatar({ name, src, size = 'sm' }: { name: string; src: string | null | undefined; size?: keyof typeof SIZE }) {
  return (
    <Avatar className={cn(SIZE[size])}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback aria-hidden="true" className="bg-accent font-semibold text-accent-foreground">
        {initialOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
