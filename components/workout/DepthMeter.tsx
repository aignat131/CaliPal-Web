'use client'

import { depthColor } from '@/lib/ml/stretch-detector'

interface Props {
  /** 0-1 current depth */
  depthScore: number
  /** 0-1 peak depth achieved */
  peakDepthScore: number
  /** Raw measurement value (e.g., 145) */
  rawMeasurement: number
  /** Unit (e.g., "°" or "%") */
  measurementUnit: string
  /** Target (e.g., 180) */
  targetMeasurement: number
}

/**
 * Semi-circular arc gauge showing stretch depth.
 * Arc fills left-to-right based on depthScore, colored by depth quality.
 * Center shows the raw measurement, peak marked on the arc.
 */
export default function DepthMeter({
  depthScore,
  peakDepthScore,
  rawMeasurement,
  measurementUnit,
  targetMeasurement,
}: Props) {
  const size = 180
  const cx = size / 2
  const cy = size / 2 + 10
  const r = 70
  const strokeWidth = 10

  // Arc runs from 180° to 0° (left to right, opening upward)
  const startAngle = Math.PI      // left side (180°)
  const endAngle = 0              // right side (0°)
  const totalArc = Math.PI        // 180° sweep

  // Background arc path
  const bgX1 = cx + r * Math.cos(startAngle)
  const bgY1 = cy + r * Math.sin(startAngle)
  const bgX2 = cx + r * Math.cos(endAngle)
  const bgY2 = cy + r * Math.sin(endAngle)
  const bgPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 0 1 ${bgX2} ${bgY2}`

  // Fill arc — sweeps from startAngle toward endAngle by depthScore
  const fillAngle = startAngle - totalArc * Math.min(1, depthScore)
  const fX = cx + r * Math.cos(fillAngle)
  const fY = cy + r * Math.sin(fillAngle)
  const largeArc = depthScore > 0.5 ? 1 : 0
  const fillPath = depthScore > 0.01
    ? `M ${bgX1} ${bgY1} A ${r} ${r} 0 ${largeArc} 1 ${fX} ${fY}`
    : ''

  // Peak marker position
  const peakAngle = startAngle - totalArc * Math.min(1, peakDepthScore)
  const peakX = cx + r * Math.cos(peakAngle)
  const peakY = cy + r * Math.sin(peakAngle)

  const color = depthColor(depthScore)
  const peakColor = depthColor(peakDepthScore)
  const isNewPeak = depthScore >= peakDepthScore - 0.01 && depthScore > 0.1

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Glow filter */}
        <defs>
          <filter id="depth-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Fill arc */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            filter={isNewPeak ? 'url(#depth-glow)' : undefined}
            style={{ transition: 'stroke 0.3s, d 0.15s' }}
          />
        )}

        {/* Peak marker diamond */}
        {peakDepthScore > 0.05 && (
          <g transform={`translate(${peakX}, ${peakY}) rotate(45)`}>
            <rect
              x={-3.5} y={-3.5}
              width={7} height={7}
              fill={peakColor}
              opacity={0.7}
              rx={1}
            />
          </g>
        )}

        {/* Center measurement */}
        <text
          x={cx} y={cy - 8}
          textAnchor="middle"
          fill="white"
          fontWeight="900"
          fontSize="32"
          fontFamily="system-ui, sans-serif"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
        >
          {rawMeasurement}{measurementUnit}
        </text>

        {/* Target */}
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          fill="rgba(255,255,255,0.35)"
          fontWeight="700"
          fontSize="13"
          fontFamily="system-ui, sans-serif"
        >
          / {targetMeasurement}{measurementUnit}
        </text>
      </svg>
    </div>
  )
}
