import { sendGmail } from '@/lib/google-gmail'

const ALERT_TO = 'walo@globalalora.com'

/**
 * The Baileys worker lost its WhatsApp session and needs the QR re-scanned
 * (Configuración → WhatsApp in the CRM). Sent at most when it actually
 * happens — Baileys' normal transient reconnects don't trigger this.
 */
export async function sendWhatsAppDisconnectedAlert(): Promise<void> {
  try {
    await sendGmail({
      from: 'info@globalalora.com',
      to: ALERT_TO,
      subject: '⚠️ WhatsApp del CRM desconectado',
      html: `
        <p>El WhatsApp del CRM (Baileys) se desvinculó y dejó de recibir mensajes.</p>
        <p>Para reconectarlo, entrá a <strong>Configuración → WhatsApp</strong> en el CRM y escaneá el QR de nuevo con el WhatsApp Business de Alora.</p>
      `,
    })
  } catch (err) {
    console.error('[WhatsApp] Failed to send disconnect alert email:', err instanceof Error ? err.message : err)
  }
}
