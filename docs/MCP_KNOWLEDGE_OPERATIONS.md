# Especificación de Operaciones MCP — ARKAIOS Knowledge Library

El servidor MCP ([`server.mjs`](../server.mjs)) expone el contrato funcional oficial **`knowledge.*`** para Claude, Antigravity, AURA, ELEMIA y enjambres multi-agente, asegurando total retrocompatibilidad con las herramientas clásicas.

---

## 1. Catálogo Completo de Herramientas MCP

### 1. `knowledge_latest` (Alias: `knowledge.latest`)
* **Descripción:** Devuelve las publicaciones más recientes incorporadas a la biblioteca.
* **Parámetros:**
  - `limit` *(opcional, número)*: Cantidad de elementos (defecto: 10).
  - `category` *(opcional, string)*: Filtro por categoría temática.
* **Ejemplo de Retorno:**
```json
{
  "total": 311,
  "returned": 2,
  "items": [
    {
      "id": "meta-776644758860856_9988",
      "title": "Suite de Agentes en Rust y MCP",
      "category": "Autonomous Software Engineering",
      "content_type": "post",
      "published_at": "2026-10-15T21:54:00.000Z",
      "captured_at": "2026-10-16T05:20:00.000Z",
      "content_hash": "bdfb9d0e6b8c8140...",
      "facts": {
        "source_platform": "Facebook Fanpage (arkaiosIA)",
        "external_links": ["https://github.com/storytold"]
      },
      "agent_lesson": "[INFERENCIA DE AGENTE] Suite creativa en Rust para control autónomo..."
    }
  ]
}
```

### 2. `knowledge_get` (Alias: `knowledge.get`)
* **Descripción:** Consulta un registro específico por su ID exacto o Meta ID.
* **Parámetros:**
  - `id` *(requerido, string)*: Identificador del registro.

### 3. `knowledge_search` (Alias: `knowledge.search`)
* **Descripción:** Busca en la biblioteca por coincidencia en título, resumen, lecciones y stacks.
* **Parámetros:**
  - `query` *(requerido, string)*: Término de búsqueda.
  - `category` *(opcional, string)*: Filtro de categoría.
  - `limit` *(opcional, número)*: Límite de resultados.

### 4. `knowledge_since` (Alias: `knowledge.since`)
* **Descripción:** Consulta incremental que devuelve elementos incorporados después de un cursor temporal o ID.
* **Parámetros:**
  - `since` *(requerido, string)*: Timestamp ISO (ej. `"2026-10-15T21:54:00.000Z"`).
  - `limit` *(opcional, número)*: Límite de resultados.

### 5. `knowledge_sync_status` (Alias: `knowledge.sync_status`)
* **Descripción:** Diagnóstico operativo de la sincronización con Meta y estado de tokens.
* **Parámetros:** Ninguno.
* **Retorno:**
```json
{
  "page_monitored": "https://www.facebook.com/arkaiosIA",
  "total_records": 311,
  "token_status": "EXPIRED",
  "token_expired": true,
  "last_error": "Error validating access token: Session has expired... (Código 190)",
  "last_sync": "2026-10-16T05:20:36.980Z"
}
```

### 6. `knowledge_events` (Alias: `knowledge.events`)
* **Descripción:** Consulta el flujo de eventos internos del bus (`knowledge.post.created`, `knowledge.post.updated`, `knowledge.sync.failed`).
* **Parámetros:**
  - `since` *(opcional, string)*: Timestamp ISO o Event ID.
  - `limit` *(opcional, número)*: Cantidad de eventos.

### 7. `knowledge_subscribe` (Alias: `knowledge.subscribe`)
* **Descripción:** Registra una suscripción HTTP para recepción de notificaciones push en tiempo real.
* **Parámetros:**
  - `agent_id` *(requerido, string)*: Nombre del agente.
  - `callback_url` *(requerido, string)*: Endpoint HTTP/HTTPS receptor.
  - `topics` *(opcional, array)*: Tópicos de eventos (`["*"]` por defecto).

---

## 2. Herramientas Clásicas Preservadas

* `search_library`
* `get_lesson`
* `list_technologies`
* `get_top_resource` (ArtCraft #1)
* `propose_knowledge` (Ingesta a cuarentena)
* `audit_proposal` (Votación multi-agente WAL)
* `get_proposals_status` (Estado de cuarentena)
