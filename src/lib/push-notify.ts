import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  const pub  = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return
  webpush.setVapidDetails('mailto:info@globalalora.com', pub, priv)
  vapidConfigured = true
}

export interface PushPayload {
  title: string
  body:  string
  url?:  string
  icon?: string
}

async function sendToSubs(
  subs: { endpoint: string; p256dh: string; auth_key: string }[],
  payload: PushPayload,
) {
  const admin = createAdminClient()
  const message = JSON.stringify(payload)
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          message,
        )
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        } else {
          console.error('[Push] sendNotification failed:', status, sub.endpoint.slice(-20))
        }
      }
    })
  )
}

/**
 * Send a push notification to all registered CRM users.
 * Silently no-ops when VAPID env vars are not set.
 */
export async function notifyAll(payload: PushPayload): Promise<void> {
  ensureVapid()
  if (!vapidConfigured) return

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')

  if (!subs?.length) return
  await sendToSubs(subs, payload)
}

/**
 * Send a push notification to a specific user (by user_id).
 * Silently no-ops when VAPID env vars are not set.
 */
export async function notifyUser(userId: string, payload: PushPayload): Promise<void> {
  ensureVapid()
  if (!vapidConfigured) return

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('user_id', userId)

  if (!subs?.length) return
  await sendToSubs(subs, payload)
}
