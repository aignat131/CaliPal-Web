import { LanguageProvider } from '@/lib/context/LanguageContext'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
