/**
 * ARKAIOS Knowledge Library - Data Curator & Schema Validator
 * 
 * Cleans, validates, deduplicates, and normalizes library.json.
 * Ensures data integrity, schema consistency, and priority positioning.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_FILE = path.join(__dirname, 'library.json');

const REQUIRED_FIELDS = ['id', 'title', 'category', 'summary', 'agent_lesson', 'original_url'];

export function curateLibrary() {
  console.log('======================================================================');
  console.log('🧹 CURANDO Y VALIDANDO BASE DE DATOS library.json');
  console.log('======================================================================\n');

  if (!fs.existsSync(LIBRARY_FILE)) {
    console.error('❌ Archivo library.json no encontrado.');
    return { success: false, error: 'File not found' };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  } catch (e) {
    console.error('❌ Error de sintaxis JSON en library.json:', e.message);
    return { success: false, error: e.message };
  }

  if (!Array.isArray(raw)) {
    console.error('❌ El archivo library.json debe contener un array.');
    return { success: false, error: 'Root is not an array' };
  }

  const initialCount = raw.length;
  console.log(`[+] Total de elementos brutos leídos: ${initialCount}`);

  const seenIds = new Set();
  const seenUrls = new Set();
  const validItems = [];
  const issues = [];

  raw.forEach((item, idx) => {
    // 1. Validar campos requeridos
    const missing = REQUIRED_FIELDS.filter(f => !item[f] || (typeof item[f] === 'string' && !item[f].trim()));
    if (missing.length > 0) {
      issues.push(`Item #${idx + 1} ("${item.title || item.id || 'Sin título'}") omitido por campos faltantes: ${missing.join(', ')}`);
      return;
    }

    // 2. Normalizar ID
    const cleanId = item.id.trim();
    if (seenIds.has(cleanId)) {
      issues.push(`ID duplicado omitido: "${cleanId}"`);
      return;
    }

    // 3. Normalizar URL y deduplicar
    const canonical = (item.canonical_url || item.original_url || '').toLowerCase().trim();
    if (canonical && seenUrls.has(canonical)) {
      issues.push(`URL canónica duplicada omitida: "${canonical}" (ID: ${cleanId})`);
      return;
    }

    seenIds.add(cleanId);
    if (canonical) seenUrls.add(canonical);

    // 4. Normalizar arrays
    const cleanItem = {
      id: cleanId,
      title: item.title.trim(),
      category: item.category.trim(),
      platform: item.platform || 'Facebook (Video / Post)',
      original_url: item.original_url.trim(),
      canonical_url: (item.canonical_url || item.original_url).trim(),
      github_repo: item.github_repo ? item.github_repo.trim() : null,
      website: item.website ? item.website.trim() : null,
      technologies: Array.isArray(item.technologies) ? item.technologies.map(t => t.trim()).filter(Boolean) : [],
      skills_unlocked: Array.isArray(item.skills_unlocked) ? item.skills_unlocked.map(s => s.trim()).filter(Boolean) : [],
      summary: item.summary.trim(),
      agent_lesson: item.agent_lesson.trim(),
      tags: Array.isArray(item.tags) ? item.tags.map(t => t.trim()).filter(Boolean) : []
    };

    validItems.push(cleanItem);
  });

  // 5. Garantizar que ArtCraft quede como Top #1
  const artcraftIdx = validItems.findIndex(x => x.id === 'kb-top-01-artcraft');
  if (artcraftIdx > 0) {
    const [topItem] = validItems.splice(artcraftIdx, 1);
    validItems.unshift(topItem);
    console.log('[+] Posicionamiento verificado: ArtCraft fijado en índice 0 (Top #1).');
  }

  // Guardar archivo limpio
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(validItems, null, 2), 'utf-8');

  console.log(`\n✅ Curación finalizada con éxito.`);
  console.log(`   - Elementos iniciales: ${initialCount}`);
  console.log(`   - Elementos válidos únicos: ${validItems.length}`);
  console.log(`   - Duplicados o inválidos filtrados: ${initialCount - validItems.length}`);
  if (issues.length > 0) {
    console.log(`\nDetalle de incidencias atendidas (${issues.length}):`);
    issues.slice(0, 5).forEach(iss => console.log(`   • ${iss}`));
    if (issues.length > 5) console.log(`   • ...y ${issues.length - 5} más.`);
  }

  return {
    success: true,
    total: validItems.length,
    filtered: initialCount - validItems.length
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  curateLibrary();
}
