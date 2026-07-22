import { getMusclesForExercise, MUSCLE_LABELS, MUSCLE_COLORS } from '@/lib/data/musclemap'

interface Props {
  exerciseName: string
  category: string
  /** Max number of pills to show (default 3) */
  max?: number
}

export default function MusclePills({ exerciseName, category, max = 3 }: Props) {
  const muscles = getMusclesForExercise(exerciseName, category)
  const shown = muscles.slice(0, max)

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(m => (
        <span
          key={m}
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-tight"
          style={{
            color: MUSCLE_COLORS[m],
            backgroundColor: `${MUSCLE_COLORS[m]}15`,
            border: `1px solid ${MUSCLE_COLORS[m]}25`,
          }}
        >
          {MUSCLE_LABELS[m]}
        </span>
      ))}
      {muscles.length > max && (
        <span className="text-[9px] text-white/30 font-bold px-1 self-center">
          +{muscles.length - max}
        </span>
      )}
    </div>
  )
}
