'use client'

import { useState } from 'react'
import {
  doc, collection, getDocs, query, where, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { toAndroidDateTime } from './shared'

export function AddTrainingForm({ communityId, userId, userName, isStaff, isAdmin, defaultLocation, firebaseUser, onClose }: {
  communityId: string; userId: string; userName: string; isStaff: boolean; isAdmin: boolean; defaultLocation?: string; firebaseUser: import('firebase/auth').User | null; onClose: () => void
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(tomorrow.toISOString().split('T')[0])
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('20:30')
  const [location, setLocation] = useState(defaultLocation ?? '')
  const [official, setOfficial] = useState(false)
  const [sendEmail, setSendEmail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rateError, setRateError] = useState('')
  const [showEquipment, setShowEquipment] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])
  const [exercises, setExercises] = useState<{ name: string; sets: string; repsPerSet: string }[]>([])


  const EQUIPMENT_OPTIONS = [
    { id: 'rings', label: '🪢 Inele' },
    { id: 'elastic_bands', label: '🔁 Benzi elastice' },
    { id: 'parallels', label: '⚙️ Paralele' },
    { id: 'jump_rope', label: '🪝 Coardă de sărit' },
  ]
  const [customEquipment, setCustomEquipment] = useState('')

  function toggleEquipment(id: string) {
    setSelectedEquipment(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setRateError('')
    try {
      // Rate limit: max 5 trainings per day per community per user
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const rateSnap = await getDocs(query(
        collection(db, 'communities', communityId, 'trainings'),
        where('authorId', '==', userId),
      ))
      const todayCount = rateSnap.docs.filter(d => {
        const ts = d.data().createdAt?.toDate?.()
        return ts && ts >= todayStart
      }).length
      if (todayCount >= 5) {
        setRateError('Ai atins limita de 5 antrenamente pe zi în această comunitate.')
        setSaving(false)
        return
      }
      const validExercises = exercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          name: ex.name.trim(),
          sets: parseInt(ex.sets) || 1,
          repsPerSet: parseInt(ex.repsPerSet) || 10,
        }))
      const trainingTimeStart = toAndroidDateTime(date, start)
      const trainingTimeEnd = toAndroidDateTime(date, end)
      const trainingData = {
        name:            name.trim(),
        description:     desc.trim(),
        timeStart:       trainingTimeStart,
        timeEnd:         trainingTimeEnd,
        location:        location.trim(),
        authorId:        userId,
        authorName:      userName,
        authorCoach:     isStaff,
        authorAdmin:     false,
        official,
        reminderMinutes: 30,
        rsvps:           userId ? { [userId]: 'GOING' } : {},
        rsvpNames:       userId ? { [userId]: userName } : {},
        ...(validExercises.length > 0 ? { exercises: validExercises } : {}),
        ...(selectedEquipment.length > 0 || customEquipment.trim() ? {
        equipment: customEquipment.trim()
          ? [...selectedEquipment, customEquipment.trim()]
          : selectedEquipment
      } : {}),
        createdAt:       serverTimestamp(),
      }
      // Atomic batch: create training + mirror + backup together
      const batch = writeBatch(db)
      const trainingRef = doc(collection(db, 'communities', communityId, 'trainings'))
      const mirrorRef = doc(db, 'communities', communityId, 'trainings_safe', trainingRef.id)
      const backupRef = doc(db, 'training_backups', `community_${communityId}_${trainingRef.id}`)
      batch.set(trainingRef, trainingData)
      batch.set(mirrorRef, trainingData)
      batch.set(backupRef, {
        ...trainingData,
        sourceType: 'community',
        sourceId: communityId,
        originalTrainingId: trainingRef.id,
        backedUpAt: serverTimestamp(),
      })
      await batch.commit()
      const docRef = trainingRef
      if (sendEmail) {
        try {
          const idToken = await (firebaseUser ?? auth.currentUser)?.getIdToken(true)
          console.log('[email] idToken:', idToken ? 'ok' : 'null')
          if (idToken) {
            const res = await fetch('/api/email/training', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
              body: JSON.stringify({
                communityId,
                trainingId: docRef.id,
                trainingName: name.trim(),
                description: desc.trim(),
                timeStart: trainingTimeStart,
                timeEnd: trainingTimeEnd,
                location: location.trim(),
                authorName: userName,
              }),
            })
            const text = await res.text()
            console.log('[email] response:', res.status, text)
          }
        } catch (err) {
          console.error('[email] error:', err)
        }
      }
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/30" style={{ backgroundColor: 'var(--app-bg)' }}>
      <p className="text-sm font-bold text-white mb-3">Adaugă antrenament</p>
      <div className="flex flex-col gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nume *"
          maxLength={120}
          className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descriere"
          maxLength={1000}
          className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        <div className="flex gap-2">
          <input type="time" value={start} onChange={e => setStart(e.target.value)}
            className="flex-1 min-w-0 h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
          <input type="time" value={end} onChange={e => setEnd(e.target.value)}
            className="flex-1 min-w-0 h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        </div>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Locație"
          maxLength={100}
          className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />

        {isStaff && (
          <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={official}
              onChange={e => setOfficial(e.target.checked)}
              className="accent-brand-green w-4 h-4"
            />
            <span>Oficial</span>
            <span className="text-xs text-white/35">(anunț oficial al comunității)</span>
          </label>
        )}
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              className="accent-brand-green w-4 h-4"
            />
            <span>Notificare email</span>
            <span className="text-xs text-white/35">(trimite email membrilor)</span>
          </label>
        )}
        {/* Exercises */}
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/45">Exerciții</span>
            <button
              type="button"
              onClick={() => setExercises(prev => [...prev, { name: '', sets: '3', repsPerSet: '10' }])}
              className="text-xs text-brand-green font-bold hover:text-brand-green/80 transition-colors"
            >
              + Adaugă
            </button>
          </div>
          {exercises.map((ex, i) => (
            <div key={i} className="flex gap-1.5 mb-1.5 items-center">
              <input
                value={ex.name}
                onChange={e => setExercises(prev => prev.map((ex2, j) => j === i ? { ...ex2, name: e.target.value } : ex2))}
                placeholder="Exercițiu"
                maxLength={80}
                className="flex-1 min-w-0 h-9 rounded-lg px-2.5 text-xs text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
              />
              <input
                value={ex.sets}
                onChange={e => setExercises(prev => prev.map((ex2, j) => j === i ? { ...ex2, sets: e.target.value } : ex2))}
                placeholder="Set"
                type="number"
                min="1"
                className="w-12 h-9 rounded-lg px-1 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 text-center"
              />
              <span className="text-white/30 text-xs flex-shrink-0">×</span>
              <input
                value={ex.repsPerSet}
                onChange={e => setExercises(prev => prev.map((ex2, j) => j === i ? { ...ex2, repsPerSet: e.target.value } : ex2))}
                placeholder="Rep"
                type="number"
                min="1"
                className="w-12 h-9 rounded-lg px-1 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 text-center"
              />
              <button
                type="button"
                onClick={() => setExercises(prev => prev.filter((_, j) => j !== i))}
                className="w-7 h-7 rounded-full flex items-center justify-center text-red-400/50 hover:text-red-400 flex-shrink-0 text-base leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Equipment selector */}
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowEquipment(v => !v)}
            className="flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70 transition-colors"
          >
            <span>{showEquipment ? '▾' : '▸'}</span>
            <span>Aduci echipament?</span>
            {(selectedEquipment.length > 0 || customEquipment.trim()) && (
              <span className="text-brand-green font-bold">({selectedEquipment.length + (customEquipment.trim() ? 1 : 0)})</span>
            )}
          </button>
          {showEquipment && (
            <div className="mt-2 flex flex-col gap-1.5 pl-1">
              {EQUIPMENT_OPTIONS.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEquipment.includes(opt.id)}
                    onChange={() => toggleEquipment(opt.id)}
                    className="accent-brand-green w-4 h-4"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              <input
                value={customEquipment}
                onChange={e => setCustomEquipment(e.target.value)}
                placeholder="Altceva (ex: kettlebell...)"
                maxLength={60}
                className="mt-1 h-9 rounded-xl px-3 text-xs text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
              />
            </div>
          )}
        </div>

        {rateError && <p className="text-xs text-red-400 text-center">{rateError}</p>}
        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-white/15 text-sm text-white/60">
            Anulează
          </button>
          <button onClick={save} disabled={saving || !name.trim()}
            className="flex-1 h-9 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
            {saving ? '...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}
