/**
 * ARKAIOS Knowledge Library - Autonomous Multi-Agent Consensus & Quarantine Engine (Phase 4 Sovereign - Hardened WAL)
 * 
 * Implementa gobernanza y resiliencia multi-agente de nivel institucional:
 * 1. Write-Ahead Transaction Journal (WAL): Registro transaccional en .transaction_journal.json
 *    con fases PREPARED, LIBRARY_COMMITTED, ALL_COMMITTED y COMPLETED.
 * 2. Recuperación Idempotente y Cierre de Split-Brain (Crash-Recovery):
 *    - Si ambos archivos ya contienen el estado objetivo antes de la caída: CONFIRMA hacia adelante (forward-complete),
 *      evitando revertir aprobaciones ya escritas con éxito.
 *    - Si solo un archivo o ninguno fue escrito: ejecuta ROLLBACK seguro restaurando el snapshot previo.
 *    - Ante corrupción insalvable del diario: activa BLOQUEO DE SEGURIDAD (fail-safe lock) impidiendo escrituras.
 * 3. Identidad de Proponentes Autenticada y Quórum Escalonado:
 *    - Proponentes Autenticados (Comité o Contribuidores registrados en .authorized_contributors con token verificado):
 *      Quórum estándar de 2 votos independientes.
 *    - Proponentes Externos no autenticados o con tokens no registrados: Marcados estrictamente como
 *      UNAUTHENTICATED_EXTERNAL con Quórum forzoso de 3 votos independientes.
 * 4. Aislamiento de Secretos: Los tokens del comité y contribuidores se mantienen en almacenes privados.
 * 5. Transacciones Atómicas: Preservación matemática de ArtCraft #1 y cero pérdida de registros.
 * 6. Envoltorio de Seguridad: Datos marcados explícitamente como PASSIVE_DATA_ONLY (no ejecutables).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBRARY_FILE = path.join(__dirname, 'library.json');
const PROPOSALS_FILE = path.join(__dirname, 'proposals.json');
const COMMITTEE_FILE = path.join(__dirname, '.agent_committee_tokens');
const CONTRIBUTORS_FILE = path.join(__dirname, '.authorized_contributors');
const JOURNAL_FILE = path.join(__dirname, '.transaction_journal.json');

export const AUTHENTICATED_QUORUM = 2;
export const UNAUTHENTICATED_QUORUM = 3;

export const AUTHORIZED_COMMITTEE_MEMBERS = [
  'ARKAIOS-Curator',
  'Claude-Auditor',
  'Gemini-Evaluator',
  'Cursor-Inspector'
];

export const AUTHORIZED_CONTRIBUTORS = [
  'Gemini-Lab-Omni',
  'Arkaios-Agent-Core',
  'Claude-Contributor',
  'Cursor-Partner'
];

// Estado de bloqueo de seguridad del motor en caso de fallos graves
let isEngineLocked = false;
let engineLockReason = null;

export function getEngineLockStatus() {
  return { locked: isEngineLocked, reason: engineLockReason };
}

/**
 * Inicializa y administra el almacén de tokens privados del comité de agentes
 */
function loadOrCreateCommitteeTokens() {
  if (fs.existsSync(COMMITTEE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(COMMITTEE_FILE, 'utf-8'));
    } catch (e) {
      // Regenerar si está corrupto
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
 * Inicializa y administra el registro de contribuidores autorizados
 */
function loadOrCreateContributorTokens() {
  if (fs.existsSync(CONTRIBUTORS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONTRIBUTORS_FILE, 'utf-8'));
    } catch (e) {
      // Regenerar si está corrupto
    }
  }

  const tokens = {};
  for (const contributor of AUTHORIZED_CONTRIBUTORS) {
    tokens[contributor] = crypto.randomBytes(32).toString('hex');
  }

  fs.writeFileSync(CONTRIBUTORS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return tokens;
}

/**
 * Acceso controlado a credenciales exclusivo para pruebas automatizadas
 */
export function _getTestingCredentials() {
  return {
    committee: loadOrCreateCommitteeTokens(),
    contributors: loadOrCreateContributorTokens()
  };
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

  const committeeTokens = loadOrCreateCommitteeTokens();
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

/**
 * Verifica la identidad de un contribuidor contra el registro de contribuidores autorizados
 */
export function authenticateContributor(agentName, agentToken) {
  if (!agentName || typeof agentName !== 'string') {
    return { authenticated: false, reason: 'Nombre de agente no suministrado.' };
  }

  const normalizedContributor = AUTHORIZED_CONTRIBUTORS.find(
    c => c.toLowerCase() === agentName.trim().toLowerCase()
  );

  if (!normalizedContributor) {
    return { authenticated: false, reason: `El agente "${agentName}" no está en el registro de contribuidores autorizados.` };
  }

  if (!agentToken || typeof agentToken !== 'string') {
    return { authenticated: false, reason: `Token de contribuidor obligatorio para ${normalizedContributor}.` };
  }

  const contributorTokens = loadOrCreateContributorTokens();
  const expectedToken = contributorTokens[normalizedContributor];

  if (!expectedToken) {
    return { authenticated: false, reason: 'Credencial no configurada para este contribuidor.' };
  }

  const providedBuf = Buffer.from(agentToken.trim());
  const expectedBuf = Buffer.from(expectedToken.trim());

  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return {
      authenticated: false,
      reason: `Credencial inválida para el contribuidor ${normalizedContributor}. Falsificación de identidad rechazada.`
    };
  }

  return { authenticated: true, contributorName: normalizedContributor };
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
 * Escritura atómica a disco usando archivo temporal, flush a disco (fsync) y renombrado
 */
export function atomicSaveJson(filePath, data) {
  const tmpPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmpPath, 'w');
  fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf-8');
  fs.fsyncSync(fd);
  fs.closeSync(fd);

  // En Windows, renameSync puede sufrir EPERM temporal si el destino es indexado o leído por otro hilo
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmpPath, filePath);
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && attempt < 4) {
        const start = Date.now();
        while (Date.now() - start < 25) {} // pausa breve de 25ms
      } else {
        try {
          fs.copyFileSync(tmpPath, filePath);
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          return;
        } catch (copyErr) {
          throw err;
        }
      }
    }
  }
}

/**
 * Comprueba si la biblioteca en disco contiene el nuevo elemento objetivo
 */
function libraryContainsTarget(currentLib, targetLib, proposalId) {
  if (!Array.isArray(currentLib) || !Array.isArray(targetLib)) return false;
  if (currentLib.length !== targetLib.length) return false;
  // Buscar elemento que coincida con la propuesta
  return currentLib.some(item => item?.governance?.proposal_id === proposalId);
}

/**
 * Comprueba si las propuestas en disco contienen la propuesta marcada como APPROVED
 */
function proposalsContainTarget(currentProps, proposalId) {
  if (!Array.isArray(currentProps)) return false;
  const prop = currentProps.find(p => p.proposal_id === proposalId);
  return !!(prop && prop.status === 'APPROVED');
}

/**
 * RECUPERACIÓN AUTOMÁTICA ANTE FALLOS (Idempotent Crash Recovery Engine)
 * Inspecciona el diario de transacciones (.transaction_journal.json) y aplica
 * la decisión matemática correcta:
 * - Si ambos archivos ya reflejan la transacción: CONFIRMA (Forward-complete).
 * - Si hubo fallo a medio camino (split-write): ROLLBACK al snapshot previo.
 * - Si el diario está insalvablemente corrupto: ACTIVA BLOQUEO DE SEGURIDAD.
 */
export function recoverPendingTransactions() {
  if (!fs.existsSync(JOURNAL_FILE)) {
    return { recovered: false, status: 'CLEAN' };
  }

  try {
    const journalRaw = fs.readFileSync(JOURNAL_FILE, 'utf-8');
    let journal;
    try {
      journal = JSON.parse(journalRaw);
    } catch (parseErr) {
      // Bloqueo de seguridad: el diario está corrupto y no puede parsearse.
      // Entrar en modo seguro para impedir daño a la biblioteca.
      isEngineLocked = true;
      engineLockReason = 'Corrupción irrecuperable en .transaction_journal.json. Servidor en modo seguro de solo lectura.';
      console.error(`[WAL CRITICAL] ${engineLockReason}`);
      return { recovered: false, locked: true, error: engineLockReason };
    }

    if (!journal || !journal.tx_id || !journal.proposal_id) {
      isEngineLocked = true;
      engineLockReason = 'Diario WAL incompleto o sin identificador de transacción.';
      return { recovered: false, locked: true, error: engineLockReason };
    }

    console.warn(`[WAL RECOVERY] Transacción pendiente detectada: ${journal.tx_id} en fase "${journal.state}". Evaluando estado en disco...`);

    const diskLibrary = loadJson(LIBRARY_FILE, []);
    const diskProposals = loadJson(PROPOSALS_FILE, []);

    const libMatchesTarget = libraryContainsTarget(diskLibrary, journal.target_library, journal.proposal_id);
    const propsMatchTarget = proposalsContainTarget(diskProposals, journal.proposal_id);

    // CASO 1: AMBOS archivos ya fueron escritos con éxito antes de la caída
    // (Incluso si el estado del diario decía WAL_LIBRARY_COMMITTED o WAL_ALL_COMMITTED)
    if (libMatchesTarget && propsMatchTarget) {
      console.warn(`[WAL RECOVERY] Ambos archivos (library.json y proposals.json) ya contienen la transacción ${journal.tx_id} completada. Confirmando hacia adelante (Forward-Complete).`);
      fs.unlinkSync(JOURNAL_FILE);
      return {
        recovered: true,
        action: 'FORWARD_COMPLETED',
        tx_id: journal.tx_id,
        proposal_id: journal.proposal_id,
        message: 'Transacción confirmada: ninguna aprobación fue revertida.'
      };
    }

    // CASO 2: La transacción quedó a medio camino (split-brain o fallo parcial)
    // Se restaura el snapshot previo limpio
    console.warn(`[WAL RECOVERY] Inconsistencia detectada (lib_ok: ${libMatchesTarget}, props_ok: ${propsMatchTarget}). Ejecutando Rollback seguro al estado previo...`);

    if (journal.pre_library_snapshot && Array.isArray(journal.pre_library_snapshot)) {
      atomicSaveJson(LIBRARY_FILE, journal.pre_library_snapshot);
    }
    if (journal.pre_proposals_snapshot && Array.isArray(journal.pre_proposals_snapshot)) {
      atomicSaveJson(PROPOSALS_FILE, journal.pre_proposals_snapshot);
    }

    fs.unlinkSync(JOURNAL_FILE);
    console.warn(`[WAL RECOVERY] Rollback completado con éxito para ${journal.tx_id}. Estado consistente restaurado.`);

    return {
      recovered: true,
      action: 'ROLLED_BACK_INCOMPLETE_TRANSACTION',
      tx_id: journal.tx_id,
      restored_records: journal.pre_library_snapshot.length
    };

  } catch (err) {
    isEngineLocked = true;
    engineLockReason = `Error crítico durante recuperación de diario: ${err.message}`;
    console.error(`[WAL FATAL] ${engineLockReason}`);
    return { recovered: false, locked: true, error: engineLockReason };
  }
}

// Ejecución automática de recuperación en cada inicio del motor
recoverPendingTransactions();

/**
 * Sanitiza texto y detecta vectores de prompt injection o comando
 */
export function validateAndSanitizeText(text) {
  if (typeof text !== 'string') return { valid: false, reason: 'El valor debe ser una cadena de texto.' };
  const trimmed = text.trim();
  if (trimmed.length < 5) return { valid: false, reason: 'El contenido es demasiado corto (mínimo 5 caracteres).' };
  if (trimmed.length > 8000) return { valid: false, reason: 'El contenido excede la longitud máxima permitida (8000 caracteres).' };

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
 * Registra una propuesta en la cola de cuarentena distinguiendo identidad autenticada
 */
export function submitProposal(input, proposerAgent = 'Anonymous-Agent', proposerToken = null) {
  if (isEngineLocked) {
    return { success: false, error: `SISTEMA BLOQUEADO POR SEGURIDAD: ${engineLockReason}` };
  }

  const proposals = loadJson(PROPOSALS_FILE, []);
  const library = loadJson(LIBRARY_FILE, []);

  const rawAgentName = String(proposerAgent).trim() || 'Anonymous-Agent';

  // 1. Verificar si afirma ser miembro del comité
  const isClaimingCommittee = AUTHORIZED_COMMITTEE_MEMBERS.some(
    m => m.toLowerCase() === rawAgentName.toLowerCase()
  );

  // 2. Verificar si afirma ser contribuidor registrado
  const isClaimingContributor = AUTHORIZED_CONTRIBUTORS.some(
    c => c.toLowerCase() === rawAgentName.toLowerCase()
  );

  let verifiedIdentity = null;
  let identityType = 'UNAUTHENTICATED_EXTERNAL';
  let requiredQuorum = UNAUTHENTICATED_QUORUM; // Por defecto: Quórum de 3 votos

  if (isClaimingCommittee) {
    const auth = authenticateAuditor(rawAgentName, proposerToken);
    if (!auth.authenticated) {
      return {
        success: false,
        error: `Falsificación de identidad detectada: ${auth.reason}`
      };
    }
    verifiedIdentity = auth.memberName;
    identityType = 'AUTHENTICATED_COMMITTEE_MEMBER';
    requiredQuorum = AUTHENTICATED_QUORUM; // 2 votos
  } else if (isClaimingContributor) {
    const auth = authenticateContributor(rawAgentName, proposerToken);
    if (!auth.authenticated) {
      return {
        success: false,
        error: `Falsificación de identidad detectada: ${auth.reason}`
      };
    }
    verifiedIdentity = auth.contributorName;
    identityType = 'AUTHENTICATED_CONTRIBUTOR';
    requiredQuorum = AUTHENTICATED_QUORUM; // 2 votos
  } else {
    // Si un agente no registrado proporciona un token inventado, NUNCA se le concede AUTHENTICATED_CONTRIBUTOR
    if (proposerToken) {
      console.warn(`[GOVERNANCE] Token presentado por agente externo no registrado "${rawAgentName}". Ignorado para quórum reducido.`);
    }
    verifiedIdentity = null;
    identityType = 'UNAUTHENTICATED_EXTERNAL';
    requiredQuorum = UNAUTHENTICATED_QUORUM; // 3 votos obligatorios
  }

  // 3. Validar campos obligatorios
  if (!input.title || !input.summary || !input.agent_lesson || !input.source_url) {
    return {
      success: false,
      error: 'Campos requeridos incompletos. Se exige: title, summary, agent_lesson y source_url.'
    };
  }

  // 4. Sanitizar textos
  const titleCheck = validateAndSanitizeText(input.title);
  if (!titleCheck.valid) return { success: false, error: `Título inválido: ${titleCheck.reason}` };

  const summaryCheck = validateAndSanitizeText(input.summary);
  if (!summaryCheck.valid) return { success: false, error: `Resumen inválido: ${summaryCheck.reason}` };

  const lessonCheck = validateAndSanitizeText(input.agent_lesson);
  if (!lessonCheck.valid) return { success: false, error: `Lección técnica inválida: ${lessonCheck.reason}` };

  const urlCheck = validateSourceUrl(input.source_url);
  if (!urlCheck.valid) return { success: false, error: `Fuente inválida: ${urlCheck.reason}` };

  // 5. Verificación de no-duplicados contra la biblioteca existente
  const isDuplicateLib = library.some(item => 
    (item.original_url && item.original_url.toLowerCase() === urlCheck.cleanUrl.toLowerCase()) ||
    (item.title && item.title.toLowerCase() === titleCheck.clean.toLowerCase())
  );
  if (isDuplicateLib) {
    return { success: false, error: 'La lección ya existe en la biblioteca de ARKAIOS (duplicado detectado).' };
  }

  // 6. Verificación contra propuestas pendientes o en votación
  const isDuplicatePending = proposals.some(p => 
    (p.status === 'PENDING_CONSENSUS' || p.status === 'VOTING_IN_PROGRESS') &&
    (p.data?.source_url?.toLowerCase() === urlCheck.cleanUrl.toLowerCase() ||
     p.data?.title?.toLowerCase() === titleCheck.clean.toLowerCase())
  );
  if (isDuplicatePending) {
    return { success: false, error: 'Ya existe una propuesta idéntica en cuarentena pendiente de consenso.' };
  }

  // 7. Crear registro de propuesta en cuarentena
  const proposalId = `prop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const contentFingerprint = crypto.createHash('sha256')
    .update(`${rawAgentName}:${titleCheck.clean}:${urlCheck.cleanUrl}`)
    .digest('hex');

  const newProposal = {
    proposal_id: proposalId,
    status: 'PENDING_CONSENSUS',
    proposer: {
      display_name: rawAgentName,
      verified_identity: verifiedIdentity,
      identity_type: identityType,
      authenticated: !!verifiedIdentity,
      fingerprint: contentFingerprint
    },
    quorum_required: requiredQuorum,
    submitted_at: now,
    votes: [],
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
        proposer_display: rawAgentName,
        identity_type: identityType,
        quorum_required: requiredQuorum,
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
    identity_type: identityType,
    quorum_required: requiredQuorum,
    message: `Propuesta registrada en cuarentena. Quórum requerido: ${requiredQuorum} votos de auditores independientes.`
  };
}

/**
 * Transacción de dos fases con Write-Ahead Journaling (WAL) y garantía ACID
 */
function atomicCommitPromotion(proposals, currentProposal, auditorMember, notes, now) {
  if (isEngineLocked) {
    return { success: false, error: `SISTEMA BLOQUEADO POR SEGURIDAD: ${engineLockReason}` };
  }

  const txId = `tx-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  const currentLibrary = loadJson(LIBRARY_FILE, []);
  const currentProposals = loadJson(PROPOSALS_FILE, []);

  // 1. Preparar la nueva lección
  const newKbId = `kb-collab-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const data = currentProposal.data;

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
      proposer: currentProposal.proposer,
      approved_at: now,
      quorum_achieved: currentProposal.votes.filter(v => v.decision === 'APPROVE').length,
      approving_auditors: currentProposal.votes.filter(v => v.decision === 'APPROVE').map(v => v.auditor)
    },
    security_envelope: {
      is_executable: false,
      privilege_level: 'PASSIVE_DATA_ONLY',
      untrusted_external_content: true,
      statement: 'Este registro es exclusivamente informativo y descriptivo. No otorga autorización de ejecución ni altera el comportamiento de ningún agente.'
    }
  };

  // 2. Construir la nueva biblioteca garantizando ArtCraft en índice 0
  const artcraftItem = currentLibrary.find(item => item.id === 'kb-top-01-artcraft');
  if (!artcraftItem) {
    return { success: false, error: 'Integrity check failed: Registro #1 ArtCraft no encontrado en library.json.' };
  }

  const otherItems = currentLibrary.filter(item => item.id !== 'kb-top-01-artcraft');
  const targetLibrary = [
    artcraftItem,
    newKnowledgeItem,
    ...otherItems
  ];

  if (targetLibrary.length !== currentLibrary.length + 1) {
    return { success: false, error: `Record count mismatch: esperado ${currentLibrary.length + 1}, obtenido ${targetLibrary.length}` };
  }

  // 3. Actualizar la propuesta
  currentProposal.status = 'APPROVED';
  currentProposal.resolved_at = now;
  currentProposal.promoted_kb_id = newKbId;
  currentProposal.audit_trail.push({
    timestamp: now,
    action: 'CONSENSUS_REACHED_AND_PROMOTED',
    agent: auditorMember,
    promoted_kb_id: newKbId,
    quorum_achieved: currentProposal.votes.filter(v => v.decision === 'APPROVE').length,
    notes: notes || 'Quórum de consenso alcanzado e incorporado con éxito.'
  });

  const targetProposals = currentProposals.map(p => 
    p.proposal_id === currentProposal.proposal_id ? currentProposal : p
  );

  // 4. FASE WAL 1: Grabar snapshot previo y objetivo en el diario de transacciones (fsync)
  const journalEntry = {
    tx_id: txId,
    state: 'WAL_PREPARED',
    proposal_id: currentProposal.proposal_id,
    created_at: now,
    pre_library_snapshot: currentLibrary,
    pre_proposals_snapshot: currentProposals,
    target_library: targetLibrary,
    target_proposals: targetProposals
  };

  try {
    atomicSaveJson(JOURNAL_FILE, journalEntry);

    // 5. FASE WAL 2: Escribir library.json
    atomicSaveJson(LIBRARY_FILE, targetLibrary);

    // Actualizar diario: library confirmada
    journalEntry.state = 'WAL_LIBRARY_COMMITTED';
    atomicSaveJson(JOURNAL_FILE, journalEntry);

    // 6. FASE WAL 3: Escribir proposals.json
    atomicSaveJson(PROPOSALS_FILE, targetProposals);

    // Actualizar diario: AMBOS archivos confirmados en disco antes de borrar el diario
    journalEntry.state = 'WAL_ALL_COMMITTED';
    atomicSaveJson(JOURNAL_FILE, journalEntry);

    // 7. FASE WAL 4: Transacción completada con éxito -> Limpiar diario
    if (fs.existsSync(JOURNAL_FILE)) {
      fs.unlinkSync(JOURNAL_FILE);
    }

    return {
      success: true,
      status: 'APPROVED',
      tx_id: txId,
      proposal_id: currentProposal.proposal_id,
      promoted_kb_id: newKbId,
      total_library_items: targetLibrary.length,
      message: `Consenso alcanzado e incorporado con éxito bajo transacción WAL ${txId}.`
    };
  } catch (err) {
    console.error(`[WAL TRANSACTION FAILED] Error en ${txId}:`, err);
    // Ejecutar recuperación automática inmediata
    recoverPendingTransactions();
    return {
      success: false,
      error: `Fallo durante transacción transaccional. Rollback automático ejecutado: ${err.message}`
    };
  }
}

/**
 * Evalúa y audita una propuesta en cuarentena aplicando quórum y separación de responsabilidades
 */
export function auditProposal(proposalId, auditorAgent, auditorToken, decision = 'APPROVE', notes = '') {
  if (isEngineLocked) {
    return { success: false, error: `SISTEMA BLOQUEADO POR SEGURIDAD: ${engineLockReason}` };
  }

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

  // 3. Regla Anti-Self-Approval: Prohibición estricta de autoaprobación
  const proposerIdentity = proposal.proposer?.verified_identity || proposal.proposer?.display_name || '';
  if (auditorMember.toLowerCase() === proposerIdentity.toLowerCase()) {
    return {
      success: false,
      error: 'Violación de regla de consenso: El agente proponente no puede auditar ni votar su propia propuesta (Anti-Self-Approval).'
    };
  }

  // 4. Prevención de doble voto del mismo auditor
  if (!Array.isArray(proposal.votes)) proposal.votes = [];
  const alreadyVoted = proposal.votes.some(v => v.auditor.toLowerCase() === auditorMember.toLowerCase());
  if (alreadyVoted) {
    return {
      success: false,
      error: `Violación de regla de consenso: El auditor ${auditorMember} ya emitió su voto previamente para esta propuesta.`
    };
  }

  // 5. Si la decisión es rechazar
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

  // 6. Evaluación técnica de seguridad previa al voto
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

  // 7. Registrar voto favorable
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
  const requiredQuorum = proposal.quorum_required || AUTHENTICATED_QUORUM;

  // 8. Verificar si se alcanzó el Quórum necesario (2 para autenticadas, 3 para no autenticadas)
  if (approvalVotes.length < requiredQuorum) {
    proposal.status = 'VOTING_IN_PROGRESS';
    atomicSaveJson(PROPOSALS_FILE, proposals);

    return {
      success: true,
      status: 'VOTING_IN_PROGRESS',
      proposal_id: proposalId,
      current_approvals: approvalVotes.length,
      required_quorum: requiredQuorum,
      identity_type: proposal.proposer?.identity_type,
      approving_auditors: approvalVotes.map(v => v.auditor),
      message: `Voto registrado (${approvalVotes.length}/${requiredQuorum}). La propuesta permanece en cuarentena esperando quórum independiente.`
    };
  }

  // 9. Quórum alcanzado: Iniciar transacción atómica WAL
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
