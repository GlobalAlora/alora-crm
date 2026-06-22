# WhatsApp worker (Baileys)

Proceso de Node siempre activo que mantiene la sesión de WhatsApp Web (vía
[Baileys](https://github.com/WhiskeySockets/Baileys)) y la conecta con el CRM:

- **Entrante:** cada mensaje 1 a 1 que llega se reenvía a
  `POST /api/webhooks/whatsapp-baileys` en el CRM, que crea el lead (si no
  existe) y guarda el mensaje.
- **Saliente:** el CRM le pega a `POST /send` de este worker cuando alguien
  responde desde el chat.

No puede correr en Vercel (serverless) porque necesita mantener una conexión
abierta todo el tiempo. Hay que deployarlo en un host que esté siempre
encendido.

## Variables de entorno

Copiá `.env.example` a `.env` y completá:

| Variable | Para qué |
|---|---|
| `CRM_WEBHOOK_URL` | URL completa del webhook en el CRM, ej. `https://tu-crm.vercel.app/api/webhooks/whatsapp-baileys` |
| `BAILEYS_WEBHOOK_SECRET` | Secreto que el worker manda al CRM al reenviar mensajes. Tiene que ser igual al `BAILEYS_WEBHOOK_SECRET` configurado en Vercel. |
| `BAILEYS_WORKER_SECRET` | Secreto que protege `/send` y `/qr` de este worker. Tiene que ser igual al `BAILEYS_WORKER_SECRET` configurado en Vercel. |
| `AUTH_DIR` | Carpeta donde se guarda la sesión de WhatsApp (default `./auth_info`). Tiene que ser un volumen persistente — si se borra hay que escanear el QR de nuevo. |
| `PORT` | Puerto HTTP (default `3001`). |

En el CRM (Vercel), agregá estas env vars:
- `BAILEYS_WEBHOOK_SECRET` (igual al del worker)
- `BAILEYS_WORKER_URL` → URL pública del worker, ej. `https://tu-worker.up.railway.app`
- `BAILEYS_WORKER_SECRET` (igual al del worker)

## Deploy en Railway (recomendado)

1. Creá un nuevo proyecto en Railway → "Deploy from GitHub repo" → elegí este repo.
2. En **Settings → Root Directory**, poné `whatsapp-worker`.
3. Railway detecta el `Dockerfile` y lo usa para el build.
4. En **Settings → Volumes**, agregá un volumen montado en `/app/auth_info`
   (así la sesión sobrevive a redeploys/restarts). Si no agregás el volumen,
   cada redeploy te va a pedir escanear el QR de nuevo.
5. En **Variables**, completá las env vars de la tabla de arriba.
6. Generá un dominio público (Settings → Networking → Generate Domain).

## Deploy en Render

1. New → Web Service → conectá el repo.
2. **Root Directory:** `whatsapp-worker`. **Runtime:** Docker.
3. En **Disks**, agregá un disco persistente montado en `/app/auth_info`
   (el plan free de Render no soporta discos persistentes — necesitás un
   plan paid para que la sesión no se pierda en cada restart).
4. Completá las env vars.

## Primer login (escanear el QR)

1. Una vez deployado, abrí en el navegador:
   `https://tu-worker.../qr?secret=<BAILEYS_WORKER_SECRET>`
2. Te va a mostrar el código QR. Escaneálo desde el WhatsApp del número que
   van a usar para el CRM: **Configuración → Dispositivos vinculados →
   Vincular un dispositivo**.
3. Cuando conecta, la página `/qr` muestra "Ya conectado a WhatsApp ✅" y el
   worker queda escuchando mensajes nuevos.
4. Si alguna vez desvinculás el dispositivo desde el teléfono, el worker te
   va a avisar en los logs que hay que borrar `auth_info/` y volver a escanear.

## Correrlo local (para probar)

```bash
cd whatsapp-worker
npm install
cp .env.example .env   # completá las variables
npm start
```
