import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderPropuestaPdf } from '@/lib/propuesta-pdf'

type Params = { params: Promise<{ id: string }> }

// Public, unauthenticated — same data as /api/propuesta/[id], rendered as a
// downloadable PDF (real server-side render, not a browser print-to-PDF).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('propuestas')
    .select('valor_usd, valor_ars, moneda, contenido, lead:leads(nombre, apellido, empresa)')
    .eq('id', id)
    .single()

  if (error || !data || !data.contenido) {
    return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  }

  const lead = Array.isArray(data.lead) ? data.lead[0] : data.lead
  const monto = data.moneda === 'ARS' ? data.valor_ars : data.valor_usd

  try {
    const buffer = await renderPropuestaPdf({
      contenido: data.contenido,
      moneda: data.moneda,
      monto,
      leadNombre: lead ? [lead.nombre, lead.apellido].filter(Boolean).join(' ') : undefined,
      leadEmpresa: lead?.empresa,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="propuesta-alora.pdf"`,
      },
    })
  } catch (err) {
    console.error('[Propuesta PDF] Error:', err)
    return NextResponse.json({ error: 'Error generando el PDF' }, { status: 500 })
  }
}
