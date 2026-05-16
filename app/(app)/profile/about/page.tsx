'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Heart, Code2, Globe } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

export default function AboutPage() {
  const router = useRouter()
  const t = useT()

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">{t('about.title')}</h1>
        </div>

        {/* Logo block */}
        <div className="flex flex-col items-center mb-8 py-6 rounded-2xl" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-3" style={{ backgroundColor: '#1ED75F22', border: '2px solid #1ED75F44' }}>
            <span className="text-4xl font-black text-brand-green">C</span>
          </div>
          <p className="text-xl font-black text-white">CaliPal</p>
          <p className="text-xs text-white/40 mt-1">{t('about.version_full')}</p>
        </div>

        {/* Info cards */}
        <div className="rounded-2xl overflow-hidden divide-y divide-white/8 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <Row icon={<Globe size={16} />} label={t('about.version')} value="1.0.0" />
          <Row icon={<Heart size={16} />} label={t('about.made_with')} value="Next.js · Firebase · MediaPipe" />
          <Row icon={<Code2 size={16} />} label={t('about.platform')} value="Vercel" />
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <p className="text-xs font-bold text-white/40 tracking-widest mb-2">{t('about.desc_title')}</p>
          <p className="text-sm text-white/70 leading-relaxed">{t('about.desc_text')}</p>
        </div>

        <p className="text-center text-xs text-white/25 mt-6">
          {t('about.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-brand-green">{icon}</span>
      <span className="flex-1 text-sm text-white">{label}</span>
      <span className="text-xs text-white/40 text-right">{value}</span>
    </div>
  )
}
