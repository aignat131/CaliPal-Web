/**
 * Shared room code generation — used by both battles and events.
 * Characters exclude ambiguous chars (I/O/0/1).
 * 30^6 ≈ 729M possible codes.
 */
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Generate a 6-character alphanumeric room code. */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}
