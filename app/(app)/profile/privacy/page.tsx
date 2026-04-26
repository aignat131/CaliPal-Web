'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPage() {
  const router = useRouter()

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Confidențialitate</h1>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-2xl mb-4 border border-brand-green/20" style={{ backgroundColor: '#1ED75F0D' }}>
          <Shield size={24} className="text-brand-green flex-shrink-0" />
          <p className="text-sm text-white/80 leading-relaxed">
            Datele tale sunt stocate securizat în Firebase și nu sunt partajate cu terți.
          </p>
        </div>

        {[
          {
            title: 'Date colectate',
            content: 'Colectăm numele, adresa de email, fotografia de profil și datele de activitate (antrenamente, skill-uri, comunități) pentru a-ți oferi serviciile aplicației.',
          },
          {
            title: 'Locație',
            content: 'Locația ta este folosită opțional pentru a-ți arăta parcurile din apropiere și pentru a te marca ca prezent la un parc. Poți opri partajarea locației în orice moment.',
          },
          {
            title: 'Notificări',
            content: 'Notificările push sunt opționale și pot fi dezactivate din setările browserului sau din aplicație.',
          },
          {
            title: 'Ștergerea datelor',
            content: 'Poți solicita ștergerea contului și a tuturor datelor asociate contactând suportul.',
          },
          {
            title: 'Cookie-uri',
            content: 'Folosim cookie-uri esențiale pentru autentificare și preferințe de sesiune. Nu folosim cookie-uri de tracking terță parte.',
          },
        ].map(section => (
          <div key={section.title} className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-xs font-bold text-white/50 tracking-widest mb-2">{section.title.toUpperCase()}</p>
            <p className="text-sm text-white/70 leading-relaxed">{section.content}</p>
          </div>
        ))}

        <p className="text-center text-xs text-white/25 mt-2">Ultima actualizare: Aprilie 2026</p>
      </div>
    </div>
  )
}
