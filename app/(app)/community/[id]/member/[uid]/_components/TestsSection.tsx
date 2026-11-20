'use client'

import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import {
  metricSeries, sanitizeTestConfig, sanitizeTestValues, seriesDelta, testStatus,
  type TestConfig, type TestEntry,
} from '@/lib/schedule/progress'
import { todayKey } from '@/lib/schedule/week'
import { MetricChart } from './MetricChart'
import { Section, fieldCls } from './Section'
import { Activity, Plus, Table2, Trash2 } from 'lucide-react'

const fmt = (d: string) => d.split('-').reverse().join('.')

export function TestsSection({ communityId, uid, isOwner }: { communityId: string; uid: string; isOwner: boolean }) {
  const { showToast } = useToast()
  const [config, setConfig] = useState<TestConfig>(sanitizeTestConfig(null))
  const [tests, setTests] = useState<TestEntry[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'communities', communityId, 'config', 'plan'),
    s => setConfig(sanitizeTestConfig(s.data())), () => undefined), [communityId])

  useEffect(() => onSnapshot(collection(db, 'communities', communityId, 'memberPlans', uid, 'tests'), snap => {
    setTests(snap.docs.map(d => ({ date: d.id, values: (d.data().values as Record<string, number>) ?? {} }))
      .sort((a, b) => a.date.localeCompare(b.date)))
  }, () => setTests([])), [communityId, uid])

  const today = todayKey()
  const status = tests ? testStatus(tests, config.intervalWeeks, today) : null

  async function remove(date: string) {
    if (!confirm(`Ștergi testul din ${fmt(date)}?`)) return
    try { await deleteDoc(doc(db, 'communities', communityId, 'memberPlans', uid, 'tests', date)) }
    catch { showToast('Nu am putut șterge testul.', 'error') }
  }

  return (
    <Section title={`Teste de progres · la ${config.intervalWeeks} săpt.`} icon={<Activity size={11} />}
      action={isOwner && !adding ? (
        <button onClick={() => setAdding(true)} className="text-xs font-bold text-brand-green flex items-center gap-0.5"><Plus size={12} /> Test nou</button>
      ) : undefined}>
      {tests === null || !status ? (
        <div className="h-24 rounded-xl bg-white/5 animate-pulse" />
      ) : (
        <div className="flex flex-col gap-3">
          {status.due && !adding && (
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ backgroundColor: 'rgba(255,184,0,0.12)' }}>
              <p className="text-xs text-white/75 flex-1">
                {status.last
                  ? `E timpul pentru testul de progres${status.overdueDays > 0 ? ` (întârziat ${status.overdueDays} zile)` : ''}. Ultimul: ${fmt(status.last)}.`
                  : isOwner ? 'Fă primul test ca să-ți vezi evoluția.' : 'Niciun test înregistrat încă.'}
              </p>
              {isOwner && (
                <button onClick={() => setAdding(true)} className="h-8 px-3 rounded-lg bg-brand-green text-black text-xs font-black flex-shrink-0">Începe</button>
              )}
            </div>
          )}
          {!status.due && status.last && (
            <p className="text-[11px] text-white/40">Ultimul test: {fmt(status.last)} · următorul: {fmt(status.next)}</p>
          )}

          {adding && (
            <TestForm communityId={communityId} uid={uid} config={config}
              existing={tests} onDone={() => setAdding(false)} />
          )}

          {tests.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {config.metrics.map(m => {
                  const series = metricSeries(tests, m.id)
                  if (!series.length) return null
                  const delta = seriesDelta(series)
                  return (
                    <div key={m.id}>
                      <MetricChart title={m.name} unit={m.unit} series={series} />
                      {delta !== null && (
                        <p className={`text-[11px] mt-1 px-1 ${delta > 0 ? 'text-brand-green' : delta < 0 ? 'text-red-400' : 'text-white/40'}`}>
                          {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {delta > 0 ? '+' : ''}{delta} {m.unit} față de primul test
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Table view (accessibility + exact values) */}
              <button onClick={() => setShowTable(v => !v)} className="self-start text-xs font-bold text-white/50 flex items-center gap-1">
                <Table2 size={12} /> {showTable ? 'Ascunde tabelul' : 'Vezi tabelul'}
              </button>
              {showTable && (
                <div className="overflow-x-auto">
                  <table className="text-[11.5px] w-full">
                    <thead>
                      <tr className="text-white/45">
                        <th className="text-left font-semibold py-1 pr-2 sticky left-0" style={{ backgroundColor: 'var(--app-surface)' }}>Data</th>
                        {config.metrics.map(m => <th key={m.id} className="text-right font-semibold py-1 px-2 whitespace-nowrap">{m.name} ({m.unit})</th>)}
                        {isOwner && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {[...tests].reverse().map(t => (
                        <tr key={t.date} className="border-t border-white/8">
                          <td className="py-1.5 pr-2 text-white/70 sticky left-0" style={{ backgroundColor: 'var(--app-surface)' }}>{fmt(t.date)}</td>
                          {config.metrics.map(m => <td key={m.id} className="text-right px-2 text-white tabular-nums">{t.values[m.id] ?? '—'}</td>)}
                          {isOwner && (
                            <td className="text-right">
                              <button onClick={() => void remove(t.date)} aria-label={`Șterge testul din ${fmt(t.date)}`} className="w-7 h-7 inline-flex items-center justify-center text-red-400/60"><Trash2 size={12} /></button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Section>
  )
}

function TestForm({ communityId, uid, config, existing, onDone }: {
  communityId: string
  uid: string
  config: TestConfig
  existing: TestEntry[]
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [date, setDate] = useState(todayKey())
  const prev = existing.find(t => t.date === date)
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(config.metrics.map(m => [m.id, prev?.values[m.id]?.toString() ?? ''])))
  const [saving, setSaving] = useState(false)

  async function save() {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(values)) if (v.trim() !== '') parsed[k] = Number(v.replace(',', '.'))
    const clean = sanitizeTestValues(parsed, config.metrics)
    if (!Object.keys(clean).length) { showToast('Completează cel puțin o valoare.', 'error'); return }
    setSaving(true)
    try {
      await setDoc(doc(db, 'communities', communityId, 'memberPlans', uid, 'tests', date), { values: clean, updatedAt: serverTimestamp() })
      showToast('Test salvat 💪', 'success')
      onDone()
    } catch {
      showToast('Nu am putut salva testul.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 pb-3 border-b border-white/8">
      <label className="flex items-center gap-2">
        <span className="text-xs text-white/45 w-16 flex-shrink-0">Data</span>
        <input type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value)} className={fieldCls} />
      </label>
      {prev && <p className="text-[11px] text-[#FFB800]">Există deja un test la data asta — îl vei actualiza.</p>}
      <div className="grid grid-cols-2 gap-2">
        {config.metrics.map(m => (
          <label key={m.id} className="flex flex-col gap-1">
            <span className="text-[11px] text-white/45">{m.name} ({m.unit})</span>
            <input inputMode="decimal" value={values[m.id] ?? ''} placeholder="—"
              onChange={e => setValues(v => ({ ...v, [m.id]: e.target.value }))} className={fieldCls} />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
        <button onClick={() => void save()} disabled={saving}
          className="flex-1 h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">{saving ? '…' : 'Salvează testul'}</button>
      </div>
    </div>
  )
}
