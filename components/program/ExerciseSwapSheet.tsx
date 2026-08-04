'use client'

import { useEffect, useState } from 'react'
import { X, RotateCcw, Search } from 'lucide-react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { DEFAULT_EXERCISE_CATALOGUE, type CatalogueEntry, getCategory } from '@/lib/data/exercise-catalogue'

interface Props {
  open: boolean
  onClose: () => void
  /** Original exercise name (before any swap) */
  exerciseName: string
  /** Currently displayed name (may be swapped) */
  currentName: string
  onSwap: (newName: string) => void
  onReset: () => void
  isSwapped: boolean
}

export default function ExerciseSwapSheet({
  open, onClose, exerciseName, currentName, onSwap, onReset, isSwapped,
}: Props) {
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>(DEFAULT_EXERCISE_CATALOGUE)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'exercise_catalogue'), snap => {
      if (!snap.empty) {
        setCatalogue(snap.docs.map(d => d.data() as CatalogueEntry).sort((a, b) => a.name.localeCompare(b.name, 'ro')))
      }
    }, () => {})
    return unsub
  }, [])

  if (!open) return null

  const category = getCategory(exerciseName, catalogue)
  const alternatives = catalogue
    .filter(e => e.category === category && e.name !== exerciseName && e.name !== currentName)
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg rounded-t-3xl border-t border-white/10 max-h-[70vh] flex flex-col"
        style={{ backgroundColor: 'var(--app-bg)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">Schimbă: {exerciseName}</p>
            <p className="text-[11px] text-white/40 mt-0.5">Alternative din categoria {category}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0 ml-3">
            <X size={16} className="text-white/60" />
          </button>
        </div>

        {/* Reset swap button */}
        {isSwapped && (
          <div className="px-5 pb-3 flex-shrink-0">
            <button onClick={onReset}
              className="flex items-center gap-1.5 text-xs font-bold text-brand-green hover:text-brand-green/80 transition-colors">
              <RotateCcw size={12} /> Resetare la original ({exerciseName})
            </button>
          </div>
        )}

        {/* Search */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 h-9 rounded-xl px-3 bg-white/5 border border-white/8">
            <Search size={14} className="text-white/30 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Caută exercițiu..."
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
            />
          </div>
        </div>

        {/* Alternatives list */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {alternatives.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-6">
              {search ? 'Niciun rezultat' : 'Nu există alternative în această categorie'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {alternatives.map(alt => (
                <button
                  key={alt.name}
                  onClick={() => onSwap(alt.name)}
                  className="w-full text-left px-3.5 py-3 rounded-xl border border-white/6 hover:border-brand-green/25 transition-colors flex items-center justify-between"
                  style={{ backgroundColor: 'var(--app-surface)' }}
                >
                  <div>
                    <p className="text-sm font-bold text-white">{alt.name}</p>
                    <p className="text-[11px] text-white/35 mt-0.5">
                      {alt.metric === 'seconds' ? 'Timp' : 'Repetări'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-brand-green/60">Selectează</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
