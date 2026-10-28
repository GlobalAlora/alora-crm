import { TOOLS, type ToolContext } from './tools'
import { ToolError } from './helpers'

/**
 * Servidor MCP mínimo (JSON-RPC 2.0 sobre Streamable HTTP, modo stateless).
 * Cada POST trae uno o varios mensajes JSON-RPC y se responde con JSON.
 * Spec: https://modelcontextprotocol.io/specification
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const SERVER_INFO = { name: 'alora-crm', title: 'CRM de ALORA', version: '1.0.0' }

const INSTRUCTIONS = `Sos el asistente de gestión de ALORA (agencia de desarrollo digital) conectado a su CRM.
- Para "¿cómo venimos?" o un brief, arrancá por resumen_crm.
- Leads y proyectos se pueden indicar por nombre/empresa; si hay ambigüedad la herramienta devuelve los candidatos con id: preguntá cuál.
- Antes de cualquier herramienta de escritura (mover etapa, crear lead/tarea, actualizar tarea, registrar actividad) mostrá exactamente qué vas a hacer y esperá confirmación, salvo que el usuario ya lo haya pedido de forma explícita y completa.
- Las descripciones de tareas tienen que ser autocontenidas: qué hacer, qué dato concreto conseguir, con quién y cuándo se da por terminada.
- Zona horaria: Argentina (UTC-3). Montos en la moneda que devuelve el CRM; no conviertas USD/ARS salvo que te lo pidan.`

type JsonRpcId = string | number | null
interface JsonRpcRequest { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: Record<string, unknown> }
interface JsonRpcResponse { jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } }

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })
const err = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })

function textResult(payload: unknown, isError = false) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1)
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }
}

/** Procesa un mensaje. Devuelve null para notificaciones (sin id). */
export async function handleMessage(msg: unknown, getCtx: () => Promise<ToolContext>): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== 'object' || (msg as JsonRpcRequest).jsonrpc !== '2.0' || typeof (msg as JsonRpcRequest).method !== 'string') {
    // Respuestas del cliente (no las pedimos) o basura: ignorar si no hay id.
    const id = (msg as { id?: JsonRpcId } | null)?.id
    return id === undefined ? null : err(id ?? null, -32600, 'Invalid Request')
  }
  const { id, method, params = {} } = msg as JsonRpcRequest
  const isNotification = id === undefined

  try {
    switch (method) {
      case 'initialize': {
        const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0]
        return ok(id ?? null, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return isNotification ? null : ok(id ?? null, {})
      case 'tools/list':
        return ok(id ?? null, {
          tools: TOOLS.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...t.annotations } })),
        })
      case 'tools/call': {
        const name = params.name as string
        const tool = TOOLS.find(t => t.name === name)
        if (!tool) return err(id ?? null, -32602, `Herramienta desconocida: ${name}`)
        const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>
        try {
          const ctx = await getCtx()
          const result = await tool.handler(args, ctx)
          return ok(id ?? null, textResult(result))
        } catch (e) {
          if (e instanceof ToolError) return ok(id ?? null, textResult(e.message, true))
          console.error(`[mcp] ${name} failed:`, e)
          return ok(id ?? null, textResult(`Error interno ejecutando ${name}: ${e instanceof Error ? e.message : String(e)}`, true))
        }
      }
      case 'resources/list':
        return ok(id ?? null, { resources: [] })
      case 'prompts/list':
        return ok(id ?? null, { prompts: [] })
      default:
        if (method.startsWith('notifications/')) return null
        return isNotification ? null : err(id ?? null, -32601, `Método no soportado: ${method}`)
    }
  } catch (e) {
    console.error('[mcp] unexpected error:', e)
    return isNotification ? null : err(id ?? null, -32603, 'Internal error')
  }
}
