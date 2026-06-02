import type { Metadata } from 'next'
import { adminDb } from '@/lib/firebase/admin'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params
    const snap = await adminDb().collection('communities').doc(id).get()
    const data = snap.data()
    if (!data) return { title: 'CaliPal' }
    return {
      title: `${data.name} · CaliPal`,
      description: data.description || `Comunitate de calisthenics — ${data.location}`,
      openGraph: {
        title: `${data.name} · CaliPal`,
        description: data.description || `Comunitate de calisthenics — ${data.location}`,
        images: data.imageUrl ? [{ url: data.imageUrl }] : [{ url: '/og-image.png' }],
      },
    }
  } catch {
    return { title: 'CaliPal' }
  }
}

export default function CommunityDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
