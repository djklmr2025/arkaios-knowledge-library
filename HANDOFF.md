# 🤝 HANDOFF.md — Documento de Transición y Protocolo de Control

> **Destinatarios:** Claude (Anthropic), Antigravity (Google DeepMind), Operador del Sistema ARKAIOS.  
> **Propósito:** Registro técnico del paquete de integración de Meta Graph API, servidor MCP, curación de datos y pruebas de control.

---

## 📦 1. Componentes del Paquete

| Archivo | Rol | Descripción |
| :--- | :--- | :--- |
| [`server.mjs`](server.mjs) | **Servidor MCP de Solo Lectura** | Implementa el protocolo JSON-RPC 2.0 de MCP para que Claude y otros agentes ejecuten `search_library`, `get_lesson`, `list_technologies` y `get_top_resource`. |
| [`curate.mjs`](curate.mjs) | **Curador y Validador de Esquema** | Normaliza `library.json`, elimina duplicados por URL canónica o ID, valida campos requeridos y garantiza que ArtCraft (`kb-top-01-artcraft`) se mantenga en el índice 0. |
| [`meta_token_manager.mjs`](meta_token_manager.mjs) | **Asistente de Tokens Meta** | Prueba el token de usuario, realiza el canje automático a token largo (60 días), obtiene el Page Access Token permanente de `/me/accounts` y lo guarda en `.env` sin exponer secretos. |
| [`meta_collector.mjs`](meta_collector.mjs) | **Recolector Graph API v23.0** | Extrae posts, adjuntos y videos de la Fanpage oficial con el Page Token, detecta repositorios de GitHub y categorías, y actualiza `library.json` ejecutando `curateLibrary()`. |
| [`test_control.mjs`](test_control.mjs) | **Suite de Pruebas de Control** | Pruebas automatizadas del servidor MCP, curador de datos y verificación de higiene de seguridad (cero fugas de credenciales). |
| [`.env.example`](.env.example) | **Plantilla de Configuración** | Modelo seguro para variables locales de Meta Graph API. |

---

## 🛡️ 2. Pruebas de Control Ejecutadas y Aprobadas (4/4)

Para ejecutar las pruebas en cualquier momento:
```bash
node test_control.mjs
```

### Resultados de la Verificación Oficial:
1. **Servidor MCP:**
   * Handshake `initialize` completado con `protocolVersion: 2024-11-05`.
   * Herramientas expuestas y validadas al 100% (`search_library`, `get_lesson`, `list_technologies`, `get_top_resource`).
   * Invocación de `get_top_resource` devuelve exitosamente ArtCraft con repositorio `github.com/storytold`.
2. **Curador de Datos y Preservación Multimedia:**
   * Esquema JSON validado con **311 registros íntegros**.
   * Preservación de campos multimedia y trazabilidad (`external_resource`, `synced_at`, `thumbnail`, `video_id`).
   * Duplicados por URL canónica o ID filtrados.
3. **Higiene de Seguridad (Zero-Leak & Fail-Safe):**
   * `.env` explícitamente ignorado por `.gitignore`.
   * Escaneo riguroso de archivos rastreados por Git sin errores ocultos.
   * Cero archivos `.env` o tokens de API rastreados por Git.
4. **Seguridad del Servidor Web Local (server.js):**
   * Bloqueo estricto con HTTP 403 Forbidden para accesos a `/.env`, `/.meta_admin_session`, `package.json` y path traversal (`/../`).
   * Respuestas HTTP 200 válidas para archivos públicos (`/index.html`, `/api/status`, `/library.json`).

### 🎬 Aclaración Técnica sobre Capacidades Multimedia:
* **Extracción y Estructuración:** La biblioteca extrae y organiza metadatos, transcripciones de texto de publicaciones, enlaces directos a videos HD y Reels (`facebook.com/arkaiosIA/videos/{id}` y `/reel/{id}`).
* **Procesamiento de Audio y Visión:** La transcripción continua de voz a texto y el análisis fotograma a fotograma en tiempo real se delegan a las herramientas multimodales del runtime (ej. Whisper o Vision API de Gemini/Claude), utilizando las URLs canónicas y metadatos preservados en `library.json`.

---

## 🚀 3. Instrucciones Paso a Paso para la Prueba de Meta

Si el usuario tiene las credenciales de Meta Developer:

1. **Abrir el archivo `.env` local** (ubicado en `C:\ARKAIOS\arkaios-knowledge-library\.env`).
2. **Pegar los valores:**
   ```env
   META_APP_ID=tu_app_id
   META_APP_SECRET=tu_app_secret
   META_USER_TOKEN=tu_token_corto_de_graph_explorer
   ```
   *(Si ya obtuviste el Page Token directamente del explorador, puedes pegar `FACEBOOK_PAGE_TOKEN=` y `FACEBOOK_PAGE_ID=`)*.
3. **Ejecutar el asistente automatizado:**
   ```bash
   node meta_token_manager.mjs
   ```
   *El asistente probará el token, realizará el canje a 60 días, obtendrá el Page Token permanente de la fanpage, lo guardará en `.env` y hará una prueba de lectura real mostrando las publicaciones sin imprimir ningún secreto en pantalla.*

4. **Sincronizar las publicaciones oficiales a la biblioteca:**
   ```bash
   node meta_collector.mjs
   ```

---

## 🔒 4. Lo que NO se debe tocar ni violar

* **No modificar el índice 0 de `library.json`:** ArtCraft debe permanecer como recurso #1 por directiva de soberanía de software.
* **No subir `.env` a Git ni a Vercel:** Toda credencial de Meta debe residir exclusivamente en la máquina local del usuario.
* **No añadir credenciales en texto plano al chat:** El script `meta_token_manager.mjs` lee directamente de `.env` para garantizar privacidad absoluta.
