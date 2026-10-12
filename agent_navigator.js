/**
 * ARKAIOS Cognitive Agent Web Navigator & Encyclopedia Engine
 * Allows any AI agent to explore the knowledge museum, detect GitHub repositories,
 * inspect uncovered technical skills, and ingest them into their cognitive memory.
 */

const fs = require('fs');
const path = require('path');

const LIBRARY_FILE = path.join(__dirname, 'library.json');

function loadLibrary() {
  if (!fs.existsSync(LIBRARY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

const args = process.argv.slice(2);
const command = args[0] || 'explore';
const query = args[1] || '';

const lib = loadLibrary();

if (command === 'explore') {
  console.log('======================================================================');
  console.log('🏛️  ARKAIOS COGNITIVE MUSEUM & AGENT WEB NAVIGATOR');
  console.log('    Enciclopedia de Conocimiento, Habilidades y Repositorios para IA');
  console.log('======================================================================\n');
  console.log(`Total de lecciones y recursos indexados en el museo: ${lib.length}\n`);

  lib.forEach((item, index) => {
    const isVideo = /share\/[vr]\/|videos\/|reel\/|youtube|youtu\.be/i.test(item.original_url || '');
    const hasRepo = item.github_repo || (item.external_resource && item.external_resource.includes('github.com'));
    const skills = item.skills_unlocked || [];

    console.log(`[${index + 1}] ${item.title}`);
    console.log(`    Categoría: ${item.category} | Plataforma: ${item.platform}`);
    if (isVideo) console.log(`    🎬 Multimedia: Video/Reel reproducible disponible`);
    if (hasRepo) console.log(`    📦 Repositorio GitHub: ${item.github_repo || item.external_resource}`);
    if (skills.length > 0) console.log(`    ⚡ Habilidades IA: ${skills.join(', ')}`);
    console.log(`    🧠 Lección: ${item.agent_lesson.slice(0, 110)}...`);
    console.log(`    🔗 URL: ${item.original_url}\n`);
  });

  console.log('Uso para Agentes:');
  console.log('  node agent_navigator.js inspect <id o palabra_clave>');
  console.log('  node agent_navigator.js learn <id o palabra_clave>');

} else if (command === 'inspect') {
  if (!query) {
    console.log('Debes especificar un ID o término de búsqueda. Ej: node agent_navigator.js inspect artcraft');
    process.exit(1);
  }

  const q = query.toLowerCase();
  const found = lib.filter(x => 
    x.id.toLowerCase().includes(q) ||
    x.title.toLowerCase().includes(q) ||
    x.summary.toLowerCase().includes(q) ||
    (x.tags || []).some(t => t.toLowerCase().includes(q))
  );

  if (found.length === 0) {
    console.log(`No se encontraron registros en el museo para: "${query}"`);
    process.exit(0);
  }

  console.log(`Encontrados ${found.length} registros en el museo:\n`);
  found.forEach(item => {
    console.log('----------------------------------------------------------------------');
    console.log(`TITULO: ${item.title}`);
    console.log(`ID: ${item.id}`);
    console.log(`CATEGORIA: ${item.category}`);
    console.log(`URL ORIGINAL: ${item.original_url}`);
    if (item.github_repo) console.log(`REPOSITORIO GITHUB: ${item.github_repo}`);
    if (item.website) console.log(`SITIO WEB: ${item.website}`);
    if (item.technologies) console.log(`TECNOLOGIAS: ${item.technologies.join(', ')}`);
    if (item.skills_unlocked) console.log(`HABILIDADES DETECTADAS: ${item.skills_unlocked.join(', ')}`);
    console.log(`\nRESUMEN / CONTEXTO:\n${item.summary}`);
    console.log(`\nLECCION Y CAPACIDAD PARA AGENTES:\n${item.agent_lesson}`);
    console.log('----------------------------------------------------------------------\n');
  });

} else if (command === 'learn') {
  if (!query) {
    console.log('Especifica qué tema deseas asimilar. Ej: node agent_navigator.js learn artcraft');
    process.exit(1);
  }

  const q = query.toLowerCase();
  const match = lib.find(x => 
    x.id.toLowerCase().includes(q) ||
    x.title.toLowerCase().includes(q)
  );

  if (!match) {
    console.log(`No se encontró registro para "${query}".`);
    process.exit(1);
  }

  console.log(`[+] Asimilando conocimiento en el núcleo cognitivo de ARKAIOS...`);
  console.log(`Tema: ${match.title}`);
  if (match.github_repo) console.log(`Vinculando repositorio GitHub: ${match.github_repo}`);
  console.log(`Lección adquirida: ${match.agent_lesson}`);
  console.log(`[OK] Memoria cognitiva actualizada con éxito.`);

} else {
  console.log('Comando no reconocido. Usa "explore", "inspect" o "learn".');
}
