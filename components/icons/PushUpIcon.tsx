import Image from 'next/image'

export function PushUpIcon({ width = 24, height = 24, className }: { width?: number; height?: number; className?: string }) {
  return <Image src="/icons/exercises/push-up.png" alt="Push-up" width={width} height={height} className={className} />
}
