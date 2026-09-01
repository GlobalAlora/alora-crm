/**
 * Número y mensajes de WhatsApp para los botones de acción de una propuesta
 * (Aceptar / Tengo dudas / Contacto directo) -- compartido por la página
 * pública (web) y el PDF, para que ambos manden exactamente al mismo lugar
 * con el mismo texto.
 */
export const PROPUESTA_WHATSAPP_NUMERO = '5491124629452'

export function propuestaWhatsappLink(texto: string): string {
  return `https://wa.me/${PROPUESTA_WHATSAPP_NUMERO}?text=${encodeURIComponent(texto)}`
}

export function propuestaCtaLinks(titulo: string) {
  return {
    aceptar: propuestaWhatsappLink(`Hola! Quiero aceptar la propuesta "${titulo}" y comenzar ahora con el 15% de descuento.`),
    dudas: propuestaWhatsappLink(`Hola! Tengo dudas sobre la propuesta "${titulo}".`),
    contacto: propuestaWhatsappLink(`Hola! Te escribo por la propuesta "${titulo}".`),
  }
}
