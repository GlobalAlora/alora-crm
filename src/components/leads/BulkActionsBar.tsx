'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, ChevronDown, Loader2 } from 'lucide-react'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage, User } from '@/types'
import { leadsApi, usersApi } from '@/lib/api'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'
import toast from 'react-hot-toast'

interface BulkActionsBarProps {
  selectedIds: string[]
  onClearSelection: () => void
}

export function BulkActionsBar({ selectedIds, onClearSelection }: BulkActionsBarProps) {
  const queryClient = useQueryClient()
  const [showStageMenu, setShowStageMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const { mutate: changeStage, isPending: isChangingStage } = useMutation({
    mutationFn: async (stage: PipelineStage) => {
      await Promise.all(selectedIds.map((id) => leadsApi.moveStage(id, stage)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${selectedIds.length} leads actualizados`)
      onClearSelection()
      setShowStageMenu(false)
    },
    onError: () => {
      toast.error('Error al actualizar etapas')
    },
  })

  const { mutate: reassign, isPending: isReassigning } = useMutation({
    mutationFn: async (userId: string) => {
      await Promise.all(selectedIds.map((id) => leadsApi.update(id, { responsable_id: userId })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success(`${selectedIds.length} leads reasignados`)
      onClearSelection()
      setShowUserMenu(false)
    },
    onError: () => {
      toast.error('Error al reasignar')
    },
  })

  if (selectedIds.length === 0) return null

  return (
    <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-md text-sm">
      <span className="font-medium">{selectedIds.length} seleccionado(s)</span>
      <div className="flex-1" />

      {/* Cambiar etapa */}
      <div className="relative">
        <button
          onClick={() => setShowStageMenu(!showStageMenu)}
          disabled={isChangingStage}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50"
        >
          {isChangingStage ? <Loader2 size={14} className="animate-spin" /> : 'Cambiar etapa'}
          <ChevronDown size={14} />
        </button>

        {showStageMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowStageMenu(false)} />
            <div className="absolute top-full right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-48 p-1">
              {PIPELINE_STAGES.map((stage) => (
                <button
                  key={stage.value}
                  onClick={() => changeStage(stage.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-50 text-slate-700"
                >
                  <StatusBadge stage={stage.value} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Reasignar */}
      <div className="relative">
        <ReassignMenu
          isOpen={showUserMenu}
          onToggle={() => setShowUserMenu(!showUserMenu)}
          onSelect={reassign}
          onClose={() => setShowUserMenu(false)}
          isPending={isReassigning}
        />
      </div>

      <button
        onClick={onClearSelection}
        className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  )
}

function ReassignMenu({
  isOpen,
  onToggle,
  onSelect,
  onClose,
  isPending,
}: {
  isOpen: boolean
  onToggle: () => void
  onSelect: (userId: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const { data: users } = useQueryClient().getQueryData<{ data: User[] }>(['users'])
    ?? { data: [] }

  // Fetch users if not in cache
  const { data: fetchedUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60 * 1000,
    enabled: !users.length,
  })

  const availableUsers = users.length > 0 ? users : (fetchedUsers ?? [])

  return (
    <>
      <button
        onClick={onToggle}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Reasignar'}
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute top-full right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-48 p-1 max-h-64 overflow-y-auto">
            {availableUsers.map((user: User) => (
              <button
                key={user.id}
                onClick={() => onSelect(user.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-50 text-slate-700"
              >
                <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size="sm" />
                <span className="truncate">{user.full_name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
