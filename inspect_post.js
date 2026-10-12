const { execSync } = require('child_process');
const fs = require('fs');

const userAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const canonicalUrl = 'https://www.facebook.com/arkaiosIA/posts/pfbid0xHc6syHSZDhmuuNbuNMtL645Bqk7DV7igJqmC2sdz7EVe5aEtiTLtGog8wT7graul';

console.log('Consultando URL canonica:', canonicalUrl);

try {
  const html = execSync(`curl.exe -s -L -A "${userAgent}" "${canonicalUrl}"`, { maxBuffer: 30 * 1024 * 1024 }).toString('utf-8');
  console.log('Descargado:', (html.length / 1024).toFixed(2), 'KB');

  fs.writeFileSync('C:/ARKAIOS/arkaios-knowledge-library/latest_post.html', html, 'utf-8');

  // Title & description from meta tags
  const ogTitle = (html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || [])[1];
  const ogDesc = (html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) || [])[1];
  const ogImage = (html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || [])[1];
  const ogVideo = (html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i) || [])[1];

  console.log('OG TITLE:', ogTitle);
  console.log('OG DESC:', ogDesc);
  console.log('OG IMAGE:', ogImage);
  console.log('OG VIDEO:', ogVideo);

  // Relay messages
  const rawPosts = html.split(/"message"\s*:\s*\{\s*"text"\s*:\s*"/);
  console.log('Relay sections:', rawPosts.length);
  for (let i = 1; i < rawPosts.length; i++) {
    const section = rawPosts[i];
    const endQuote = section.indexOf('"}');
    if (endQuote !== -1) {
      let text = section.slice(0, endQuote);
      try { text = JSON.parse(`"${text}"`); } catch (e) {}
      console.log(`\n=== TEXTO DEL POST [${i}] ===`);
      console.log(text);
    }
  }

  // Find github links
  const githubLinks = html.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_\-\.\/]+/gi) || [];
  console.log('\nREPOSITORIOS GITHUB:', Array.from(new Set(githubLinks)));

  // Find any external URLs in post text
  const urlsInHtml = html.match(/https?:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(?:\/[^\s"<>'\\]*)?/g) || [];
  const interestingUrls = Array.from(new Set(urlsInHtml.filter(u => !u.includes('facebook.com') && !u.includes('fbcdn') && !u.includes('w3.org'))));
  console.log('ENLACES EXTERNOS INTERESANTES:', interestingUrls);

} catch (err) {
  console.error('Error:', err.message);
}
