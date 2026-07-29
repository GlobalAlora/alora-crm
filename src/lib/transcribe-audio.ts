import OpenAI from 'openai'
import { toFile } from 'openai'

let _client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

// WhatsApp voice notes come in as audio/ogg;codecs=opus — Whisper accepts ogg.
function extensionFromMimetype(mimetype: string): string {
  if (mimetype.includes('ogg'))  return 'ogg'
  if (mimetype.includes('mp4'))  return 'mp4'
  if (mimetype.includes('mpeg') || mimetype.includes('mp3')) return 'mp3'
  if (mimetype.includes('webm')) return 'webm'
  if (mimetype.includes('wav'))  return 'wav'
  return 'ogg'
}

export async function transcribeAudio(audioBase64: string, mimetype: string): Promise<string | null> {
  const client = getClient()
  if (!client) {
    console.error('[Whisper] OPENAI_API_KEY not set — audio transcription skipped')
    return null
  }

  try {
    const buffer = Buffer.from(audioBase64, 'base64')
    const ext    = extensionFromMimetype(mimetype)
    const file   = await toFile(new Blob([buffer], { type: mimetype }), `audio.${ext}`)

    const result = await client.audio.transcriptions.create({
      file,
      model:    'whisper-1',
      language: 'es',
    })

    const text = result.text?.trim()
    console.log('[Whisper] Transcribed:', text?.slice(0, 100))
    return text || null
  } catch (err) {
    console.error('[Whisper] Transcription failed:', err instanceof Error ? err.message : err)
    return null
  }
}
