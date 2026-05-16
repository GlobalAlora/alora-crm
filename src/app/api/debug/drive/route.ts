import { NextResponse } from 'next/server'
import { ensureLeadDriveFolder } from '@/lib/google-drive'

export async function GET() {
  try {
    const result = await ensureLeadDriveFolder({
      id: 'test-debug-000',
      nombre: 'Test',
      apellido: 'Debug',
      empresa: 'Alora',
      drive_folder_id: null,
    })
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
