import 'dotenv/config'
import express from 'express'
import pino from 'pino'
import qrcode from 'qrcode'
import { Boom } from '@hapi/boom'
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const CRM_WEBHOOK_URL      = process.env.CRM_WEBHOOK_URL
const BAILEYS_WEBHOOK_SECRET = process.env.BAILEYS_WEBHOOK_SECRET
const BAILEYS_WORKER_SECRET  = process.env.BAILEYS_WORKER_SECRET
const AUTH_DIR             = process.env.AUTH_DIR || './auth_info'
const PORT                 = process.env.PORT || 3001

let sock = null
let latestQr = null
let connectionStatus = 'disconnected' // 'disconnected' | 'connecting' | 'connected'

// ── WhatsApp connection ─────────────────────────────────────────────────────

async function startSock() {
  connectionStatus = 'connecting'
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      latestQr = qr
      logger.info('Nuevo QR generado — abrí GET /qr?secret=... para escanearlo')
    }

    if (connection === 'open') {
      connectionStatus = 'connected'
      latestQr = null
      logger.info('Conectado a WhatsApp')
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected'
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode
        : undefined
      const loggedOut = statusCode === DisconnectReason.loggedOut

      if (loggedOut) {
        logger.warn(`Sesión cerrada desde el teléfono. Borrá ${AUTH_DIR} y reiniciá para escanear un QR nuevo.`)
      } else {
        logger.warn({ statusCode }, 'Conexión cerrada, reconectando…')
        startSock()
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      try {
        await handleIncomingMessage(message)
      } catch (err) {
        logger.error({ err }, 'Error procesando mensaje entrante')
      }
    }
  })
}

// ── Inbound message → CRM webhook ───────────────────────────────────────────

function extractText(message) {
  if (message.conversation) return { text: message.conversation, mediaType: null }
  if (message.extendedTextMessage?.text) return { text: message.extendedTextMessage.text, mediaType: null }
  if (message.imageMessage) return { text: message.imageMessage.caption || null, mediaType: 'image' }
  if (message.videoMessage) return { text: message.videoMessage.caption || null, mediaType: 'video' }
  if (message.documentMessage) return { text: message.documentMessage.caption || null, mediaType: 'document' }
  if (message.audioMessage) return { text: null, mediaType: 'audio' }
  if (message.stickerMessage) return { text: null, mediaType: 'sticker' }
  return { text: null, mediaType: null }
}

async function handleIncomingMessage(m) {
  if (!m.message || m.key.fromMe) return

  let jid = m.key.remoteJid || ''
  // Ignore groups, broadcast lists and channels — only 1:1 chats become leads
  if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return

  // WhatsApp's privacy "LID" system hides the real phone number behind an opaque
  // id (`<id>@lid`) for some contacts. Baileys resolves the real number either
  // directly on the message (`remoteJidAlt`) or via its LID↔phone mapping store.
  if (jid.endsWith('@lid')) {
    const altJid = m.key.remoteJidAlt
    if (altJid) {
      jid = altJid
    } else {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(jid).catch(() => null)
      if (pn) {
        jid = pn
      } else {
        logger.warn({ lid: jid }, 'No se pudo resolver el LID a un número real, se ignora el mensaje')
        return
      }
    }
  }

  const phone = jid.split('@')[0]
  const name = m.pushName || null
  const { text, mediaType } = extractText(m.message)

  if (!CRM_WEBHOOK_URL || !BAILEYS_WEBHOOK_SECRET) {
    logger.error('CRM_WEBHOOK_URL / BAILEYS_WEBHOOK_SECRET no configurados, no se pudo reenviar el mensaje')
    return
  }

  const res = await fetch(CRM_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': BAILEYS_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ phone, name, text, waMessageId: m.key.id, mediaType }),
  })

  if (!res.ok) {
    logger.error({ status: res.status, body: await res.text().catch(() => '') }, 'El CRM rechazó el mensaje')
  }
}

// ── HTTP server (health check, QR pairing, send) ────────────────────────────

const app = express()
app.use(express.json())

function requireSecret(req, res, next) {
  const secret = req.headers['x-webhook-secret']
  if (!secret || secret !== BAILEYS_WORKER_SECRET) {
    logger.warn({ path: req.path, gotSecret: secret ? `${secret.slice(0, 4)}…` : null }, 'Petición rechazada: secreto inválido o ausente')
    return res.status(401).json({ error: 'No autorizado' })
  }
  next()
}

app.get('/health', (req, res) => {
  res.json({ status: connectionStatus })
})

// JSON variant for server-to-server callers (e.g. the CRM's own API route)
app.get('/qr-data', requireSecret, async (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'connected', qr: null })
  }
  if (!latestQr) {
    return res.json({ status: connectionStatus, qr: null })
  }
  const dataUrl = await qrcode.toDataURL(latestQr)
  res.json({ status: connectionStatus, qr: dataUrl })
})

app.get('/qr', async (req, res) => {
  if (req.query.secret !== BAILEYS_WORKER_SECRET) {
    return res.status(401).send('No autorizado')
  }
  if (connectionStatus === 'connected') {
    return res.send('<h1>Ya conectado a WhatsApp ✅</h1>')
  }
  if (!latestQr) {
    return res.send('<h1>Generando QR… recargá la página en unos segundos</h1>')
  }
  const dataUrl = await qrcode.toDataURL(latestQr)
  res.send(
    `<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
       <img src="${dataUrl}" alt="Escaneá este QR con WhatsApp" />
     </body></html>`
  )
})

// Argentine mobiles are addressed on WhatsApp as 549<area><number>, but
// numbers are very commonly stored/typed as 54<area><number> (missing the
// "9"). Since WhatsApp only runs on mobiles, any 54-prefixed contact here is
// safe to treat as a mobile and gets the 9 inserted if it's missing.
function normalizeArgentinaMobile(rawPhone) {
  const digits = (rawPhone || '').replace(/\D/g, '')
  if (digits.startsWith('54') && !digits.startsWith('549')) {
    return '549' + digits.slice(2)
  }
  return digits
}

app.post('/send', requireSecret, async (req, res) => {
  const phone = normalizeArgentinaMobile(req.body?.phone)
  const { message } = req.body || {}
  logger.info({ rawPhone: req.body?.phone, phone, len: message?.length }, '/send recibido')

  try {
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone y message son requeridos' })
    }
    if (connectionStatus !== 'connected' || !sock) {
      logger.warn({ connectionStatus }, '/send rechazado: WhatsApp no conectado')
      return res.status(503).json({ error: 'WhatsApp no está conectado' })
    }

    // Resolve the canonical jid to address this contact with (WhatsApp may
    // require addressing some contacts by their LID instead of phone number).
    const fallbackJid = `${phone}@s.whatsapp.net`
    let jid = fallbackJid
    try {
      const results = await sock.onWhatsApp(fallbackJid)
      if (results?.[0]?.exists && results[0].jid) {
        jid = results[0].jid
      } else {
        logger.warn({ phone }, '/send: onWhatsApp no encontró el contacto, se intenta con el jid de teléfono')
      }
    } catch (lookupErr) {
      logger.warn({ lookupErr, phone }, '/send: falló onWhatsApp, se intenta con el jid de teléfono')
    }

    const result = await sock.sendMessage(jid, { text: message })
    logger.info({ jid, waMessageId: result?.key?.id }, '/send: sendMessage devolvió ok')
    res.json({ id: result?.key?.id ?? null })
  } catch (err) {
    logger.error({ err, phone }, '/send: error enviando mensaje')
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => logger.info(`Servidor HTTP escuchando en :${PORT}`))

startSock()
