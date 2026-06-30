import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'

export const metadata: Metadata = {
  title: 'Alora CRM',
  description: 'Pipeline comercial y gestión de leads',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#1B4040" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="h-full antialiased">
        <ServiceWorkerRegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
