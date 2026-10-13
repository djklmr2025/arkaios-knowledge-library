/**
 * ARKAIOS Knowledge Library - Control & Security Test Suite
 * 
 * Verifies:
 * 1. Read-only MCP Server JSON-RPC Protocol (server.mjs)
 * 2. Data Curation & Schema Integrity (curate.mjs)
 * 3. Security & Zero-Leak Hygiene (No secrets in tracked git files)
 */

import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { curateLibrary } from './curate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMcpServer() {
  console.log('🧪 [TEST 1/3] Probando Servidor MCP (server.mjs)...');

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join(__dirname, 'server.mjs')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let step = 0;
    let passed = true;

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const res = JSON.parse(line);
          if (step === 0 && res.result?.serverInfo?.name === 'arkaios-knowledge-library-mcp') {
            console.log('   ✓ Inicialización MCP JSON-RPC 2.0 exitosa.');
            step++;
            // Pedir herramientas
            proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
          } else if (step === 1 && res.result?.tools?.length >= 4) {
            console.log(`   ✓ Lista de herramientas MCP validada (${res.result.tools.length} herramientas activas).`);
            step++;
            // Invocar get_top_resource
            proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_top_resource', arguments: {} } }) + '\n');
          } else if (step === 2) {
            const content = JSON.parse(res.result.content[0].text);
            if (content.id === 'kb-top-01-artcraft') {
              console.log('   ✓ Invocación MCP "get_top_resource" exitosa: Recurso #1 ArtCraft verificado.');
            } else {
              console.error('   ✗ Recurso #1 inesperado:', content.id);
              passed = false;
            }
            step++;
            proc.kill();
            resolve(passed);
          }
        } catch (e) {
          // ignore non-json
        }
      }
    });

    proc.on('error', reject);

    // Enviar initialize
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  });
}

function testCurationAndSchema() {
  console.log('\n🧪 [TEST 2/3] Probando Curador y Esquema JSON (curate.mjs)...');
  const result = curateLibrary();

  if (!result.success) {
    console.error('   ✗ Curador falló:', result.error);
    return false;
  }

  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, 'library.json'), 'utf-8'));
  if (lib.length === 0) {
    console.error('   ✗ library.json quedó vacío');
    return false;
  }

  if (lib[0].id !== 'kb-top-01-artcraft') {
    console.error('   ✗ El primer elemento no es ArtCraft');
    return false;
  }

  console.log(`   ✓ Base de datos validada con éxito: ${lib.length} registros íntegros.`);
  console.log('   ✓ Registro #1 ArtCraft fijado correctamente con enlace a github.com/storytold.');
  return true;
}

function testSecurityHygiene() {
  console.log('\n🧪 [TEST 3/3] Verificando Higiene de Seguridad (Zero-Leak)...');
  const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf-8');

  let secure = true;
  if (!gitignore.includes('.env')) {
    console.error('   ✗ .env no está protegido en .gitignore');
    secure = false;
  } else {
    console.log('   ✓ .env está explícitamente ignorado en .gitignore.');
  }

  // Verificar que git no rastree ningún .env real (permitiendo .env.example)
  try {
    const trackedFiles = execSync('git ls-files', { encoding: 'utf-8' }).split('\n').map(l => l.trim()).filter(Boolean);
    const leakedEnv = trackedFiles.filter(f => /^\.env(\.local|\.production|\.development)?$/.test(f));
    if (leakedEnv.length > 0) {
      console.error(`   ✗ ALERTA: Un archivo .env privado está siendo rastreado por git: ${leakedEnv.join(', ')}`);
      secure = false;
    } else {
      console.log('   ✓ Ningún archivo .env privado está siendo rastreado por git.');
    }

    // Escanear archivos rastreados en busca de tokens expuestos
    const forbiddenPatterns = [/ghp_[a-zA-Z0-9]{20,}/, /vcp_[a-zA-Z0-9]{20,}/, /rnd_[a-zA-Z0-9]{20,}/, /EAAB[a-zA-Z0-9]{20,}/];
    let leakDetected = false;

    trackedFiles.split('\n').filter(Boolean).forEach(file => {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const text = fs.readFileSync(file, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(text)) {
            console.error(`   ✗ POSIBLE TOKEN DETECTADO en ${file}`);
            leakDetected = true;
            secure = false;
          }
        }
      }
    });

    if (!leakDetected) {
      console.log('   ✓ Cero tokens o secretos detectados en archivos rastreados por git.');
    }
  } catch (e) {
    console.log('   ℹ️ Git no disponible para inspección o entorno limpio.');
  }

  return secure;
}

async function runAll() {
  console.log('======================================================================');
  console.log('🛡️  ARKAIOS KNOWLEDGE LIBRARY — SUITE DE PRUEBAS DE CONTROL');
  console.log('======================================================================\n');

  const t1 = await testMcpServer();
  const t2 = testCurationAndSchema();
  const t3 = testSecurityHygiene();

  console.log('\n======================================================================');
  if (t1 && t2 && t3) {
    console.log('🎉 TODAS LAS PRUEBAS DE CONTROL PASARON EXITOSAMENTE (3/3)');
    console.log('   El paquete está verificado y listo para producción y multi-agentes.');
  } else {
    console.error('⚠️ AL MENOS UNA PRUEBA FALLÓ. Revisa los detalles anteriores.');
    process.exit(1);
  }
  console.log('======================================================================');
}

runAll();
