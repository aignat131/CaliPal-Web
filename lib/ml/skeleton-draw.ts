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
