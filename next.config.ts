import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Los .woff de Inter/JetBrains Mono para el PDF (propuesta-pdf.tsx) se leen
  // por fs en runtime, no por import -- sin esto, Vercel no los detecta como
  // dependencias del route y el PDF generado en producción se queda sin
  // fuentes aunque funcione perfecto en local.
  outputFileTracingIncludes: {
    '/api/propuesta/[id]/pdf': ['./src/lib/pdf-fonts/**'],
  },
}

export default nextConfig
