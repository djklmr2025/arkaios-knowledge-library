/**
 * ARKAIOS Knowledge Library - Autonomous Multi-Agent Consensus & Quarantine Engine (Phase 4)
 * 
 * Implements sovereign multi-agent governance:
 * 1. Quarantine submission: proposals go to proposals.json, NEVER directly to library.json.
 * 2. 4 Strict consensus criteria:
 *    - Schema & Data Integrity
 *    - Zero-Injection (anti-prompt & anti-command injection)
 *    - No Self-Approval (proposer !== auditor)
 *    - Verifiable HTTPS Source
 * 3. Immutable preservation of library baseline (kb-top-01-artcraft remains #1).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBRARY_FILE = path.join(__dirname, 'library.json');
const PROPOSALS_FILE = path.join(__dirname, 'proposals.json');

function loadJson(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Sanitiza texto y detecta vectores de prompt injection o comando
 */
export function validateAndSanitizeText(text) {
  if (typeof text !== 'string') return { valid: false, reason: 'El valor debe ser una cadena de texto.' };
  const trimmed = text.trim();
  if (trimmed.length < 5) return { valid: false, reason: 'El contenido es demasiado corto (mínimo 5 caracteres).' };
  if (trimmed.length > 8000) return { valid: false, reason: 'El contenido excede la longitud máxima permitida (8000 caracteres).' };

  // Detección de patrones de prompt injection o comandos maliciosos
  const dangerousPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /disregard\s+(all\s+)?prior\s+context/i,
    /you\s+are\s+now\s+in\s+developer\s+mode/i,
    /system\s+override\s*:/i,
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /[;|`$><^\\]/, // caracteres de concatenación/redirección de shell
    /&&|\|\|/      // operadores lógicos de encadenamiento de shell
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: 'Contenido rechazado por detección de patrones no permitidos o caracteres de inyección.' };
    }
  }

  return { valid: true, clean: trimmed };
}

/**
 * Valida que la URL de origen sea una fuente HTTPS legítima
 */
export function validateSourceUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return { valid: false, reason: 'URL de origen obligatoria.' };
  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Solo se admiten fuentes seguras con protocolo HTTPS.' };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return { valid: false, reason: 'Las fuentes deben provenir de dominios web públicos verificables.' };
    }
    return { valid: true, cleanUrl: parsed.toString() };
  } catch (e) {
    return { valid: false, reason: 'Formato de URL inválido.' };
  }
}

/**
 * Registra una propuesta en la cola de cuarentena
 */
export function submitProposal(input, proposerAgent = 'Autonomous-Agent') {
  const proposals = loadJson(PROPOSALS_FILE, []);
  const library = loadJson(LIBRARY_FILE, []);

  // 1. Validar campos obligatorios
  if (!input.title || !input.summary || !input.agent_lesson || !input.source_url) {
    return {
      success: false,
      error: 'Campos requeridos incompletos. Se exige: title, summary, agent_lesson y source_url.'
    };
  }

  // 2. Sanitizar textos
  const titleCheck = validateAndSanitizeText(input.title);
  if (!titleCheck.valid) return { success: false, error: `Título inválido: ${titleCheck.reason}` };

  const summaryCheck = validateAndSanitizeText(input.summary);
  if (!summaryCheck.valid) return { success: false, error: `Resumen inválido: ${summaryCheck.reason}` };

  const lessonCheck = validateAndSanitizeText(input.agent_lesson);
  if (!lessonCheck.valid) return { success: false, error: `Lección técnica inválida: ${lessonCheck.reason}` };

  const urlCheck = validateSourceUrl(input.source_url);
  if (!urlCheck.valid) return { success: false, error: `Fuente inválida: ${urlCheck.reason}` };

  // 3. Verificación de no-duplicados contra la biblioteca existente
  const isDuplicateLib = library.some(item => 
    (item.original_url && item.original_url.toLowerCase() === urlCheck.cleanUrl.toLowerCase()) ||
    (item.title && item.title.toLowerCase() === titleCheck.clean.toLowerCase())
  );
  if (isDuplicateLib) {
    return { success: false, error: 'La lección ya existe en la biblioteca de ARKAIOS (duplicado detectado).' };
  }

  // 4. Verificación contra propuestas pendientes
  const isDuplicatePending = proposals.some(p => 
    p.status === 'PENDING_CONSENSUS' &&
    (p.data?.source_url?.toLowerCase() === urlCheck.cleanUrl.toLowerCase() ||
     p.data?.title?.toLowerCase() === titleCheck.clean.toLowerCase())
  );
  if (isDuplicatePending) {
    return { success: false, error: 'Ya existe una propuesta idéntica en cuarentena pendiente de consenso.' };
  }

  // 5. Crear registro de propuesta en cuarentena
  const proposalId = `prop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const newProposal = {
    proposal_id: proposalId,
    status: 'PENDING_CONSENSUS',
    proposer_agent: String(proposerAgent).trim() || 'Unknown-Agent',
    submitted_at: now,
    data: {
      title: titleCheck.clean,
      category: (input.category || 'Collective Intelligence').trim(),
      summary: summaryCheck.clean,
      agent_lesson: lessonCheck.clean,
      source_url: urlCheck.cleanUrl,
      technologies: Array.isArray(input.technologies) ? input.technologies.map(t => String(t).trim()).filter(Boolean) : [],
      skills_unlocked: Array.isArray(input.skills_unlocked) ? input.skills_unlocked.map(s => String(s).trim()).filter(Boolean) : [],
      tags: Array.isArray(input.tags) ? input.tags.map(t => String(t).trim()).filter(Boolean) : ['#CollectiveMemory']
    },
    audit_trail: [
      {
        timestamp: now,
        action: 'SUBMITTED_TO_QUARANTINE',
        agent: proposerAgent,
        status: 'PENDING_CONSENSUS'
      }
    ]
  };

  proposals.push(newProposal);
  saveJson(PROPOSALS_FILE, proposals);

  return {
    success: true,
    proposal_id: proposalId,
    status: 'PENDING_CONSENSUS',
    message: 'Propuesta registrada con éxito en la cola de cuarentena para auditoría multi-agente.'
  };
}

/**
 * Evalúa y audita una propuesta en cuarentena aplicando las 4 reglas de consenso
 */
export function auditProposal(proposalId, auditorAgent = 'ARKAIOS-Auditor-Agent', decision = 'APPROVE', notes = '') {
  const proposals = loadJson(PROPOSALS_FILE, []);
  const proposal = proposals.find(p => p.proposal_id === proposalId);

  if (!proposal) {
    return { success: false, error: `Propuesta ${proposalId} no encontrada en cuarentena.` };
  }

  if (proposal.status !== 'PENDING_CONSENSUS') {
    return { success: false, error: `La propuesta ya fue resuelta previamente con estado: ${proposal.status}.` };
  }

  const now = new Date().toISOString();
  const auditor = String(auditorAgent).trim() || 'ARKAIOS-Auditor-Agent';

  // Regla 1 de Gobernanza: Prohibición estricta de autoaprobación
  if (auditor.toLowerCase() === proposal.proposer_agent.toLowerCase()) {
    return {
      success: false,
      error: 'Violación de regla de consenso: El agente proponente no puede auditar ni aprobar su propia propuesta (Anti-Self-Approval).'
    };
  }

  // Si la decisión es rechazar
  if (decision === 'REJECT') {
    proposal.status = 'REJECTED';
    proposal.resolved_at = now;
    proposal.rejection_reason = notes || 'Rechazada por comité de auditoría multi-agente.';
    proposal.audit_trail.push({
      timestamp: now,
      action: 'REJECTED',
      agent: auditor,
      notes: proposal.rejection_reason
    });
    saveJson(PROPOSALS_FILE, proposals);
    return { success: true, status: 'REJECTED', proposal_id: proposalId, message: 'Propuesta rechazada y archivada.' };
  }

  // Evaluación de los 4 criterios estrictos de consenso para aprobación
  const data = proposal.data;
  const titleCheck = validateAndSanitizeText(data.title);
  const summaryCheck = validateAndSanitizeText(data.summary);
  const lessonCheck = validateAndSanitizeText(data.agent_lesson);
  const urlCheck = validateSourceUrl(data.source_url);

  if (!titleCheck.valid || !summaryCheck.valid || !lessonCheck.valid || !urlCheck.valid) {
    proposal.status = 'REJECTED';
    proposal.resolved_at = now;
    proposal.rejection_reason = 'Falló la verificación de seguridad o sanitización durante la auditoría.';
    proposal.audit_trail.push({
      timestamp: now,
      action: 'REJECTED_SECURITY_FAILURE',
      agent: auditor,
      notes: proposal.rejection_reason
    });
    saveJson(PROPOSALS_FILE, proposals);
    return { success: false, status: 'REJECTED', error: proposal.rejection_reason };
  }

  // Consenso Aprobado: Incorporar atómicamente a la biblioteca soberana
  const library = loadJson(LIBRARY_FILE, []);
  const newKbId = `kb-collab-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

  const newKnowledgeItem = {
    id: newKbId,
    title: data.title,
    category: data.category,
    platform: 'ARKAIOS Collective Memory (Multi-Agent Consensual)',
    original_url: data.source_url,
    canonical_url: data.source_url,
    github_repo: data.source_url.includes('github.com') ? data.source_url : null,
    website: null,
    technologies: data.technologies,
    skills_unlocked: data.skills_unlocked,
    summary: data.summary,
    agent_lesson: data.agent_lesson,
    tags: data.tags,
    external_resource: data.source_url,
    synced_at: now,
    governance: {
      proposal_id: proposalId,
      proposer_agent: proposal.proposer_agent,
      audited_by: auditor,
      approved_at: now
    }
  };

  // Preservación inmutable del recurso #1 ArtCraft en el índice 0
  const artcraftItem = library.find(item => item.id === 'kb-top-01-artcraft');
  const otherItems = library.filter(item => item.id !== 'kb-top-01-artcraft');

  const updatedLibrary = [
    artcraftItem || library[0],
    newKnowledgeItem,
    ...otherItems.filter(item => item !== library[0])
  ].filter(Boolean);

  saveJson(LIBRARY_FILE, updatedLibrary);

  // Actualizar registro en cuarentena
  proposal.status = 'APPROVED';
  proposal.resolved_at = now;
  proposal.promoted_kb_id = newKbId;
  proposal.audit_trail.push({
    timestamp: now,
    action: 'APPROVED_AND_PROMOTED',
    agent: auditor,
    promoted_kb_id: newKbId,
    notes: notes || 'Aprobada unánimemente por consenso multi-agente.'
  });
  saveJson(PROPOSALS_FILE, proposals);

  return {
    success: true,
    status: 'APPROVED',
    proposal_id: proposalId,
    promoted_kb_id: newKbId,
    total_library_items: updatedLibrary.length,
    message: `Lección incorporada exitosamente a la biblioteca soberana con ID ${newKbId}.`
  };
}

/**
 * Consulta propuestas en cuarentena
 */
export function getProposals(statusFilter = null) {
  const proposals = loadJson(PROPOSALS_FILE, []);
  if (!statusFilter) return proposals;
  return proposals.filter(p => p.status === statusFilter);
}
