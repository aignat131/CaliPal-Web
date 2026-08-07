/**
 * Renders a video frame onto a canvas with manual "cover" scaling.
 *
 * Instead of relying on CSS `object-cover` (which can behave inconsistently
 * across browsers and DOM nesting contexts), this sets the canvas buffer to
 * match its CSS display dimensions and applies a 2D transform that maps
 * video coordinates to display coordinates with cover-style cropping.
 *
 * After calling this, all subsequent canvas drawing operations (skeleton, etc.)
 * should use **video coordinate space** (0…videoWidth, 0…videoHeight) —
 * the active ctx transform maps them to the correct display positions.
 *
 * Returns the video dimensions for downstream code, or null if the video
 * or canvas isn't ready yet.
 */
export function renderVideoCover(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): { vw: number; vh: number } | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (!cw || !ch) return null

  // Resize canvas buffer to match its CSS display size (only when changed)
  if (canvas.width !== cw || canvas.height !== ch) {
    console.log('[renderVideoCover] video:', vw, 'x', vh, '| canvas:', cw, 'x', ch, '| scale:', Math.max(cw / vw, ch / vh).toFixed(3))
    canvas.width = cw
    canvas.height = ch
  }

  // Cover scaling: use the larger axis scale so the video fills the canvas
  const scale = Math.max(cw / vw, ch / vh)
  const offsetX = (cw - vw * scale) / 2
  const offsetY = (ch - vh * scale) / 2

  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY)
  ctx.drawImage(video, 0, 0)

  return { vw, vh }
}
