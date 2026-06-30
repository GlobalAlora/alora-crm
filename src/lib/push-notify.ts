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

/**
 * Send a push notification to all registered CRM users.
 * Silently no-ops when VAPID env vars are not set.
 * Automatically removes stale subscriptions (410 / 404 responses).
 */
export async function notifyAll(payload: PushPayload): Promise<void> {
  ensureVapid()
  if (!vapidConfigured) return

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')

  if (!subs?.length) return

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
          // Subscription expired — clean up
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        } else {
          console.error('[Push] sendNotification failed:', status, sub.endpoint.slice(-20))
        }
      }
    })
  )
}
