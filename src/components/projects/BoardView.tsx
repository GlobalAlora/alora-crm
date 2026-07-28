'use client'

import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Plus, CheckCircle2, Circle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { TaskSection, ProjectTask, User } from '@/types'
import { Avatar } from './TaskPanel'

interface Props {
  sections: (TaskSection & { tasks?: ProjectTask[] })[]
  selectedTaskId: string | null
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onSelectTask: (id: string) => void
  onToggleTask: (id: string, isDone: boolean) => void
  onAddTask: (sectionId: string) => void
}

export function BoardView({ sections, selectedTaskId, users, onSelectTask, onToggleTask, onAddTask }: Props) {
  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-4 px-6 pt-4">
      {sections
        .sort((a, b) => a.position - b.position)
        .map(section => (
          <BoardColumn
            key={section.id}
            section={section}
            selectedTaskId={selectedTaskId}
            users={users}
            onSelectTask={onSelectTask}
            onToggleTask={onToggleTask}
            onAddTask={() => onAddTask(section.id)}
          />
        ))}
    </div>
  )
}

function BoardColumn({
  section,
  selectedTaskId,
  users,
  onSelectTask,
  onToggleTask,
  onAddTask,
}: {
  section: TaskSection & { tasks?: ProjectTask[] }
  selectedTaskId: string | null
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onSelectTask: (id: string) => void
  onToggleTask: (id: string, isDone: boolean) => void
  onAddTask: () => void
}) {
  const tasks = (section.tasks ?? [])
    .filter(t => !t.deleted_at && !t.parent_task_id)
    .sort((a, b) => a.position - b.position)
  const taskIds = tasks.map(t => t.id)

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: section.id })

  return (
    <div className="flex flex-col w-64 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: section.color ?? '#94A3B8' }} />
        <span className="text-sm font-semibold text-slate-700 flex-1">{section.nombre}</span>
        <span className="text-xs text-slate-400">{tasks.length}</span>
      </div>

      {/* Cards */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setDropRef}
          className={cn(
            'flex-1 space-y-2 min-h-[80px] rounded-lg transition-colors',
            isOver ? 'bg-blue-50' : ''
          )}
        >
          {tasks.map(task => (
            <BoardCard
              key={task.id}
              task={task}
              isSelected={selectedTaskId === task.id}
              users={users}
              onToggle={(isDone) => onToggleTask(task.id, isDone)}
              onClick={() => onSelectTask(task.id)}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add task */}
      <button
        onClick={onAddTask}
        className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
      >
        <Plus size={12} />
        Agregar tarea
      </button>
    </div>
  )
}

function BoardCard({
  task,
  isSelected,
  users,
  onToggle,
  onClick,
}: {
  task: ProjectTask
  isSelected: boolean
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onToggle: (isDone: boolean) => void
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const isDone    = task.estado === 'finalizada'
  const isOverdue = task.fecha_limite && !isDone && new Date(task.fecha_limite) < new Date()
  const assignee  = task.assignee_id ? users.find(u => u.id === task.assignee_id) : null

  const priorityColor =
    task.prioridad === 'urgente' ? 'border-l-red-500' :
    task.prioridad === 'alta'    ? 'border-l-amber-500' :
    task.prioridad === 'media'   ? 'border-l-blue-400' : 'border-l-slate-200'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border border-l-2 p-3 cursor-pointer shadow-sm hover:shadow-md transition-all',
        priorityColor,
        isSelected ? 'ring-1 ring-blue-400' : '',
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        <button
          onClick={e => { e.stopPropagation(); onToggle(!isDone) }}
          className={cn('flex-shrink-0 mt-0.5 transition-colors', isDone ? 'text-green-500' : 'text-slate-300 hover:text-green-500')}
        >
          {isDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
        </button>
        <span className={cn('text-xs font-medium leading-snug flex-1', isDone ? 'line-through text-slate-400' : 'text-slate-800')}>
          {task.titulo}
        </span>
      </div>

      <div className="flex items-center justify-between">
        {task.fecha_limite ? (
          <span className={cn('text-[10px]', isOverdue ? 'text-red-500 font-medium' : 'text-slate-400')}>
            {format(new Date(task.fecha_limite), 'd MMM', { locale: es })}
          </span>
        ) : <span />}
        {assignee && (
          <Avatar name={assignee.full_name} url={assignee.avatar_url} size={18} />
        )}
      </div>
    </div>
  )
}
