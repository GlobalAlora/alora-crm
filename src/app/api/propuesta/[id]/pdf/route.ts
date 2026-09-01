import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderPropuestaPdf, renderResumenPdf } from '@/lib/propuesta-pdf'
import { slugOrIdColumn } from '@/lib/propuesta-lookup'

type Params = { params: Promise<{ id: string }> }

// Public, unauthenticated — same data as /api/propuesta/[id], rendered as a
// downloadable PDF (real server-side render, not a browser print-to-PDF).
// ?doc=resumen (default) or ?doc=detallada picks which of the two documents.
// [id] can be the real UUID or the readable slug.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const doc = req.nextUrl.searchParams.get('doc') === 'detallada' ? 'detallada' : 'resumen'
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('propuestas')
    .select('contenido')
    .eq(slugOrIdColumn(id), id)
    .single()

  if (error || !data || !data.contenido?.detallada) {
    return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  }

  try {
    const buffer = doc === 'detallada' || !data.contenido.resumen
      ? await renderPropuestaPdf(data.contenido.detallada)
      : await renderResumenPdf(data.contenido.resumen)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="propuesta-alora${doc === 'detallada' ? '' : '-resumen'}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[Propuesta PDF] Error:', err)
    return NextResponse.json({ error: 'Error generando el PDF' }, { status: 500 })
  }
}
