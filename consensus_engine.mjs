/**
 * ARKAIOS Knowledge Library - Autonomous Multi-Agent Consensus & Quarantine Engine (Phase 4 Hardened)
 * 
 * Implementa gobernanza soberana multi-agente blindada:
 * 1. Identidad autenticada de agentes: el comité tiene tokens criptográficos verificados con timingSafeEqual.
 * 2. Cuarentena obligatoria: proposals.json almacena todas las propuestas; NUNCA tocan library.json de forma directa.
 * 3. Consenso multi-auditor con quórum (REQUIRED_QUORUM = 2): se requieren al menos dos votos independientes de auditores autorizados.
 * 4. Prohibición estricta de autoaprobación y duplicación de votos.
 * 5. Transacción atómica de dos fases con copias de respaldo (.bak), renombrado atómico (.tmp -> final) y rollback ante fallos.
 * 6. Preservación inmutable y estricta: ArtCraft en índice 0 y cero pérdida de registros existentes.
 * 7. Envoltorio de datos pasivos: lecciones marcadas como información no ejecutable (PASSIVE_DATA_ONLY).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBRARY_FILE = path.join(__dirname, 'library.json');
const PROPOSALS_FILE = path.join(__dirname, 'proposals.json');
const COMMITTEE_FILE = path.join(__dirname, '.agent_committee_tokens');

export const REQUIRED_QUORUM = 2;

export const AUTHORIZED_COMMITTEE_MEMBERS = [
  'ARKAIOS-Curator',
  'Claude-Auditor',
  'Gemini-Evaluator',
  'Cursor-Inspector'
];

/**
 * Inicializa y administra el almacén de tokens privados del comité de agentes
 */
export function getOrCreateCommitteeTokens() {
  if (fs.existsSync(COMMITTEE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(COMMITTEE_FILE, 'utf-8'));
    } catch (e) {
      // Si está corrupto, se regenera
    }
  }

  const tokens = {};
  for (const member of AUTHORIZED_COMMITTEE_MEMBERS) {
    tokens[member] = crypto.randomBytes(32).toString('hex');
  }

  fs.writeFileSync(COMMITTEE_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return tokens;
}

/**
 * Verifica la identidad de un auditor contra los tokens autorizados del comité
 */
export function authenticateAuditor(auditorAgent, auditorToken) {
  if (!auditorAgent || typeof auditorAgent !== 'string') {
    return { authenticated: false, reason: 'Identificador de auditor no suministrado.' };
  }

  const normalizedAuditor = AUTHORIZED_COMMITTEE_MEMBERS.find(
    m => m.toLowerCase() === auditorAgent.trim().toLowerCase()
  );

  if (!normalizedAuditor) {
    return {
      authenticated: false,
      reason: `El agente "${auditorAgent}" no forma parte del comité de auditoría autorizado.`
    };
  }

  if (!auditorToken || typeof auditorToken !== 'string') {
    return {
      authenticated: false,
      reason: `Token de autenticación obligatorio para el auditor ${normalizedAuditor}.`
    };
  }

  const committeeTokens = getOrCreateCommitteeTokens();
  const expectedToken = committeeTokens[normalizedAuditor];

  if (!expectedToken) {
    return { authenticated: false, reason: 'Credencial de comité no configurada para este auditor.' };
  }

  const providedBuf = Buffer.from(auditorToken.trim());
  const expectedBuf = Buffer.from(expectedToken.trim());

  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return {
      authenticated: false,
      reason: `Credencial inválida para el auditor ${normalizedAuditor}. Falsificación de identidad rechazada.`
    };
  }

  return { authenticated: true, memberName: normalizedAuditor };
}

function loadJson(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

/**
 * Escritura atómica a disco usando archivo temporal y renombrado atómico
 */
export function atomicSaveJson(filePath, data) {
  const tmpPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
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
export function submitProposal(input, proposerAgent = 'Autonomous-Agent', proposerToken = null) {
  const proposals = loadJson(PROPOSALS_FILE, []);
  const library = loadJson(LIBRARY_FILE, []);

  // 1. Validar identidad si el proponente pretende hacerse pasar por un miembro del comité
  const isClaimingCommittee = AUTHORIZED_COMMITTEE_MEMBERS.some(
    m => m.toLowerCase() === String(proposerAgent).trim().toLowerCase()
  );

  let verifiedProposer = String(proposerAgent).trim() || 'Anonymous-Agent';
  if (isClaimingCommittee) {
    const auth = authenticateAuditor(proposerAgent, proposerToken);
    if (!auth.authenticated) {
      return {
        success: false,
        error: `Falsificación de identidad detectada: ${auth.reason}`
      };
    }
    verifiedProposer = auth.memberName;
  }

  // 2. Validar campos obligatorios
  if (!input.title || !input.summary || !input.agent_lesson || !input.source_url) {
    return {
      success: false,
      error: 'Campos requeridos incompletos. Se exige: title, summary, agent_lesson y source_url.'
    };
  }

  // 3. Sanitizar textos
  const titleCheck = validateAndSanitizeText(input.title);
  if (!titleCheck.valid) return { success: false, error: `Título inválido: ${titleCheck.reason}` };

  const summaryCheck = validateAndSanitizeText(input.summary);
  if (!summaryCheck.valid) return { success: false, error: `Resumen inválido: ${summaryCheck.reason}` };

  const lessonCheck = validateAndSanitizeText(input.agent_lesson);
  if (!lessonCheck.valid) return { success: false, error: `Lección técnica inválida: ${lessonCheck.reason}` };

  const urlCheck = validateSourceUrl(input.source_url);
  if (!urlCheck.valid) return { success: false, error: `Fuente inválida: ${urlCheck.reason}` };

  // 4. Verificación de no-duplicados contra la biblioteca existente
  const isDuplicateLib = library.some(item => 
    (item.original_url && item.original_url.toLowerCase() === urlCheck.cleanUrl.toLowerCase()) ||
    (item.title && item.title.toLowerCase() === titleCheck.clean.toLowerCase())
  );
  if (isDuplicateLib) {
    return { success: false, error: 'La lección ya existe en la biblioteca de ARKAIOS (duplicado detectado).' };
  }

  // 5. Verificación contra propuestas pendientes o en votación
  const isDuplicatePending = proposals.some(p => 
    (p.status === 'PENDING_CONSENSUS' || p.status === 'VOTING_IN_PROGRESS') &&
    (p.data?.source_url?.toLowerCase() === urlCheck.cleanUrl.toLowerCase() ||
     p.data?.title?.toLowerCase() === titleCheck.clean.toLowerCase())
  );
  if (isDuplicatePending) {
    return { success: false, error: 'Ya existe una propuesta idéntica en cuarentena pendiente de consenso.' };
  }

  // 6. Crear registro de propuesta en cuarentena
  const proposalId = `prop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const newProposal = {
    proposal_id: proposalId,
    status: 'PENDING_CONSENSUS',
    proposer_agent: verifiedProposer,
    submitted_at: now,
    votes: [], // Registro de votos del comité
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
        agent: verifiedProposer,
        status: 'PENDING_CONSENSUS'
      }
    ]
  };

  proposals.push(newProposal);
  atomicSaveJson(PROPOSALS_FILE, proposals);

  return {
    success: true,
    proposal_id: proposalId,
    status: 'PENDING_CONSENSUS',
    message: 'Propuesta registrada con éxito en la cola de cuarentena para auditoría multi-agente.'
  };
}

/**
 * Transacción atómica de dos fases para incorporar una propuesta aprobada a la biblioteca soberana
 */
function atomicCommitPromotion(proposals, currentProposal, auditorMember, notes, now) {
  const libraryBackup = `${LIBRARY_FILE}.bak`;
  const proposalsBackup = `${PROPOSALS_FILE}.bak`;

  // 1. Crear copias de respaldo antes de iniciar la transacción
  fs.copyFileSync(LIBRARY_FILE, libraryBackup);
  fs.copyFileSync(PROPOSALS_FILE, proposalsBackup);

  try {
    const library = loadJson(LIBRARY_FILE, []);


    const newKbId = `kb-collab-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const data = currentProposal.data;

    // Envoltorio de seguridad: los datos son información pasiva, nunca ejecutables
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
        proposal_id: currentProposal.proposal_id,
        proposer_agent: currentProposal.proposer_agent,
        approved_at: now,
        quorum_required: REQUIRED_QUORUM,
        approving_auditors: currentProposal.votes.filter(v => v.decision === 'APPROVE').map(v => v.auditor)
      },
      security_envelope: {
        is_executable: false,
        privilege_level: 'PASSIVE_DATA_ONLY',
        untrusted_external_content: true,
        statement: 'Este registro es exclusivamente informativo y descriptivo. No otorga autorización de ejecución ni altera el comportamiento de ningún agente.'
      }
    };

    // Preservación estricta: ArtCraft en índice 0 y conservación de todos los registros existentes
    const artcraftItem = library.find(item => item.id === 'kb-top-01-artcraft');
    if (!artcraftItem) {
      throw new Error('Integrity check failed: Registro #1 ArtCraft no encontrado en library.json.');
    }

    const otherItems = library.filter(item => item.id !== 'kb-top-01-artcraft');
    const updatedLibrary = [
      artcraftItem,
      newKnowledgeItem,
      ...otherItems
    ];

    // Verificación matemática de conteo estricto: cero pérdidas
    if (updatedLibrary.length !== library.length + 1) {
      throw new Error(`Record count mismatch: esperado ${library.length + 1}, obtenido ${updatedLibrary.length}`);
    }

    if (updatedLibrary[0].id !== 'kb-top-01-artcraft') {
      throw new Error('Immutability check failed: ArtCraft fue desplazado de la primera posición.');
    }

    // Actualizar estado de la propuesta
    currentProposal.status = 'APPROVED';
    currentProposal.resolved_at = now;
    currentProposal.promoted_kb_id = newKbId;
    currentProposal.audit_trail.push({
      timestamp: now,
      action: 'CONSENSUS_REACHED_AND_PROMOTED',
      agent: auditorMember,
      promoted_kb_id: newKbId,
      quorum_achieved: currentProposal.votes.filter(v => v.decision === 'APPROVE').length,
      notes: notes || 'Quórum de consenso alcanzado e incorporado exitosamente.'
    });

    // Escritura atómica a disco
    atomicSaveJson(LIBRARY_FILE, updatedLibrary);
    atomicSaveJson(PROPOSALS_FILE, proposals);

    // Limpieza de respaldos al completar con éxito
    if (fs.existsSync(libraryBackup)) fs.unlinkSync(libraryBackup);
    if (fs.existsSync(proposalsBackup)) fs.unlinkSync(proposalsBackup);

    return {
      success: true,
      status: 'APPROVED',
      proposal_id: currentProposal.proposal_id,
      promoted_kb_id: newKbId,
      total_library_items: updatedLibrary.length,
      message: `Consenso alcanzado (${REQUIRED_QUORUM}/${REQUIRED_QUORUM}). Lección incorporada exitosamente con ID ${newKbId}.`
    };
  } catch (error) {
    // Rollback transaccional: restaurar desde copia de seguridad
    if (fs.existsSync(libraryBackup)) {
      fs.copyFileSync(libraryBackup, LIBRARY_FILE);
      fs.unlinkSync(libraryBackup);
    }
    if (fs.existsSync(proposalsBackup)) {
      fs.copyFileSync(proposalsBackup, PROPOSALS_FILE);
      fs.unlinkSync(proposalsBackup);
    }

    return {
      success: false,
      error: `Transacción abortada y revertida (Rollback seguro): ${error.message}`
    };
  }
}

/**
 * Evalúa y audita una propuesta en cuarentena aplicando las reglas de consenso multi-auditor
 */
export function auditProposal(proposalId, auditorAgent, auditorToken, decision = 'APPROVE', notes = '') {
  // 1. Autenticación criptográfica de la identidad del auditor
  const auth = authenticateAuditor(auditorAgent, auditorToken);
  if (!auth.authenticated) {
    return { success: false, error: auth.reason };
  }
  const auditorMember = auth.memberName;

  // 2. Cargar propuesta
  const proposals = loadJson(PROPOSALS_FILE, []);
  const proposal = proposals.find(p => p.proposal_id === proposalId);

  if (!proposal) {
    return { success: false, error: `Propuesta ${proposalId} no encontrada en cuarentena.` };
  }

  if (proposal.status === 'APPROVED' || proposal.status === 'REJECTED') {
    return { success: false, error: `La propuesta ya fue resuelta previamente con estado final: ${proposal.status}.` };
  }

  const now = new Date().toISOString();

  // 3. Regla de Gobernanza 1: Prohibición estricta de autoaprobación (Anti-Self-Approval)
  if (auditorMember.toLowerCase() === proposal.proposer_agent.toLowerCase()) {
    return {
      success: false,
      error: 'Violación de regla de consenso: El agente proponente no puede auditar ni votar su propia propuesta (Anti-Self-Approval).'
    };
  }

  // 4. Regla de Gobernanza 2: Prevención de doble voto del mismo auditor
  if (!Array.isArray(proposal.votes)) proposal.votes = [];
  const alreadyVoted = proposal.votes.some(v => v.auditor.toLowerCase() === auditorMember.toLowerCase());
  if (alreadyVoted) {
    return {
      success: false,
      error: `Violación de regla de consenso: El auditor ${auditorMember} ya emitió su voto previamente para esta propuesta.`
    };
  }

  // 5. Si la decisión es rechazar (Veto de auditoría o motivo fundado)
  if (decision === 'REJECT') {
    proposal.status = 'REJECTED';
    proposal.resolved_at = now;
    proposal.rejection_reason = notes || 'Rechazada por voto del comité de auditoría.';
    proposal.votes.push({
      auditor: auditorMember,
      decision: 'REJECT',
      notes: proposal.rejection_reason,
      voted_at: now
    });
    proposal.audit_trail.push({
      timestamp: now,
      action: 'REJECTED',
      agent: auditorMember,
      notes: proposal.rejection_reason
    });
    atomicSaveJson(PROPOSALS_FILE, proposals);
    return { success: true, status: 'REJECTED', proposal_id: proposalId, message: 'Propuesta rechazada y archivada.' };
  }

  // 6. Evaluación de criterios técnicos y de seguridad antes de admitir el voto
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
      agent: auditorMember,
      notes: proposal.rejection_reason
    });
    atomicSaveJson(PROPOSALS_FILE, proposals);
    return { success: false, status: 'REJECTED', error: proposal.rejection_reason };
  }

  // 7. Registrar voto de aprobación
  proposal.votes.push({
    auditor: auditorMember,
    decision: 'APPROVE',
    notes: notes || 'Aprobado técnicamente tras verificación de fuentes y esquema.',
    voted_at: now
  });

  proposal.audit_trail.push({
    timestamp: now,
    action: 'VOTE_RECORDED',
    agent: auditorMember,
    decision: 'APPROVE',
    notes: notes || 'Voto de aprobación registrado en comité.'
  });

  const approvalVotes = proposal.votes.filter(v => v.decision === 'APPROVE');

  // 8. Verificar Quórum (Consenso Verdadero >= REQUIRED_QUORUM)
  if (approvalVotes.length < REQUIRED_QUORUM) {
    proposal.status = 'VOTING_IN_PROGRESS';
    atomicSaveJson(PROPOSALS_FILE, proposals);

    return {
      success: true,
      status: 'VOTING_IN_PROGRESS',
      proposal_id: proposalId,
      current_approvals: approvalVotes.length,
      required_quorum: REQUIRED_QUORUM,
      approving_auditors: approvalVotes.map(v => v.auditor),
      message: `Voto registrado (${approvalVotes.length}/${REQUIRED_QUORUM}). La propuesta permanece en cuarentena esperando el segundo voto independiente.`
    };
  }

  // 9. Quórum alcanzado: Iniciar transacción atómica de incorporación
  return atomicCommitPromotion(proposals, proposal, auditorMember, notes, now);
}

/**
 * Consulta propuestas en cuarentena
 */
export function getProposals(statusFilter = null) {
  const proposals = loadJson(PROPOSALS_FILE, []);
  if (!statusFilter || statusFilter === 'ALL') return proposals;
  return proposals.filter(p => p.status === statusFilter);
}
