import { sendGmail } from '@/lib/google-gmail'

const ALERT_TO = 'somosglobalalora@gmail.com'

interface NewReviewAlertInput {
  nombre: string
  empresa: string | null
  rating: number
  resena: string
  locale: string
}

/**
 * Notifies the team by email whenever a client submits a review from the
 * public /resenas form. Reviews are NOT auto-published — this is the only
 * record of the submission, and someone on the team manually adds it to
 * the testimonials shown on the site after reviewing it.
 * Best-effort: never throws, so a failure here can't block the response
 * the visitor sees.
 */
export async function sendNewReviewAlert(review: NewReviewAlertInput): Promise<void> {
  try {
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
    await sendGmail({
      from: 'info@globalalora.com',
      to: ALERT_TO,
      subject: `⭐ Nueva reseña de ${review.nombre}${review.empresa ? ` (${review.empresa})` : ''}`,
      html: `
        <p>Un cliente dejó una reseña en el sitio web. No se publica sola — revisala y agregala a /resenas si corresponde.</p>
        <ul>
          <li><strong>Nombre:</strong> ${review.nombre}</li>
          ${review.empresa ? `<li><strong>Empresa:</strong> ${review.empresa}</li>` : ''}
          <li><strong>Calificación:</strong> ${stars} (${review.rating}/5)</li>
          <li><strong>Idioma:</strong> ${review.locale}</li>
        </ul>
        <p><strong>Reseña:</strong></p>
        <p style="white-space: pre-wrap;">${review.resena}</p>
      `,
    })
  } catch (err) {
    console.error('[reviews] Failed to send new review alert email:', err instanceof Error ? err.message : err)
  }
}
