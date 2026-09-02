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

/** Etiqueta del botón "Aceptar propuesta" -- sin promo, texto genérico; con
 * promo, usa el porcentaje real de la propuesta, nunca un número fijo. */
export function propuestaAceptarLabel(descuentoPorcentaje?: number | null): string {
  return descuentoPorcentaje
    ? `Aceptar propuesta y comenzar ahora — ${descuentoPorcentaje}% off`
    : 'Aceptar propuesta y comenzar ahora'
}

export function propuestaCtaLinks(titulo: string, descuentoPorcentaje?: number | null) {
  const descuentoTexto = descuentoPorcentaje ? ` con el ${descuentoPorcentaje}% de descuento` : ''
  return {
    aceptar: propuestaWhatsappLink(`Hola! Quiero aceptar la propuesta "${titulo}" y comenzar ahora${descuentoTexto}.`),
    dudas: propuestaWhatsappLink(`Hola! Tengo dudas sobre la propuesta "${titulo}".`),
    contacto: propuestaWhatsappLink(`Hola! Te escribo por la propuesta "${titulo}".`),
  }
}
