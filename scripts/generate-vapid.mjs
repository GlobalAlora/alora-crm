/**
 * Run once to generate VAPID keys for Web Push:
 *   node scripts/generate-vapid.mjs
 *
 * Then add the output to Vercel environment variables:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (same value as VAPID_PUBLIC_KEY)
 */
import { generateVAPIDKeys } from 'web-push'

const keys = generateVAPIDKeys()
console.log('\n✅ VAPID keys generated — add these to Vercel env vars:\n')
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log('\n⚠️  Keep VAPID_PRIVATE_KEY secret. NEXT_PUBLIC_VAPID_PUBLIC_KEY is safe to expose.\n')
