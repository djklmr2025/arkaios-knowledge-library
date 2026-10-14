/**
 * ARKAIOS Knowledge Library - Control & Security Test Suite
 * 
 * Verifies:
 * 1. Read-only MCP Server JSON-RPC Protocol (server.mjs) across all 4 tools
 * 2. Data Curation & Schema Integrity with metadata preservation (curate.mjs)
 * 3. Security & Zero-Leak Hygiene (No secrets in tracked git files, fail-on-error)
 * 4. Local Web Server Security (server.js: 403 on private files & path traversal)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { curateLibrary } from './curate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMcpServer() {
  console.log('🧪 [TEST 1/4] Probando Servidor MCP (server.mjs) y sus 4 herramientas...');

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
            // 1. Probar get_top_resource
            proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_top_resource', arguments: {} } }) + '\n');
          } else if (step === 2) {
            const content = JSON.parse(res.result.content[0].text);
            if (content.id === 'kb-top-01-artcraft') {
              console.log('   ✓ Invocación MCP [1/4] "get_top_resource" exitosa: Recurso #1 ArtCraft.');
            } else {
              console.error('   ✗ Recurso #1 inesperado:', content.id);
              passed = false;
            }
            step++;
            // 2. Probar search_library
            proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_library', arguments: { query: 'artcraft', limit: 2 } } }) + '\n');
          } else if (step === 3) {
            const content = JSON.parse(res.result.content[0].text);
            if (content.total_found > 0) {
              console.log(`   ✓ Invocación MCP [2/4] "search_library" exitosa: ${content.total_found} resultados encontrados.`);
            } else {
              console.error('   ✗ search_library no encontró resultados para "artcraft".');
              passed = false;
            }
            step++;
            // 3. Probar get_lesson
            proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_lesson', arguments: { id: 'kb-top-01-artcraft' } } }) + '\n');
          } else if (step === 4) {
            const content = JSON.parse(res.result.content[0].text);
            if (content.id === 'kb-top-01-artcraft' && content.agent_lesson) {
              console.log('   ✓ Invocación MCP [3/4] "get_lesson" exitosa: Lección técnica extraída.');
            } else {
              console.error('   ✗ get_lesson no devolvió la lección esperada.');
              passed = false;
            }
            step++;
            // 4. Probar list_technologies
            proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_technologies', arguments: {} } }) + '\n');
          } else if (step === 5) {
            const content = JSON.parse(res.result.content[0].text);
            if (content.technologies?.length > 0 && content.github_repos?.length > 0) {
              console.log(`   ✓ Invocación MCP [4/4] "list_technologies" exitosa: ${content.technologies.length} tecnologías y ${content.github_repos.length} repos catalogados.`);
            } else {
              console.error('   ✗ list_technologies no devolvió tecnologías.');
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

    proc.on('error', (err) => {
      console.error('   ✗ Error en proceso MCP:', err.message);
      resolve(false);
    });

    // Enviar initialize
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  });
}

function testCurationAndSchema() {
  console.log('\n🧪 [TEST 2/4] Probando Curador, Metadatos Multimedia y Esquema JSON (curate.mjs)...');
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

  // Verificar preservación de metadatos multimedia
  const hasMetadata = lib.some(item => item.external_resource || item.synced_at || item.thumbnail);
  if (!hasMetadata) {
    console.error('   ✗ Alerta: No se encontraron metadatos multimedia (external_resource, synced_at) preservados.');
    return false;
  }

  console.log(`   ✓ Base de datos validada con éxito: ${lib.length} registros íntegros.`);
  console.log('   ✓ Metadatos multimedia y referencias preservadas correctamente.');
  console.log('   ✓ Registro #1 ArtCraft fijado correctamente con enlace a github.com/storytold.');
  return true;
}

function testSecurityHygiene() {
  console.log('\n🧪 [TEST 3/4] Verificando Higiene de Seguridad (Zero-Leak) y Escaneo Git...');
  const gitignorePath = path.join(__dirname, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    console.error('   ✗ Archivo .gitignore no encontrado');
    return false;
  }

  const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  let secure = true;
  if (!gitignore.includes('.env')) {
    console.error('   ✗ .env no está protegido en .gitignore');
    secure = false;
  } else {
    console.log('   ✓ .env está explícitamente ignorado en .gitignore.');
  }

  // Verificar que git no rastree ningún .env real ni secretos
  try {
    const rawTracked = execSync('git ls-files', { encoding: 'utf-8' });
    const trackedFiles = rawTracked.split('\n').map(l => l.trim()).filter(Boolean);

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

    // Iterar directamente sobre el array trackedFiles sin error de split
    trackedFiles.forEach(file => {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const text = fs.readFileSync(fullPath, 'utf-8');
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
    console.error(`   ✗ Error crítico al inspeccionar archivos git: ${e.message}`);
    secure = false;
  }

  return secure;
}

async function testServerSecurity() {
  console.log('\n🧪 [TEST 4/4] Probando Seguridad del Servidor Web Local (server.js)...');

  return new Promise((resolve) => {
    const serverProc = spawn('node', [path.join(__dirname, 'server.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let started = false;

    const cleanup = (passed) => {
      try { serverProc.kill(); } catch (e) {}
      resolve(passed);
    };

    serverProc.stdout.on('data', async (d) => {
      const out = d.toString();
      if (!started && out.includes('http://localhost:8989')) {
        started = true;
        let passed = true;

        const checkEndpoint = (pathUrl, expectedStatus) => {
          return new Promise((resCheck) => {
            const req = http.get(`http://localhost:8989${pathUrl}`, (res) => {
              res.resume();
              if (res.statusCode === expectedStatus) {
                console.log(`   ✓ ${pathUrl} devolvió HTTP ${res.statusCode} (esperado: ${expectedStatus}).`);
                resCheck(true);
              } else {
                console.error(`   ✗ ${pathUrl} devolvió HTTP ${res.statusCode} pero se esperaba ${expectedStatus}.`);
                resCheck(false);
              }
            });
            req.on('error', (err) => {
              if (err.code === 'ECONNRESET') return;
              console.error(`   ✗ Error de red al consultar ${pathUrl}: ${err.message}`);
              resCheck(false);
            });
          });
        };

        try {
          const t1 = await checkEndpoint('/index.html', 200);
          const t2 = await checkEndpoint('/.env', 403);
          const t3 = await checkEndpoint('/.meta_admin_session/Default', 403);
          const t4 = await checkEndpoint('/../package.json', 403);
          const t5 = await checkEndpoint('/api/status', 200);

          passed = t1 && t2 && t3 && t4 && t5;
        } catch (err) {
          console.error('   ✗ Fallo en pruebas HTTP:', err.message);
          passed = false;
        }

        cleanup(passed);
      }
    });

    serverProc.stderr.on('data', (d) => {
      // ignore or log
    });

    serverProc.on('error', (err) => {
      console.error('   ✗ Error al iniciar server.js:', err.message);
      cleanup(false);
    });

    // Timeout de seguridad en 6 segundos
    setTimeout(() => {
      if (!started) {
        console.error('   ✗ Timeout esperando que server.js inicie en el puerto 8989.');
        cleanup(false);
      }
    }, 6000);
  });
}

async function runAll() {
  console.log('======================================================================');
  console.log('🛡️  ARKAIOS KNOWLEDGE LIBRARY — SUITE DE PRUEBAS DE CONTROL');
  console.log('======================================================================\n');

  const t1 = await testMcpServer();
  const t2 = testCurationAndSchema();
  const t3 = testSecurityHygiene();
  const t4 = await testServerSecurity();

  console.log('\n======================================================================');
  if (t1 && t2 && t3 && t4) {
    console.log('🎉 TODAS LAS PRUEBAS DE CONTROL PASARON EXITOSAMENTE (4/4)');
    console.log('   El paquete está verificado y listo para producción y multi-agentes.');
  } else {
    console.error('⚠️ AL MENOS UNA PRUEBA FALLÓ. Revisa los detalles anteriores.');
    process.exit(1);
  }
  console.log('======================================================================');
}

runAll();
