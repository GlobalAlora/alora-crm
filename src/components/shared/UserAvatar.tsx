import { cn } from '@/lib/utils'

interface UserAvatarUser {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface UserAvatarProps {
  user: UserAvatarUser
  size?: 'xs' | 'sm' | 'md'
  showName?: boolean
  className?: string
}

const SIZE_CLASSES = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
}

function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

const BG_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]

function hashColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % BG_COLORS.length
  return BG_COLORS[Math.abs(hash) % BG_COLORS.length]
}

export function UserAvatar({ user, size = 'md', showName = false, className }: UserAvatarProps) {
  const initials = getInitials(user.full_name)
  const bgColor  = hashColor(user.id)

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt={user.full_name}
          className={cn('rounded-full object-cover flex-shrink-0', SIZE_CLASSES[size])}
        />
      ) : (
        <div
          className={cn(
            'rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0',
            SIZE_CLASSES[size],
            bgColor
          )}
          title={user.full_name}
        >
          {initials}
        </div>
      )}
      {showName && (
        <span className="text-sm text-slate-700 truncate">{user.full_name}</span>
      )}
    </div>
  )
}
