import Image from 'next/image'

export function PullUpIcon({ width = 24, height = 24, className }: { width?: number; height?: number; className?: string }) {
  return <Image src="/icons/exercises/pull-up.png" alt="Pull-up" width={width} height={height} className={className} />
}
