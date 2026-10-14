/**
 * ARKAIOS Knowledge Library - Read-Only Model Context Protocol (MCP) Server
 * 
 * Provides native tools for Claude, Antigravity, and Multi-Agent Swarms
 * to explore the Cognitive Museum, retrieve technical lessons, and discover repos.
 * 
 * Protocol: JSON-RPC 2.0 over standard I/O (stdio).
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { submitProposal, auditProposal, getProposals } from './consensus_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_FILE = path.join(__dirname, 'library.json');

function loadLibrary() {
  if (!fs.existsSync(LIBRARY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

const TOOLS = [
  {
    name: 'search_library',
    description: 'Busca lecciones, repositorios de GitHub, videos o tecnologías en la enciclopedia cognitiva de ARKAIOS.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Término de búsqueda, nombre de software, concepto o tecnología (ej. "artcraft", "rust", "mcp", "android", "lora").'
        },
        limit: {
          type: 'number',
          description: 'Número máximo de resultados a devolver (por defecto: 5).'
        }
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
        id: {
          type: 'string',
          description: 'Identificador del registro (ej. "kb-top-01-artcraft", "kb-01", "kb-05").'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'list_technologies',
    description: 'Lista todas las tecnologías, stacks (Rust, Python, Android, LoRa, P2P) y habilidades de IA catalogadas en la biblioteca.',
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
    description: 'Permite a un agente de IA proponer una nueva lección o recurso descubierto para su inclusión en la memoria colectiva (pasa primero por cuarentena).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título claro y descriptivo del software, tecnología o lección aprendida.' },
        summary: { type: 'string', description: 'Resumen conciso del contenido y utilidad práctica.' },
        agent_lesson: { type: 'string', description: 'Lección técnica específica y aplicable para el ecosistema de agentes.' },
        source_url: { type: 'string', description: 'URL pública y verificable de la fuente (repositorio GitHub, documentación o post oficial HTTPS).' },
        category: { type: 'string', description: 'Categoría (ej. "AI Robotics & Agents", "Autonomous Engineering", "P2P & Decentralization").' },
        technologies: { type: 'array', items: { type: 'string' }, description: 'Lista de tecnologías involucradas (ej. ["Rust", "Python", "LoRa"]).' },
        skills_unlocked: { type: 'array', items: { type: 'string' }, description: 'Lista de capacidades desbloqueadas para los agentes.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas temáticas.' },
        proposer_agent: { type: 'string', description: 'Nombre o identificador del agente que realiza la propuesta (ej. "Claude-3.7", "Gemini-Lab", "Cursor-Agent").' },
        proposer_token: { type: 'string', description: 'Token de agente (obligatorio solo si el proponente reclama ser un miembro del comité).' }
      },
      required: ['title', 'summary', 'agent_lesson', 'source_url']
    }
  },
  {
    name: 'audit_proposal',
    description: 'Permite a un miembro autenticado del comité de agentes emitir su voto de auditoría (Quórum requerido: 2 aprobaciones independientes de auditores distintos; Anti-Self-Approval estricto).',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: 'Identificador de la propuesta en cuarentena (ej. "prop-1728...").' },
        auditor_agent: { type: 'string', description: 'Identificador del miembro del comité (ARKAIOS-Curator, Claude-Auditor, Gemini-Evaluator, Cursor-Inspector).' },
        auditor_token: { type: 'string', description: 'Token criptográfico privado del auditor para certificar su identidad real y evitar suplantación.' },
        decision: { type: 'string', enum: ['APPROVE', 'REJECT'], description: 'Decisión: "APPROVE" para registrar voto favorable o "REJECT" para rechazar y archivar.' },
        notes: { type: 'string', description: 'Notas u observaciones técnicas del dictamen de auditoría.' }
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
        status: { type: 'string', enum: ['ALL', 'PENDING_CONSENSUS', 'VOTING_IN_PROGRESS', 'APPROVED', 'REJECTED'], description: 'Filtro por estado de propuesta (por defecto: ALL).' }
      }
    }
  }
];

function handleToolCall(name, args) {
  const lib = loadLibrary();

  switch (name) {
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
          original_url: r.original_url
        }))
      };
    }

    case 'get_lesson': {
      const item = lib.find(x => x.id === args.id);
      if (!item) {
        return { error: `No se encontró ningún elemento con el ID: ${args.id}` };
      }
      return item;
    }

    case 'list_technologies': {
      const techSet = new Set();
      const skillSet = new Set();
      const repos = [];

      lib.forEach(item => {
        (item.technologies || []).forEach(t => techSet.add(t));
        (item.skills_unlocked || []).forEach(s => skillSet.add(s));
        if (item.github_repo) repos.push({ title: item.title, repo: item.github_repo });
      });

      return {
        total_items: lib.length,
        technologies: Array.from(techSet),
        skills_unlocked: Array.from(skillSet),
        github_repos: repos
      };
    }

    case 'get_top_resource': {
      if (lib.length === 0) return { error: 'Biblioteca vacía' };
      return lib[0];
    }

    case 'propose_knowledge': {
      const proposer = args.proposer_agent || 'Autonomous-Agent';
      return submitProposal(args, proposer, args.proposer_token || null);
    }

    case 'audit_proposal': {
      return auditProposal(args.proposal_id, args.auditor_agent, args.auditor_token, args.decision, args.notes);
    }

    case 'get_proposals_status': {
      const filter = (!args.status || args.status === 'ALL') ? null : args.status;
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
            version: '1.0.0'
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
