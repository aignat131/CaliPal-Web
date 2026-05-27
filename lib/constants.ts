// ── Z-index layer map ─────────────────────────────────────────────────────────
// Layer order (lowest → highest):
//   nav → miniBar → communityModal → parkModal → notifications → offlineBanner
export const Z = {
  nav:             50,
  miniBar:        200,
  communityModal: 500,
  parkModal:     3000,
  notifications: 4000,
  offlineBanner: 9000,
} as const

// ── Layout sizes ──────────────────────────────────────────────────────────────
export const NAV_HEIGHT       = 56   // mobile bottom nav (px), excluding safe-area
export const SIDEBAR_WIDTH_SM = 64   // desktop sidebar icon-only (px)
export const SIDEBAR_WIDTH_LG = 192  // desktop sidebar with labels (px)
export const BTN_HEIGHT       = 52   // primary CTA button height (px)

// ── ML thresholds (elbow/knee angles in degrees) ──────────────────────────────
export const ML_PULLUP_UP_ANGLE   = 148
export const ML_PULLUP_DOWN_ANGLE = 105
export const ML_PUSHUP_UP_ANGLE   = 155
export const ML_PUSHUP_DOWN_ANGLE =  90
export const ML_SQUAT_UP_ANGLE    = 160
export const ML_SQUAT_DOWN_ANGLE  = 100
