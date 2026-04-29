import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

const sizes = { xs: 'w-5 h-5 text-[10px]', sm: 'w-6 h-6 text-xs', md: 'w-8 h-8 text-sm' }

export function UserAvatar({ name, avatarUrl, size = 'sm', className }: UserAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn('rounded-full object-cover flex-shrink-0', sizes[size], className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold flex-shrink-0',
        sizes[size],
        className
      )}
    >
      {getInitials(name)}
    </div>
  )
}
