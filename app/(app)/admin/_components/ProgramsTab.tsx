'use client'

import { useState, useEffect } from 'react'
import {
  collection, onSnapshot, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { FirestoreTrainingProgram } from '@/types'
import { Plus, Trash2, Pencil, BookOpen } from 'lucide-react'
import ProgramForm from '@/components/training/ProgramForm'

const LEVEL_LABELS: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

export function ProgramsTab() {
  const [programs, setPrograms] = useState<FirestoreTrainingProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editProgram, setEditProgram] = useState<FirestoreTrainingProgram | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'training_programs'), orderBy('order', 'asc')),
      snap => {
        setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FirestoreTrainingProgram))
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [])

  async function deleteProgram(id: string, name: string) {
    if (!confirm(`Delete program "${name}"?`)) return
    setDeletingId(id)
    try { await deleteDoc(doc(db, 'training_programs', id)) }
    finally { setDeletingId(null) }
  }

  async function togglePublished(program: FirestoreTrainingProgram) {
    await updateDoc(doc(db, 'training_programs', program.id), {
      published: !program.published,
      updatedAt: serverTimestamp(),
    })
  }

  return (
    <div>
      <button
        onClick={() => { setEditProgram(null); setShowForm(true) }}
        className="w-full h-11 rounded-xl mb-4 border border-blue-400/40 text-blue-400 text-sm font-bold flex items-center justify-center gap-2"
      >
        <Plus size={15} /> Program nou
      </button>

      {showForm && (
        <ProgramForm
          program={editProgram}
          nextOrder={programs.length}
          onClose={() => { setShowForm(false); setEditProgram(null) }}
          showPublishedToggle
        />
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
          ))}
        </div>
      )}

      {!loading && programs.length === 0 && (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/35">Niciun program creat.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {programs.map(p => {
          const totalDays = p.weeks.reduce((sum, w) => sum + w.days.filter(d => !d.restDay).length, 0)
          const totalExercises = p.weeks.reduce((sum, w) => sum + w.days.reduce((s2, d) => s2 + d.exercises.length, 0), 0)
          return (
            <div key={p.id} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: 'var(--app-surface)' }}>
              <span className="text-xl flex-shrink-0">{p.focusEmoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                <p className="text-[11px] text-white/40">
                  {p.weeks.length} wk · {totalDays} days · {totalExercises} ex · {LEVEL_LABELS[p.level]}
                </p>
              </div>
              {/* Published badge */}
              <button
                onClick={() => togglePublished(p)}
                className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 transition-colors ${
                  p.published
                    ? 'bg-brand-green/20 text-brand-green border border-brand-green/30'
                    : 'bg-white/10 text-white/40 border border-white/15'
                }`}
              >
                {p.published ? 'LIVE' : 'DRAFT'}
              </button>
              {/* Edit */}
              <button
                onClick={() => { setEditProgram(p); setShowForm(true) }}
                className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0"
              >
                <Pencil size={11} className="text-white/60" />
              </button>
              {/* Delete */}
              <button
                onClick={() => deleteProgram(p.id, p.name)}
                disabled={deletingId === p.id}
                className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              >
                {deletingId === p.id
                  ? <div className="w-3 h-3 border border-red-400/50 border-t-transparent rounded-full animate-spin" />
                  : <Trash2 size={11} className="text-red-400" />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
