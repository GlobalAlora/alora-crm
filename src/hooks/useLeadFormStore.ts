import { create } from 'zustand'
import type { Lead } from '@/types'

interface LeadFormStore {
  isOpen: boolean
  editingLead: Lead | null
  open: (lead?: Lead) => void
  close: () => void
}

export const useLeadFormStore = create<LeadFormStore>((set) => ({
  isOpen: false,
  editingLead: null,
  open: (lead) => set({ isOpen: true, editingLead: lead ?? null }),
  close: () => set({ isOpen: false, editingLead: null }),
}))
