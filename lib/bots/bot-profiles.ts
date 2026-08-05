// ── Bot Profile Definitions ─────────────────────────────────────────────────

export interface BotProfile {
  uid: string
  displayName: string
  photoUrl: string
}

const BOT_PROFILES: BotProfile[] = [
  { uid: 'bot_0', displayName: 'CaliBot Alpha',   photoUrl: '' },
  { uid: 'bot_1', displayName: 'CaliBot Beta',    photoUrl: '' },
  { uid: 'bot_2', displayName: 'CaliBot Gamma',   photoUrl: '' },
  { uid: 'bot_3', displayName: 'CaliBot Delta',   photoUrl: '' },
  { uid: 'bot_4', displayName: 'CaliBot Epsilon',  photoUrl: '' },
  { uid: 'bot_5', displayName: 'CaliBot Zeta',    photoUrl: '' },
  { uid: 'bot_6', displayName: 'CaliBot Eta',     photoUrl: '' },
  { uid: 'bot_7', displayName: 'CaliBot Theta',   photoUrl: '' },
]

/** Check whether a UID belongs to a bot. */
export function isBotUid(uid: string): boolean {
  return uid.startsWith('bot_')
}

/** Get bot profile by index (0–7). */
export function getBotProfile(index: number): BotProfile {
  return BOT_PROFILES[index % BOT_PROFILES.length]
}

/** Get the first N bot profiles. */
export function getBotProfiles(count: number): BotProfile[] {
  return BOT_PROFILES.slice(0, Math.min(count, BOT_PROFILES.length))
}
