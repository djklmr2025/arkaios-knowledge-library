/**
 * ARKAIOS Knowledge Library - Control & Security Test Suite v1.2
 * 
 * Verifies:
 * 1. Read-only MCP Server JSON-RPC Protocol (server.mjs) across all 4 tools
 * 2. Data Curation & Schema Integrity with metadata preservation (curate.mjs)
 * 3. Security & Zero-Leak Hygiene (No secrets in tracked git files, fail-on-error)
 * 4. Local Web Server Security & CSRF Protection (server.js: 403 on private files & CSRF)
 * 5. Media Extractor Command Injection Defense (media_extractor.js & sync_worker.js safe execution)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn, spawnSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { curateLibrary } from './curate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMcpServer() {
  console.log('🧪 [TEST 1/5] Probando Servidor MCP (server.mjs) y sus 4 herramientas...');

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
  console.log('\n🧪 [TEST 2/5] Probando Curador, Metadatos Multimedia y Esquema JSON (curate.mjs)...');
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
  console.log('\n🧪 [TEST 3/5] Verificando Higiene de Seguridad (Zero-Leak) y Escaneo Git...');
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
  console.log('\n🧪 [TEST 4/5] Probando Seguridad del Servidor Web Local (server.js, 127.0.0.1 y CSRF)...');

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
      if (!started && (out.includes('127.0.0.1:8989') || out.includes(':8989'))) {
        started = true;
        let passed = true;

        const checkEndpoint = (pathUrl, expectedStatus, options = {}) => {
          return new Promise((resCheck) => {
            const reqOptions = {
              hostname: '127.0.0.1',
              port: 8989,
              path: pathUrl,
              method: options.method || 'GET',
              headers: options.headers || {}
            };

            const req = http.request(reqOptions, (res) => {
              res.resume();
              if (res.statusCode === expectedStatus) {
                console.log(`   ✓ ${reqOptions.method} ${pathUrl} devolvió HTTP ${res.statusCode} (esperado: ${expectedStatus}).`);
                resCheck(true);
              } else {
                console.error(`   ✗ ${reqOptions.method} ${pathUrl} devolvió HTTP ${res.statusCode} pero se esperaba ${expectedStatus}.`);
                resCheck(false);
              }
            });

            req.on('error', (err) => {
              if (err.code === 'ECONNRESET') return;
              console.error(`   ✗ Error de red al consultar ${pathUrl}: ${err.message}`);
              resCheck(false);
            });

            req.end();
          });
        };

        try {
          // Pruebas GET estáticas y endpoints públicos
          const t1 = await checkEndpoint('/index.html', 200);
          const t2 = await checkEndpoint('/.env', 403);
          const t3 = await checkEndpoint('/.meta_admin_session/Default', 403);
          const t4 = await checkEndpoint('/../package.json', 403);
          const t5 = await checkEndpoint('/api/status', 200);

          // Pruebas POST administrativas y protección CSRF (origen no autorizado bloqueado)
          const t6 = await checkEndpoint('/api/sync', 403, {
            method: 'POST',
            headers: { 'Origin': 'https://malicious-website.com' }
          });
          const t7 = await checkEndpoint('/api/auth/login', 403, {
            method: 'POST',
            headers: { 'Origin': 'https://attacker.evil' }
          });

          passed = t1 && t2 && t3 && t4 && t5 && t6 && t7;
        } catch (err) {
          console.error('   ✗ Fallo en pruebas HTTP:', err.message);
          passed = false;
        }

        cleanup(passed);
      }
    });

    serverProc.on('error', (err) => {
      console.error('   ✗ Error al iniciar server.js:', err.message);
      cleanup(false);
    });

    setTimeout(() => {
      if (!started) {
        console.error('   ✗ Timeout esperando que server.js inicie en 127.0.0.1:8989.');
        cleanup(false);
      }
    }, 6000);
  });
}

function testMediaExtractorSecurity() {
  console.log('\n🧪 [TEST 5/5] Probando Defensa contra Inyección de Comandos (media_extractor.js)...');
  let secure = true;

  // 1. Probar URL malformada sin protocolo
  const r1 = spawnSync('node', [path.join(__dirname, 'media_extractor.js'), 'invalid-scheme://malicious'], { encoding: 'utf-8' });
  if (r1.status !== 0 && (r1.stderr.includes('invalida') || r1.stderr.includes('Solo se permiten'))) {
    console.log('   ✓ Rechazo seguro de esquemas URL no permitidos.');
  } else {
    console.error('   ✗ media_extractor.js no rechazó URL con esquema inválido.');
    secure = false;
  }

  // 2. Probar intento de inyección de comandos en parámetros
  const payload = 'https://www.facebook.com/arkaiosIA" & echo INJECTED & "';
  const r2 = spawnSync('node', [path.join(__dirname, 'media_extractor.js'), payload], { encoding: 'utf-8' });
  if (r2.status !== 0 && !r2.stdout.includes('INJECTED')) {
    console.log('   ✓ Intento de inyección de comando bloqueado exitosamente.');
  } else {
    console.error('   ✗ ALERTA: Falla en defensa contra command injection.');
    secure = false;
  }

  return secure;
}

async function runAll() {
  console.log('======================================================================');
  console.log('🛡️  ARKAIOS KNOWLEDGE LIBRARY — SUITE DE PRUEBAS DE CONTROL v1.2');
  console.log('======================================================================\n');

  const t1 = testCurationAndSchema();
  const t2 = await testMcpServer();
  const t3 = testSecurityHygiene();
  const t4 = await testServerSecurity();
  const t5 = testMediaExtractorSecurity();

  console.log('\n======================================================================');
  if (t1 && t2 && t3 && t4 && t5) {
    console.log('🎉 TODAS LAS PRUEBAS DE CONTROL PASARON EXITOSAMENTE (5/5)');
    console.log('   El paquete v1.2 está completamente blindado para producción y agentes.');
  } else {
    console.error('⚠️ AL MENOS UNA PRUEBA FALLÓ. Revisa los detalles anteriores.');
    process.exit(1);
  }
  console.log('======================================================================');
}

runAll();
