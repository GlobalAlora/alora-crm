'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type Status = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

export function PushSubscription() {
  const [status, setStatus]   = useState<Status>('loading')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported'); return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied'); return
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setStatus(sub ? 'subscribed' : 'unsubscribed')
    })
  }, [])

  async function subscribe() {
    setWorking(true)
    try {
      // Si el navegador ya tiene una decisión guardada (granted/denied de un
      // intento anterior), esto resuelve al toque SIN mostrar ningún popup
      // -- no es un bug, es que ya no hay nada que preguntar.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        toast.error('El navegador tiene las notificaciones bloqueadas para este sitio — habilitalas en la configuración del sitio (ícono del candado junto a la URL).')
        return
      }

      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        toast.error('Falta la clave VAPID en el build — avisale a Walo que haga un redeploy después de configurarla en Vercel.')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sub.toJSON()),
      })
      if (res.ok) {
        setStatus('subscribed')
      } else {
        const body = await res.json().catch(() => ({}))
        toast.error(`No se pudo guardar la suscripción: ${body.error ?? res.statusText}`)
      }
    } catch (err) {
      console.error('[Push] Subscribe failed:', err)
      toast.error(err instanceof Error ? `Error activando notificaciones: ${err.message}` : 'Error activando notificaciones')
    } finally {
      setWorking(false)
    }
  }

  async function unsubscribe() {
    setWorking(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setStatus('unsubscribed')
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err)
    } finally {
      setWorking(false)
    }
  }

  if (status === 'loading' || status === 'unsupported') return null

  if (status === 'denied') return (
    <p className="text-xs text-red-500 px-3 py-1">
      Notificaciones bloqueadas — habilitá los permisos en tu browser
    </p>
  )

  if (status === 'subscribed') return (
    <button
      onClick={unsubscribe}
      disabled={working}
      className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-red-600 transition-colors px-3 py-1.5 rounded-md hover:bg-red-50 w-full"
    >
      🔔 Notificaciones activas
    </button>
  )

  return (
    <button
      onClick={subscribe}
      disabled={working}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-700 transition-colors px-3 py-1.5 rounded-md hover:bg-emerald-50 w-full"
    >
      🔕 Activar notificaciones
    </button>
  )
}
