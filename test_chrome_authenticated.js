const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetUrl = 'https://www.facebook.com/share/p/19pf44tsSp/';
const sessionDir = 'C:\\ARKAIOS\\arkaios-knowledge-library\\.meta_admin_session';
const tempDir = 'C:\\ARKAIOS\\arkaios-knowledge-library\\.temp_read_profile';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

console.log('--- Probando Volcado Autenticado con Perfil Clonado ---');

try {
  // Create shallow clone of session dir without lockfile
  if (fs.existsSync(tempDir)) {
    execSync(`rmdir /s /q "${tempDir}"`, { stdio: 'ignore' });
  }
  
  console.log('Clonando perfil para eludir bloqueo de Windows...');
  // Use robocopy to copy profile ignoring open lock files
  try {
    execSync(`robocopy "${sessionDir}" "${tempDir}" /E /XF "lockfile" "Singleton*" "parent.lock" /R:0 /W:0`, { stdio: 'ignore' });
  } catch(e) {
    // Robocopy returns exit code 1 on success with copied files
  }

  console.log('Ejecutando Chrome Headless sobre:', targetUrl);
  const cmd = `"${chromePath}" --headless=new --dump-dom --user-data-dir="${tempDir}" --virtual-time-budget=10000 "${targetUrl}"`;
  const dom = execSync(cmd, { maxBuffer: 40 * 1024 * 1024 }).toString('utf-8');
  console.log('DOM descargado con éxito. Tamaño:', (dom.length / 1024).toFixed(2), 'KB');

  fs.writeFileSync('C:/ARKAIOS/arkaios-knowledge-library/target_dom.html', dom, 'utf-8');

  // Search for post title and content in DOM
  const titleMatch = dom.match(/<title>([^<]+)<\/title>/i);
  console.log('TITULO DE PAGINA:', titleMatch ? titleMatch[1] : 'No detectado');

  // Extract post text from divs
  const textMatches = dom.match(/dir="auto"[^>]*>([^<]+)</g) || [];
  console.log('\nTextos encontrados con dir="auto":', textMatches.length);
  const sampleTexts = textMatches.map(t => t.replace(/dir="auto"[^>]*>/, '').replace(/<$/, '')).filter(t => t.length > 20);
  console.log('Muestras de texto:');
  sampleTexts.slice(0, 10).forEach((t, i) => console.log(`${i+1}. ${t}`));

  // Search for github or repos
  const gh = dom.match(/github\.com\/[a-zA-Z0-9_\-\.\/]+/gi) || [];
  console.log('\nRepositorios GitHub detectados:', Array.from(new Set(gh)));

} catch (err) {
  console.error('Error:', err.message);
} finally {
  try {
    if (fs.existsSync(tempDir)) execSync(`rmdir /s /q "${tempDir}"`, { stdio: 'ignore' });
  } catch(e) {}
}
