/**
 * ARKAIOS Knowledge Library - Suite Avanzada de Recuperación WAL ante Caídas Catastróficas
 * 
 * Certifica matemáticamente las propiedades ACID y el comportamiento ante caídas:
 * 
 * ESCENARIO 1 (Split-Brain / Fallo Parcial):
 * - library.json se escribió (312 registros), pero proposals.json NO se actualizó antes del corte.
 * - Resultado exigido: Rollback automático al estado previo limpio (311 registros) en el arranque.
 * 
 * ESCENARIO 2 (Fallo Tras Escritura Completa / Defecto 2 de ChatGPT):
 * - Ambos archivos (library.json y proposals.json) se escribieron con éxito, y coinciden al 100%
 *   con los hashes SHA-256 objetivo registrados en el diario.
 * - Resultado exigido: NO debe revertir la aprobación. Ejecuta Forward-Complete confirmando
 *   la transacción y limpiando el diario.
 * 
 * ESCENARIO 3 (Modificación Ajena a la Transacción / Hash SHA-256 Mismatch):
 * - library.json tiene la cantidad esperada de registros y el proposal_id correcto, pero un registro
 *   ajeno fue alterado en su contenido.
 * - Resultado exigido: El hash SHA-256 detecta la discrepancia, rechaza Forward-Complete y
 *   ejecuta Rollback seguro al snapshot previo.
 * 
 * ESCENARIO 4 (Corrupción Irrecuperable del Diario / Fail-Safe Lock):
 * - El diario se corrompe físicamente con datos basura no parseables.
 * - Resultado exigido: El motor activa Bloqueo de Seguridad (fail-safe lock), impidiendo escrituras.
 * 
 * ESCENARIO 5 (Atomicidad Pura sin Degradación):
 * - Se comprueba que atomicSaveJson() nunca realiza copyFileSync() no atómico ante fallos de rename.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { computeCanonicalHash, atomicSaveJson } from './consensus_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBRARY_FILE = path.join(__dirname, 'library.json');
const PROPOSALS_FILE = path.join(__dirname, 'proposals.json');
const JOURNAL_FILE = path.join(__dirname, '.transaction_journal.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`CRASH RECOVERY TEST FAILURE: ${message}`);
  }
}

console.log('======================================================================');
console.log('💥 ARKAIOS - CERTIFICACIÓN WAL ACID: 5 ESCENARIOS AVANZADOS DE CAÍDA');
console.log('======================================================================\n');

// 1. Guardar el estado limpio inicial
const initialLibRaw = fs.readFileSync(LIBRARY_FILE, 'utf-8');
const initialLib = JSON.parse(initialLibRaw);
const initialProposalsRaw = fs.existsSync(PROPOSALS_FILE) ? fs.readFileSync(PROPOSALS_FILE, 'utf-8') : '[]';

try {
  console.log(`[BASE] Estado inicial de biblioteca: ${initialLib.length} registros exactos.\n`);

  // ============================================================================
  // ESCENARIO 1: Split-Brain (library.json escrito, proposals.json no escrito)
  // ============================================================================
  console.log('🧪 [ESCENARIO 1] Simulación de Split-Brain (corte tras escribir solo library.json)...');

  const phantomItem = {
    id: 'kb-phantom-crash-test',
    title: 'Elemento Fantasma Interrumpido por Corte de Energía',
    category: 'Crash Simulation',
    governance: { proposal_id: 'prop-split-brain-001' }
  };
  const corruptedLibrary = [initialLib[0], phantomItem, ...initialLib.slice(1)];
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(corruptedLibrary, null, 2), 'utf-8');

  // proposals.json sigue con el estado previo
  fs.writeFileSync(PROPOSALS_FILE, initialProposalsRaw, 'utf-8');

  // Diario WAL activo con hashes
  const splitBrainJournal = {
    tx_id: 'tx-split-brain-001',
    state: 'WAL_LIBRARY_COMMITTED',
    proposal_id: 'prop-split-brain-001',
    created_at: new Date().toISOString(),
    pre_library_hash: computeCanonicalHash(initialLib),
    pre_proposals_hash: computeCanonicalHash(JSON.parse(initialProposalsRaw)),
    target_library_hash: computeCanonicalHash(corruptedLibrary),
    target_proposals_hash: computeCanonicalHash([{ proposal_id: 'prop-split-brain-001', status: 'APPROVED' }]),
    pre_library_snapshot: initialLib,
    pre_proposals_snapshot: JSON.parse(initialProposalsRaw),
    target_library: corruptedLibrary,
    target_proposals: [{ proposal_id: 'prop-split-brain-001', status: 'APPROVED' }]
  };
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(splitBrainJournal, null, 2), 'utf-8');

  const child1 = spawnSync('node', ['-e', `
    import('./consensus_engine.mjs').then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
  `], { cwd: __dirname, encoding: 'utf-8' });

  assert(child1.status === 0, 'El proceso hijo debe ejecutar recuperación sin errores.');

  const libAfterScenario1 = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  assert(libAfterScenario1.length === initialLib.length, `Debe restaurar exactamente ${initialLib.length} registros (tiene ${libAfterScenario1.length}).`);
  assert(libAfterScenario1[0].id === 'kb-top-01-artcraft', 'ArtCraft debe permanecer en el índice 0.');
  assert(!libAfterScenario1.some(i => i.id === 'kb-phantom-crash-test'), 'El registro fantasma fue purgado con éxito.');
  assert(!fs.existsSync(JOURNAL_FILE), 'El diario de transacciones debe haberse limpiado tras el rollback.');

  console.log('   ✓ Rollback automático exitoso: biblioteca restaurada a 311 registros.');
  console.log('   ✓ Cero registros fantasma y ArtCraft intacto en el índice 0.\n');

  // ============================================================================
  // ESCENARIO 2: Caída tras escribir AMBOS archivos (Verificación Hash SHA-256)
  // ============================================================================
  console.log('🧪 [ESCENARIO 2] Caída tras escribir AMBOS archivos con verificación SHA-256 exacta...');

  const legitPromotedItem = {
    id: 'kb-legit-promoted-002',
    title: 'Lección Legítima Aprobada Completamente',
    category: 'Completed Transaction',
    governance: { proposal_id: 'prop-legit-002' }
  };
  const completedTargetLibrary = [initialLib[0], legitPromotedItem, ...initialLib.slice(1)];
  const completedTargetProposals = [
    { proposal_id: 'prop-legit-002', status: 'APPROVED', promoted_kb_id: 'kb-legit-promoted-002' }
  ];

  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(completedTargetLibrary, null, 2), 'utf-8');
  fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(completedTargetProposals, null, 2), 'utf-8');

  const completedJournal = {
    tx_id: 'tx-legit-completed-002',
    state: 'WAL_ALL_COMMITTED',
    proposal_id: 'prop-legit-002',
    created_at: new Date().toISOString(),
    pre_library_hash: computeCanonicalHash(initialLib),
    pre_proposals_hash: computeCanonicalHash(JSON.parse(initialProposalsRaw)),
    target_library_hash: computeCanonicalHash(completedTargetLibrary),
    target_proposals_hash: computeCanonicalHash(completedTargetProposals),
    pre_library_snapshot: initialLib,
    pre_proposals_snapshot: JSON.parse(initialProposalsRaw),
    target_library: completedTargetLibrary,
    target_proposals: completedTargetProposals
  };
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(completedJournal, null, 2), 'utf-8');

  const child2 = spawnSync('node', ['-e', `
    import('./consensus_engine.mjs').then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
  `], { cwd: __dirname, encoding: 'utf-8' });

  assert(child2.status === 0, 'El proceso hijo debe ejecutar confirmación sin errores.');

  const libAfterScenario2 = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  const propsAfterScenario2 = JSON.parse(fs.readFileSync(PROPOSALS_FILE, 'utf-8'));

  assert(libAfterScenario2.length === initialLib.length + 1, 'Debe conservar los 312 registros.');
  assert(libAfterScenario2.some(i => i.id === 'kb-legit-promoted-002'), 'La lección aprobada debe permanecer en library.json.');
  assert(propsAfterScenario2.some(p => p.proposal_id === 'prop-legit-002' && p.status === 'APPROVED'), 'Propuesta permanece APPROVED.');
  assert(!fs.existsSync(JOURNAL_FILE), 'El diario debe haber sido limpiado tras confirmar.');

  console.log('   ✓ Forward-Complete exitoso con verificación SHA-256 exacta (aprobación preservada).');
  console.log('   ✓ Consistencia perfecta de 312 registros y estado APPROVED intacto.\n');

  // ============================================================================
  // ESCENARIO 3: Modificación Ajena a la Transacción (Ajuste 2 de ChatGPT)
  // ============================================================================
  console.log('🧪 [ESCENARIO 3] Detección de modificación ajena mediante SHA-256...');

  // Se tiene una biblioteca con la misma longitud y con el proposal_id correcto, pero
  // un registro ajeno fue alterado subrepticiamente (cambió el título del elemento #5)
  const modifiedTargetLibrary = JSON.parse(JSON.stringify(completedTargetLibrary));
  modifiedTargetLibrary[2].title = 'TITULO_ALTERADO_AJENO_A_LA_TRANSACCION';

  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(modifiedTargetLibrary, null, 2), 'utf-8');
  fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(completedTargetProposals, null, 2), 'utf-8');

  // El diario espera el target_library_hash original sin la alteración
  const tamperJournal = {
    tx_id: 'tx-tamper-check-003',
    state: 'WAL_LIBRARY_COMMITTED',
    proposal_id: 'prop-legit-002',
    created_at: new Date().toISOString(),
    pre_library_hash: computeCanonicalHash(initialLib),
    pre_proposals_hash: computeCanonicalHash(JSON.parse(initialProposalsRaw)),
    target_library_hash: computeCanonicalHash(completedTargetLibrary), // Hash del estado legítimo
    target_proposals_hash: computeCanonicalHash(completedTargetProposals),
    pre_library_snapshot: initialLib,
    pre_proposals_snapshot: JSON.parse(initialProposalsRaw),
    target_library: completedTargetLibrary,
    target_proposals: completedTargetProposals
  };
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(tamperJournal, null, 2), 'utf-8');

  // El proceso hijo debe detectar que diskLibHash !== target_library_hash y ejecutar Rollback
  const child3 = spawnSync('node', ['-e', `
    import('./consensus_engine.mjs').then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
  `], { cwd: __dirname, encoding: 'utf-8' });

  assert(child3.status === 0, 'El proceso hijo debe ejecutar rollback ante discrepancia de hash.');

  const libAfterScenario3 = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  assert(libAfterScenario3.length === initialLib.length, 'Debe ejecutar rollback a 311 registros ante hash mismatch.');
  assert(libAfterScenario3[2].title !== 'TITULO_ALTERADO_AJENO_A_LA_TRANSACCION', 'El registro ajeno alterado debe haber sido revertido al snapshot original.');

  console.log('   ✓ Hash mismatch detectado: la alteración de un registro ajeno bloqueó Forward-Complete.');
  console.log('   ✓ Rollback ejecutado limpiamente restaurando el estado íntegro previo.\n');

  // ============================================================================
  // ESCENARIO 4: Corrupción del Diario y Fail-Safe Lock
  // ============================================================================
  console.log('🧪 [ESCENARIO 4] Simulación de Diario Corrupto y Activación de Fail-Safe Lock...');

  fs.writeFileSync(JOURNAL_FILE, '{{{{CORRUPT_NOT_JSON_DATA}}}}', 'utf-8');

  const child4 = spawnSync('node', ['-e', `
    import('./consensus_engine.mjs').then(m => {
      const lock = m.getEngineLockStatus();
      if (!lock.locked) {
        console.error('El motor debio bloquearse ante un diario corrupto.');
        process.exit(1);
      }
      const testSubmit = m.submitProposal({
        title: 'Prueba Bloqueada',
        summary: 'Debe fallar por lock',
        agent_lesson: 'Fallo seguro',
        source_url: 'https://github.com/locked/test'
      });
      if (testSubmit.success || !testSubmit.error.includes('SISTEMA BLOQUEADO')) {
        console.error('La propuesta debio ser rechazada por el bloqueo de seguridad.');
        process.exit(2);
      }
      process.exit(0);
    });
  `], { cwd: __dirname, encoding: 'utf-8' });

  assert(child4.status === 0, 'El motor debe bloquearse ante diario corrupto y rechazar escrituras.');
  console.log('   ✓ Fail-Safe Lock verificado: el motor se bloquea e impide escrituras ante diario corrupto.\n');

  // ============================================================================
  // ESCENARIO 5: Atomicidad Pura sin Degradación a Copia No Atómica (Ajuste 1 de ChatGPT)
  // ============================================================================
  console.log('🧪 [ESCENARIO 5] Comprobación de Atomicidad Pura (Cero copyFileSync fallback)...');

  // Comprobar que si el destino es un directorio no sobreescribible por renameSync,
  // atomicSaveJson() lanza error seguro y NUNCA degrada a copyFileSync sobreescribiendo datos
  let threwExpected = false;
  try {
    atomicSaveJson(__dirname, { test: 'illegal_directory_target' });
  } catch (err) {
    threwExpected = true;
    assert(err.message.includes('Atomic replacement failed'), 'El error debe indicar fallo atómico sin degradación.');
  }
  assert(threwExpected, 'atomicSaveJson debe fallar de forma segura si no puede renombrar atómicamente.');
  console.log('   ✓ Atomicidad pura confirmada: cero degradación a copia en caliente no atómica.');

  console.log('\n======================================================================');
  console.log('🎉 TODOS LOS 5 ESCENARIOS AVANZADOS DE CAÍDA PASARON CON ÉXITO');
  console.log('   - Split-Brain Rollback: Certificado.');
  console.log('   - Forward-Complete SHA-256: Certificado.');
  console.log('   - Detección de modificación ajena (Hash Mismatch): Certificado.');
  console.log('   - Fail-Safe Lock ante corrupción: Certificado.');
  console.log('   - Atomicidad pura sin fallback degradado: Certificado.');
  console.log('======================================================================\n');

} finally {
  // Limpieza y restauración final al estado limpio
  fs.writeFileSync(LIBRARY_FILE, initialLibRaw, 'utf-8');
  fs.writeFileSync(PROPOSALS_FILE, initialProposalsRaw, 'utf-8');
  if (fs.existsSync(JOURNAL_FILE)) fs.unlinkSync(JOURNAL_FILE);
}
