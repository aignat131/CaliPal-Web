'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { DEFAULT_EXERCISE_CATALOGUE, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import { Plus, Trash2, Pencil, X, Dumbbell } from 'lucide-react'

export function ExercisesTab() {
  const [exercises, setExercisesState] = useState<(CatalogueEntry & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<(CatalogueEntry & { id: string }) | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'exercise_catalogue'), snap => {
      setExercisesState(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as CatalogueEntry & { id: string }))
          .sort((a, b) => a.category.localeCompare(b.category, 'ro') || a.name.localeCompare(b.name, 'ro'))
      )
      setLoading(false)
    })
    return unsub
  }, [])

  async function seedDefaults() {
    if (!confirm('Populezi catalogul cu exercițiile implicite?')) return
    setSeeding(true)
    try {
      await Promise.all(
        DEFAULT_EXERCISE_CATALOGUE.map(e =>
          addDoc(collection(db, 'exercise_catalogue'), {
            name: e.name,
            category: e.category,
            metric: e.metric,
            createdAt: serverTimestamp(),
          })
        )
      )
    } finally { setSeeding(false) }
  }

  async function deleteExercise(id: string, name: string) {
    if (!confirm(`Ștergi exercițiul "${name}"?`)) return
    setDeletingId(id)
    try { await deleteDoc(doc(db, 'exercise_catalogue', id)) }
    finally { setDeletingId(null) }
  }

  // Group by category for display
  const grouped = new Map<string, (CatalogueEntry & { id: string })[]>()
  for (const ex of exercises) {
    const arr = grouped.get(ex.category) ?? []
    arr.push(ex)
    grouped.set(ex.category, arr)
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setEditEntry(null); setShowForm(true) }}
          className="flex-1 h-11 rounded-xl border border-brand-green/40 text-brand-green text-sm font-bold flex items-center justify-center gap-2"
        >
          <Plus size={15} /> Exercițiu nou
        </button>
        {exercises.length === 0 && !loading && (
          <button
            onClick={seedDefaults}
            disabled={seeding}
            className="flex-1 h-11 rounded-xl border border-white/20 text-white/60 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {seeding ? '...' : '⚡ Inițializează implicite'}
          </button>
        )}
      </div>

      {showForm && (
        <ExerciseForm
          entry={editEntry}
          onClose={() => { setShowForm(false); setEditEntry(null) }}
        />
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-12 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
          ))}
        </div>
      )}

      {!loading && exercises.length === 0 && (
        <div className="text-center py-12">
          <Dumbbell size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/35 mb-1">Niciun exercițiu în catalog.</p>
          <p className="text-xs text-white/25">Apasă &ldquo;Inițializează implicite&rdquo; pentru a popula catalogul.</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {Array.from(grouped.entries()).map(([category, exList]) => (
          <div key={category}>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1 uppercase">{category}</p>
            <div className="flex flex-col gap-1.5">
              {exList.map(ex => (
                <div key={ex.id} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: 'var(--app-surface)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{ex.name}</p>
                  </div>
                  {/* Metric badge */}
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                    ex.metric === 'seconds'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-brand-green/20 text-brand-green border border-brand-green/30'
                  }`}>
                    {ex.metric === 'seconds' ? 'SEC' : 'REP'}
                  </span>
                  {/* Edit */}
                  <button
                    onClick={() => { setEditEntry(ex); setShowForm(true) }}
                    className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0"
                  >
                    <Pencil size={11} className="text-white/60" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => deleteExercise(ex.id, ex.name)}
                    disabled={deletingId === ex.id}
                    className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                  >
                    {deletingId === ex.id
                      ? <div className="w-3 h-3 border border-red-400/50 border-t-transparent rounded-full animate-spin" />
                      : <Trash2 size={11} className="text-red-400" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExerciseForm({
  entry, onClose,
}: {
  entry: (CatalogueEntry & { id: string }) | null
  onClose: () => void
}) {
  const [name, setName] = useState(entry?.name ?? '')
  const [category, setCategory] = useState(entry?.category ?? 'Trageri')
  const [metric, setMetric] = useState<'reps' | 'seconds'>(entry?.metric ?? 'reps')
  const [saving, setSaving] = useState(false)

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50"

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const data = { name: name.trim(), category, metric }
      if (entry) {
        await updateDoc(doc(db, 'exercise_catalogue', entry.id), data)
      } else {
        await addDoc(collection(db, 'exercise_catalogue'), { ...data, createdAt: serverTimestamp() })
      }
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/25" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-white">{entry ? 'Editează exercițiu' : 'Exercițiu nou'}</p>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/60" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nume exercițiu *"
          className={inputCls}
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-[var(--app-bg)]"
        >
          {['Trageri', 'Împingeri', 'Core', 'Picioare', 'Statice', 'Cardio', 'Altele'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {/* Metric selector */}
        <div>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1.5">MĂSURĂ</p>
          <div className="flex gap-2">
            <button
              onClick={() => setMetric('reps')}
              className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors ${
                metric === 'reps'
                  ? 'bg-brand-green text-black'
                  : 'border border-white/15 text-white/50'
              }`}
            >
              Repetări
            </button>
            <button
              onClick={() => setMetric('seconds')}
              className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors ${
                metric === 'seconds'
                  ? 'bg-blue-500 text-white'
                  : 'border border-white/15 text-white/50'
              }`}
            >
              Secunde
            </button>
          </div>
        </div>
        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex-1 h-9 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40"
          >
            {saving ? '...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}
