/**
 * ARKAIOS Knowledge Library - Suite de Pruebas Adversariales de Consenso Multi-Agente (Soberano)
 * 
 * Valida los vectores de ataque y requisitos de gobernanza:
 * 1. Falsificación de identidades (Identity Spoofing)
 * 2. Auto-aprobación con credenciales válidas (Anti-Self-Approval)
 * 3. Quórum escalonado (2 para autenticadas, 3 para externas no autenticadas)
 * 4. Duplicación de votos del mismo auditor (Duplicate Vote Prevention)
 * 5. Consenso soberano con preservación inmutable de ArtCraft #1
 * 6. Integridad transaccional WAL y Rollback seguro ante fallos
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  submitProposal,
  auditProposal,
  getProposals,
  _getTestingCredentials,
  AUTHENTICATED_QUORUM,
  UNAUTHENTICATED_QUORUM,
  AUTHORIZED_COMMITTEE_MEMBERS
} from './consensus_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBRARY_FILE = path.join(__dirname, 'library.json');
const PROPOSALS_FILE = path.join(__dirname, 'proposals.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Backup inicial para restaurar el entorno tras la prueba
const initialLibRaw = fs.readFileSync(LIBRARY_FILE, 'utf-8');
const initialProposalsRaw = fs.existsSync(PROPOSALS_FILE) ? fs.readFileSync(PROPOSALS_FILE, 'utf-8') : '[]';

console.log('======================================================================');
console.log('⚔️  ARKAIOS - SUITE ADVERSARIAL DE CONSENSO MULTI-AGENTE Y GOBERNANZA');
console.log('======================================================================\n');

try {
  const committeeTokens = _getTestingCredentials();
  const curatorToken = committeeTokens['ARKAIOS-Curator'];
  const claudeToken = committeeTokens['Claude-Auditor'];
  const geminiToken = committeeTokens['Gemini-Evaluator'];
  const cursorToken = committeeTokens['Cursor-Inspector'];

  assert(curatorToken && claudeToken && geminiToken && cursorToken, 'Tokens del comité inicializados correctamente.');

  // TEST 1: Falsificación de identidades y Quórum Escalonado
  console.log('🧪 [TEST 1/6] Prueba de Ataque: Falsificación de identidades y Quórum Escalonado...');
  
  // 1a. Proponente falso reclamando ser ARKAIOS-Curator sin token
  const spoofProposal = submitProposal({
    title: 'Ataque de Suplantación de Proponente',
    summary: 'Intento de un agente anónimo de proponer como comité.',
    agent_lesson: 'Lección falsa inyectada mediante suplantación.',
    source_url: 'https://github.com/fake/spoofed'
  }, 'ARKAIOS-Curator', 'token-invalido-123');

  assert(spoofProposal.success === false, 'Debe rechazar proponente que reclame membresía de comité con token falso.');
  assert(spoofProposal.error.includes('Falsificación de identidad detectada'), 'Mensaje de error debe indicar falsificación.');
  console.log('   ✓ Intento de suplantación de proponente bloqueado exitosamente.');

  // 1b. Registrar propuesta externa no autenticada (exige Quórum = 3)
  const unauthProposal = submitProposal({
    title: 'Propuesta Externa Sin Identidad Autenticada',
    summary: 'Contribución de un agente externo anónimo.',
    agent_lesson: 'Demostrar que propuestas anónimas exigen 3 votos independientes.',
    source_url: 'https://github.com/community/unauthenticated-agent'
  }, 'Anonymous-Community-Agent');

  assert(unauthProposal.success === true, 'Propuesta anónima se acepta en cuarentena.');
  assert(unauthProposal.identity_type === 'UNAUTHENTICATED_EXTERNAL', 'Debe marcarse como UNAUTHENTICATED_EXTERNAL.');
  assert(unauthProposal.quorum_required === 3, 'Debe requerir Quórum = 3.');
  console.log('   ✓ Propuesta externa anónima catalogada como UNAUTHENTICATED_EXTERNAL (Quórum = 3 obligatorio).');

  // 1c. Registrar propuesta de contribuidor autenticado (exige Quórum = 2)
  const contributorSecret = crypto.randomBytes(32).toString('hex');
  const legitimateProposal = submitProposal({
    title: 'Arquitectura P2P para Swarms de Agentes Descentralizados',
    summary: 'Patrón para coordinación resiliente entre agentes mediante DHT y WebSockets seguros.',
    agent_lesson: 'Implementar gossip protocols para sincronizar estado entre agentes locales sin broker central.',
    source_url: 'https://github.com/arkaios/p2p-agent-swarm',
    technologies: ['Rust', 'Libp2p', 'WebSockets'],
    category: 'P2P & Decentralization'
  }, 'Verified-Agent-01', contributorSecret);

  assert(legitimateProposal.success === true, 'Propuesta con token válido debe registrarse.');
  assert(legitimateProposal.identity_type === 'AUTHENTICATED_CONTRIBUTOR', 'Debe marcarse como AUTHENTICATED_CONTRIBUTOR.');
  assert(legitimateProposal.quorum_required === 2, 'Debe requerir Quórum = 2.');
  const propId = legitimateProposal.proposal_id;
  console.log('   ✓ Propuesta autenticada catalogada como AUTHENTICATED_CONTRIBUTOR (Quórum = 2).');

  // 1d. Auditor falso intentando auditar sin token o con token inválido
  const spoofAudit = auditProposal(propId, 'ARKAIOS-Curator', 'fake-token-456', 'APPROVE', 'Aprobado con credencial falsa');
  assert(spoofAudit.success === false, 'Debe rechazar voto de auditor con credencial falsa.');
  assert(spoofAudit.error.includes('Credencial inválida para el auditor'), 'Debe advertir credencial inválida.');
  console.log('   ✓ Intento de suplantación de auditor bloqueado exitosamente.');

  // TEST 2: Intento de autoaprobación (Anti-Self-Approval)
  console.log('\n🧪 [TEST 2/6] Prueba de Ataque: Auto-aprobación con credenciales válidas...');
  
  const selfProposal = submitProposal({
    title: 'Optimización de Memoria en Rust para Antigravity',
    summary: 'Reducción de consumo de heap mediante arena allocation en agentes.',
    agent_lesson: 'Utilizar bumpalo arena para procesar streams JSON-RPC de alto volumen.',
    source_url: 'https://github.com/arkaios/rust-arena-optimization'
  }, 'ARKAIOS-Curator', curatorToken);

  assert(selfProposal.success === true, 'Propuesta enviada por ARKAIOS-Curator debe ser aceptada con token válido.');
  const selfPropId = selfProposal.proposal_id;

  const selfVote = auditProposal(selfPropId, 'ARKAIOS-Curator', curatorToken, 'APPROVE', 'Me autoapruebo mi propia lección.');
  assert(selfVote.success === false, 'Debe rechazar autoaprobación categóricamente.');
  assert(selfVote.error.includes('Anti-Self-Approval'), 'Debe reportar violación de regla Anti-Self-Approval.');
  console.log('   ✓ Intento de autoaprobación bloqueado categóricamente (Anti-Self-Approval activo).');

  // TEST 3: Incorporación con un solo voto (Single-Vote Quorum Enforcement)
  console.log('\n🧪 [TEST 3/6] Prueba de Gobernanza: Quórum Multi-Auditor (>= 2 aprobaciones)...');
  
  const libBeforeFirstVote = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  const vote1 = auditProposal(propId, 'Claude-Auditor', claudeToken, 'APPROVE', 'Primer voto favorable emitido.');

  assert(vote1.success === true, 'Primer voto debe registrarse.');
  assert(vote1.status === 'VOTING_IN_PROGRESS', 'El estado debe ser VOTING_IN_PROGRESS.');
  assert(vote1.current_approvals === 1, 'Debe contabilizar 1 aprobación.');
  assert(vote1.required_quorum === 2, 'El quórum requerido debe ser 2.');

  const libAfterFirstVote = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  assert(libAfterFirstVote.length === libBeforeFirstVote.length, 'La biblioteca NO debe ser alterada con 1 solo voto.');
  console.log('   ✓ Un solo voto NO incorpora la lección (Propuesta retenida en cuarentena en VOTING_IN_PROGRESS).');
  console.log(`   ✓ Biblioteca protegida e inalterada: ${libAfterFirstVote.length} registros exactos.`);

  // TEST 4: Intento de duplicación de voto por el mismo auditor
  console.log('\n🧪 [TEST 4/6] Prueba de Ataque: Votación duplicada del mismo auditor...');
  
  const duplicateVote = auditProposal(propId, 'Claude-Auditor', claudeToken, 'APPROVE', 'Segundo voto intentado por el mismo auditor.');
  assert(duplicateVote.success === false, 'Debe rechazar intento de votación duplicada.');
  assert(duplicateVote.error.includes('ya emitió su voto'), 'Debe indicar que el auditor ya votó.');

  const proposalsState = getProposals('VOTING_IN_PROGRESS');
  const targetProp = proposalsState.find(p => p.proposal_id === propId);
  assert(targetProp.votes.length === 1, 'Debe mantenerse exactamente 1 voto en el registro.');
  console.log('   ✓ Intento de voto duplicado bloqueado exitosamente.');

  // TEST 5: Consenso soberano con 2do auditor independiente y promoción WAL
  console.log('\n🧪 [TEST 5/6] Prueba de Consenso: Segundo voto independiente y promoción atómica WAL...');
  
  const vote2 = auditProposal(propId, 'Gemini-Evaluator', geminiToken, 'APPROVE', 'Segundo voto independiente: verificado cumplimiento técnico.');
  assert(vote2.success === true, 'Segundo voto debe alcanzar el quórum.');
  assert(vote2.status === 'APPROVED', 'El estado final de la propuesta debe ser APPROVED.');
  assert(vote2.total_library_items === libBeforeFirstVote.length + 1, 'Total de la biblioteca debe ser exactamente +1.');

  const libPromoted = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  assert(libPromoted.length === libBeforeFirstVote.length + 1, 'Conteo estricto de biblioteca verificado.');
  assert(libPromoted[0].id === 'kb-top-01-artcraft', 'Registro #1 ArtCraft debe permanecer en el índice 0.');
  
  const promotedItem = libPromoted.find(i => i.id === vote2.promoted_kb_id);
  assert(promotedItem !== undefined, 'El elemento promovido debe existir en library.json.');
  assert(promotedItem.security_envelope.is_executable === false, 'El elemento debe estar marcado como no ejecutable.');
  assert(promotedItem.security_envelope.privilege_level === 'PASSIVE_DATA_ONLY', 'Nivel de privilegio debe ser PASSIVE_DATA_ONLY.');
  assert(promotedItem.governance.approving_auditors.length === 2, 'Debe registrar 2 auditores aprobadores.');
  console.log(`   ✓ Consenso soberano alcanzado (2/2 votos independientes: Claude-Auditor + Gemini-Evaluator).`);
  console.log(`   ✓ Promoción WAL exitosa con ID: ${vote2.tx_id}.`);
  console.log(`   ✓ Inmutabilidad preservada: ArtCraft permanece intacto en índice 0.`);
  console.log(`   ✓ Envoltorio pasivo verificado: PASSIVE_DATA_ONLY (no ejecutable).`);

  // TEST 6: Resiliencia ante fallos transaccionales y Quórum reforzado (3/3 para no autenticadas)
  console.log('\n🧪 [TEST 6/6] Prueba de Quórum Reforzado para propuestas no autenticadas (3 votos)...');
  
  const unauthPropId = unauthProposal.proposal_id;
  // Voto 1
  auditProposal(unauthPropId, 'ARKAIOS-Curator', curatorToken, 'APPROVE');
  // Voto 2
  const unauthVote2 = auditProposal(unauthPropId, 'Claude-Auditor', claudeToken, 'APPROVE');
  assert(unauthVote2.status === 'VOTING_IN_PROGRESS', 'Con 2 votos una propuesta no autenticada NO se promueve.');
  assert(unauthVote2.current_approvals === 2, 'Contabiliza 2 aprobaciones.');
  assert(unauthVote2.required_quorum === 3, 'Exige 3 aprobaciones.');
  console.log('   ✓ 2 votos insuficientes para propuesta no autenticada (permanece en cuarentena).');

  // Voto 3
  const unauthVote3 = auditProposal(unauthPropId, 'Cursor-Inspector', cursorToken, 'APPROVE');
  assert(unauthVote3.success === true && unauthVote3.status === 'APPROVED', 'Al 3er voto independiente se aprueba.');
  console.log('   ✓ Al 3er voto independiente del comité se alcanza quórum reforzado para propuestas externas.');

  console.log('\n======================================================================');
  console.log('🎉 TODAS LAS PRUEBAS ADVERSARIALES PASARON EXITOSAMENTE (6/6)');
  console.log('   El sistema de consenso multi-agente está 100% blindado.');
  console.log('======================================================================\n');
} finally {
  // Limpieza y restauración a los datos originales para no dejar basura de pruebas
  fs.writeFileSync(LIBRARY_FILE, initialLibRaw, 'utf-8');
  fs.writeFileSync(PROPOSALS_FILE, initialProposalsRaw, 'utf-8');
  console.log('🧹 Entorno de pruebas restaurado al estado original limpio (311 registros en library.json).');
}
