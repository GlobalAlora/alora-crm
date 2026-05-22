import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhatsAppMessage } from '@/types'

interface Props {
  message: WhatsAppMessage
}

function StatusIcon({ status, isOutbound }: { status: WhatsAppMessage['status']; isOutbound: boolean }) {
  if (!isOutbound) return null

  const base = 'flex-shrink-0'

  if (status === 'sending') {
    return <Clock size={11} className={cn(base, 'text-blue-300')} />
  }
  if (status === 'failed') {
    return <AlertCircle size={11} className={cn(base, 'text-red-400')} />
  }
  if (status === 'read') {
    return <CheckCheck size={11} className={cn(base, 'text-sky-300')} />
  }
  if (status === 'delivered') {
    return <CheckCheck size={11} className={cn(base, 'text-blue-300')} />
  }
  // sent
  return <Check size={11} className={cn(base, 'text-blue-300')} />
}

export function MessageBubble({ message }: Props) {
  const isOutbound = message.direction === 'outbound'
  const text = message.body

  let time = ''
  try {
    time = format(new Date(message.created_at), 'HH:mm', { locale: es })
  } catch { /* noop */ }

  return (
    <div className={cn('flex mb-1', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[72%] rounded-2xl px-3.5 py-2 shadow-sm',
          isOutbound
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm',
          message.status === 'failed' && 'bg-red-100 border border-red-300 text-red-800'
        )}
      >
        {/* Media placeholder */}
        {message.media_type && (
          <p className={cn(
            'text-xs italic mb-1',
            isOutbound ? 'text-blue-200' : 'text-slate-400'
          )}>
            [{message.media_type}]
          </p>
        )}

        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {text ?? ''}
        </p>

        <div className="flex items-center justify-end gap-1 mt-1">
          <span className={cn(
            'text-[10px]',
            isOutbound ? 'text-blue-200' : 'text-slate-400',
            message.status === 'failed' && 'text-red-400'
          )}>
            {message.status === 'failed' ? 'Error al enviar' : time}
          </span>
          <StatusIcon status={message.status} isOutbound={isOutbound} />
        </div>
      </div>
    </div>
  )
}

// Date separator between messages from different days
export function DateSeparator({ date }: { date: string }) {
  let label = ''
  try {
    label = format(new Date(date), "d 'de' MMMM", { locale: es })
  } catch { /* noop */ }

  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-[11px] text-slate-400 font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  )
}
