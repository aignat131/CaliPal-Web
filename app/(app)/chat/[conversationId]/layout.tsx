import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mesaje · CaliPal',
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
