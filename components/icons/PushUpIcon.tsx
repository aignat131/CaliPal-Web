import type { SVGProps } from 'react'

export function PushUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={24}
      height={24}
      {...props}
    >
      {/* Ground line */}
      <path
        d="M8 54h48"
        stroke="#4B5563"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Head */}
      <circle cx={14} cy={30} r={5} fill="#1ED75F" />
      {/* Torso — angled plank body */}
      <path
        d="M19 32l30 6"
        stroke="#1ED75F"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Arms — bent at elbows pushing up */}
      <path
        d="M22 34l-4 12M22 34l6 10"
        stroke="#A3E635"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Legs — extended back */}
      <path
        d="M49 38l4 14M49 38l-5 14"
        stroke="#A3E635"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Hands on ground */}
      <circle cx={18} cy={46} r={2} fill="#A3E635" />
      <circle cx={28} cy={44} r={2} fill="#A3E635" />
      {/* Down arrow indicator */}
      <path
        d="M38 14v8M34 18l4 4 4-4"
        stroke="#1ED75F"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
