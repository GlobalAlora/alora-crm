---
name: consultar-crm
description: Consulta el CRM real de ALORA (leads, pipeline, propuestas, tareas, actividad, WhatsApp) en Supabase vía el MCP ya configurado en este repo, traduciendo preguntas de negocio en lenguaje natural a queries SQL.
---

# Consultar el CRM de ALORA

Este repo (`alora-crm`) tiene el MCP de Supabase configurado en `.mcp.json`, apuntando a la
base de datos **real de producción** (`project_ref: fddqgawhgpjzauubugvf`). Cuando te pregunten
algo sobre el negocio — leads, pipeline, propuestas, tareas, actividad reciente — usá las
herramientas del MCP de Supabase (`list_tables`, `execute_sql` o equivalente) para consultarla
directamente en vez de adivinar o pedirle al usuario que lo busque a mano.

## Reglas de seguridad

- Es la base de producción del CRM real. **Solo SELECT** salvo que el usuario pida
  explícitamente modificar o borrar algo.
- Nunca ejecutes `UPDATE`, `DELETE`, `DROP` ni `TRUNCATE` sin confirmación explícita.
- `leads.deleted_at`: es soft-delete. Filtrá siempre `WHERE deleted_at IS NULL` salvo que
  te pidan ver leads eliminados.
- Los montos (`valor_usd`, `valor_propuesta_usd`, etc.) pueden estar en USD o ARS —
  fijate siempre en la columna `moneda` / `valor_propuesta_moneda` antes de sumarlos, no
  mezcles monedas en un mismo total.
- **Reportes por período van SIEMPRE por la fecha real del hito, nunca por `created_at`/
  `updated_at`/`stage_updated_at`/cuándo se cargó o cambió algo.** Reunión → `fecha_reunion`
  (agendada, realizada, Y cancelada por ALORA — las tres). Propuesta → `fecha_propuesta` del
  lead (NO `propuestas.created_at`: una propuesta vieja backfileada tarde, o una de prueba, tiene
  un `created_at` reciente que no refleja cuándo se mandó de verdad). Cierre → `fecha_cierre`.
  Regla confirmada explícitamente por el usuario tras encontrar 3 bugs reales de esto en
  `src/app/api/analytics/route.ts` en la misma sesión — ver memoria
  `feedback_reportes_fecha_real_del_lead`.

## Esquema — tablas principales

### `leads`
El corazón del CRM. Un lead = un prospecto/cliente potencial.

Columnas clave:
- Identidad: `nombre`, `apellido`, `email`, `email_secundario`, `telefono`, `empresa`, `pais`, `sitio_web`
- Interés: `servicios_interesados` (array), `servicio_interesado` (legacy), `consulta_detallada`, `presupuesto_estimado`
- Pipeline: `estado_pipeline` (ver etapas abajo), `kanban_position`, `stage_updated_at`, `fuente`
- Fechas de cada hito: `fecha_ingreso`, `fecha_contacto`, `fecha_reunion`, `fecha_propuesta`,
  `fecha_followup`, `fecha_cierre`, `fecha_inicio_proyecto`, `fecha_cierre_proyecto`
- Reunión: `reunion_hora`, `reunion_link`, `reunion_asistencia` (`se_presento` / `no_se_presento` /
  `reagendo` / `cancelada_alora` — esta última es cuando ALORA decide no dar una reunión ya
  agendada, ej. tras más charla por WhatsApp el lead no da la talla; no cuenta como "no show" del
  lead), `reunion_asistencia_at` (cuándo se marcó ese estado en el sistema — NO usar esto para
  filtrar reportes por período, ver regla de fechas abajo)
- Teléfono: `telefono` puede venir en formatos muy distintos (con/sin código de país, con/sin el 9
  de celular argentino, con espacios/guiones). Para matchear el mismo número contra otro lead o un
  mensaje de WhatsApp entrante, comparar por los ÚLTIMOS 10 DÍGITOS (`right(regexp_replace(telefono,
  '[^0-9]','','g'), 10)`), nunca por igualdad exacta de string — hay una función SQL para esto,
  `find_lead_by_normalized_phone(p_phone)`.
- Dinero (legacy, hoy vive mejor en `propuestas`): `valor_propuesta_usd`, `valor_propuesta_ars`, `valor_propuesta_moneda`
- Responsables: `responsable_id` → `users` (comercial interno), `lider_tecnico_id` / `dev_id` → `team_members` (equipo técnico)
- Proyecto: `avance_proyecto` (0-100)
- Integraciones: `drive_folder_id/url` (carpeta de Drive creada al confirmar reunión),
  `calendar_event_id/url` (evento de Calendar al reservar reunión)
- `deleted_at` (soft delete), `last_activity_at`, `notas`, `form_id`, `form_data` (JSON con lo que mandó el formulario)

### `estado_pipeline` — etapas (en orden del embudo)
`lead_entrante` → `lead_contactado` → `sin_respuesta` → `reunion_reservada` → `reunion_realizada`
→ `propuesta_en_armado` → `propuesta_enviada` → `follow_up` → `cliente_ganado` / `cliente_perdido` / `no_cualificado`

Además de esas (fijas en el código), el equipo agregó etapas custom vía Configuración → Pipeline
(tabla `pipeline_stages`, no un enum): `basura` (ni siquiera es una consulta real, no un lead),
`ghosting` (hubo reunión/propuesta real y después silencio) y
`no_asistio_a_reunion__follow_up`. Si contás leads por `estado_pipeline`, tenelas en cuenta —
`basura` y `no_cualificado` no son "leads cualificados" para métricas de conversión.

### `fuente` (de dónde vino el lead)
`formulario`, `referido`, `linkedin`, `instagram`, `whatsapp`, `chatbot`, `mail`, `otro`

### `propuestas`
Cotizaciones asociadas a un lead (`lead_id`). `descripcion`, `valor_usd`/`valor_ars`, `moneda`,
`tipo_pago` (`unica_vez`/`mensual`), `estado` (`pendiente`/`aceptada`/`rechazada`), `link` (URL
pública, ahora basada en `slug` legible en vez del UUID — ej. `/propuesta/ecommerce-a-medida`),
`slug`. Es la fuente de verdad actual para el valor de una propuesta (más confiable que los
campos legacy en `leads`).

`contenido` (jsonb, generado por el Presupuestador — el agente de IA que arma propuestas,
`src/app/api/propuestas/agente/route.ts`) tiene la forma `{detallada, resumen}`: dos documentos
completos (23 bloques posibles + inversión + mantenimiento la versión detallada; findings +
incluye/no incluye + inversión + tiempos la versión resumen). `contenido.detallada.inversion` y
`contenido.resumen.inversion` incluyen `descuento_porcentaje`/`descuento_condicion` (null si no
hay promo de confirmación temprana) — de ahí sale el "% off" real que muestra el botón de
"Aceptar propuesta" del link público, no un número fijo.

`propuesta_eventos` (`propuesta_id`, `tipo`: `vista`/`aceptar`/`dudas`/`contacto`, `created_at`)
registra cada apertura del link público y cada click en los botones de acción — para saber
cuántas veces se abrió una propuesta y si el cliente clickeó aceptar/dudas.

### `stage_history`
Historial de cambios de etapa por lead: `lead_id`, `etapa`, `fecha_ingreso`. Útil para calcular
cuánto tiempo pasó un lead en cada etapa o detectar cuellos de botella.

### `activities`
Log de todo lo que pasa con un lead: `tipo` (`nota`/`llamada`/`email`/`reunion`/`cambio_estado`/
`tarea_completada`/`webhook`/`whatsapp`), `descripcion`, `metadata` (JSON), `user_id`.

### `tasks`
Tareas por lead: `titulo`, `descripcion`, `vencimiento`, `completada`, `asignado_a` → `users`.

### `users` vs `team_members`
- `users`: gente que **usa el CRM** (login, roles `admin`/`sales`/`viewer`). Es quien aparece en
  `leads.responsable_id` (dueño comercial del lead).
- `team_members`: roster más amplio del equipo (incluye gente técnica que no necesariamente
  loguea al CRM). Aparece en `leads.lider_tecnico_id` y `leads.dev_id`.

### WhatsApp: `whatsapp_conversations`, `wa_messages`, `whatsapp_faqs`
Inbox de WhatsApp conectado a leads vía `whatsapp_conversations.lead_id` → `leads.id`.
`bot_active` / `bot_phase` (`qualifying`/`faq`/`booking`) indica si el bot (Lidia) está
atendiendo esa conversación. `followup_count` (0-2) cuenta los recordatorios automáticos que
Lidia mandó cuando el lead quedó en silencio (se resetea a 0 si el lead responde) —
`src/lib/whatsapp-followup.ts` tiene el texto exacto de esos 2 mensajes, útil para contarlos en
`wa_messages` por `body`. `whatsapp_faqs` (`pregunta`/`respuesta`/`activo`/`orden`) es la lista
de preguntas frecuentes reales que Lidia usa para responder — no son datos hardcodeados en el
prompt, así que reflejan lo que el equipo carga ahí.

### Segmentación y marketing: `lead_tags`, `lead_tag_relations`, `lists`, `list_leads`, `campaigns`, `campaign_recipients`
Tags y listas para segmentar leads; campañas de email marketing enviadas sobre esos segmentos.

### Otras: `pipeline_stages` (config de columnas del kanban), `form_configs` (formularios embebidos
del sitio web), `channel_configs`, `embed_events` (tracking de formularios), `push_subscriptions`

## Vocabulario de negocio → query

- **"leads sin responder" / "leads que no contactamos"** → `estado_pipeline = 'lead_entrante'`
  o `fecha_contacto IS NULL`, ordenado por `fecha_ingreso`.
- **"leads calientes"** → alta actividad reciente / cerca de cerrar; mirá `last_activity_at`
  reciente + `estado_pipeline` en etapas avanzadas (`propuesta_enviada`, `follow_up`).
- **"leads estancados"** → `stage_updated_at` viejo relativo a la etapa en la que están.
- **"pipeline actual" / "cuánto tenemos en pipeline"** → agrupar `leads` por `estado_pipeline`
  y sumar `propuestas.valor_usd` (join por `lead_id`, filtrando `propuestas.estado = 'pendiente'`),
  separado por `moneda`.
- **"revenue ganado" / "cuánto facturamos"** → `leads.estado_pipeline = 'cliente_ganado'` +
  `propuestas.estado = 'aceptada'`, sumado por moneda.
- **"tareas vencidas"** → `tasks.completada = false AND vencimiento < now()`.
- **"reuniones de esta semana"** → `leads.fecha_reunion` dentro del rango, con `reunion_asistencia`.
- **"reuniones canceladas por ALORA"** → `reunion_asistencia = 'cancelada_alora'`, filtrando por
  período con `fecha_reunion` (la fecha de la reunión cancelada) — no `reunion_asistencia_at`
  (cuándo se marcó) ni `fecha_ingreso` del lead.
- **"servicios más pedidos"** → `servicios_interesados` (array) de `leads`, aplanar y contar frecuencia.
- **"actividad reciente de fulano"** → `activities` filtrado por `user_id`, orden `created_at desc`.

## Ejemplos de queries

Leads nuevos de los últimos 7 días:
```sql
select nombre, apellido, empresa, fuente, estado_pipeline, fecha_ingreso
from leads
where deleted_at is null and fecha_ingreso >= now() - interval '7 days'
order by fecha_ingreso desc;
```

Pipeline por etapa (cantidad y valor propuesto pendiente, en USD):
```sql
select l.estado_pipeline, count(distinct l.id) as leads, sum(p.valor_usd) as valor_pendiente_usd
from leads l
left join propuestas p on p.lead_id = l.id and p.estado = 'pendiente' and p.moneda = 'USD'
where l.deleted_at is null
group by l.estado_pipeline
order by valor_pendiente_usd desc nulls last;
```

Tareas vencidas con el lead y el responsable:
```sql
select t.titulo, t.vencimiento, l.nombre as lead, u.full_name as asignado
from tasks t
join leads l on l.id = t.lead_id
left join users u on u.id = t.asignado_a
where t.completada = false and t.vencimiento < now()
order by t.vencimiento asc;
```

Propuestas pendientes por lead:
```sql
select l.nombre, l.empresa, p.descripcion, p.valor_usd, p.valor_ars, p.moneda, p.estado
from propuestas p
join leads l on l.id = p.lead_id
where p.estado = 'pendiente'
order by p.created_at desc;
```

## Cómo responder

Cuando te hagan una pregunta de negocio en lenguaje natural, traducila a SQL usando este
esquema, ejecutala con el MCP de Supabase, y respondé en base al resultado real — no inventes
números. Si la pregunta es ambigua sobre el rango de fechas o la moneda, preguntá o asumí un
default razonable y aclaralo en la respuesta.
