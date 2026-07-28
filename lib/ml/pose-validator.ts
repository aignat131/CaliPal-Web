import { angleBetween, MP } from './pose-math'
import type { Landmark } from './pose-math'
import type { ExerciseType } from './form-coach'

export interface PoseValidation {
  valid: boolean
  reason?: string
}

const MIN_VISIBILITY = 0.5
const HYSTERESIS_FRAMES = 5

/**
 * Validates that the user is physically in the correct exercise position
 * before allowing rep counting. Prevents cheating by requiring proper
 * body orientation — even with permissive angle thresholds, you can't
 * fake reps by standing upright and waving your arms.
 */
export class PoseValidator {
  private consecutiveValid = 0
  private consecutiveInvalid = 0
  private wasValid = false

  reset() {
    this.consecutiveValid = 0
    this.consecutiveInvalid = 0
    this.wasValid = false
  }

  /**
   * Returns whether the user is in a valid position for the given exercise.
   * Uses hysteresis to prevent flickering: requires HYSTERESIS_FRAMES
   * consecutive valid frames to activate, and HYSTERESIS_FRAMES consecutive
   * invalid frames to deactivate.
   */
  validate(landmarks: Landmark[], exerciseType: ExerciseType): PoseValidation {
    if (!landmarks || landmarks.length < 29) {
      return this.applyHysteresis(false, 'Nu se detectează corpul')
    }

    const check = this.checkPose(landmarks, exerciseType)
    return this.applyHysteresis(check.valid, check.reason)
  }

  private applyHysteresis(rawValid: boolean, reason?: string): PoseValidation {
    if (rawValid) {
      this.consecutiveValid++
      this.consecutiveInvalid = 0
    } else {
      this.consecutiveInvalid++
      this.consecutiveValid = 0
    }

    if (!this.wasValid && this.consecutiveValid >= HYSTERESIS_FRAMES) {
      this.wasValid = true
    } else if (this.wasValid && this.consecutiveInvalid >= HYSTERESIS_FRAMES) {
      this.wasValid = false
    }

    return { valid: this.wasValid, reason: this.wasValid ? undefined : reason }
  }

  private checkPose(lms: Landmark[], type: ExerciseType): PoseValidation {
    switch (type) {
      case 'pushup': return this.checkPushupPose(lms)
      case 'squat':  return this.checkSquatPose(lms)
      case 'pullup': return this.checkPullupPose(lms)
    }
  }

  // ── Push-up: body roughly horizontal, plank-like position ──────────────

  private checkPushupPose(lms: Landmark[]): PoseValidation {
    // Need at least one complete arm chain + hips visible
    const leftArmVis = this.minVis(lms, MP.LEFT_SHOULDER, MP.LEFT_ELBOW, MP.LEFT_WRIST)
    const rightArmVis = this.minVis(lms, MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW, MP.RIGHT_WRIST)
    const hipVis = Math.max(lms[MP.LEFT_HIP].visibility ?? 0, lms[MP.RIGHT_HIP].visibility ?? 0)

    if (Math.max(leftArmVis, rightArmVis) < MIN_VISIBILITY || hipVis < MIN_VISIBILITY) {
      return { valid: false, reason: 'Asigură-te că brațele și corpul sunt vizibile' }
    }

    const avgShoulderY = (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2
    const avgHipY = (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2

    // Shoulders and hips must be roughly level (not standing upright)
    const verticalDiff = Math.abs(avgShoulderY - avgHipY)
    if (verticalDiff > 0.28) {
      return { valid: false, reason: 'Intră în poziția de flotare — corp orizontal' }
    }

    // Wrists must be below (or level with) shoulders — arms supporting body, not raised
    const bestWristY = Math.max(lms[MP.LEFT_WRIST].y, lms[MP.RIGHT_WRIST].y)
    const bestShoulderY = Math.min(lms[MP.LEFT_SHOULDER].y, lms[MP.RIGHT_SHOULDER].y)
    if (bestWristY < bestShoulderY - 0.05) {
      return { valid: false, reason: 'Mâinile trebuie pe podea — intră în poziția de flotare' }
    }

    // If ankles are visible, check body planarity (shoulder-hip-ankle roughly straight)
    const leftAnkleVis = lms[MP.LEFT_ANKLE].visibility ?? 0
    const rightAnkleVis = lms[MP.RIGHT_ANKLE].visibility ?? 0
    if (Math.max(leftAnkleVis, rightAnkleVis) >= MIN_VISIBILITY) {
      const bodyAngle = Math.max(leftAnkleVis, rightAnkleVis) === leftAnkleVis
        ? this.safeAngle(lms, MP.LEFT_SHOULDER, MP.LEFT_HIP, MP.LEFT_ANKLE)
        : this.safeAngle(lms, MP.RIGHT_SHOULDER, MP.RIGHT_HIP, MP.RIGHT_ANKLE)
      if (bodyAngle > 0 && bodyAngle < 140) {
        return { valid: false, reason: 'Corpul trebuie drept — nu sta pe genunchi' }
      }
    }

    return { valid: true }
  }

  // ── Squat: body upright, standing position ─────────────────────────────

  private checkSquatPose(lms: Landmark[]): PoseValidation {
    // Need at least one complete leg chain visible
    const leftLegVis = this.minVis(lms, MP.LEFT_HIP, MP.LEFT_KNEE, MP.LEFT_ANKLE)
    const rightLegVis = this.minVis(lms, MP.RIGHT_HIP, MP.RIGHT_KNEE, MP.RIGHT_ANKLE)
    const shoulderVis = Math.max(lms[MP.LEFT_SHOULDER].visibility ?? 0, lms[MP.RIGHT_SHOULDER].visibility ?? 0)

    if (Math.max(leftLegVis, rightLegVis) < MIN_VISIBILITY || shoulderVis < MIN_VISIBILITY) {
      return { valid: false, reason: 'Asigură-te că picioarele sunt vizibile complet' }
    }

    // Shoulders should be ABOVE hips (lower y value = higher in frame)
    const avgShoulderY = (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2
    const avgHipY = (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
    const avgKneeY = (lms[MP.LEFT_KNEE].y + lms[MP.RIGHT_KNEE].y) / 2

    if (avgShoulderY > avgHipY) {
      return { valid: false, reason: 'Stai în picioare, cu fața spre cameră' }
    }

    // Hips should be above knees (upright posture, not lying down)
    if (avgHipY > avgKneeY + 0.05) {
      return { valid: false, reason: 'Stai în picioare pentru genuflexiuni' }
    }

    // Body should be roughly vertical: significant vertical span
    const avgAnkleY = (lms[MP.LEFT_ANKLE].y + lms[MP.RIGHT_ANKLE].y) / 2
    const verticalSpan = avgAnkleY - avgShoulderY
    if (verticalSpan < 0.25) {
      return { valid: false, reason: 'Stai în picioare — corpul trebuie să fie vertical' }
    }

    return { valid: true }
  }

  // ── Pull-up: arms extended upward, hanging position ────────────────────

  private checkPullupPose(lms: Landmark[]): PoseValidation {
    // Need at least one complete arm chain visible
    const leftArmVis = this.minVis(lms, MP.LEFT_SHOULDER, MP.LEFT_ELBOW, MP.LEFT_WRIST)
    const rightArmVis = this.minVis(lms, MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW, MP.RIGHT_WRIST)

    if (Math.max(leftArmVis, rightArmVis) < MIN_VISIBILITY) {
      return { valid: false, reason: 'Asigură-te că brațele sunt vizibile' }
    }

    // At least one wrist should be above or near shoulder level
    // (arms reaching up to bar). In MediaPipe, lower y = higher in frame.
    const leftWristAbove = lms[MP.LEFT_WRIST].y < lms[MP.LEFT_SHOULDER].y + 0.05
    const rightWristAbove = lms[MP.RIGHT_WRIST].y < lms[MP.RIGHT_SHOULDER].y + 0.05

    if (!leftWristAbove && !rightWristAbove) {
      return { valid: false, reason: 'Agață-te de bară cu brațele sus' }
    }

    // Body should be roughly vertical (elongated)
    const avgShoulderY = (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2
    const avgHipY = (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2

    if (avgHipY < avgShoulderY) {
      // Hips above shoulders = upside down or lying down
      return { valid: false, reason: 'Atârnă de bară cu corpul vertical' }
    }

    return { valid: true }
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  private minVis(lms: Landmark[], ...indices: number[]): number {
    return Math.min(...indices.map(i => lms[i]?.visibility ?? 0))
  }

  private safeAngle(lms: Landmark[], a: number, b: number, c: number): number {
    if (!lms[a] || !lms[b] || !lms[c]) return 0
    return angleBetween(lms[a], lms[b], lms[c])
  }

  private bestAngle(leftAngle: number, rightAngle: number, leftVis: number, rightVis: number): number {
    if (leftVis >= rightVis) return leftAngle
    return rightAngle
  }
}
