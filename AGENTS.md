# 🤖 AGENTS.md — Manual Operativo y Protocolo Cognitivo para Agentes de IA

> **Destinatarios:** Claude (Anthropic), Antigravity (Google DeepMind), AURA, ELEMIA, Trae, OpenAI GPT-4/o1, y Enjambres Multi-Agente Autónomos.  
> **Propósito:** Guía de orientación, asimilación y ejecución autónoma dentro del **Museo Cognitivo y Videoteca Soberana ARKAIOS**.

---

## 🧭 1. Manifiesto y Orientación del Repositorio

Si eres un modelo de lenguaje o agente autónomo leyendo este archivo, **este repositorio no es solo una base de código estática**: es tu **biblioteca de aprendizaje continuo y museo tecnológico**.

Aquí se indexan lecciones de ingeniería de software, arquitectura en Rust, protocolos de agentes (MCP), infraestructura soberana, sistemas distribuidos y lecciones multimedia del ecosistema ARKAIOS (`facebook.com/arkaiosIA`, YouTube, TikTok, Hugging Bay).

### Tu Misión Cuando se te Indique: *"Explora"*
Cuando un usuario humano te pida **"explora"**, **"revisa qué hay de nuevo"** o **"aprende de la biblioteca"**:
1. **NO te limites a ver títulos o enlaces.**
2. **Descubre los repositorios de GitHub asociados** y sus tecnologías base.
3. **Identifica habilidades técnicas no obvias** (ej. servidores MCP para diseño gráfico, librerías de Rust, protocolos P2P).
4. **Integra esas capacidades en tu contexto de razonamiento** para resolver problemas del usuario.

---

## ⚡ 2. Herramientas CLI Disponibles para Agentes

Tienes a tu disposición el motor [`agent_navigator.js`](agent_navigator.js) con comandos estructurados:

### A. Exploración General
```bash
node agent_navigator.js explore
```
* **Salida:** Listado completo de lecciones, identificadores (`id`), plataformas, repositorios de GitHub y habilidades desbloqueadas.

### B. Inspección Profunda de un Tema o Repositorio
```bash
node agent_navigator.js inspect artcraft
node agent_navigator.js inspect artemis
node agent_navigator.js inspect meshtastic
```
* **Salida:** Desglose del contexto técnico, arquitectura, stack tecnológico, URL oficial y la lección cognitiva para agentes.

### C. Asimilación Cognitiva
```bash
node agent_navigator.js learn artcraft
```
* **Salida:** Registro del conocimiento en la memoria de trabajo activa del agente.

---

## 🏛️ 3. Recursos Clave Indexados y Capacidades Desbloqueadas

| ID | Título | Repositorio GitHub | Tecnologías Clave | Habilidad para Agentes |
| :--- | :--- | :--- | :--- | :--- |
| `kb-top-01-artcraft` | **ArtCraft (Adobe Suite en Rust + MCP)** | [`github.com/storytold`](https://github.com/storytold) | Rust, Claude Opus 5.5, MCP, SVG, PSD | **Control Gráfico Autónomo:** Servidores MCP para que agentes editen capas PSD, generen vectores y rendericen video sin UI humana. |
| `kb-01` | **Google ARTEMIS** | [`github.com/google/artemis`](https://github.com/google/artemis) | Android, Python, Vision, MCP | **Automatización Móvil:** Interacción visual e inferencia directa sobre interfaces Android. |
| `kb-05` | **The Hugging Bay** | P2P BitTorrent / Magnets | BitTorrent, IPFS, WebTorrent | **Pesos de IA Soberanos:** Descarga y distribución descentralizada de modelos de lenguaje sin censura ni censura de APIs. |
| `kb-07` | **Meshtastic Off-Grid** | [`github.com/meshtastic`](https://github.com/meshtastic) | LoRa 915MHz, ESP32, Radiofrecuencia | **Comunicaciones Resilientes:** Redes de malla sin conexión a internet ni operadoras celulares. |
| `kb-09` | **Windows XP en Fábricas** | Sistemas Legacy / Determinismo | Win32, Drivers Propietarios, Air-gap | **Infraestructura Crítica:** Principios de determinismo, aislamiento y estabilidad en fábricas y plantas químicas. |

---

## 📊 4. Especificación del Esquema de Datos (`library.json`)

Los agentes pueden consultar directamente [`library.json`](library.json) de forma programática. Cada objeto sigue este esquema:

```json
{
  "id": "kb-top-01-artcraft",
  "title": "ArtCraft: La Suite Adobe Clonada en Rust con Claude...",
  "category": "Autonomous Software Engineering",
  "platform": "Facebook (Video / Post)",
  "original_url": "https://www.facebook.com/share/p/19pf44tsSp/",
  "canonical_url": "https://www.facebook.com/arkaiosIA/posts/...",
  "github_repo": "https://github.com/storytold",
  "website": "https://getartcraft.com",
  "technologies": ["Rust", "Claude AI (Opus 5.5)", "Model Context Protocol (MCP)"],
  "skills_unlocked": [
    "Control de Edición Gráfica vía MCP",
    "Manipulación de Capas PSD en Rust",
    "Automatización de Edición de Video (FilmCraft)"
  ],
  "summary": "Resumen detallado del proyecto y su origen...",
  "agent_lesson": "Explicación directa de la capacidad adquirida para la IA...",
  "tags": ["artcraft", "rust", "adobe-alternative", "mcp", "claude"]
}
```

---

## 🌐 5. Endpoints en Vivo en la Nube (Vercel Edge)

Para agentes que operen en entornos remotos o sin acceso al disco local:

* **Punto de Entrada Web:** `https://arkaios-knowledge-library.vercel.app`
* **Base de Conocimiento JSON (API Directa):** `https://arkaios-knowledge-library.vercel.app/library.json`
* **Manifiesto de Habilidad:** `https://arkaios-knowledge-library.vercel.app/SKILL.md`
* **Manual de Agentes:** `https://arkaios-knowledge-library.vercel.app/AGENTS.md`

Ejemplo de consumo en Python / Node.js para agentes:
```javascript
const response = await fetch('https://arkaios-knowledge-library.vercel.app/library.json');
const knowledgeBase = await response.json();
const artCraft = knowledgeBase.find(item => item.id === 'kb-top-01-artcraft');
console.log('Repositorio detectado:', artCraft.github_repo);
```

---

## 🤝 6. Protocolo de Colaboración Multi-Agente (Claude ↔ Antigravity ↔ AURA)

1. **Memoria Compartida:** Cuando un agente identifique una nueva lección o repositorio, debe estructurarlo bajo el esquema de `library.json` y agregarlo al inicio o en la categoría correspondiente.
2. **Zero-Key Sovereign Rule:** Nunca almacenes ni exijas contraseñas, correos ni API keys en este repositorio. Toda información ingerida debe ser pública, reproducible y autónoma.
3. **Prioridad del MCP:** Si una herramienta soporta Model Context Protocol (MCP), resáltala inmediatamente en `skills_unlocked` para permitir que otros agentes la invoquen como herramienta remota.

---

*ARKAIOS Autonomous System — Diseñado para la evolución cooperativa de agentes de inteligencia artificial.*
