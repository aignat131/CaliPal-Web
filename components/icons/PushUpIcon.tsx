/**
 * Push-up exercise icon — based on Tabler Icons "stretching" (MIT license)
 * https://github.com/tabler/tabler-icons
 */
import type { SVGProps } from 'react'

export function PushUpIcon(props: SVGProps<SVGSVGElement>) {
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
        <path d="M15 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
        <path d="M5 20l5 -.5l1 -2" />
        <path d="M18 20v-5h-5.5l2.5 -6.5l-5.5 1l1.5 2" />
      </g>
    </svg>
  )
}
