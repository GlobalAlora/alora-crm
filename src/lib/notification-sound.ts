// Chime sintetizado con Web Audio API -- sin archivo de audio que cargar
// (evita un asset extra y problemas de autoplay con <audio>). Dos tonos
// cortos, como el "ding-dong" típico de una notificación.
export function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    const tones: [number, number][] = [[880, now], [660, now + 0.12]]
    for (const [freq, start] of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    }

    setTimeout(() => ctx.close(), 600)
  } catch {
    // Web Audio bloqueado (sin interacción previa del usuario, etc.) -- no es crítico.
  }
}
