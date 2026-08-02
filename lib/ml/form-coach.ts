import { angleBetween, angleBetween2D, MP } from './pose-math'
import type { Landmark } from './pose-math'
import type { RepState, PushupState, SquatState } from './rep-counter'

export type ExerciseType = 'pullup' | 'pushup' | 'squat'
export type CueSeverity = 'warning' | 'error'

export interface FormCue {
  /** Stable key for React list rendering — cue clears automatically when condition is false */
  id: string
  message: string
  severity: CueSeverity
}

const HIP_BUFFER_SIZE = 4
const KIPPING_THRESHOLD = 0.04

export class FormCoach {
  private hipYBuffer: number[] = []

  reset() {
    this.hipYBuffer = []
  }

  /**
   * Returns the set of form violations active on this frame.
   * Call once per animation frame after the rep counter update.
   * Cues self-clear — callers should replace the previous cue list with this result.
   */
  getFormCues(
    landmarks: Landmark[],
    exerciseType: ExerciseType,
    repState: RepState | PushupState | SquatState
  ): FormCue[] {
    if (!landmarks || landmarks.length < 29) return []
    switch (exerciseType) {
      case 'pullup': return this._pullupCues(landmarks, repState as RepState)
      case 'pushup': return this._pushupCues(landmarks)
      case 'squat':  return this._squatCues(landmarks, repState as SquatState)
    }
  }

  private _pullupCues(landmarks: Landmark[], state: RepState): FormCue[] {
    const cues: FormCue[] = []

    const lS = landmarks[MP.LEFT_SHOULDER]
    const lE = landmarks[MP.LEFT_ELBOW]
    const lW = landmarks[MP.LEFT_WRIST]
    const rS = landmarks[MP.RIGHT_SHOULDER]
    const rE = landmarks[MP.RIGHT_ELBOW]
    const rW = landmarks[MP.RIGHT_WRIST]
    const lH = landmarks[MP.LEFT_HIP]
    const rH = landmarks[MP.RIGHT_HIP]

    const leftElbow  = angleBetween(lS, lE, lW)
    const rightElbow = angleBetween(rS, rE, rW)
    const avgElbow   = (leftElbow + rightElbow) / 2
    const avgHipY    = (lH.y + rH.y) / 2

    // Rule 1: arms not fully extended while hanging
    if (state === 'HANGING' && avgElbow < 140) {
      cues.push({ id: 'pu-extend', message: 'Extinde brațele complet', severity: 'warning' })
    }

    // Rule 2: left/right arm asymmetry
    if (Math.abs(leftElbow - rightElbow) > 25) {
      cues.push({ id: 'pu-symm', message: 'Brațe simetrice', severity: 'warning' })
    }

    // Rule 3: kipping — rapid hip vertical oscillation over last 4 frames
    this.hipYBuffer.push(avgHipY)
    if (this.hipYBuffer.length > HIP_BUFFER_SIZE) this.hipYBuffer.shift()
    if (this.hipYBuffer.length === HIP_BUFFER_SIZE) {
      const delta = Math.abs(this.hipYBuffer[HIP_BUFFER_SIZE - 1] - this.hipYBuffer[0])
      if (delta > KIPPING_THRESHOLD) {
        cues.push({ id: 'pu-kip', message: 'Evită balaiul', severity: 'error' })
      }
    }

    // Rule 4: didn't pull high enough — elbow still too open at peak
    if (state === 'PEAK' && avgElbow > 115) {
      cues.push({ id: 'pu-peak', message: 'Urcă mai sus', severity: 'error' })
    }

    return cues
  }

  private _pushupCues(_landmarks: Landmark[]): FormCue[] {
    // No form cues for push-ups — user may face camera head-on
    // so leg/body landmarks are unreliable
    return []
  }

  private _squatCues(landmarks: Landmark[], state: SquatState): FormCue[] {
    const cues: FormCue[] = []

    const lH = landmarks[MP.LEFT_HIP]
    const rH = landmarks[MP.RIGHT_HIP]
    const lK = landmarks[MP.LEFT_KNEE]
    const rK = landmarks[MP.RIGHT_KNEE]
    const lA = landmarks[MP.LEFT_ANKLE]
    const rA = landmarks[MP.RIGHT_ANKLE]
    const lS = landmarks[MP.LEFT_SHOULDER]
    const rS = landmarks[MP.RIGHT_SHOULDER]

    const avgKneeAngle = (angleBetween2D(lH, lK, lA) + angleBetween2D(rH, rK, rA)) / 2

    // Rule 1: insufficient depth — knee angle too open at bottom position
    if (state === 'DOWN' && avgKneeAngle > 100) {
      cues.push({ id: 'sq-depth', message: 'Coboară mai mult', severity: 'warning' })
    }

    // Rule 2: knee tracking too far past toes (side-view camera)
    const leftKneeToe  = Math.abs(lK.x - lA.x)
    const rightKneeToe = Math.abs(rK.x - rA.x)
    if (Math.max(leftKneeToe, rightKneeToe) > 0.12) {
      cues.push({ id: 'sq-toe', message: 'Nu depăși vârful degetelor', severity: 'warning' })
    }

    // Rule 3: excessive forward lean — shoulder too far in front of hips
    const avgShoulderX = (lS.x + rS.x) / 2
    const avgHipX      = (lH.x + rH.x) / 2
    if (Math.abs(avgShoulderX - avgHipX) > 0.08) {
      cues.push({ id: 'sq-lean', message: 'Stai mai drept', severity: 'warning' })
    }

    return cues
  }
}
