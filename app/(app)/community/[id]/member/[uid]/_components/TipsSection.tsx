'use client'

import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, updateDoc, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import { callApi, apiErrorMessage } from '@/lib/schedule/client'
import { relativeTimeRo } from '@/lib/schedule/week'
import {
  isTipCategory, TIP_CATEGORIES, TIP_EMOJI, TIP_LABELS, TIP_MAX_LENGTH, type CoachTip, type TipCategory,
} from '@/lib/schedule/tips'
import { Section, areaCls } from './Section'
import { Lightbulb, Plus, Send, Trash2 } from 'lucide-react'

function toTip(id: string, x: Record<string, unknown>): CoachTip {
  return {
    id,
    text: (x.text as string) ?? '',
    category: isTipCategory(x.category) ? x.category : 'general',
    authorName: (x.authorName as string) ?? '',
    createdAtMs: (x.createdAt as Timestamp | undefined)?.toMillis?.() ?? null,
    seen: x.seen === true,
  }
}

const VISIBLE = 5

export function TipsSection({ communityId, uid, isOwner, canGive }: {
  communityId: string
  uid: string
  isOwner: boolean
  canGive: boolean
}) {
  const { showToast } = useToast()
  const [tips, setTips] = useState<CoachTip[] | null>(null)
  const [composing, setComposing] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    return onSnapshot(collection(db, 'communities', communityId, 'memberPlans', uid, 'tips'), snap => {
      setTips(snap.docs.map(d => toTip(d.id, d.data())).sort((a, b) => (b.createdAtMs ?? Infinity) - (a.createdAtMs ?? Infinity)))
    }, () => setTips([]))
  }, [communityId, uid])

  // The member has now seen their new tips.
  useEffect(() => {
    if (!isOwner || !tips) return
    for (const t of tips.filter(t => !t.seen)) {
      updateDoc(doc(db, 'communities', communityId, 'memberPlans', uid, 'tips', t.id), { seen: true }).catch(() => undefined)
    }
  }, [isOwner, tips, communityId, uid])

  async function remove(t: CoachTip) {
    if (!confirm('Ștergi acest sfat?')) return
    try { await deleteDoc(doc(db, 'communities', communityId, 'memberPlans', uid, 'tips', t.id)) }
    catch { showToast('Nu am putut șterge.', 'error') }
  }

  const shown = showAll ? tips ?? [] : (tips ?? []).slice(0, VISIBLE)

  return (
    <Section title="Sfaturi de la antrenor" icon={<Lightbulb size={11} />}
      action={canGive && !composing ? (
        <button onClick={() => setComposing(true)} className="text-xs font-bold text-brand-green flex items-center gap-0.5">
          <Plus size={12} /> Sfat nou
        </button>
      ) : undefined}>
      {composing && (
        <TipForm communityId={communityId} uid={uid} onDone={() => setComposing(false)} />
      )}
      {tips === null ? (
        <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
      ) : tips.length === 0 && !composing ? (
        <p className="text-xs text-white/40">
          {canGive
            ? 'Dă-i sfaturi: ce să încălzească mai mult, indicii de tehnică, mobilitate, recuperare…'
            : 'Antrenorul nu ți-a trimis încă sfaturi. Când o face, primești notificare.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map(t => (
            <div key={t.id} className={`rounded-xl p-3 ${isOwner && !t.seen ? 'bg-[#FFB800]/10 border border-[#FFB800]/25' : 'bg-white/5'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/8 text-white/75">
                  {TIP_EMOJI[t.category]} {TIP_LABELS[t.category]}
                </span>
                {isOwner && !t.seen && <span className="text-[10px] font-black text-[#FFB800]">NOU</span>}
                <span className="text-[11px] text-white/35 ml-auto">{relativeTimeRo(t.createdAtMs)}</span>
                {canGive && (
                  <button onClick={() => void remove(t)} aria-label="Șterge sfatul"
                    className="w-7 h-7 -my-1 rounded-lg flex items-center justify-center text-red-400/60 hover:bg-red-500/10">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <p className="text-sm text-white/85 whitespace-pre-line break-words">{t.text}</p>
              {t.authorName && <p className="text-[11px] text-white/35 mt-1">— {t.authorName}</p>}
            </div>
          ))}
          {tips.length > VISIBLE && (
            <button onClick={() => setShowAll(v => !v)} className="text-xs text-white/40 font-bold self-start mt-1">
              {showAll ? 'Arată mai puține' : `Arată toate (${tips.length})`}
            </button>
          )}
        </div>
      )}
    </Section>
  )
}

function TipForm({ communityId, uid, onDone }: { communityId: string; uid: string; onDone: () => void }) {
  const { showToast } = useToast()
  const [category, setCategory] = useState<TipCategory>('warmup')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (!text.trim()) return
    setSending(true)
    const res = await callApi(`/api/community/${communityId}/members/${uid}/tips`, { text, category })
    setSending(false)
    if (!res.ok) { showToast(apiErrorMessage(res.reason), 'error'); return }
    showToast('Sfat trimis', 'success')
    onDone()
  }

  return (
    <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-white/8">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categorie">
        {TIP_CATEGORIES.map(c => (
          <button key={c} role="radio" aria-checked={category === c} onClick={() => setCategory(c)}
            className={`h-8 px-2.5 rounded-full text-xs font-bold border ${
              category === c ? 'border-brand-green/60 bg-brand-green/10 text-brand-green' : 'border-white/10 text-white/55'
            }`}>
            {TIP_EMOJI[c]} {TIP_LABELS[c]}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} maxLength={TIP_MAX_LENGTH} rows={3} autoFocus
        placeholder="Ex: Înainte de tracțiuni, 2 serii de scapula pull-ups și rotiri de umeri — 5 min de încălzire în plus."
        className={areaCls} />
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
        <button onClick={() => void send()} disabled={sending || !text.trim()}
          className="flex-1 h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40 flex items-center justify-center gap-1.5">
          <Send size={13} /> {sending ? 'Se trimite…' : 'Trimite'}
        </button>
      </div>
    </div>
  )
}
