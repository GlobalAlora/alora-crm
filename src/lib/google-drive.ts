/**
 * Google Drive integration for Alora CRM.
 *
 * Uses a Service Account (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
 * that has been granted Editor access to the parent folder
 * (GOOGLE_DRIVE_PARENT_FOLDER_ID = "ALORA - COMERCIAL - LEADS/PROPUESTAS").
 *
 * Folder names use the lead's company / full name + short ID to stay readable in Drive.
 */

import { google } from 'googleapis'

// ── Config ────────────────────────────────────────────────────────────────────

function getDriveClient() {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const parentId   = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID

  if (!email || !privateKey || !parentId) {
    throw new Error(
      'Missing Google Drive env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, ' +
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_DRIVE_PARENT_FOLDER_ID'
    )
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  return { drive: google.drive({ version: 'v3', auth }), parentId }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a readable folder name for the lead.
 * Example: "ALKEMIA - Sofía Natale (abc123)"
 */
function buildFolderName(lead: {
  nombre: string
  apellido: string | null
  empresa: string | null
  id: string
}): string {
  const fullName = [lead.nombre, lead.apellido].filter(Boolean).join(' ')
  const prefix   = lead.empresa ? `${lead.empresa} - ` : ''
  const shortId  = lead.id.slice(0, 8)
  return `${prefix}${fullName} (${shortId})`
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DriveFolderResult {
  folderId: string
  folderUrl: string
  alreadyExisted: boolean
}

/**
 * Creates a Drive folder for the lead inside the parent folder.
 * Idempotent: if a folder with the same name already exists under the parent,
 * returns the existing one instead of creating a duplicate.
 *
 * Pass `existingFolderId` (from leads.drive_folder_id) to skip the search
 * and return immediately — this is the fastest idempotency check.
 */
export async function ensureLeadDriveFolder(lead: {
  id: string
  nombre: string
  apellido: string | null
  empresa: string | null
  drive_folder_id?: string | null
}): Promise<DriveFolderResult> {
  const { drive, parentId } = getDriveClient()
  const folderName = buildFolderName(lead)

  // Fast-path: already stored in DB
  if (lead.drive_folder_id) {
    return {
      folderId:      lead.drive_folder_id,
      folderUrl:     `https://drive.google.com/drive/folders/${lead.drive_folder_id}`,
      alreadyExisted: true,
    }
  }

  // Search for existing folder with same name under the parent (avoid duplicates)
  const { data: searchResult } = await drive.files.list({
    q: [
      `name = '${folderName.replace(/'/g, "\\'")}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `'${parentId}' in parents`,
      `trashed = false`,
    ].join(' and '),
    fields: 'files(id, name)',
    spaces: 'drive',
  })

  if (searchResult.files && searchResult.files.length > 0) {
    const existing = searchResult.files[0]
    return {
      folderId:      existing.id!,
      folderUrl:     `https://drive.google.com/drive/folders/${existing.id}`,
      alreadyExisted: true,
    }
  }

  // Create new folder
  const { data: created } = await drive.files.create({
    requestBody: {
      name:     folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  [parentId],
    },
    fields: 'id, name',
  })

  if (!created.id) throw new Error('Drive API returned no folder ID')

  return {
    folderId:      created.id,
    folderUrl:     `https://drive.google.com/drive/folders/${created.id}`,
    alreadyExisted: false,
  }
}

// ── Meet notes/transcripts (for the Presupuestador agent) ──────────────────────

/**
 * Google Workspace auto-saves Meet notes ("Notes by Gemini") and transcripts
 * into a "Meet Recordings" folder in the organizer's own Drive. That folder
 * has to be shared with the service account (Viewer is enough) for this to
 * find anything — it is NOT the same as the per-lead PROPUESTAS folder above.
 */
export interface MeetDoc {
  name: string
  url: string
  text: string
  fecha: string | null
}

export interface MeetNotesResult {
  notas: MeetDoc[]
  transcripciones: MeetDoc[]
}

const NOTAS_RE = /notes? by gemini|\bnotas?\b/i
const TRANSCRIPT_RE = /transcript|transcripci[oó]n/i

async function findMeetRecordingsFolderId(drive: ReturnType<typeof google.drive>): Promise<string | null> {
  const { data } = await drive.files.list({
    q: `name = 'Meet Recordings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  })
  return data.files?.[0]?.id ?? null
}

/**
 * Searches the "Meet Recordings" folder for docs whose filename mentions any
 * of the given search terms (lead name, empresa) and returns their text
 * content, split into "notas" (Gemini summary) vs "transcripciones" (full
 * transcript) by filename. Returns null if the folder isn't shared with the
 * service account, or if nothing matches.
 */
export async function findMeetNotesForLead(searchTerms: string[]): Promise<MeetNotesResult | null> {
  const terms = searchTerms.map(t => t.trim()).filter(Boolean)
  if (!terms.length) return null

  const { drive } = getDriveClient()
  const folderId = await findMeetRecordingsFolderId(drive)
  if (!folderId) return null

  const nameQuery = terms.map(t => `name contains '${t.replace(/'/g, "\\'")}'`).join(' or ')
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (${nameQuery})`,
    fields: 'files(id, name, mimeType, webViewLink, createdTime)',
    spaces: 'drive',
    orderBy: 'createdTime desc',
    pageSize: 10,
  })

  const files = data.files ?? []
  if (!files.length) return null

  const notas: MeetDoc[] = []
  const transcripciones: MeetDoc[] = []

  for (const file of files) {
    if (!file.id || file.mimeType !== 'application/vnd.google-apps.document') continue
    try {
      const { data: exported } = await drive.files.export(
        { fileId: file.id, mimeType: 'text/plain' },
        { responseType: 'text' },
      )
      const doc: MeetDoc = {
        name: file.name ?? 'Documento',
        url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
        text: String(exported).slice(0, 20_000),
        fecha: file.createdTime ?? null,
      }
      if (TRANSCRIPT_RE.test(file.name ?? '')) transcripciones.push(doc)
      else if (NOTAS_RE.test(file.name ?? '')) notas.push(doc)
    } catch (err) {
      console.error(`[Drive] Failed to export "${file.name}":`, err)
    }
  }

  if (!notas.length && !transcripciones.length) return null
  return { notas, transcripciones }
}
