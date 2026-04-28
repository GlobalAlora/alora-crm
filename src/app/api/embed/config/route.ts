import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface FormField {
  name: string
  label: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select'
  required?: boolean
  placeholder?: string
  options?: string[]
  width?: 'full' | 'half'
}

export interface FormConfig {
  title: string
  subtitle: string
  color: string
  fields: FormField[]
  tags: string[]
}

const DEFAULT_CONFIG: FormConfig = {
  title: '¿Hablamos?',
  subtitle: 'Completá el formulario y te contactamos en 24hs.',
  color: '#2563eb',
  tags: [],
  fields: [
    { name: 'nombre',   label: 'Nombre',   type: 'text',     required: true,  placeholder: 'Juan Pérez',          width: 'half' },
    { name: 'empresa',  label: 'Empresa',  type: 'text',     required: false, placeholder: 'Mi empresa',          width: 'half' },
    { name: 'email',    label: 'Email',    type: 'email',    required: false, placeholder: 'juan@empresa.com',    width: 'half' },
    { name: 'telefono', label: 'Teléfono', type: 'phone',    required: false, placeholder: '+54 11 0000-0000',    width: 'half' },
    {
      name: 'servicio_interesado', label: '¿Qué servicio te interesa?', type: 'select', required: false,
      options: ['Diseño web', 'SEO', 'Google Ads', 'Meta Ads', 'Redes sociales', 'Branding', 'Email marketing', 'Otro'],
      width: 'full',
    },
    { name: 'mensaje', label: 'Mensaje', type: 'textarea', required: false, placeholder: 'Contanos en qué podemos ayudarte...', width: 'full' },
  ],
}

export async function GET(req: NextRequest) {
  const formId = req.nextUrl.searchParams.get('formId')

  if (!formId) {
    return NextResponse.json({ data: DEFAULT_CONFIG }, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=60' },
    })
  }

  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('form_configs')
      .select('title, subtitle, color, fields, tags')
      .eq('id', formId)
      .eq('active', true)
      .maybeSingle()

    return NextResponse.json({ data: data ?? DEFAULT_CONFIG }, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=60' },
    })
  } catch {
    return NextResponse.json({ data: DEFAULT_CONFIG }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}
