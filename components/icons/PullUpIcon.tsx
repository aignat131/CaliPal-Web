import type { SVGProps } from 'react'

export function PullUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={24}
      height={24}
      {...props}
    >
      {/* Bar */}
      <path
        d="M10 10h44"
        stroke="#6366F1"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Bar brackets */}
      <path
        d="M10 6v8M54 6v8"
        stroke="#6366F1"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Arms — reaching up to bar, bent at elbows */}
      <path
        d="M26 10l-2 10M38 10l2 10"
        stroke="#818CF8"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Head */}
      <circle cx={32} cy={16} r={5} fill="#6366F1" />
      {/* Torso */}
      <path
        d="M32 21v18"
        stroke="#6366F1"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Legs — hanging, slightly bent */}
      <path
        d="M32 39l-5 14M32 39l5 14"
        stroke="#818CF8"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Up arrow indicator */}
      <path
        d="M50 34v-10M46 28l4-4 4 4"
        stroke="#6366F1"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
