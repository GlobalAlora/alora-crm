'use client'

import { useMemo } from 'react'
import {
  addDays, startOfWeek, differenceInDays,
  eachWeekOfInterval, format,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { TaskSection, ProjectTask, User } from '@/types'
import { Avatar } from './TaskPanel'

const DAY_W = 28   // px per day
const ROW_H = 36   // px per task row
const LABEL_W = 220 // px for the name column

const PRIORITY_BAR: Record<string, string> = {
  urgente: 'bg-red-400',
  alta:    'bg-amber-400',
  media:   'bg-blue-400',
  baja:    'bg-slate-300',
}

interface Props {
  sections: (TaskSection & { tasks?: ProjectTask[] })[]
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onSelectTask: (id: string) => void
  selectedTaskId: string | null
}

export function CronogramaView({ sections, users, onSelectTask, selectedTaskId }: Props) {
  const allTasks = sections.flatMap(s => (s.tasks ?? []).filter(t => !t.deleted_at && !t.parent_task_id))

  const { rangeStart, rangeEnd, weeks, totalDays } = useMemo(() => {
    const today = new Date()
    const dates = allTasks.flatMap(t => [
      t.fecha_inicio  ? new Date(t.fecha_inicio)  : null,
      t.fecha_limite  ? new Date(t.fecha_limite)  : null,
    ].filter(Boolean) as Date[])

    const minDate = dates.length > 0
      ? new Date(Math.min(...dates.map(d => d.getTime())))
      : addDays(today, -14)
    const maxDate = dates.length > 0
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : addDays(today, 60)

    const rangeStart = startOfWeek(addDays(minDate, -7), { weekStartsOn: 1 })
    const rangeEnd   = addDays(maxDate, 14)
    const weeks      = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 })
    const totalDays  = differenceInDays(rangeEnd, rangeStart) + 1

    return { rangeStart, rangeEnd, weeks, totalDays }
  }, [allTasks])

  const todayOffset = differenceInDays(new Date(), rangeStart)
  const totalWidth  = LABEL_W + totalDays * DAY_W

  if (allTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400">No hay tareas en este proyecto.</p>
      </div>
    )
  }

  function bar(task: ProjectTask) {
    const s = task.fecha_inicio ? new Date(task.fecha_inicio) : task.fecha_limite ? new Date(task.fecha_limite) : null
    const e = task.fecha_limite ? new Date(task.fecha_limite) : task.fecha_inicio ? new Date(task.fecha_inicio) : null
    if (!s || !e) return null
    const left  = differenceInDays(s, rangeStart)
    const days  = Math.max(1, differenceInDays(e, s) + 1)
    const isDone    = task.estado === 'finalizada'
    const isOverdue = !isDone && task.fecha_limite && new Date(task.fecha_limite) < new Date()
    return { left, days, isDone, isOverdue }
  }

  return (
    <div className="flex-1 overflow-auto flex flex-col bg-white">
      <div style={{ minWidth: totalWidth }}>

        {/* ── Header: week labels ── */}
        <div className="flex border-b bg-white sticky top-0 z-20 shadow-sm">
          {/* Name column */}
          <div
            className="flex-shrink-0 border-r border-slate-200 bg-slate-50 flex items-end px-4 py-2"
            style={{ width: LABEL_W }}
          >
            <span className="text-xs font-medium text-slate-500">Tarea</span>
          </div>

          {/* Week cells */}
          <div className="flex">
            {weeks.map((weekStart, i) => {
              const isCurrentWeek = differenceInDays(new Date(), weekStart) >= 0 &&
                                    differenceInDays(new Date(), weekStart) < 7
              return (
                <div
                  key={i}
                  style={{ width: 7 * DAY_W }}
                  className={cn(
                    'border-r border-slate-100 text-xs px-2 py-2',
                    isCurrentWeek ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-500'
                  )}
                >
                  {format(weekStart, 'd MMM', { locale: es })}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Rows ── */}
        {sections
          .sort((a, b) => a.position - b.position)
          .map(section => {
            const tasks = (section.tasks ?? [])
              .filter(t => !t.deleted_at && !t.parent_task_id)
              .sort((a, b) => a.position - b.position)

            return (
              <div key={section.id}>
                {/* Section header row */}
                <div
                  className="flex bg-slate-50 border-b border-slate-200"
                  style={{ height: ROW_H - 4 }}
                >
                  <div
                    className="flex-shrink-0 border-r border-slate-200 flex items-center gap-2 px-4"
                    style={{ width: LABEL_W }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: section.color ?? '#94A3B8' }} />
                    <span className="text-xs font-semibold text-slate-600">{section.nombre}</span>
                    <span className="text-xs text-slate-400">({tasks.length})</span>
                  </div>
                  {/* Today line */}
                  <div className="flex-1 relative">
                    <TodayLine offset={todayOffset} totalDays={totalDays} />
                  </div>
                </div>

                {/* Task rows */}
                {tasks.map(task => {
                  const b          = bar(task)
                  const assignee   = task.assignee_id ? users.find(u => u.id === task.assignee_id) : null
                  const isSelected = selectedTaskId === task.id
                  const barColor   = b?.isDone ? 'bg-green-500' : b?.isOverdue ? 'bg-red-400' : (PRIORITY_BAR[task.prioridad] ?? 'bg-blue-400')

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex border-b border-slate-100 cursor-pointer transition-colors',
                        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      )}
                      style={{ height: ROW_H }}
                      onClick={() => onSelectTask(task.id)}
                    >
                      {/* Name */}
                      <div
                        className="flex-shrink-0 border-r border-slate-100 flex items-center gap-2 px-4"
                        style={{ width: LABEL_W }}
                      >
                        {assignee && <Avatar name={assignee.full_name} url={assignee.avatar_url} size={16} />}
                        <span className={cn('text-xs truncate flex-1', task.estado === 'finalizada' ? 'line-through text-slate-400' : 'text-slate-700')}>
                          {task.titulo}
                        </span>
                      </div>

                      {/* Timeline area */}
                      <div className="flex-1 relative overflow-hidden">
                        <TodayLine offset={todayOffset} totalDays={totalDays} />

                        {/* Day grid lines (every 7) */}
                        {weeks.map((_, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 border-r border-slate-100"
                            style={{ left: (i + 1) * 7 * DAY_W }}
                          />
                        ))}

                        {/* Task bar */}
                        {b && (
                          <div
                            title={task.titulo}
                            className={cn(
                              'absolute top-1/2 -translate-y-1/2 rounded-full text-white text-[10px] flex items-center px-2 overflow-hidden whitespace-nowrap select-none',
                              barColor,
                              isSelected ? 'ring-1 ring-blue-400 ring-offset-1' : ''
                            )}
                            style={{
                              left:   b.left * DAY_W + 2,
                              width:  Math.max(b.days * DAY_W - 4, DAY_W - 4),
                              height: 20,
                            }}
                          >
                            {b.days * DAY_W > 60 && task.titulo}
                          </div>
                        )}

                        {/* No dates — show dash */}
                        {!b && (
                          <div className="absolute inset-0 flex items-center pl-4">
                            <span className="text-xs text-slate-200">—</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
      </div>
    </div>
  )
}

function TodayLine({ offset, totalDays }: { offset: number; totalDays: number }) {
  if (offset < 0 || offset > totalDays) return null
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-blue-400 z-10 pointer-events-none"
      style={{ left: offset * DAY_W + DAY_W / 2 }}
    >
      <div className="w-2 h-2 rounded-full bg-blue-500 absolute -top-1 -left-[3px]" />
    </div>
  )
}
