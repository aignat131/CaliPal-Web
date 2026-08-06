import { MP } from './pose-math'
import type { Landmark } from './pose-math'

export const POSE_CONNECTIONS: [number, number][] = [
  [MP.LEFT_SHOULDER, MP.RIGHT_SHOULDER],
  [MP.LEFT_SHOULDER, MP.LEFT_ELBOW],
  [MP.LEFT_ELBOW, MP.LEFT_WRIST],
  [MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW],
  [MP.RIGHT_ELBOW, MP.RIGHT_WRIST],
  [MP.LEFT_SHOULDER, MP.LEFT_HIP],
  [MP.RIGHT_SHOULDER, MP.RIGHT_HIP],
  [MP.LEFT_HIP, MP.RIGHT_HIP],
  [MP.LEFT_HIP, MP.LEFT_KNEE],
  [MP.RIGHT_HIP, MP.RIGHT_KNEE],
  [MP.LEFT_KNEE, MP.LEFT_ANKLE],
  [MP.RIGHT_KNEE, MP.RIGHT_ANKLE],
]

/**
 * Draws a dashed horizontal line at the estimated pull-up bar position.
 */
export function drawBarLine(
  ctx: CanvasRenderingContext2D,
  barY: number,
  w: number,
  h: number,
  color: string,
) {
  const y = barY * h
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([8, 6])
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(w, y)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draws a colored arc at a joint vertex showing the measured angle.
 * Makes stretch depth measurement visible on the camera feed.
 */
export function drawAngleArc(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  vertexIdx: number,
  armAIdx: number,
  armBIdx: number,
  w: number,
  h: number,
  angle: number,
  color: string,
) {
  const v = landmarks[vertexIdx]
  const a = landmarks[armAIdx]
  const b = landmarks[armBIdx]
  if (!v || !a || !b) return
  if ((v.visibility ?? 1) < 0.3) return

  const vx = v.x * w, vy = v.y * h
  const ax = a.x * w, ay = a.y * h
  const bx = b.x * w, by = b.y * h

  // Compute angles from vertex to each arm
  const angleA = Math.atan2(ay - vy, ax - vx)
  const angleB = Math.atan2(by - vy, bx - vx)

  const arcRadius = 25

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.arc(vx, vy, arcRadius, Math.min(angleA, angleB), Math.max(angleA, angleB))
  ctx.stroke()

  // Draw angle label
  const midAngle = (angleA + angleB) / 2
  const labelX = vx + (arcRadius + 14) * Math.cos(midAngle)
  const labelY = vy + (arcRadius + 14) * Math.sin(midAngle)
  ctx.globalAlpha = 0.8
  ctx.fillStyle = color
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${Math.round(angle)}°`, labelX, labelY)
  ctx.restore()
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  color: string
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = landmarks[a]
    const lb = landmarks[b]
    if (!la || !lb || (la.visibility ?? 1) < 0.3 || (lb.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.moveTo(la.x * w, la.y * h)
    ctx.lineTo(lb.x * w, lb.y * h)
    ctx.stroke()
  }
  for (const lm of landmarks) {
    if ((lm.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}
