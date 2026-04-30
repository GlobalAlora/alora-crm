'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Building2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from './UserAvatar'

interface SearchResult {
  id: string
  nombre: string
  apellido: string | null
  empresa: string | null
  estado_pipeline: string
}

export function GlobalLeadSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/leads/search?q=${encodeURIComponent(query)}&limit=8`)
        const json = await res.json()
        setResults(json.data ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (leadId: string) => {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(`/leads/${leadId}`)
  }

  return (
    <div ref={searchRef} className="relative">
      <button
        onClick={() => {
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all',
          open
            ? 'border-blue-400 ring-2 ring-blue-100 bg-white'
            : 'border-slate-200 hover:border-slate-300 bg-white'
        )}
      >
        <Search size={14} className="text-slate-400" />
        <span className="text-sm text-slate-500">Buscar lead...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 rounded border border-slate-200">
          <span>⌘</span>K
        </kbd>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, empresa..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && (
                <div className="p-4 text-center text-sm text-slate-400">Buscando...</div>
              )}

              {!loading && query && results.length === 0 && (
                <div className="p-4 text-center text-sm text-slate-400">No se encontraron resultados</div>
              )}

              {!loading && !query && (
                <div className="p-4 text-center text-sm text-slate-400">
                  Escribe para buscar leads
                </div>
              )}

              {!loading && results.length > 0 && (
                <div className="p-1">
                  {results.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => handleSelect(lead.id)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {lead.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {lead.nombre} {lead.apellido || ''}
                        </p>
                        {lead.empresa && (
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <Building2 size={10} /> {lead.empresa}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
