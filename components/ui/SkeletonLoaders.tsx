/**
 * Skeleton loader components — use these instead of spinners while data loads.
 * All use the `.skeleton` CSS class from globals.css for the shimmer effect.
 */

/** A single community / training card skeleton */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 flex gap-3 animate-fade-in-up" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-2 py-0.5">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  )
}

/** A profile header skeleton */
export function SkeletonProfile() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 animate-fade-in-up">
      <div className="skeleton w-20 h-20 rounded-full" />
      <div className="skeleton h-5 w-32 rounded" />
      <div className="skeleton h-3 w-20 rounded" />
    </div>
  )
}

/** A training row skeleton (used in lists) */
export function SkeletonTrainingRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-fade-in-up">
      <div className="skeleton w-9 h-9 rounded-xl flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="skeleton h-3.5 w-2/3 rounded" />
        <div className="skeleton h-3 w-2/5 rounded" />
      </div>
      <div className="skeleton h-7 w-16 rounded-full" />
    </div>
  )
}

/** N card skeletons stacked — quick list placeholder */
export function SkeletonCardList({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ animationDelay: `${i * 60}ms` }}>
          <SkeletonCard />
        </div>
      ))}
    </div>
  )
}

/** Message bubble skeleton for chat loading state */
export function SkeletonMessages() {
  const widths = ['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5']
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {widths.map((w, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className={`skeleton h-9 ${w} rounded-2xl`} />
        </div>
      ))}
    </div>
  )
}
