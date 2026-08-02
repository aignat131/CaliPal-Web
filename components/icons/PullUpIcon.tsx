/**
 * Pull-up exercise icon — based on Tabler Icons "barbell" (MIT license)
 * https://github.com/tabler/tabler-icons
 */
import type { SVGProps } from 'react'

export function PullUpIcon(props: SVGProps<SVGSVGElement>) {
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
        <path d="M2 12h1" />
        <path d="M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2" />
        <path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" />
        <path d="M9 12h6" />
        <path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1" />
        <path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2" />
        <path d="M22 12h-1" />
      </g>
    </svg>
  )
}
