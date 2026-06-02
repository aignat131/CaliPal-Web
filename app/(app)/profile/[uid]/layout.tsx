import type { Metadata } from 'next'
import { adminDb } from '@/lib/firebase/admin'

export async function generateMetadata({ params }: { params: Promise<{ uid: string }> }): Promise<Metadata> {
  try {
    const { uid } = await params
    const snap = await adminDb().collection('users').doc(uid).get()
    const data = snap.data()
    if (!data) return { title: 'CaliPal' }
    const name = data.displayName || 'Profil'
    return {
      title: `${name} · CaliPal`,
      openGraph: {
        title: `${name} · CaliPal`,
        images: data.photoUrl ? [{ url: data.photoUrl }] : [{ url: '/og-image.png' }],
      },
    }
  } catch {
    return { title: 'CaliPal' }
  }
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
