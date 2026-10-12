const { execSync } = require('child_process');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sessionDir = 'C:\\ARKAIOS\\arkaios-knowledge-library\\.meta_admin_session';
const tempDir = 'C:\\ARKAIOS\\arkaios-knowledge-library\\.temp_read_profile';

console.log('Obteniendo feed en vivo de https://www.facebook.com/arkaiosIA con perfil autenticado...');

try {
  if (fs.existsSync(tempDir)) execSync(`rmdir /s /q "${tempDir}"`, { stdio: 'ignore' });
  try {
    execSync(`robocopy "${sessionDir}" "${tempDir}" /E /XF "lockfile" "Singleton*" "parent.lock" /R:0 /W:0`, { stdio: 'ignore' });
  } catch(e) {}

  const cmd = `"${chromePath}" --headless=new --dump-dom --user-data-dir="${tempDir}" --virtual-time-budget=12000 "https://www.facebook.com/arkaiosIA"`;
  const dom = execSync(cmd, { maxBuffer: 40 * 1024 * 1024 }).toString('utf-8');
  console.log('DOM descargado:', (dom.length / 1024).toFixed(2), 'KB');

  // Find posts text
  const textMatches = dom.match(/dir="auto"[^>]*>([^<]+)</g) || [];
  const cleanTexts = textMatches.map(t => t.replace(/dir="auto"[^>]*>/, '').replace(/<$/, '')).filter(t => t.length > 25);
  
  console.log('Publicaciones en el feed principal (primeras 15):');
  cleanTexts.slice(0, 15).forEach((t, i) => console.log(`${i+1}. ${t}`));

  // Find any post links
  const postLinks = dom.match(/https?:\/\/(?:www\.)?facebook\.com\/(?:arkaiosIA\/posts\/|share\/p\/)[a-zA-Z0-9_\-\.\/]+/gi) || [];
  console.log('\nEnlaces a posts detectados:', Array.from(new Set(postLinks)));

  // Find any github links
  const githubLinks = dom.match(/github\.com\/[a-zA-Z0-9_\-\.\/]+/gi) || [];
  console.log('\nRepositorios GitHub en el feed:', Array.from(new Set(githubLinks)));

} catch (e) {
  console.error('Error:', e.message);
} finally {
  try {
    if (fs.existsSync(tempDir)) execSync(`rmdir /s /q "${tempDir}"`, { stdio: 'ignore' });
  } catch(e) {}
}
