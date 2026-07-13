---
name: sincronizar-cerebro
description: Genera y actualiza el vault de Obsidian de ALORA (carpeta C:\Users\bruno\OneDrive\alora-cerebro) con datos reales del CRM, para tener un "cerebro" visual del negocio (clientes, pipeline, pagos pendientes, tareas) navegable en Obsidian.
---

# Sincronizar el Cerebro de ALORA

Este skill genera notas markdown en `C:\Users\bruno\OneDrive\alora-cerebro` (un vault de
Obsidian, sincronizado vía OneDrive para que también lo vea el socio) a partir de datos reales
del CRM, consultados vía el MCP de Supabase ya configurado en este repo (ver también la skill
`consultar-crm` para el mapeo completo de tablas).

Se dispara cuando el usuario pide algo como "sincronizá el cerebro", "actualizá el vault",
"generá las notas de Obsidian".

**Vault path:** `C:\Users\bruno\OneDrive\alora-cerebro` (movido desde `C:\Users\bruno\alora-cerebro`
el 13/07/2026 para compartirlo por OneDrive). Las carpetas `Clientes/`, `Pipeline/`, `Tareas/`
ya existen. No uses otra ruta salvo que el usuario la indique explícitamente.

## Qué generar

Todas las queries son de solo lectura sobre Supabase (ver `consultar-crm` para el esquema
completo). Con los resultados, escribí/sobreescribí estos archivos:

### 1. `Pipeline.md`

Query: leads activos (`deleted_at IS NULL`) agrupados por `estado_pipeline`, con conteo y
valor pendiente (join a `propuestas` donde `estado = 'pendiente'`, separado por moneda).

Formato:
```markdown
# Pipeline

Actualizado: {fecha de hoy}

| Etapa | Leads | Valor pendiente USD | Valor pendiente ARS |
|---|---|---|---|
| Lead entrante | N | $N | $N |
| ... | | | |

## Leads por etapa

### Lead entrante
- [[Clientes/{nombre}|{nombre}]] — {empresa}
...
```
(Para leads que todavía no son clientes, si no tienen nota propia en `Clientes/`, poné el
nombre sin link o creá una nota mínima igual — mejor tener el nodo en el grafo que no tenerlo.)

### 2. `Pagos pendientes.md`

Query: `propuestas` con `estado = 'pendiente'` o `'aceptada'` sin cobrar, joined con `leads`.
Agrupá por el estado del lead en 3 baldes, como en el ejemplo que nos inspiró:
- **Convertido a cliente** (`estado_pipeline = 'cliente_ganado'`)
- **En negociación** (`propuesta_enviada`, `follow_up`)
- **Sin avance** (`propuesta_en_armado` o etapas tempranas con propuesta pendiente)

Formato tipo checklist, con el nombre del cliente linkeado a su nota:
```markdown
# Pagos pendientes

Actualizado: {fecha de hoy}

## Convertido a cliente
- [ ] [[Clientes/{nombre}]] — ${monto} {moneda}

## En negociación
- [ ] [[Clientes/{nombre}]] — ${monto} {moneda}

## Sin avance
- [ ] [[Clientes/{nombre}]] — ${monto} {moneda}
```

### 3. `Clientes/{Nombre Apellido}.md` — una nota por cada lead en `cliente_ganado` (y, si el
usuario lo pide, también los que están en etapas avanzadas del pipeline)

Formato:
```markdown
---
tags: [cliente]
empresa: "{empresa}"
estado: "{estado_pipeline}"
---

# {Nombre Apellido}

- **Empresa:** {empresa}
- **Email:** {email}
- **Teléfono:** {telefono}
- **País:** {pais}
- **Fuente:** {fuente}
- **Responsable:** {responsable.full_name}
- **Cliente desde:** {fecha_cierre}

## Propuestas
- {descripcion} — ${valor} {moneda} — {estado}

## Actividad reciente
- {fecha}: {descripcion de la activity}

## Tareas
- [ ] {titulo} — vence {vencimiento}

---
Ver también: [[Pipeline]] · [[Pagos pendientes]]
```

### 4. `Tareas vencidas.md`

Query: `tasks` con `completada = false AND vencimiento < now()`, joined a `leads` y `users`.

```markdown
# Tareas vencidas

Actualizado: {fecha de hoy}

- [ ] {titulo} — [[Clientes/{nombre}]] — vencía {vencimiento} — asignada a {asignado.full_name}
```

### 5. Actualizar `Cerebro ALORA.md`

Al final, actualizá la sección "Todavía no sincronizado" de la nota hub (`C:\Users\bruno\alora-cerebro\Cerebro ALORA.md`) — reemplazala por un resumen de una línea: "Última sincronización: {fecha y hora}".

## Reglas

- Todo en español, moneda siempre explícita (no mezclar USD/ARS en una misma cifra).
- Usá `[[wikilinks]]` de Obsidian para conectar notas entre sí (así se arma el grafo).
- No inventes datos: si un campo viene null/vacío en la DB, omitilo o poné "sin dato", no lo completes a criterio.
- Es un vault local, no se commitea a git — no hace falta pedir permiso para sobreescribir estos archivos en cada sync, son generados.
