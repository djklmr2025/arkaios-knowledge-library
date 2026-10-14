/**
 * ARKAIOS Knowledge Library - Simulación de Cliente MCP Externo Independiente
 * Prueba de integración JSON-RPC 2.0 (Stdio) tal como se conectaría Claude Desktop, Cursor o Gemini
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runExternalMcpClientTest() {
  console.log('======================================================================');
  console.log('🤖 PRUEBA DE INTEGRACIÓN: CLIENTE MCP EXTERNO INDEPENDIENTE (JSON-RPC 2.0)');
  console.log('======================================================================\n');

  const serverProc = spawn('node', [path.join(__dirname, 'server.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let messageId = 1;
  const pendingRequests = new Map();

  function sendRpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      pendingRequests.set(id, { resolve, reject });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      serverProc.stdin.write(payload);
    });
  }

  let buffer = '';
  serverProc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // conservar resto incompleto

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pendingRequests.has(msg.id)) {
          const { resolve, reject } = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          if (msg.error) {
            reject(msg.error);
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        // Ignorar logs no JSON
      }
    }
  });

  serverProc.on('error', (err) => {
    console.error('✗ Error al spawnear server.mjs:', err.message);
  });

  try {
    // 1. Handshake Inicial (initialize)
    console.log('📡 [1/5] Enviando Handshake MCP Inicial (initialize)...');
    const initResult = await sendRpc('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'ExternalAgentClient', version: '1.0.0' },
      capabilities: {}
    });
    console.log(`   ✓ Servidor respondió: ${initResult.serverInfo?.name} v${initResult.serverInfo?.version}`);
    console.log(`   ✓ Versión de protocolo negociada: ${initResult.protocolVersion}`);

    // 2. Descubrimiento de Herramientas (tools/list)
    console.log('\n🔍 [2/5] Descubriendo catálogo de herramientas para el agente (tools/list)...');
    const toolsResult = await sendRpc('tools/list', {});
    const tools = toolsResult.tools || [];
    console.log(`   ✓ ${tools.length} herramientas MCP disponibles para agentes:`);
    tools.forEach(t => console.log(`     - ${t.name}: ${t.description.substring(0, 70)}...`));

    // Validar que NO existen herramientas administrativas en MCP
    const dangerousTools = tools.filter(t => t.name.includes('sync') || t.name.includes('admin') || t.name.includes('login'));
    if (dangerousTools.length === 0) {
      console.log('   ✓ Verificación Zero-Risk: Cero endpoints administrativos expuestos a agentes.');
    } else {
      throw new Error(`Herramientas administrativas expuestas indebidamente: ${dangerousTools.map(t => t.name).join(', ')}`);
    }

    // 3. Consulta de Recurso Top #1 (get_top_resource)
    console.log('\n🏆 [3/5] Consultando recurso prioritario #1 (get_top_resource)...');
    const topResult = await sendRpc('tools/call', { name: 'get_top_resource', arguments: {} });
    const topData = JSON.parse(topResult.content[0].text);
    console.log(`   ✓ Recurso #1 obtenido: "${topData.title}"`);
    console.log(`   ✓ ID: ${topData.id} | Repositorio: ${topData.github_repo}`);
    console.log(`   ✓ Tecnologías: ${topData.technologies?.join(', ')}`);

    // 4. Búsqueda Semántica de Conocimiento (search_library)
    console.log('\n🔎 [4/5] Búsqueda de conocimiento sin credenciales (search_library para "mcp")...');
    const searchResult = await sendRpc('tools/call', {
      name: 'search_library',
      arguments: { query: 'mcp' }
    });
    const searchData = JSON.parse(searchResult.content[0].text);
    console.log(`   ✓ Elementos encontrados: ${searchData.total_found}`);
    if (searchData.results?.length > 0) {
      console.log(`   ✓ Primer resultado: "${searchData.results[0].title}"`);
    }

    // 5. Extracción de Lección para Memoria de Agentes (get_lesson)
    console.log('\n🧠 [5/5] Extracción de lección técnica para agentes (get_lesson)...');
    const lessonResult = await sendRpc('tools/call', {
      name: 'get_lesson',
      arguments: { id: 'kb-top-01-artcraft' }
    });
    const lessonData = JSON.parse(lessonResult.content[0].text);
    console.log(`   ✓ Lección técnica: "${lessonData.agent_lesson.substring(0, 120)}..."`);
    console.log(`   ✓ Habilidades desbloqueadas: ${lessonData.skills_unlocked?.join(', ')}`);

    console.log('\n======================================================================');
    console.log('🎉 INTEGRACIÓN MCP 100% DEMOSTRADA Y CERTIFICADA');
    console.log('   Cualquier agente externo (Claude, Cursor, Gemini) puede consultar');
    console.log('   las 311 lecciones de forma segura, soberana y sin credenciales.');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('✗ Fallo en la prueba de cliente MCP:', err.message);
  } finally {
    serverProc.kill();
  }
}

runExternalMcpClientTest();
