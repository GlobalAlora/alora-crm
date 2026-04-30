'use client'

interface FormDataSectionProps {
  formData: Record<string, string> | null
}

export function FormDataSection({ formData }: FormDataSectionProps) {
  if (!formData || Object.keys(formData).length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">Sin datos de formulario.</p>
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {Object.entries(formData).map(([key, val]) => (
            <tr key={key}>
              <td className="px-4 py-2.5 font-medium text-slate-500 w-1/3 bg-slate-50 capitalize">
                {key.replace(/_/g, ' ')}
              </td>
              <td className="px-4 py-2.5 text-slate-800 break-words">{val || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
