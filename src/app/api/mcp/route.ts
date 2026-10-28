/**
 * Endpoint MCP del CRM — permite que Claude (claude.ai / app) consulte y opere
 * el CRM como conector personalizado.
 *
 * Auth: header `Authorization: Bearer <CRM_MCP_TOKEN>` (se configura en
 * Claude → Conectores → conector personalizado → Request headers).
 *
 * Variables de entorno:
 *   CRM_MCP_TOKEN       token largo y aleatorio (obligatorio; sin él el endpoint queda apagado)
 *   CRM_MCP_USER_EMAIL  email del usuario del CRM que firma las acciones (actividades, tareas, cambios de etapa)
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleMessage } from '@/lib/mcp/server'
import type { ToolContext } from '@/lib/mcp/tools'

export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRM_MCP_TOKEN
  if (!expected || expected.length < 24) return false
  const header = req.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

let cachedUserId: string | null = null

async function buildContext(): Promise<ToolContext> {
  const db = createAdminClient()
  if (!cachedUserId) {
    const email = process.env.CRM_MCP_USER_EMAIL
    if (!email) throw new Error('Falta configurar CRM_MCP_USER_EMAIL en el servidor.')
    const { data } = await db.from('users').select('id').ilike('email', email).maybeSingle()
    if (!data) throw new Error(`CRM_MCP_USER_EMAIL (${email}) no corresponde a ningún usuario del CRM.`)
    cachedUserId = data.id
  }
  return { db, userId: cachedUserId! }
}

const unauthorized = () =>
  NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'No autorizado' } },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="alora-crm"' } },
  )

export async function POST(req: NextRequest) {
  if (!authorized(req)) return unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }

  let ctxPromise: Promise<ToolContext> | null = null
  const getCtx = () => (ctxPromise ??= buildContext())

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(m => handleMessage(m, getCtx)))).filter(Boolean)
    return responses.length ? NextResponse.json(responses) : new NextResponse(null, { status: 202 })
  }

  const response = await handleMessage(body, getCtx)
  return response ? NextResponse.json(response) : new NextResponse(null, { status: 202 })
}

// Modo stateless: no hay stream SSE de servidor→cliente ni sesiones que cerrar.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return unauthorized()
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return unauthorized()
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}
