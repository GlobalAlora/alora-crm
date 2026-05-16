// Test Google Drive connection without starting Next.js
// Run with: node scripts/test-drive.mjs

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env.local manually
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  let val = trimmed.slice(eq + 1).trim()
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
  process.env[key] = val.replace(/\\n/g, '\n')
}

const { google } = await import('googleapis')

const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
const parentId   = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID

console.log('Email:    ', email)
console.log('ParentId: ', parentId)
console.log('Key start:', privateKey?.slice(0, 40))

if (!email || !privateKey || !parentId) {
  console.error('❌ Missing env vars')
  process.exit(1)
}

try {
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  const drive = google.drive({ version: 'v3', auth })

  // 1. Test auth
  console.log('\n⏳ Testing auth...')
  await auth.authorize()
  console.log('✅ Auth OK')

  // 2. Test parent folder access
  console.log('\n⏳ Checking parent folder...')
  const { data: folder } = await drive.files.get({
    fileId: parentId,
    fields: 'id, name',
  })
  console.log('✅ Parent folder:', folder.name)

  // 3. Create test folder
  console.log('\n⏳ Creating test folder...')
  const { data: created } = await drive.files.create({
    requestBody: {
      name: 'TEST - Alora CRM debug (borrar)',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name',
  })
  console.log('✅ Created folder:', created.name, '| ID:', created.id)
  console.log('🔗', `https://drive.google.com/drive/folders/${created.id}`)

} catch (err) {
  console.error('\n❌ Error:', err.message)
  if (err.errors) console.error('Details:', JSON.stringify(err.errors, null, 2))
}
