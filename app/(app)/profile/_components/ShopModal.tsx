'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useT } from '@/lib/context/LanguageContext'
import { ShoppingBag, X, Eye } from 'lucide-react'
import type { UserDoc } from '@/types'

// ── Shop data ────────────────────────────────────────────────────────────────

type ShopCategory = 'badges' | 'titles' | 'customization'

interface ShopItem {
  id: string
  category: ShopCategory
  price: number
  icon: string
  name: string
  desc: string
  userDocField?: string
  userDocValue?: string
}

const SHOP_ITEMS: ShopItem[] = [
  // Badges
  { id: 'EARLY_BADGE',      category: 'badges', price: 100, icon: '\u2B50', name: 'Early Supporter', desc: 'Badge exclusiv pe profil pentru suporterii timpurii.' },
  { id: 'FIRE_BADGE',       category: 'badges', price: 120, icon: '\u{1F525}', name: 'Fire Badge',      desc: 'Badge de foc pe profil.' },
  { id: 'DIAMOND_BADGE',    category: 'badges', price: 200, icon: '\u{1F48E}', name: 'Diamond Badge',   desc: 'Badge de diamant premium pe profil.' },
  // Titles
  { id: 'PRO_TITLE',        category: 'titles', price: 150, icon: '\u{1F3AF}', name: 'Titlu Pro',       desc: 'Titlul "\u{1F3AF} Pro" pe profil.', userDocField: 'titleBadge', userDocValue: 'PRO' },
  { id: 'BEAST_MODE_TITLE', category: 'titles', price: 200, icon: '\u{1F4AA}', name: 'Beast Mode',      desc: 'Titlul "\u{1F4AA} Beast Mode" pe profil.', userDocField: 'titleBadge', userDocValue: 'BEAST_MODE' },
  { id: 'IRON_WILL_TITLE',  category: 'titles', price: 250, icon: '\u{1F6E1}\uFE0F', name: 'Iron Will',       desc: 'Titlul "\u{1F6E1}\uFE0F Iron Will" pe profil.', userDocField: 'titleBadge', userDocValue: 'IRON_WILL' },
  { id: 'CHAMPION_TITLE',   category: 'titles', price: 300, icon: '\u{1F3C6}', name: 'Champion',        desc: 'Titlul "\u{1F3C6} Champion" pe profil.', userDocField: 'titleBadge', userDocValue: 'CHAMPION' },
  // Customization
  { id: 'GOLD_FRAME',       category: 'customization', price: 150, icon: '\u{1F7E1}', name: 'Gold Frame',    desc: 'Cadru auriu pe avatarul t\u0103u.', userDocField: 'profileFrame', userDocValue: 'GOLD' },
  { id: 'FIRE_FRAME',       category: 'customization', price: 250, icon: '\u{1F525}', name: 'Fire Frame',    desc: 'Cadru cu efect de foc pe avatar.', userDocField: 'profileFrame', userDocValue: 'FIRE' },
  { id: 'GLOW_FRAME',       category: 'customization', price: 300, icon: '\u2728', name: 'Glow Frame',    desc: 'Cadru str\u0103lucitor animat pe avatar.', userDocField: 'profileFrame', userDocValue: 'GLOW' },
  { id: 'COLOR_GREEN',      category: 'customization', price: 100, icon: '\u{1F7E2}', name: 'Nume Verde',    desc: 'Numele t\u0103u \u00een verde.', userDocField: 'nameColor', userDocValue: '#1ED75F' },
  { id: 'COLOR_GOLD',       category: 'customization', price: 120, icon: '\u{1F7E1}', name: 'Nume Auriu',    desc: 'Numele t\u0103u \u00een auriu.', userDocField: 'nameColor', userDocValue: '#FFB800' },
  { id: 'COLOR_PURPLE',     category: 'customization', price: 120, icon: '\u{1F7E3}', name: 'Nume Violet',   desc: 'Numele t\u0103u \u00een violet.', userDocField: 'nameColor', userDocValue: '#A855F7' },
  { id: 'EMOJI_CROWN',      category: 'customization', price: 80,  icon: '\u{1F451}', name: 'Emoji Coroan\u0103', desc: 'Emoji \u{1F451} l\u00E2ng\u0103 numele t\u0103u.', userDocField: 'emojiBadge', userDocValue: '\u{1F451}' },
  { id: 'EMOJI_FIRE',       category: 'customization', price: 80,  icon: '\u{1F525}', name: 'Emoji Foc',     desc: 'Emoji \u{1F525} l\u00E2ng\u0103 numele t\u0103u.', userDocField: 'emojiBadge', userDocValue: '\u{1F525}' },
  { id: 'EMOJI_STAR',       category: 'customization', price: 80,  icon: '\u2B50', name: 'Emoji Stea',    desc: 'Emoji \u2B50 l\u00E2ng\u0103 numele t\u0103u.', userDocField: 'emojiBadge', userDocValue: '\u2B50' },
  { id: 'POWER_PACK',       category: 'customization', price: 200, icon: '\u26A1', name: 'Power Pack',    desc: 'Deblochează o provocare bonus zilnică exclusivă.' },
  { id: 'CUSTOM_NICKNAME',  category: 'customization', price: 100, icon: '\u270F\uFE0F', name: 'Nickname',      desc: 'Alege un nickname personalizat pentru evenimente.' },
]

export { SHOP_ITEMS }

export const FRAME_STYLES: Record<string, { border: string; shadow?: string; animate?: boolean }> = {
  GOLD: { border: '3px solid #FFB800' },
  FIRE: { border: '3px solid #F97316', shadow: '0 0 12px rgba(249,115,22,0.4)' },
  GLOW: { border: '3px solid #A855F7', shadow: '0 0 16px rgba(168,85,247,0.5)', animate: true },
}

export const TITLE_LABELS: Record<string, string> = {
  PRO: '\u{1F3AF} Pro',
  BEAST_MODE: '\u{1F4AA} Beast Mode',
  IRON_WILL: '\u{1F6E1}\uFE0F Iron Will',
  CHAMPION: '\u{1F3C6} Champion',
}

const CATEGORY_KEYS: ShopCategory[] = ['badges', 'titles', 'customization']

// ── Component ────────────────────────────────────────────────────────────────

interface ShopModalProps {
  onClose: () => void
  profile: UserDoc | null
  purchases: Set<string>
  uid: string
  onPurchase: (itemId: string, price: number) => Promise<void>
}

export default function ShopModal({ onClose, profile, purchases, uid, onPurchase }: ShopModalProps) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)

  const [previewItemId, setPreviewItemId] = useState<string | null>(null)
  const [equipLoading, setEquipLoading] = useState<string | null>(null)

  // Build preview profile by merging current profile with previewed item
  function getPreviewProfile() {
    const base = {
      photoUrl: profile?.photoUrl,
      displayName: profile?.displayName ?? '',
      nameColor: profile?.nameColor,
      emojiBadge: profile?.emojiBadge,
      profileFrame: profile?.profileFrame,
      titleBadge: profile?.titleBadge,
    }
    if (!previewItemId) return base
    const item = SHOP_ITEMS.find(i => i.id === previewItemId)
    if (!item?.userDocField || !item?.userDocValue) return base
    return { ...base, [item.userDocField]: item.userDocValue }
  }

  async function handleEquip(item: ShopItem) {
    if (!item.userDocField || !uid) return
    setEquipLoading(item.id)
    try {
      const userRef = doc(db, 'users', uid)
      const currentVal = profile?.[item.userDocField as keyof UserDoc]
      const isActive = currentVal === item.userDocValue

      if (isActive) {
        // Unequip
        const updates: Record<string, unknown> = { [item.userDocField]: deleteField() }
        if (item.id === 'PRO_TITLE') updates.proTitle = deleteField()
        await updateDoc(userRef, updates)
      } else {
        // Equip
        const updates: Record<string, unknown> = { [item.userDocField]: item.userDocValue }
        if (item.id === 'PRO_TITLE') updates.proTitle = true
        await updateDoc(userRef, updates)
      }
    } catch {
      // silently fail — profile snapshot will reflect actual state
    } finally {
      setEquipLoading(null)
    }
  }

  const preview = getPreviewProfile()
  const initial = preview.displayName.charAt(0).toUpperCase()
  const frameStyle = preview.profileFrame ? FRAME_STYLES[preview.profileFrame] : undefined

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-3xl flex flex-col"
        style={{ backgroundColor: 'var(--app-surface)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag size={17} className="text-brand-green" />
            <p className="font-black text-white text-sm">{t('shop.title')} · {profile?.coins ?? 0} {'\u{1FA99}'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={14} className="text-white/50" />
          </button>
        </div>

        {/* Preview card */}
        <div className="mx-5 mb-3 p-3 rounded-2xl flex-shrink-0" style={{ backgroundColor: 'var(--app-bg)' }}>
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-2">
            {previewItemId ? t('shop.preview') : t('shop.yourProfile')}
          </p>
          <div className="flex items-center gap-3">
            {/* Avatar with frame */}
            <div
              className={`relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0${frameStyle?.animate ? ' animate-pulse-glow' : ''}`}
              style={{
                backgroundColor: 'rgba(var(--accent-rgb), 0.20)',
                ...(frameStyle ? { border: frameStyle.border, boxShadow: frameStyle.shadow } : {}),
              }}
            >
              {preview.photoUrl
                ? <Image src={preview.photoUrl} alt="" fill sizes="56px" className="object-cover" referrerPolicy="no-referrer" />
                : <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-brand-green">{initial}</span>
              }
            </div>
            {/* Name + badges */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black truncate" style={{ color: preview.nameColor ?? '#ffffff' }}>
                {preview.emojiBadge && <span className="mr-1">{preview.emojiBadge}</span>}
                {preview.displayName}
              </p>
              {preview.titleBadge && TITLE_LABELS[preview.titleBadge] && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-1"
                  style={{ backgroundColor: '#A855F722', color: '#A855F7' }}>
                  {TITLE_LABELS[preview.titleBadge]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable items */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <div className="flex flex-col gap-4">
            {CATEGORY_KEYS.map(cat => {
              const items = SHOP_ITEMS.filter(i => i.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">{t(`shop.${cat}`)}</p>
                  <div className="flex flex-col gap-2">
                    {items.map(item => {
                      const owned = purchases.has(item.id)
                      const canAfford = (profile?.coins ?? 0) >= item.price
                      const hasField = !!item.userDocField
                      const isActive = hasField && profile?.[item.userDocField as keyof UserDoc] === item.userDocValue
                      const isPreviewing = previewItemId === item.id

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isPreviewing ? 'ring-2 ring-brand-green/40' : ''}`}
                          style={{
                            backgroundColor: isActive
                              ? 'rgba(var(--accent-rgb), 0.06)'
                              : owned
                                ? 'rgba(var(--accent-rgb), 0.03)'
                                : 'var(--app-bg)',
                            borderColor: isActive
                              ? 'rgba(var(--accent-rgb), 0.25)'
                              : owned
                                ? 'rgba(var(--accent-rgb), 0.12)'
                                : 'rgba(255,255,255,0.08)',
                          }}
                        >
                          <span className="text-2xl flex-shrink-0">{item.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">{item.name}</p>
                            <p className="text-xs text-white/40 leading-snug mt-0.5">{item.desc}</p>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Preview button for items with visual effect */}
                            {hasField && (
                              <button
                                onClick={() => setPreviewItemId(isPreviewing ? null : item.id)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                                  isPreviewing ? 'bg-brand-green/20' : 'bg-white/6 hover:bg-white/10'
                                }`}
                                title={t('shop.preview')}
                              >
                                <Eye size={13} className={isPreviewing ? 'text-brand-green' : 'text-white/40'} />
                              </button>
                            )}

                            {/* Action button */}
                            {owned ? (
                              hasField ? (
                                // Equip / Unequip toggle
                                <button
                                  onClick={() => handleEquip(item)}
                                  disabled={equipLoading === item.id}
                                  className="h-8 px-3 rounded-xl text-xs font-bold transition-colors border"
                                  style={isActive
                                    ? { backgroundColor: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', borderColor: 'rgba(var(--accent-rgb), 0.3)' }
                                    : { backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)' }
                                  }
                                >
                                  {equipLoading === item.id ? '...' : isActive ? t('shop.active') : t('shop.equip')}
                                </button>
                              ) : (
                                // Badge — just show owned
                                <span className="text-xs font-bold text-brand-green flex-shrink-0">{t('shop.owned')}</span>
                              )
                            ) : (
                              // Buy button
                              <button
                                onClick={() => onPurchase(item.id, item.price)}
                                disabled={!canAfford}
                                className="h-8 px-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                                style={{
                                  backgroundColor: canAfford ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                                  color: canAfford ? '#000' : 'rgba(255,255,255,0.4)',
                                }}
                              >
                                {'\u{1FA99}'} {item.price}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
