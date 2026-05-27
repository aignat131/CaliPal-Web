import Image from 'next/image'

interface UserAvatarProps {
  src?: string | null
  name?: string | null
  size?: number
  className?: string
}

/**
 * Unified avatar component — renders a user photo if available,
 * otherwise shows the first letter of the name on a brand-green tinted background.
 */
export function UserAvatar({ src, name, size = 40, className = '' }: UserAvatarProps) {
  const initial = name ? name.charAt(0).toUpperCase() : '?'
  const altText = name ? `Avatar ${name}` : 'User avatar'

  if (src) {
    return (
      <Image
        src={src}
        alt={altText}
        width={size}
        height={size}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: 'rgba(30, 215, 95, 0.18)',
        border: '1px solid rgba(30, 215, 95, 0.25)',
      }}
      aria-label={altText}
    >
      <span
        className="font-black text-brand-green leading-none"
        style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}
      >
        {initial}
      </span>
    </div>
  )
}
