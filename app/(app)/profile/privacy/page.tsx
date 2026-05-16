'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Shield } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

export default function PrivacyPage() {
  const router = useRouter()
  const t = useT()

  const sections = [
    { title: t('privacy.s1_title'), content: t('privacy.s1_text') },
    { title: t('privacy.s2_title'), content: t('privacy.s2_text') },
    { title: t('privacy.s3_title'), content: t('privacy.s3_text') },
    { title: t('privacy.s4_title'), content: t('privacy.s4_text') },
    { title: t('privacy.s5_title'), content: t('privacy.s5_text') },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">{t('privacy.title')}</h1>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-2xl mb-4 border border-brand-green/20" style={{ backgroundColor: '#1ED75F0D' }}>
          <Shield size={24} className="text-brand-green flex-shrink-0" />
          <p className="text-sm text-white/80 leading-relaxed">{t('privacy.data_safe')}</p>
        </div>

        {sections.map(section => (
          <div key={section.title} className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-xs font-bold text-white/50 tracking-widest mb-2">{section.title.toUpperCase()}</p>
            <p className="text-sm text-white/70 leading-relaxed">{section.content}</p>
          </div>
        ))}

        <p className="text-center text-xs text-white/25 mt-2">{t('privacy.last_updated')}</p>
      </div>
    </div>
  )
}
