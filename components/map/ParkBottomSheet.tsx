'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/lib/hooks/useTheme'
import { useT } from '@/lib/context/LanguageContext'
import { auth } from '@/lib/firebase/auth'
import type { ParkDoc, PlannedTraining, ParkCommunityRequest, CommunityDoc, CommunityMember, ParkPresenceMember } from '@/types'
import { Navigation, X, ChevronRight, MapPin } from 'lucide-react'
import { parseMapTrainingDate } from '@/components/map/parseMapTrainingDate'
import { MemberAvatar } from '@/components/map/MemberAvatar'
import { TrainingDetailPanel } from '@/components/map/TrainingDetailPanel'
import { ParkCommunityModal, CreateCommunityForParkModal, AddParkTrainingModal } from '@/components/map/ParkModals'

// ── Park Bottom Sheet ─────────────────────────────────────────────────────────

export function ParkBottomSheet({
  park, community, members, liveLocations, onClose,
  uid, isSuperAdmin, userName, parkTrainings, parkStandaloneTrainings, onStandaloneTrainingAdded,
  onStandaloneTrainingDeleted,
  showParkTrainingForm, setShowParkTrainingForm,
  parkPendingReq, userAdminCommunities,
  showParkCommModal, setShowParkCommModal, onPendingReqSet, onCommunityCreated: _onCommunityCreated,
  onDirectAssociated,
  parkPastTrainings, communityMembers,
  selectedTraining, selectedTrainingSource,
  onTrainingSelect, onTrainingBack,
}: {
  park: ParkDoc
  community: CommunityDoc | null
  members: ParkPresenceMember[]
  liveLocations: Record<string, string>
  onClose: () => void
  uid: string | null
  isSuperAdmin: boolean
  userName: string
  parkTrainings: PlannedTraining[]
  parkStandaloneTrainings: PlannedTraining[]
  onStandaloneTrainingAdded: (t: PlannedTraining) => void
  onStandaloneTrainingDeleted: (id: string) => void
  showParkTrainingForm: boolean
  setShowParkTrainingForm: (v: boolean) => void
  parkPendingReq: ParkCommunityRequest | null
  userAdminCommunities: CommunityDoc[]
  showParkCommModal: boolean
  setShowParkCommModal: (v: boolean) => void
  onPendingReqSet: (req: ParkCommunityRequest) => void
  onCommunityCreated: (comm: CommunityDoc) => void
  onDirectAssociated: () => void
  parkPastTrainings: PlannedTraining[]
  communityMembers: CommunityMember[]
  selectedTraining: PlannedTraining | null
  selectedTrainingSource: 'community' | 'standalone' | null
  onTrainingSelect: (tr: PlannedTraining, source: 'community' | 'standalone') => void
  onTrainingBack: () => void
}) {
  const { theme } = useTheme()
  const t = useT()
  const [showCommChoice, setShowCommChoice] = useState(false)
  const [showCreateCommForm, setShowCreateCommForm] = useState(false)
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[2000] rounded-t-3xl px-4 pt-4 pb-6 max-h-[70vh] overflow-y-auto"
      style={{
        backgroundColor: 'var(--app-surface)',
        boxShadow: theme === 'light' ? '0 -4px 24px rgba(0,0,0,0.15)' : '0 -4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

      {selectedTraining ? (
        <TrainingDetailPanel
          training={selectedTraining}
          communityId={selectedTrainingSource === 'community' ? community?.id ?? null : null}
          parkId={selectedTrainingSource === 'standalone' ? park.id : null}
          communityMembers={communityMembers}
          onBack={onTrainingBack}
          onClose={onClose}
        />
      ) : (<>

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-black text-white text-base leading-tight">{park.name}</h2>
            {members.length > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: '#1ED75F18', color: '#1ED75F', border: '1px solid #1ED75F30' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse inline-block" />
                {members.length} {members.length === 1 ? 'activ' : 'activi'}
              </span>
            )}
          </div>
          {park.address && (
            <p className="text-xs text-white/45 mt-0.5">
              {park.address}{park.city ? `, ${park.city}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${park.latitude},${park.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            title="Direcții Google Maps"
          >
            <Navigation size={14} className="text-brand-green" />
          </a>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={14} className="text-white/70" />
          </button>
        </div>
      </div>

      {park.description ? (
        <p className="text-sm text-white/60 mb-3 leading-relaxed">{park.description}</p>
      ) : null}

      {community ? (
        <div className="mb-3">
          <Link href={`/community/${community.id}`}>
            <div
              className="flex items-center gap-3 p-3 rounded-2xl border border-brand-green/30"
              style={{ backgroundColor: '#1ED75F15' }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1ED75F22' }}
              >
                <span className="text-base font-black text-brand-green">
                  {community.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-white truncate">{community.name}</p>
                  {community.verified && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: '#3B82F625', color: '#3B82F6' }}>✓</span>
                  )}
                </div>
                <p className="text-xs text-white/45">{community.memberCount} {t('common.members')}</p>
              </div>
              <ChevronRight size={16} className="text-brand-green flex-shrink-0" />
            </div>
          </Link>

          {/* Upcoming trainings */}
          {parkTrainings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-brand-green/70 tracking-widest">{t('map.trainings_section')}</p>
              {parkTrainings.map(tr => {
                const memberGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                const guestGoing = Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                const totalGoing = memberGoing + guestGoing
                const dateObj = parseMapTrainingDate(tr)
                const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' }) : ''
                const timeLabel = tr.timeStart?.slice(-5) ?? ''
                return (
                  <button key={tr.id} onClick={() => onTrainingSelect(tr, 'community')} className="w-full text-left">
                    <div className="p-2.5 rounded-xl border border-brand-green/20 hover:bg-brand-green/5 transition-colors"
                      style={{ backgroundColor: '#0D3D2820' }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-white leading-tight flex-1 min-w-0 truncate">{tr.name}</p>
                        {totalGoing > 0 && (
                          <span className="text-xs text-brand-green font-bold flex-shrink-0">{totalGoing} {t(totalGoing === 1 ? 'map.going_singular' : 'map.going_plural')}</span>
                        )}
                      </div>
                      <p className="text-xs text-white/45 mt-0.5">
                        {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}{tr.location ? ` · ${tr.location}` : ''}
                      </p>
                      {(tr.exercises ?? []).length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {(tr.exercises ?? []).slice(0, 2).map((ex, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(30,215,95,0.12)', color: '#1ED75F' }}>
                              {ex.name}
                            </span>
                          ))}
                          {(tr.exercises?.length ?? 0) > 2 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/30"
                              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                              +{(tr.exercises?.length ?? 0) - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Past trainings fallback */}
          {parkTrainings.length === 0 && parkPastTrainings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-white/35 tracking-widest">{t('map.recent_activity')}</p>
              {parkPastTrainings.map(tr => {
                const dateObj = parseMapTrainingDate(tr)
                const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
                const totalGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                  + Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                return (
                  <button key={tr.id} onClick={() => onTrainingSelect(tr, 'community')} className="w-full text-left opacity-70">
                    <div className="p-2.5 rounded-xl border border-white/8"
                      style={{ backgroundColor: 'rgba(13,27,26,0.4)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white/60 leading-tight flex-1 truncate">{tr.name}</p>
                        {totalGoing > 0 && <span className="text-xs text-white/35 flex-shrink-0">{totalGoing} participanți</span>}
                      </div>
                      <p className="text-xs text-white/30 mt-0.5">{dateLabel}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Community training history button — only if trainings exist */}
          {(parkTrainings.length > 0 || parkPastTrainings.length > 0) && (
            <div className="mt-2">
              <Link href={`/training/${community.id}/history`} onClick={onClose}>
                <button
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-white/15 text-white/60 text-sm font-semibold hover:bg-white/5 transition-colors"
                >
                  <span className="text-base">🕓</span> {t('map.training_history')}
                </button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3">
          {/* Standalone upcoming trainings */}
          {parkStandaloneTrainings.length > 0 && (
            <div className="mb-3">
              <p className="text-[9px] font-bold text-brand-green/70 tracking-widest mb-1.5">{t('map.planned_trainings')}</p>
              <div className="flex flex-col gap-1.5">
                {parkStandaloneTrainings.map(tr => {
                  const dateObj = parseMapTrainingDate(tr)
                  const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' }) : ''
                  const timeLabel = tr.timeStart?.slice(-5) ?? ''
                  const memberGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                  const guestGoing = Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                  const totalGoing = memberGoing + guestGoing
                  const _isAuthor = uid === tr.authorId

                  async function handleDelete(e: React.MouseEvent) {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!window.confirm('Ești sigur că vrei să ștergi acest antrenament?')) return
                    try {
                      const token = await auth.currentUser?.getIdToken()
                      const res = await fetch('/api/admin/delete-training', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ parkId: park.id, trainingId: tr.id }),
                      })
                      const data = await res.json()
                      if (data.ok) onStandaloneTrainingDeleted(tr.id)
                    } catch { /* ignore */ }
                  }

                  return (
                    <button key={tr.id} onClick={() => onTrainingSelect(tr, 'standalone')} className="w-full text-left">
                      <div className="p-2.5 rounded-xl border border-brand-green/20 hover:bg-brand-green/5 transition-colors"
                        style={{ backgroundColor: '#0D3D2810' }}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-white leading-tight flex-1 min-w-0 truncate">{tr.name}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {totalGoing > 0 && (
                              <span className="text-xs text-brand-green font-bold">{totalGoing} {t(totalGoing === 1 ? 'map.going_singular' : 'map.going_plural')}</span>
                            )}
                            {isSuperAdmin && (
                              <button
                                onClick={handleDelete}
                                className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center hover:bg-red-500/30 transition-colors"
                                title="Șterge antrenamentul"
                              >
                                <X size={10} className="text-red-400" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-white/45 mt-0.5">
                          {tr.authorName && `${tr.authorName} · `}{dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
                        </p>
                        {(tr.exercises ?? []).length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {(tr.exercises ?? []).slice(0, 2).map((ex, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: 'rgba(30,215,95,0.12)', color: '#1ED75F' }}>
                                {ex.name}
                              </span>
                            ))}
                            {(tr.exercises?.length ?? 0) > 2 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full text-white/30"
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                +{(tr.exercises?.length ?? 0) - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Standalone past trainings fallback */}
          {parkStandaloneTrainings.length === 0 && parkPastTrainings.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-white/35 tracking-widest">{t('map.recent_activity')}</p>
              {parkPastTrainings.map(tr => {
                const dateObj = parseMapTrainingDate(tr)
                const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
                const totalGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                  + Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                return (
                  <button key={tr.id} onClick={() => onTrainingSelect(tr, 'standalone')} className="w-full text-left opacity-70">
                    <div className="p-2.5 rounded-xl border border-white/8"
                      style={{ backgroundColor: 'rgba(13,27,26,0.4)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white/60 leading-tight flex-1 truncate">{tr.name}</p>
                        {totalGoing > 0 && <span className="text-xs text-white/35 flex-shrink-0">{totalGoing} participanți</span>}
                      </div>
                      <p className="text-xs text-white/30 mt-0.5">{dateLabel}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Plan training button */}
          {uid && (
            <button
              onClick={() => setShowParkTrainingForm(true)}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-brand-green/30 text-brand-green text-sm font-bold hover:bg-brand-green/10 transition-colors mb-2"
              style={{ backgroundColor: '#0D3D2810' }}
            >
              <span className="text-base">📅</span> {t('map.plan_training')}
            </button>
          )}

          {/* Training history button — only if trainings exist */}
          {(parkStandaloneTrainings.length > 0 || parkPastTrainings.length > 0) && (
            <Link href={`/training/park/${park.id}/history`} onClick={onClose}>
              <button
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-white/15 text-white/60 text-sm font-semibold hover:bg-white/5 transition-colors mb-2"
              >
                <span className="text-base">🕓</span> {t('map.training_history')}
              </button>
            </Link>
          )}

          {parkPendingReq ? (
            <div className="flex items-center gap-2 p-3 rounded-2xl border border-yellow-400/25"
              style={{ backgroundColor: '#F9731610' }}>
              <span className="text-sm">⏳</span>
              <p className="text-xs text-yellow-400 font-semibold">{t('map.pending_req')}</p>
            </div>
          ) : uid ? (
            showCommChoice ? (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold text-white/35 tracking-widest px-1">{t('map.add_community_title')}</p>
                <button
                  onClick={() => { setShowCommChoice(false); setShowCreateCommForm(true) }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-brand-green/30 text-left hover:bg-brand-green/10 transition-colors"
                  style={{ backgroundColor: '#1ED75F08' }}
                >
                  <span className="text-xl">🏗️</span>
                  <div>
                    <p className="text-sm font-bold text-white">{t('map.create_new_comm')}</p>
                    <p className="text-xs text-white/45">{t('map.create_new_comm_desc')}</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowCommChoice(false); setShowParkCommModal(true) }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/15 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-xl">🔗</span>
                  <div>
                    <p className="text-sm font-bold text-white">{t('map.assoc_comm')}</p>
                    <p className="text-xs text-white/45">{t('map.assoc_comm_desc')}</p>
                  </div>
                </button>
                <button onClick={() => setShowCommChoice(false)} className="text-xs text-white/35 text-center py-1">{t('map.cancel')}</button>
              </div>
            ) : (
              <button
                onClick={() => setShowCommChoice(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-brand-green/30 text-brand-green text-sm font-bold hover:bg-brand-green/10 transition-colors"
                style={{ backgroundColor: '#1ED75F08' }}
              >
                {t('map.add_community_btn')}
              </button>
            )
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-2xl border border-white/10"
              style={{ backgroundColor: 'var(--app-bg)' }}>
              <MapPin size={14} className="text-white/30" />
              <p className="text-xs text-white/40">{t('map.no_community')}</p>
            </div>
          )}
        </div>
      )}

      {/* Community members preview strip */}
      {communityMembers.length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] font-bold text-white/35 tracking-widest mb-2">
            {t('map.community_members')} ({communityMembers.length})
          </p>
          <div className="flex items-end gap-2">
            {communityMembers.slice(0, 5).map(m => (
              <div key={m.userId} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <MemberAvatar name={m.displayName} photoUrl={m.photoUrl ?? ''} />
                <span className="text-[9px] text-white/35 w-9 truncate text-center">
                  {m.displayName.split(' ')[0]}
                </span>
              </div>
            ))}
            {communityMembers.length > 5 && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <span className="text-[10px] text-white/40">+{communityMembers.length - 5}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div>
          <p className="text-xs font-bold text-white/45 tracking-widest mb-2">
            {t('map.active_now', { n: members.length })}
          </p>
          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div key={m.uid} className="flex items-center gap-2.5">
                <MemberAvatar name={m.displayName} photoUrl={liveLocations[m.uid] ?? m.photoUrl} />
                <span className="text-sm text-white/80">{m.displayName}</span>
                <span className="ml-auto w-2 h-2 rounded-full bg-brand-green animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guest "Join for More" CTA */}
      {uid === null && (
        <div className="mt-4 p-3 rounded-2xl flex items-center gap-3"
          style={{ backgroundColor: 'rgba(30,215,95,0.07)', border: '1px solid rgba(30,215,95,0.15)' }}>
          <span className="text-xl flex-shrink-0">💪</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white/80">{t('map.join_cta_title')}</p>
            <p className="text-[10px] text-white/40 leading-snug mt-0.5">{t('map.join_cta_desc')}</p>
          </div>
          <Link href="/register" onClick={onClose} className="flex-shrink-0">
            <span className="text-xs font-black text-brand-green">{t('map.join_cta_btn')}</span>
          </Link>
        </div>
      )}

      {/* Associate existing community modal */}
      {showParkCommModal && uid && (
        <ParkCommunityModal
          park={park}
          uid={uid}
          userAdminCommunities={userAdminCommunities}
          onClose={() => setShowParkCommModal(false)}
          onSubmitted={req => { onPendingReqSet(req); setShowParkCommModal(false) }}
          onDirectAssociated={() => { setShowParkCommModal(false); onDirectAssociated() }}
        />
      )}

      {/* Create new community for this park */}
      {showCreateCommForm && uid && (
        <CreateCommunityForParkModal
          park={park}
          uid={uid}
          userName={userName}
          onClose={() => setShowCreateCommForm(false)}
          onPending={req => { onPendingReqSet(req); setShowCreateCommForm(false) }}
        />
      )}

      {/* Add standalone training modal */}
      {showParkTrainingForm && uid && (
        <AddParkTrainingModal
          park={park}
          uid={uid}
          userName={userName}
          onClose={() => setShowParkTrainingForm(false)}
          onAdded={t => { onStandaloneTrainingAdded(t); setShowParkTrainingForm(false) }}
        />
      )}
      </>)}
    </div>
  )
}
