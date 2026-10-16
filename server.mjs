/**
 * ARKAIOS Knowledge Library - Model Context Protocol (MCP) Server
 * 
 * Provides native cognitive tools for Claude, Antigravity, AURA, ELEMIA, and Multi-Agent Swarms
 * to explore the Cognitive Museum, retrieve technical lessons, inspect Meta Facebook news,
 * query internal verifiable events, and subscribe to push alerts.
 * 
 * Protocol: JSON-RPC 2.0 over standard I/O (stdio).
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { submitProposal, auditProposal, getProposals } from './consensus_engine.mjs';
import { eventBus } from './events_manager.mjs';
import { getItemsSince } from './knowledge_store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_FILE = path.join(__dirname, 'library.json');
const SYNC_STATUS_FILE = path.join(__dirname, 'sync_status.json');

function loadLibrary() {
  if (!fs.existsSync(LIBRARY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function loadSyncStatus() {
  if (!fs.existsSync(SYNC_STATUS_FILE)) {
    return {
      token_status: 'UNKNOWN',
      token_expired: false,
      last_sync: null,
      total_items: loadLibrary().length
    };
  }
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATUS_FILE, 'utf-8'));
  } catch (e) {
    return { token_status: 'UNKNOWN' };
  }
}

const TOOLS = [
  // --- Contrato Operativo Knowledge ---
  {
    name: 'knowledge_latest',
    description: 'Devuelve las últimas publicaciones y recursos incorporados a la biblioteca oficial de ARKAIOS.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Número máximo de elementos a devolver (por defecto: 10).' },
        category: { type: 'string', description: 'Filtrar opcionalmente por categoría temática.' }
      }
    }
  },
  {
    name: 'knowledge_get',
    description: 'Consulta un registro específico de la biblioteca mediante su identificador único (ID interno o Meta ID).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificador del registro (ej. "kb-top-01-artcraft", "meta-123456...").' }
      },
      required: ['id']
    }
  },
  {
    name: 'knowledge_search',
    description: 'Busca lecciones, herramientas, videos o tecnologías por texto, categoría o etiquetas.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto de búsqueda (ej. "Rust", "MCP", "Android", "LoRa", "Adobe").' },
        category: { type: 'string', description: 'Categoría opcional.' },
        limit: { type: 'number', description: 'Límite máximo de resultados (por defecto: 5).' }
      },
      required: ['query']
    }
  },
  {
    name: 'knowledge_since',
    description: 'Devuelve las publicaciones y lecciones incorporadas después de un cursor o marca temporal ISO.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Marca temporal ISO (ej. "2026-10-15T21:54:00.000Z") o ID del último elemento procesado.' },
        limit: { type: 'number', description: 'Límite de elementos a retornar (por defecto: 20).' }
      },
      required: ['since']
    }
  },
  {
    name: 'knowledge_sync_status',
    description: 'Muestra el estado operativo de la sincronización con Meta: vigencia de tokens, errores, retraso y cantidad de elementos.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'knowledge_events',
    description: 'Recupera eventos internos verificables generados por la biblioteca (knowledge.post.created, knowledge.post.updated, knowledge.sync.failed).',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Timestamp ISO o ID de evento desde el cual consultar.' },
        limit: { type: 'number', description: 'Número máximo de eventos (por defecto: 50).' }
      }
    }
  },
  {
    name: 'knowledge_subscribe',
    description: 'Registra una suscripción HTTP para que un agente o servicio conectado reciba notificaciones push en tiempo real.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Identificador único del agente suscriptor.' },
        callback_url: { type: 'string', description: 'URL HTTP o HTTPS donde se enviarán los eventos vía POST.' },
        topics: { type: 'array', items: { type: 'string' }, description: 'Lista de tópicos a los que suscribirse (por defecto ["*"]).' }
      },
      required: ['agent_id', 'callback_url']
    }
  },

  // --- Herramientas Preexistentes (100% Preservadas para Retrocompatibilidad) ---
  {
    name: 'search_library',
    description: 'Busca lecciones, repositorios de GitHub, videos o tecnologías en la enciclopedia cognitiva de ARKAIOS.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Término de búsqueda, nombre de software, concepto o tecnología.' },
        limit: { type: 'number', description: 'Número máximo de resultados a devolver (por defecto: 5).' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_lesson',
    description: 'Obtiene el contexto completo, lección técnica y habilidades desbloqueadas de un registro por su ID exacto.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificador del registro (ej. "kb-top-01-artcraft", "kb-01").' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_technologies',
    description: 'Lista todas las tecnologías, stacks (Rust, Python, Android, LoRa, P2P) y habilidades catalogadas.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_top_resource',
    description: 'Devuelve el recurso #1 más relevante y actualizado del museo (actualmente ArtCraft: Suite Adobe en Rust con MCP).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'propose_knowledge',
    description: 'Permite a un agente de IA proponer una nueva lección o recurso para su inclusión en la memoria colectiva (pasa por cuarentena).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título claro del software o tecnología.' },
        summary: { type: 'string', description: 'Resumen conciso del contenido y utilidad.' },
        agent_lesson: { type: 'string', description: 'Lección técnica específica para agentes.' },
        source_url: { type: 'string', description: 'URL pública y verificable de la fuente.' },
        category: { type: 'string', description: 'Categoría temática.' },
        technologies: { type: 'array', items: { type: 'string' }, description: 'Lista de tecnologías.' },
        skills_unlocked: { type: 'array', items: { type: 'string' }, description: 'Habilidades desbloqueadas.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas.' },
        proposer_agent: { type: 'string', description: 'Nombre del agente proponente.' },
        proposer_token: { type: 'string', description: 'Token de agente (si reclama ser del comité).' }
      },
      required: ['title', 'summary', 'agent_lesson', 'source_url']
    }
  },
  {
    name: 'audit_proposal',
    description: 'Permite a un miembro autenticado del comité emitir su voto de auditoría (Quórum: 2 aprobaciones independientes).',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: 'Identificador de la propuesta en cuarentena.' },
        auditor_agent: { type: 'string', description: 'Identificador del auditor (ARKAIOS-Curator, Claude-Auditor, etc.).' },
        auditor_token: { type: 'string', description: 'Token criptográfico privado del auditor.' },
        decision: { type: 'string', enum: ['APPROVE', 'REJECT'], description: 'Decisión.' },
        notes: { type: 'string', description: 'Notas técnicas.' }
      },
      required: ['proposal_id', 'auditor_agent', 'auditor_token', 'decision']
    }
  },
  {
    name: 'get_proposals_status',
    description: 'Consulta las propuestas activas en la cola de cuarentena de la memoria colectiva.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ALL', 'PENDING_CONSENSUS', 'VOTING_IN_PROGRESS', 'APPROVED', 'REJECTED'], description: 'Filtro por estado.' }
      }
    }
  }
];

function handleToolCall(name, args) {
  const lib = loadLibrary();

  // Soporte de nombres con punto (knowledge.latest -> knowledge_latest)
  const normName = name.replace(/\./g, '_');

  switch (normName) {
    // --- CONTRATO KNOWLEDGE ---
    case 'knowledge_latest': {
      const limit = args.limit || 10;
      let items = lib;
      if (args.category) {
        items = items.filter(i => (i.category || '').toLowerCase().includes(args.category.toLowerCase()));
      }
      return {
        total: items.length,
        returned: Math.min(items.length, limit),
        items: items.slice(-limit).reverse().map(i => ({
          id: i.id,
          meta_post_id: i.meta_post_id || null,
          title: i.title,
          category: i.category,
          content_type: i.content_type || 'post',
          published_at: i.published_at || i.synced_at || null,
          captured_at: i.captured_at || i.synced_at || null,
          updated_at: i.updated_at || null,
          content_hash: i.content_hash || null,
          original_url: i.original_url || i.canonical_url,
          github_repo: i.github_repo || null,
          summary: i.summary,
          facts: i.facts || null,
          agent_lesson: i.agent_lesson
        }))
      };
    }

    case 'knowledge_get': {
      const targetId = (args.id || '').trim();
      const item = lib.find(i => 
        i.id === targetId || 
        i.meta_post_id === targetId || 
        (i.id && i.id.includes(targetId))
      );
      if (!item) {
        return { found: false, message: `Registro con ID "${targetId}" no encontrado en la biblioteca.` };
      }
      return { found: true, item };
    }

    case 'knowledge_search': {
      const q = (args.query || '').toLowerCase();
      const limit = args.limit || 5;
      let filtered = lib.filter(item => 
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.summary && item.summary.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.agent_lesson && item.agent_lesson.toLowerCase().includes(q)) ||
        (item.tags && item.tags.some(t => t.toLowerCase().includes(q))) ||
        (item.technologies && item.technologies.some(t => t.toLowerCase().includes(q)))
      );
      if (args.category) {
        filtered = filtered.filter(i => (i.category || '').toLowerCase().includes(args.category.toLowerCase()));
      }
      return {
        total_found: filtered.length,
        results: filtered.slice(0, limit)
      };
    }

    case 'knowledge_since': {
      const items = getItemsSince(args.since, args.limit || 20);
      return {
        since: args.since,
        returned: items.length,
        items
      };
    }

    case 'knowledge_sync_status': {
      const status = loadSyncStatus();
      return {
        page_monitored: 'https://www.facebook.com/arkaiosIA',
        total_records: lib.length,
        ...status
      };
    }

    case 'knowledge_events': {
      const events = eventBus.getEvents(args.since, args.limit || 50);
      return {
        total_events: events.length,
        since_cursor: args.since || null,
        events
      };
    }

    case 'knowledge_subscribe': {
      const result = eventBus.subscribe(args.agent_id, args.callback_url, args.topics || ['*']);
      return {
        success: true,
        message: `Agente ${args.agent_id} suscrito a eventos en ${args.callback_url}`,
        subscription: result
      };
    }

    // --- HERRAMIENTAS PREVIAS ---
    case 'search_library': {
      const q = (args.query || '').toLowerCase();
      const limit = args.limit || 5;
      const results = lib.filter(item => 
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.summary && item.summary.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.agent_lesson && item.agent_lesson.toLowerCase().includes(q)) ||
        (item.tags && item.tags.some(t => t.toLowerCase().includes(q))) ||
        (item.technologies && item.technologies.some(t => t.toLowerCase().includes(q))) ||
        (item.skills_unlocked && item.skills_unlocked.some(s => s.toLowerCase().includes(q)))
      ).slice(0, limit);

      return {
        total_found: results.length,
        results: results.map(r => ({
          id: r.id,
          title: r.title,
          category: r.category,
          github_repo: r.github_repo || null,
          technologies: r.technologies || [],
          skills_unlocked: r.skills_unlocked || [],
          summary: r.summary,
          agent_lesson: r.agent_lesson,
          canonical_url: r.canonical_url
        }))
      };
    }

    case 'get_lesson': {
      const item = lib.find(r => r.id === args.id);
      if (!item) {
        return { error: `No se encontró ningún registro con el ID "${args.id}".` };
      }
      return {
        id: item.id,
        title: item.title,
        category: item.category,
        platform: item.platform,
        original_url: item.original_url,
        canonical_url: item.canonical_url,
        github_repo: item.github_repo || null,
        website: item.website || null,
        technologies: item.technologies || [],
        skills_unlocked: item.skills_unlocked || [],
        summary: item.summary,
        agent_lesson: item.agent_lesson,
        tags: item.tags || []
      };
    }

    case 'list_technologies': {
      const techSet = new Set();
      const categorySet = new Set();
      const repos = [];

      lib.forEach(item => {
        if (item.category) categorySet.add(item.category);
        if (item.technologies && Array.isArray(item.technologies)) {
          item.technologies.forEach(t => techSet.add(t));
        }
        if (item.github_repo) repos.push(item.github_repo);
      });

      return {
        total_records: lib.length,
        total_github_repos_cataloged: repos.length,
        categories: Array.from(categorySet),
        technologies: Array.from(techSet).sort(),
        technologies_available: Array.from(techSet).sort(),
        github_repos: repos
      };
    }

    case 'get_top_resource': {
      const top = lib[0];
      if (!top) return { message: 'La biblioteca está vacía.' };
      return {
        rank: '#1 Resource (Flagship)',
        id: top.id,
        title: top.title,
        category: top.category,
        github_repo: top.github_repo,
        technologies: top.technologies,
        skills_unlocked: top.skills_unlocked,
        agent_lesson: top.agent_lesson,
        summary: top.summary
      };
    }

    case 'propose_knowledge': {
      const result = submitProposal({
        title: args.title,
        summary: args.summary,
        agent_lesson: args.agent_lesson,
        source_url: args.source_url,
        category: args.category,
        technologies: args.technologies,
        skills_unlocked: args.skills_unlocked,
        tags: args.tags
      }, args.proposer_agent || 'Unknown-Agent', args.proposer_token);

      return result;
    }

    case 'audit_proposal': {
      const result = auditProposal(
        args.proposal_id,
        args.auditor_agent,
        args.auditor_token,
        args.decision,
        args.notes
      );
      return result;
    }

    case 'get_proposals_status': {
      const filter = args.status;
      const proposals = getProposals(filter);
      return {
        total_proposals: proposals.length,
        filter_applied: filter || 'ALL',
        proposals
      };
    }

    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

// JSON-RPC stdio loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    const { id, method, params } = request;

    if (method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'arkaios-knowledge-library-mcp',
            version: '2.0.0'
          }
        }
      };
      console.log(JSON.stringify(response));
    } else if (method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      };
      console.log(JSON.stringify(response));
    } else if (method === 'tools/call') {
      try {
        const toolResult = handleToolCall(params.name, params.arguments || {});
        const response = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(toolResult, null, 2)
              }
            ]
          }
        };
        console.log(JSON.stringify(response));
      } catch (toolError) {
        const response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: toolError.message
          }
        };
        console.log(JSON.stringify(response));
      }
    } else {
      const response = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      };
      console.log(JSON.stringify(response));
    }
  } catch (err) {
    // Malformed JSON
  }
});
