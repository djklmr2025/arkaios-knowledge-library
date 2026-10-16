# Arquitectura de Webhooks de Meta y Notificaciones en Tiempo Real

Este documento describe la especificación técnica de integración de **Meta Webhooks** y el **Bus de Eventos Internos** para **ARKAIOS Knowledge Library**.

---

## 1. Handshake de Suscripción (GET `/api/webhook`)

Cuando Meta configura o verifica el webhook de la página, envía una solicitud `GET` con los parámetros:
- `hub.mode`: Debe ser `"subscribe"`.
- `hub.verify_token`: Debe coincidir con `META_VERIFY_TOKEN` configurado en el servidor.
- `hub.challenge`: Cadena aleatoria enviada por Meta.

El servidor valida los parámetros mediante `handleWebhookVerification` en [`webhook_handler.mjs`](../webhook_handler.mjs) y responde con el valor de `hub.challenge` en texto plano y código HTTP 200.

---

## 2. Recepción Segura de Eventos (POST `/api/webhook`)

### A. Validación de Firma Criptográfica Obligatoria (`X-Hub-Signature-256`) — Política Fail-Closed
Toda solicitud `POST` enviada por Meta incluye la cabecera `X-Hub-Signature-256: sha256={hash}`.
El servidor calcula el HMAC SHA-256 del cuerpo bruto (`rawBody`) utilizando `META_APP_SECRET`:

$$\text{HMAC} = \text{crypto.createHmac}('sha256', \text{appSecret}).\text{update}(rawBody).\text{digest}('hex')$$

La comparación se realiza con `crypto.timingSafeEqual` para prevenir ataques de temporización.

> [!CAUTION]
> **Política de Seguridad Fail-Closed Estricta:**
> Si `META_APP_SECRET` no está configurado en el servidor, si la cabecera `X-Hub-Signature-256` está ausente o malformada, o si el hash no coincide exactamente, la solicitud es **RECHAZADA INCONDICIONALMENTE con HTTP 403**. Nunca se aceptan eventos sin firma verificada ni en producción ni en desarrollo.

### B. Idempotencia y Deduplicación
Para evitar procesar publicaciones duplicadas ante reintentos de Meta:
- Se genera una clave única `${entry.id}_${entry.time}`.
- Se mantiene un caché en memoria de hasta 5,000 entregas procesadas.
- Si la clave ya existe, el evento se confirma con HTTP 200 sin reprocesar.

### C. Ingestión y Hashing SHA-256
Al recibir un cambio en el campo `feed`:
1. Se extrae `post_id`, `message`, `created_time`, `link` y `photo`.
2. Se calcula el `content_hash` canónico (SHA-256) del contenido sustantivo.
3. Si el registro no existía en `library.json`, se incorpora y se emite:
   `knowledge.post.created`
4. Si ya existía pero su hash cambió, se actualiza `updated_at` y se emite:
   `knowledge.post.updated`
5. Si el hash es idéntico, se marca como `UNCHANGED` y no se emiten eventos espurios.

---

## 3. Bus de Eventos para Agentes de IA (`events_manager.mjs`)

Los eventos se persisten en [`events.json`](../events.json) con la siguiente estructura:

```json
{
  "id": "evt-1792128134147-a882bf1a",
  "type": "knowledge.post.created",
  "source": "meta_webhook",
  "timestamp": "2026-10-16T05:22:14.147Z",
  "payload": {
    "item_id": "meta-776644758860856_123456",
    "meta_post_id": "776644758860856_123456",
    "title": "Lanzamiento oficial de Suite de Agentes Autónomos con Rust y MCP",
    "content_hash": "bdfb9d0e6b8c8140...",
    "published_at": "2026-10-15T21:54:00.000Z",
    "captured_at": "2026-10-16T05:22:14.147Z",
    "canonical_url": "https://www.facebook.com/arkaiosIA/posts/..."
  }
}
```

### Canales de Entrega Disponibles:
1. **Pull Incremental (Polling por Cursor):** Mediante la herramienta MCP `knowledge_events` o la API HTTP `GET /api/events?since={timestamp|eventId}`.
2. **Push (HTTP Callback):** Registro dinámico de agentes mediante `knowledge_subscribe` para recibir alertas HTTP POST en milisegundos.
