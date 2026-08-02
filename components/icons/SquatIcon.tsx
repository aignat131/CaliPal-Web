import type { SVGProps } from 'react'

export function SquatIcon(props: SVGProps<SVGSVGElement>) {
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
        d="M8 58h48"
        stroke="#4B5563"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Head */}
      <circle cx={32} cy={10} r={5} fill="#F59E0B" />
      {/* Torso — upright, slightly forward */}
      <path
        d="M32 15v16"
        stroke="#F59E0B"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Arms — extended forward for balance */}
      <path
        d="M32 22l-12 2M32 22l12 2"
        stroke="#FBBF24"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Upper legs — thighs angled from hip to knee */}
      <path
        d="M32 31l-8 10M32 31l8 10"
        stroke="#F59E0B"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lower legs — shins from knee to ankle */}
      <path
        d="M24 41l-2 15M40 41l2 15"
        stroke="#FBBF24"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Feet */}
      <path
        d="M18 56h8M38 56h8"
        stroke="#FBBF24"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  )
}
