import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface PlayerAvatarProps {
  photoUrl?: string | null;
  gender: string;
  name: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
  xl: 'h-32 w-32',
};

function MaleSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="20" r="12" fill="hsl(217,91%,60%)" opacity="0.7" />
      <path d="M16 56c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="hsl(217,91%,60%)" opacity="0.5" />
      <circle cx="32" cy="20" r="10" fill="hsl(217,91%,70%)" opacity="0.4" />
    </svg>
  );
}

function FemaleSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="20" r="12" fill="hsl(330,70%,60%)" opacity="0.7" />
      <path d="M16 56c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="hsl(330,70%,60%)" opacity="0.5" />
      <circle cx="32" cy="20" r="10" fill="hsl(330,70%,70%)" opacity="0.4" />
    </svg>
  );
}

export function PlayerAvatar({ photoUrl, gender, name, className, size = 'md' }: PlayerAvatarProps) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
      <AvatarFallback className="bg-transparent p-0">
        {gender === 'Female' ? (
          <FemaleSvg className="w-full h-full" />
        ) : (
          <MaleSvg className="w-full h-full" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
