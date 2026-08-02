import Image from 'next/image'

export function SquatIcon({ width = 24, height = 24, className }: { width?: number; height?: number; className?: string }) {
  return <Image src="/icons/exercises/squat.png" alt="Squat" width={width} height={height} className={className} />
}
