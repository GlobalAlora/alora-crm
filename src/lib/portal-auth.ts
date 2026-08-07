import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { createAdminClient } from './supabase/admin'

const scryptAsync = promisify(scrypt)

export const PORTAL_COOKIE = 'portal_session'
const SESSION_TTL_DAYS = 30

export interface PortalClient {
  id: string
  email: string
  nombre: string
  empresa: string | null
  plan_horas_mensual: number
  color_acento: string | null
  nombre_plan: string | null
  mensaje_bienvenida: string | null
  logo_url: string | null
  manager_nombre: string | null
  manager_avatar: string | null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [salt, storedKey] = hash.split(':')
    const key = (await scryptAsync(password, salt, 64)) as Buffer
    const storedKeyBuf = Buffer.from(storedKey, 'hex')
    return timingSafeEqual(key, storedKeyBuf)
  } catch {
    return false
  }
}

export async function createSession(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS)

  const { data, error } = await admin
    .from('portal_sessions')
    .insert({ portal_client_id: clientId, expires_at: expiresAt.toISOString() })
    .select('id')
    .single()

  if (error || !data) throw new Error('Could not create session')
  return data.id
}

export async function getPortalClient(sessionId: string): Promise<PortalClient | null> {
  if (!sessionId) return null
  const admin = createAdminClient()

  const { data } = await admin
    .from('portal_sessions')
    .select('expires_at, portal_clients(id, email, nombre, empresa, plan_horas_mensual, color_acento, nombre_plan, mensaje_bienvenida, logo_url, manager_nombre, manager_avatar)')
    .eq('id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!data?.portal_clients) return null
  return data.portal_clients as unknown as PortalClient
}

export async function deleteSession(sessionId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('portal_sessions').delete().eq('id', sessionId)
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
  path: '/',
}
