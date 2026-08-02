/**
 * Squat exercise icon — based on Tabler Icons "stretching-2" (MIT license)
 * https://github.com/tabler/tabler-icons
 */
import type { SVGProps } from 'react'

export function SquatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={24}
      height={24}
      {...props}
    >
      <g transform="scale(2.6667) translate(0 0)">
        <path d="M6.5 21l3.5 -5" />
        <path d="M5 11l7 -2" />
        <path d="M16 21l-4 -7v-5l7 -4" />
        <path d="M9.007 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      </g>
    </svg>
  )
}
