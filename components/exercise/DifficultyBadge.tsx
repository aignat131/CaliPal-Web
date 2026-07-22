const DIFFICULTY_CONFIG = {
  beginner:     { label: 'Începător',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  intermediate: { label: 'Intermediar',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  advanced:     { label: 'Avansat',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  elite:        { label: 'Elit',         color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
} as const

interface Props {
  difficulty: keyof typeof DIFFICULTY_CONFIG
}

export default function DifficultyBadge({ difficulty }: Props) {
  const config = DIFFICULTY_CONFIG[difficulty]
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-tight flex-shrink-0"
      style={{ color: config.color, backgroundColor: config.bg, border: `1px solid ${config.color}25` }}
    >
      {config.label}
    </span>
  )
}
