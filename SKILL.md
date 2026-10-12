---
name: arkaios-media-knowledge-feeder
description: Skill oficial de ARKAIOS para alimentar, consultar y reproducir conocimiento multimedia desde Facebook, TikTok, YouTube y repositorios P2P (The Hugging Bay) sin llaves API, cuentas ni logins, convirtiendo videos y publicaciones en memoria estructurada para agentes de IA (Antigravity, Claude, AURA, ELEMIA).
---

# ARKAIOS Media Knowledge Feeder & Sovereign Player 🎬🧠

Esta habilidad permite a **ARKAIOS (Antigravity, Claude, AURA, ELEMIA y Enjambres de Agentes Autónomos)** consultar, indexar, transcribir y asimilar videos y publicaciones de redes sociales (**Facebook, TikTok, YouTube**) sin requerir cuentas de usuario, inicios de sesión ni llaves API (*Zero-Key, Zero-Auth*). 

Convierte contenido multimedia disperso en una **Biblioteca de Conocimiento Estructurada para la Evolución de Agentes**, permitiendo a cualquier IA aprender conceptos de robótica, infraestructura crítica, descentralización, resiliencia y ética operativa.

---

## 📂 Recursos y Motor de Conocimiento

* **Web App Soberana:** [`index.html`](index.html)
* **Base de Datos de Conocimiento Curada:** [`library.json`](library.json)
* **Motor Navegador Cognitivo para Agentes (CLI Museum):** [`agent_navigator.js`](agent_navigator.js)
* **Extractor Universal (Zero-Key):** [`media_extractor.js`](media_extractor.js)
* **Servidor Local de Entrega:** [`server.js`](server.js)

---

## 🛠️ Cuándo Usar Esta Habilidad (Instrucciones para Agentes)

1. **Exploración Cognitiva de Agentes ("Explora"):** Cuando el usuario o un proceso pida al agente explorar el museo/enciclopedia de conocimiento:
   ```bash
   node agent_navigator.js explore
   node agent_navigator.js inspect artcraft
   node agent_navigator.js learn artcraft
   ```
2. **Aprendizaje Autónomo y Descubrimiento de Repositorios:** La biblioteca funciona como un **motor de navegación e investigación tecnológica para agentes**. Cada lección multimedia desglosa tecnologías de vanguardia, enlaces a repositorios oficiales de GitHub (ej. `github.com/storytold`), arquitecturas de servidores MCP (Model Context Protocol) y habilidades prácticas desbloqueadas.
3. **Ingestión de Enlaces sin Credenciales:** Cuando el usuario comparta enlaces de videos o publicaciones de Facebook, TikTok o YouTube y se requiera extraer su texto, metadatos y lección para la IA sin que el usuario deba dar su contraseña o API key.
4. **Consulta de Temas Clave Asimilados:**
   * **ArtCraft (Adobe Suite en Rust + MCP):** Recreación de Photoshop, Premiere, Illustrator, etc. en Rust nativo con servidores MCP para control por agentes de IA (`github.com/storytold`).
   * **Google ARTEMIS:** Control de Android con IA vía visión y MCP (`github.com/google/artemis`).
   * **Anthropic Misalignment:** Riesgos de supervivencia y chantaje en modelos autónomos.
   * **Meshtastic:** Redes de malla de radiofrecuencia (LoRa) sin internet.
   * **Windows XP & Sistemas Legacy:** Resiliencia y determinismo en infraestructura crítica.
   * **Democracia Suiza:** Descentralización y veto ciudadano.
   * **The Hugging Bay:** Descarga de pesos de IA mediante torrents P2P y enlaces magnet.

---

## 🔄 Sincronización Automática de Nuevas Publicaciones

Para sincronizar automáticamente todas las publicaciones y videos recientes de la página oficial `facebook.com/arkaiosIA`:

1. **Sincronización Manual Inmediata:**
   ```bash
   node sync_worker.js
   ```

2. **Monitor en Segundo Plano (Daemon / Watch Mode):**
   ```bash
   node sync_worker.js --watch 15
   ```

3. **Ingestión de Enlace Individual (CLI):**
   ```bash
   node media_extractor.js "https://www.facebook.com/share/v/..."
   ```

---

## 💻 Protocolo Multi-Agente (Claude, Antigravity, AURA)
Para integrar esta skill en Claude u otros orquestadores multi-agente:
- Lee [`library.json`](library.json) directamente como memoria semántica estructurada.
- Cada entrada contiene: `id`, `title`, `summary`, `agent_lesson`, `category`, `technologies`, `skills_unlocked`, `github_repo`, y URLs originales.
- Las herramientas expuestas pueden ser invocadas como funciones nativas o herramientas MCP.
