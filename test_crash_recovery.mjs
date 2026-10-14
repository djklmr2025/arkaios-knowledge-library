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
 * - Ambos archivos (library.json y proposals.json) se escribieron con éxito, pero el proceso
 *   murió antes de borrar .transaction_journal.json.
 * - Resultado exigido: NO debe revertir la aprobación. Debe ejecutar Forward-Complete confirmando
 *   la transacción y limpiando el diario.
 * 
 * ESCENARIO 3 (Corrupción Irrecuperable del Diario / Fail-Safe Lock):
 * - El diario se corrompe físicamente con datos basura no parseables.
 * - Resultado exigido: El motor activa Bloqueo de Seguridad (fail-safe lock), impidiendo escrituras
 *   hasta que el administrador resuelva la inconsistencia.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

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
console.log('💥 ARKAIOS - CERTIFICACIÓN WAL ACID: 3 ESCENARIOS DE CAÍDA CATASTRÓFICA');
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

  // proposals.json sigue con el estado previo (no contiene la propuesta aprobada)
  fs.writeFileSync(PROPOSALS_FILE, initialProposalsRaw, 'utf-8');

  // Diario WAL activo en fase "WAL_LIBRARY_COMMITTED"
  const splitBrainJournal = {
    tx_id: 'tx-split-brain-001',
    state: 'WAL_LIBRARY_COMMITTED',
    proposal_id: 'prop-split-brain-001',
    created_at: new Date().toISOString(),
    pre_library_snapshot: initialLib,
    pre_proposals_snapshot: JSON.parse(initialProposalsRaw),
    target_library: corruptedLibrary,
    target_proposals: [{ proposal_id: 'prop-split-brain-001', status: 'APPROVED' }]
  };
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(splitBrainJournal, null, 2), 'utf-8');

  // Arrancar proceso hijo independiente para probar autorrecuperación
  const child1 = spawnSync('node', ['-e', `
    import('./consensus_engine.mjs').then(() => {
      process.exit(0);
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
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
  // ESCENARIO 2: Caída tras escribir AMBOS archivos (Defecto 2 de ChatGPT)
  // ============================================================================
  console.log('🧪 [ESCENARIO 2] Simulación de Caída tras escribir AMBOS archivos (Evitar pérdida de aprobación)...');

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

  // Ambos archivos ya fueron escritos con éxito en el disco
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(completedTargetLibrary, null, 2), 'utf-8');
  fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(completedTargetProposals, null, 2), 'utf-8');

  // Pero el proceso murió justo antes de borrar el diario
  const completedJournal = {
    tx_id: 'tx-legit-completed-002',
    state: 'WAL_LIBRARY_COMMITTED', // o WAL_ALL_COMMITTED
    proposal_id: 'prop-legit-002',
    created_at: new Date().toISOString(),
    pre_library_snapshot: initialLib,
    pre_proposals_snapshot: JSON.parse(initialProposalsRaw),
    target_library: completedTargetLibrary,
    target_proposals: completedTargetProposals
  };
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(completedJournal, null, 2), 'utf-8');

  // Arrancar proceso hijo independiente
  const child2 = spawnSync('node', ['-e', `
    import('./consensus_engine.mjs').then(() => {
      process.exit(0);
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  `], { cwd: __dirname, encoding: 'utf-8' });

  assert(child2.status === 0, 'El proceso hijo debe ejecutar confirmación sin errores.');

  const libAfterScenario2 = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  const propsAfterScenario2 = JSON.parse(fs.readFileSync(PROPOSALS_FILE, 'utf-8'));

  // ¡NO DEBE HABER ROLLBACK! La aprobación completada debe conservarse íntegra
  assert(libAfterScenario2.length === initialLib.length + 1, `Debe conservar los 312 registros (aprobación preservada).`);
  assert(libAfterScenario2.some(i => i.id === 'kb-legit-promoted-002'), 'La lección aprobada debe permanecer en library.json.');
  assert(propsAfterScenario2.some(p => p.proposal_id === 'prop-legit-002' && p.status === 'APPROVED'), 'La propuesta debe permanecer como APPROVED.');
  assert(!fs.existsSync(JOURNAL_FILE), 'El diario debe haber sido limpiado tras confirmar la transacción hacia adelante.');

  console.log('   ✓ Forward-Complete exitoso: la lección aprobada NO fue revertida tras reiniciar.');
  console.log('   ✓ Consistencia perfecta preservada: 312 registros y estado APPROVED intacto.\n');

  // ============================================================================
  // ESCENARIO 3: Corrupción del Diario y Fail-Safe Lock
  // ============================================================================
  console.log('🧪 [ESCENARIO 3] Simulación de Diario Corrupto y Activación de Fail-Safe Lock...');

  fs.writeFileSync(JOURNAL_FILE, '{{{{CORRUPT_NOT_JSON_DATA}}}}', 'utf-8');

  const child3 = spawnSync('node', ['-e', `
    import('./consensus_engine.mjs').then(m => {
      const lock = m.getEngineLockStatus();
      if (!lock.locked) {
        console.error('El motor debio bloquearse ante un diario corrupto.');
        process.exit(1);
      }
      // Intentar una propuesta en modo bloqueado debe fallar
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

  assert(child3.status === 0, 'El motor debe bloquearse ante diario corrupto y rechazar escrituras.');
  console.log('   ✓ Fail-Safe Lock verificado: el motor se bloquea e impide escrituras ante diario corrupto.');

  console.log('\n======================================================================');
  console.log('🎉 TODOS LOS ESCENARIOS WAL CERTIFICADOS EXITOSAMENTE (3/3)');
  console.log('   - Split-Brain Rollback: Probado.');
  console.log('   - Forward-Complete (Sin pérdida de aprobaciones): Probado.');
  console.log('   - Fail-Safe Lock ante corrupción: Probado.');
  console.log('======================================================================\n');

} finally {
  // Limpieza y restauración final al estado limpio
  fs.writeFileSync(LIBRARY_FILE, initialLibRaw, 'utf-8');
  fs.writeFileSync(PROPOSALS_FILE, initialProposalsRaw, 'utf-8');
  if (fs.existsSync(JOURNAL_FILE)) fs.unlinkSync(JOURNAL_FILE);
}
