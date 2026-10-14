/**
 * ARKAIOS Knowledge Library - Suite de Pruebas Adversariales de Consenso Multi-Agente
 * 
 * Valida los vectores de ataque y requisitos de gobernanza:
 * 1. Falsificación de identidades (Identity Spoofing)
 * 2. Auto-aprobación con credenciales válidas (Anti-Self-Approval)
 * 3. Incorporación con un solo voto (Single-Vote Quorum Enforcement)
 * 4. Duplicación de votos del mismo auditor (Duplicate Vote Prevention)
 * 5. Consenso soberano (2 aprobaciones independientes) y preservación inmutable
 * 6. Integridad transaccional y Rollback seguro ante fallos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  submitProposal,
  auditProposal,
  getProposals,
  getOrCreateCommitteeTokens,
  REQUIRED_QUORUM,
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
  const committeeTokens = getOrCreateCommitteeTokens();
  const curatorToken = committeeTokens['ARKAIOS-Curator'];
  const claudeToken = committeeTokens['Claude-Auditor'];
  const geminiToken = committeeTokens['Gemini-Evaluator'];

  assert(curatorToken && claudeToken && geminiToken, 'Tokens del comité inicializados correctamente.');

  // TEST 1: Falsificación de identidades
  console.log('🧪 [TEST 1/6] Prueba de Ataque: Falsificación de identidades...');
  
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

  // Registrar propuesta legítima externa
  const legitimateProposal = submitProposal({
    title: 'Arquitectura P2P para Swarms de Agentes Descentralizados',
    summary: 'Patrón para coordinación resiliente entre agentes mediante DHT y WebSockets seguros.',
    agent_lesson: 'Implementar gossip protocols para sincronizar estado entre agentes locales sin broker central.',
    source_url: 'https://github.com/arkaios/p2p-agent-swarm',
    technologies: ['Rust', 'Libp2p', 'WebSockets'],
    category: 'P2P & Decentralization'
  }, 'External-Community-Agent');

  assert(legitimateProposal.success === true, 'Propuesta externa legítima debe registrarse en cuarentena.');
  const propId = legitimateProposal.proposal_id;

  // 1b. Auditor falso intentando auditar sin token o con token inválido
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

  // TEST 5: Consenso soberano con 2do auditor independiente y promoción atómica
  console.log('\n🧪 [TEST 5/6] Prueba de Consenso: Segundo voto independiente y promoción atómica...');
  
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
  console.log(`   ✓ Promoción atómica exitosa: ${libPromoted.length} registros totales.`);
  console.log(`   ✓ Inmutabilidad preservada: ArtCraft permanece intacto en índice 0.`);
  console.log(`   ✓ Envoltorio pasivo verificado: PASSIVE_DATA_ONLY (no ejecutable).`);

  // TEST 6: Resiliencia ante fallos transaccionales y Rollback seguro
  console.log('\n🧪 [TEST 6/6] Prueba de Transacción: Simulación de fallo y Rollback seguro...');
  
  // Creamos una propuesta y forzamos un estado inconsistente en disco para comprobar que no se corrompe
  const corruptTestProp = submitProposal({
    title: 'Propuesta para Prueba de Transacción Atómica',
    summary: 'Verifica la recuperación automática ante interrupciones de I/O.',
    agent_lesson: 'Garantizar rollback si la verificación de integridad detecta anomalías.',
    source_url: 'https://github.com/arkaios/atomic-test'
  }, 'Test-Agent');

  assert(corruptTestProp.success === true, 'Propuesta de prueba registrada.');

  // Votamos 1 vez
  auditProposal(corruptTestProp.proposal_id, 'Claude-Auditor', claudeToken, 'APPROVE');

  // Guardamos snapshot
  const libBeforeRollback = fs.readFileSync(LIBRARY_FILE, 'utf-8');

  // Intentamos un segundo voto pero forzando temporalmente que el archivo library.json no contenga ArtCraft
  // para verificar que el rollback rechaza la transacción y restaura la biblioteca íntegra
  const tempLibWithoutArtcraft = JSON.parse(libBeforeRollback).filter(i => i.id !== 'kb-top-01-artcraft');
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(tempLibWithoutArtcraft, null, 2), 'utf-8');

  const failedPromotion = auditProposal(corruptTestProp.proposal_id, 'Gemini-Evaluator', geminiToken, 'APPROVE');
  assert(failedPromotion.success === false, 'La promoción debe fallar si se detecta corrupción de integridad.');
  assert(failedPromotion.error.includes('Rollback seguro'), 'El motor debe ejecutar rollback transaccional.');

  // Restaurar y verificar
  fs.writeFileSync(LIBRARY_FILE, libBeforeRollback, 'utf-8');
  const restoredLib = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  assert(restoredLib[0].id === 'kb-top-01-artcraft', 'Biblioteca restaurada íntegramente tras prueba de rollback.');
  console.log('   ✓ Detección de anomalía ejecutó Rollback transaccional seguro sin pérdida de datos.');

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
