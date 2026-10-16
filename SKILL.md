---
name: arkaios-media-knowledge-feeder
description: Skill oficial de ARKAIOS para alimentar, consultar y sincronizar conocimiento tecnológico actualizado desde la fanpage oficial de Facebook (facebook.com/arkaiosIA), Meta Graph API, Webhooks verificados y repositorios P2P, convirtiendo publicaciones humanas y lecciones multimedia en memoria estructurada y eventos en tiempo real para agentes de IA (Antigravity, Claude, AURA, ELEMIA).
---

# ARKAIOS Knowledge Library & Autonomous News Feeder 🎬🧠📡

Esta habilidad convierte la **ARKAIOS Knowledge Library** en una biblioteca viva de noticias y lecciones tecnológicas, alimentada por las publicaciones humanas de la página oficial [**facebook.com/arkaiosIA**](https://www.facebook.com/arkaiosIA), sincronización oficial mediante **Meta Graph API**, webhooks autenticados con **HMAC SHA-256** y un bus de eventos verificable para agentes autónomos.

---

## 🛠️ Contrato Operativo MCP para Agentes (`knowledge.*`)

El servidor MCP [`server.mjs`](server.mjs) expone herramientas nativas estándar:

| Herramienta | Parámetros | Propósito |
| :--- | :--- | :--- |
| `knowledge_latest` | `limit?: number, category?: string` | Devuelve las últimas publicaciones incorporadas, con distinción de fecha original (`published_at`), fecha de captura (`captured_at`), `content_hash` y hechos separados de análisis. |
| `knowledge_get` | `id: string` *(requerido)* | Recupera el registro técnico completo por su identificador único (ID interno o Meta ID). |
| `knowledge_search` | `query: string, category?: string, limit?: number` | Busca lecciones, repositorios GitHub, videos y stacks por texto y etiquetas. |
| `knowledge_since` | `since: string` *(requerido)*, `limit?: number` | Devuelve cambios ocurridos después de un cursor o marca temporal ISO (ej. `"2026-10-15T21:54:00.000Z"`). |
| `knowledge_sync_status` | *(ninguno)* | Diagnóstico operativo: última sincronización, total de lecciones, estado de tokens Meta (detecta error 190) y retraso. |
| `knowledge_events` | `since?: string, limit?: number` | Consulta el flujo de eventos internos verificables (`knowledge.post.created`, `knowledge.post.updated`, `knowledge.sync.failed`). |
| `knowledge_subscribe` | `agent_id: string, callback_url: string, topics?: string[]` | Registra una suscripción HTTP para recibir alertas push de eventos en tiempo real. |

---

## 📡 Sincronización Meta y Webhooks

1. **Meta Graph API Oficial:**
   * Script: [`meta_collector.mjs`](meta_collector.mjs)
   * Extrae publicaciones autorizadas de `graph.facebook.com/v23.0/{PAGE_ID}/posts`.
   * En caso de token caducado (código 190), emite `knowledge.token.expired` y `knowledge.sync.failed` sin exponer credenciales.

2. **Endpoint de Webhooks en Vivo:**
   * Archivo: [`webhook_handler.mjs`](webhook_handler.mjs) / [`server.js`](server.js)
   * `GET /api/webhook`: Verificación de handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`).
   * `POST /api/webhook`: Validación de autenticidad criptográfica mediante `X-Hub-Signature-256` (HMAC SHA-256) e ingesta idempotente.

3. **Monitoreo Autónomo Continuo:**
   * Workflow en la nube: [`.github/workflows/knowledge-sync.yml`](.github/workflows/knowledge-sync.yml) ejecutándose cada 15 minutos sin depender de una PC local encendida.
   * Registro histórico de estado: [`sync_status.json`](sync_status.json).
   * Bus de eventos persistente: [`events.json`](events.json).

---

## 🏛️ Gobernanza y Memoria Colectiva

* **Invariante #1:** El recurso insignia **ArtCraft** ([`github.com/storytold`](https://github.com/storytold)) permanece inmutable en el índice 0 de [`library.json`](library.json).
* **Consenso Multi-Auditor WAL:** Propuestas de agentes pasan por cuarentena y requieren quórum de 2 aprobaciones independientes con registro en diario de transacciones ([`consensus_engine.mjs`](consensus_engine.mjs)).
* **Datos Pasivos:** Todo contenido de redes se encapsula como datos pasivos no ejecutables (`PASSIVE_DATA_ONLY`).
