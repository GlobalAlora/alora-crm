import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhatsAppMessage } from '@/types'

interface Props {
  message: WhatsAppMessage
}

export function MessageBubble({ message }: Props) {
  const direction = message.metadata?.direction ?? 'inbound'
  const isOutbound = direction === 'outbound'
  const text = message.metadata?.text ?? message.descripcion

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
            : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</p>
        <div className={cn(
          'flex items-center gap-1 mt-1',
          isOutbound ? 'justify-end' : 'justify-end'
        )}>
          <span className={cn(
            'text-[10px]',
            isOutbound ? 'text-blue-200' : 'text-slate-400'
          )}>
            {time}
          </span>
          {isOutbound && (
            <CheckCheck size={11} className="text-blue-200" />
          )}
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
