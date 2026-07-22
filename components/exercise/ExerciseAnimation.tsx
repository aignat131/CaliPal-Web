'use client'

/**
 * SVG stick-figure animations for common calisthenics exercises.
 * Each animation uses CSS @keyframes to loop a 2-3 second movement cycle.
 * Returns null for unknown animation IDs (graceful fallback).
 */

interface Props {
  id: string
  size?: number
}

export default function ExerciseAnimation({ id, size = 48 }: Props) {
  const Animation = ANIMATIONS[id]
  if (!Animation) return null
  return <Animation size={size} />
}

// ── Animation registry ─────────────────────────────────────────────────────

const ANIMATIONS: Record<string, React.FC<{ size: number }>> = {
  pushup: PushupAnim,
  pullup: PullupAnim,
  squat: SquatAnim,
  dip: DipAnim,
  lsit: LSitAnim,
  plank: PlankAnim,
  hang: HangAnim,
  lunge: LungeAnim,
  'leg-raise': LegRaiseAnim,
  'hollow-hold': HollowHoldAnim,
  'muscle-up': MuscleUpAnim,
  'pike-pushup': PikePushupAnim,
}

// ── Shared styles ──────────────────────────────────────────────────────────

const JOINT = { fill: '#1ED75F', r: 2.5 }
const BONE = { stroke: '#1ED75F', strokeWidth: 2, strokeLinecap: 'round' as const }
const BONE_DIM = { ...BONE, stroke: '#1ED75F80' }

// ── Push-up animation ──────────────────────────────────────────────────────

function PushupAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 40" className="overflow-visible">
      <style>{`
        @keyframes pushup-body {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(6px); }
        }
        @keyframes pushup-elbow {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(3px) translateX(2px); }
        }
      `}</style>
      <g style={{ animation: 'pushup-body 2.5s ease-in-out infinite' }}>
        {/* Head */}
        <circle cx="10" cy="14" {...JOINT} r={3} />
        {/* Shoulder → Hip → Ankle (body line) */}
        <line x1="14" y1="16" x2="34" y2="18" {...BONE} />
        <line x1="34" y1="18" x2="52" y2="20" {...BONE} />
        {/* Ankle */}
        <circle cx="52" cy="20" {...JOINT} />
      </g>
      <g style={{ animation: 'pushup-elbow 2.5s ease-in-out infinite' }}>
        {/* Shoulder */}
        <circle cx="14" cy="16" {...JOINT} />
        {/* Shoulder → Elbow → Wrist (arm) */}
        <line x1="14" y1="16" x2="14" y2="26" {...BONE} />
        <line x1="14" y1="26" x2="10" y2="34" {...BONE} />
        {/* Ground wrist */}
        <circle cx="10" cy="34" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Pull-up animation ──────────────────────────────────────────────────────

function PullupAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 60" className="overflow-visible">
      <style>{`
        @keyframes pullup-body {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pullup-elbow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(5px); }
        }
      `}</style>
      {/* Bar */}
      <line x1="2" y1="4" x2="38" y2="4" stroke="#ffffff30" strokeWidth={2} strokeLinecap="round" />
      {/* Arms (wrists stay on bar) */}
      <circle cx="12" cy="4" {...JOINT} />
      <circle cx="28" cy="4" {...JOINT} />
      <g style={{ animation: 'pullup-body 2.5s ease-in-out infinite' }}>
        {/* Left arm */}
        <line x1="12" y1="4" x2="14" y2="16" {...BONE} />
        <line x1="14" y1="16" x2="16" y2="22" {...BONE} />
        {/* Right arm */}
        <line x1="28" y1="4" x2="26" y2="16" {...BONE} />
        <line x1="26" y1="16" x2="24" y2="22" {...BONE} />
        {/* Shoulders */}
        <circle cx="16" cy="22" {...JOINT} />
        <circle cx="24" cy="22" {...JOINT} />
        {/* Head */}
        <circle cx="20" cy="17" {...JOINT} r={3} />
        {/* Torso */}
        <line x1="16" y1="22" x2="24" y2="22" {...BONE_DIM} />
        <line x1="18" y1="22" x2="18" y2="38" {...BONE} />
        <line x1="22" y1="22" x2="22" y2="38" {...BONE} />
        {/* Hips */}
        <line x1="18" y1="38" x2="22" y2="38" {...BONE_DIM} />
        {/* Legs */}
        <line x1="18" y1="38" x2="17" y2="50" {...BONE} />
        <line x1="22" y1="38" x2="23" y2="50" {...BONE} />
        <circle cx="17" cy="50" {...JOINT} />
        <circle cx="23" cy="50" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Squat animation ────────────────────────────────────────────────────────

function SquatAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 60" className="overflow-visible">
      <style>{`
        @keyframes squat-body {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(10px); }
        }
        @keyframes squat-knee {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(3px); }
        }
      `}</style>
      <g style={{ animation: 'squat-body 2.5s ease-in-out infinite' }}>
        {/* Head */}
        <circle cx="20" cy="6" {...JOINT} r={3} />
        {/* Torso */}
        <line x1="20" y1="10" x2="20" y2="26" {...BONE} />
        {/* Arms at sides */}
        <line x1="20" y1="12" x2="14" y2="20" {...BONE_DIM} />
        <line x1="20" y1="12" x2="26" y2="20" {...BONE_DIM} />
      </g>
      <g style={{ animation: 'squat-body 2.5s ease-in-out infinite' }}>
        {/* Hip */}
        <circle cx="20" cy="26" {...JOINT} />
      </g>
      <g style={{ animation: 'squat-knee 2.5s ease-in-out infinite' }}>
        {/* Left leg */}
        <line x1="18" y1="26" x2="14" y2="40" {...BONE} />
        <line x1="14" y1="40" x2="14" y2="54" {...BONE} />
        <circle cx="14" cy="40" {...JOINT} />
        <circle cx="14" cy="54" {...JOINT} />
        {/* Right leg */}
        <line x1="22" y1="26" x2="26" y2="40" {...BONE} />
        <line x1="26" y1="40" x2="26" y2="54" {...BONE} />
        <circle cx="26" cy="40" {...JOINT} />
        <circle cx="26" cy="54" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Dip animation ──────────────────────────────────────────────────────────

function DipAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 60" className="overflow-visible">
      <style>{`
        @keyframes dip-body {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(8px); }
        }
      `}</style>
      {/* Bars */}
      <line x1="4" y1="18" x2="4" y2="56" stroke="#ffffff20" strokeWidth={2} />
      <line x1="40" y1="18" x2="40" y2="56" stroke="#ffffff20" strokeWidth={2} />
      <g style={{ animation: 'dip-body 2.5s ease-in-out infinite' }}>
        {/* Hands on bars */}
        <circle cx="8" cy="18" {...JOINT} />
        <circle cx="36" cy="18" {...JOINT} />
        {/* Arms */}
        <line x1="8" y1="18" x2="14" y2="24" {...BONE} />
        <line x1="36" y1="18" x2="30" y2="24" {...BONE} />
        {/* Shoulders */}
        <circle cx="14" cy="24" {...JOINT} />
        <circle cx="30" cy="24" {...JOINT} />
        {/* Head */}
        <circle cx="22" cy="18" {...JOINT} r={3} />
        {/* Torso */}
        <line x1="22" y1="24" x2="22" y2="40" {...BONE} />
        {/* Legs */}
        <line x1="22" y1="40" x2="20" y2="54" {...BONE} />
        <line x1="22" y1="40" x2="24" y2="54" {...BONE} />
        <circle cx="20" cy="54" {...JOINT} />
        <circle cx="24" cy="54" {...JOINT} />
      </g>
    </svg>
  )
}

// ── L-Sit animation ────────────────────────────────────────────────────────

function LSitAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 40" className="overflow-visible">
      <style>{`
        @keyframes lsit-legs {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-5deg); }
        }
      `}</style>
      {/* Ground marks */}
      <line x1="16" y1="34" x2="28" y2="34" stroke="#ffffff15" strokeWidth={1} />
      {/* Arms (straight, supporting) */}
      <line x1="18" y1="16" x2="18" y2="34" {...BONE} />
      <line x1="26" y1="16" x2="26" y2="34" {...BONE} />
      <circle cx="18" cy="34" {...JOINT} />
      <circle cx="26" cy="34" {...JOINT} />
      {/* Shoulders */}
      <circle cx="18" cy="16" {...JOINT} />
      <circle cx="26" cy="16" {...JOINT} />
      {/* Head */}
      <circle cx="22" cy="10" {...JOINT} r={3} />
      {/* Torso */}
      <line x1="22" y1="16" x2="22" y2="28" {...BONE} />
      {/* Legs (horizontal, L-shape) */}
      <g style={{ animation: 'lsit-legs 3s ease-in-out infinite', transformOrigin: '22px 28px' }}>
        <line x1="22" y1="28" x2="42" y2="26" {...BONE} />
        <circle cx="42" cy="26" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Plank animation (static with subtle breathing) ─────────────────────────

function PlankAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 36" className="overflow-visible">
      <style>{`
        @keyframes plank-breathe {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(1px); }
        }
      `}</style>
      <g style={{ animation: 'plank-breathe 3s ease-in-out infinite' }}>
        {/* Head */}
        <circle cx="8" cy="12" {...JOINT} r={3} />
        {/* Body line */}
        <line x1="12" y1="16" x2="34" y2="18" {...BONE} />
        <line x1="34" y1="18" x2="52" y2="20" {...BONE} />
        {/* Forearms (on ground) */}
        <line x1="12" y1="16" x2="10" y2="28" {...BONE} />
        <line x1="10" y1="28" x2="6" y2="28" {...BONE} />
        <circle cx="6" cy="28" {...JOINT} />
        {/* Ankle */}
        <circle cx="52" cy="20" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Hang animation (static with subtle sway) ───────────────────────────────

function HangAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 60" className="overflow-visible">
      <style>{`
        @keyframes hang-sway {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(1.5px); }
        }
      `}</style>
      {/* Bar */}
      <line x1="4" y1="4" x2="36" y2="4" stroke="#ffffff30" strokeWidth={2} strokeLinecap="round" />
      {/* Hands */}
      <circle cx="14" cy="4" {...JOINT} />
      <circle cx="26" cy="4" {...JOINT} />
      <g style={{ animation: 'hang-sway 3s ease-in-out infinite' }}>
        {/* Arms */}
        <line x1="14" y1="4" x2="16" y2="20" {...BONE} />
        <line x1="26" y1="4" x2="24" y2="20" {...BONE} />
        {/* Head */}
        <circle cx="20" cy="16" {...JOINT} r={3} />
        {/* Torso */}
        <line x1="20" y1="20" x2="20" y2="38" {...BONE} />
        {/* Legs */}
        <line x1="20" y1="38" x2="18" y2="52" {...BONE} />
        <line x1="20" y1="38" x2="22" y2="52" {...BONE} />
        <circle cx="18" cy="52" {...JOINT} />
        <circle cx="22" cy="52" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Lunge animation ────────────────────────────────────────────────────────

function LungeAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 60" className="overflow-visible">
      <style>{`
        @keyframes lunge-body {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(8px); }
        }
      `}</style>
      <g style={{ animation: 'lunge-body 2.5s ease-in-out infinite' }}>
        {/* Head */}
        <circle cx="22" cy="6" {...JOINT} r={3} />
        {/* Torso */}
        <line x1="22" y1="10" x2="22" y2="26" {...BONE} />
        {/* Hip */}
        <circle cx="22" cy="26" {...JOINT} />
        {/* Front leg (bent) */}
        <line x1="22" y1="26" x2="32" y2="38" {...BONE} />
        <line x1="32" y1="38" x2="32" y2="52" {...BONE} />
        <circle cx="32" cy="38" {...JOINT} />
        <circle cx="32" cy="52" {...JOINT} />
        {/* Back leg (extended) */}
        <line x1="22" y1="26" x2="10" y2="38" {...BONE} />
        <line x1="10" y1="38" x2="6" y2="52" {...BONE} />
        <circle cx="10" cy="38" {...JOINT} />
        <circle cx="6" cy="52" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Leg Raise animation ────────────────────────────────────────────────────

function LegRaiseAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 60" className="overflow-visible">
      <style>{`
        @keyframes legraise-legs {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-70deg); }
        }
      `}</style>
      {/* Bar */}
      <line x1="4" y1="4" x2="36" y2="4" stroke="#ffffff30" strokeWidth={2} strokeLinecap="round" />
      {/* Hands */}
      <circle cx="14" cy="4" {...JOINT} />
      <circle cx="26" cy="4" {...JOINT} />
      {/* Arms */}
      <line x1="14" y1="4" x2="16" y2="18" {...BONE} />
      <line x1="26" y1="4" x2="24" y2="18" {...BONE} />
      {/* Head */}
      <circle cx="20" cy="14" {...JOINT} r={3} />
      {/* Torso */}
      <line x1="20" y1="18" x2="20" y2="34" {...BONE} />
      {/* Legs (animated) */}
      <g style={{ animation: 'legraise-legs 2.5s ease-in-out infinite', transformOrigin: '20px 34px' }}>
        <line x1="20" y1="34" x2="18" y2="50" {...BONE} />
        <line x1="20" y1="34" x2="22" y2="50" {...BONE} />
        <circle cx="18" cy="50" {...JOINT} />
        <circle cx="22" cy="50" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Hollow Hold animation ──────────────────────────────────────────────────

function HollowHoldAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 36" className="overflow-visible">
      <style>{`
        @keyframes hollow-rock {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
      `}</style>
      <g style={{ animation: 'hollow-rock 3s ease-in-out infinite', transformOrigin: '30px 24px' }}>
        {/* Ground reference */}
        <line x1="8" y1="28" x2="52" y2="28" stroke="#ffffff10" strokeWidth={1} />
        {/* Lower back on ground */}
        <circle cx="30" cy="24" {...JOINT} />
        {/* Arms extended behind head */}
        <line x1="30" y1="24" x2="18" y2="16" {...BONE} />
        <line x1="18" y1="16" x2="8" y2="12" {...BONE} />
        <circle cx="8" cy="12" {...JOINT} />
        {/* Head */}
        <circle cx="18" cy="14" {...JOINT} r={2.5} />
        {/* Legs extended forward, slightly raised */}
        <line x1="30" y1="24" x2="42" y2="20" {...BONE} />
        <line x1="42" y1="20" x2="54" y2="18" {...BONE} />
        <circle cx="54" cy="18" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Muscle-up animation ────────────────────────────────────────────────────

function MuscleUpAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 60" className="overflow-visible">
      <style>{`
        @keyframes muscleup-body {
          0%, 30% { transform: translateY(0px); }
          50% { transform: translateY(-18px); }
          70%, 100% { transform: translateY(0px); }
        }
      `}</style>
      {/* Bar */}
      <line x1="4" y1="20" x2="36" y2="20" stroke="#ffffff30" strokeWidth={2} strokeLinecap="round" />
      <g style={{ animation: 'muscleup-body 3s ease-in-out infinite' }}>
        {/* Hands */}
        <circle cx="14" cy="20" {...JOINT} />
        <circle cx="26" cy="20" {...JOINT} />
        {/* Arms */}
        <line x1="14" y1="20" x2="16" y2="30" {...BONE} />
        <line x1="26" y1="20" x2="24" y2="30" {...BONE} />
        {/* Head */}
        <circle cx="20" cy="26" {...JOINT} r={3} />
        {/* Torso */}
        <line x1="20" y1="30" x2="20" y2="44" {...BONE} />
        {/* Legs */}
        <line x1="20" y1="44" x2="18" y2="56" {...BONE} />
        <line x1="20" y1="44" x2="22" y2="56" {...BONE} />
        <circle cx="18" cy="56" {...JOINT} />
        <circle cx="22" cy="56" {...JOINT} />
      </g>
    </svg>
  )
}

// ── Pike Push-up animation ─────────────────────────────────────────────────

function PikePushupAnim({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" className="overflow-visible">
      <style>{`
        @keyframes pike-head {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(8px); }
        }
      `}</style>
      <g style={{ animation: 'pike-head 2.5s ease-in-out infinite' }}>
        {/* Head (goes down between arms) */}
        <circle cx="14" cy="10" {...JOINT} r={3} />
        {/* Arms */}
        <line x1="16" y1="14" x2="16" y2="28" {...BONE} />
        <line x1="16" y1="28" x2="12" y2="38" {...BONE} />
        <circle cx="12" cy="38" {...JOINT} />
        {/* Shoulder */}
        <circle cx="16" cy="14" {...JOINT} />
      </g>
      {/* Body (V-shape, hips high) */}
      <line x1="16" y1="14" x2="28" y2="6" {...BONE} />
      <circle cx="28" cy="6" {...JOINT} />
      {/* Legs down from hip */}
      <line x1="28" y1="6" x2="40" y2="38" {...BONE} />
      <circle cx="40" cy="38" {...JOINT} />
    </svg>
  )
}
