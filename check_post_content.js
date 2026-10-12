const fs = require('fs');

const f1 = 'C:/ARKAIOS/arkaios-knowledge-library/latest_post.html';
if (fs.existsSync(f1)) {
  const content = fs.readFileSync(f1, 'utf-8');
  console.log('latest_post.html size:', content.length);
  // Search for any words or text
  const msgs = content.match(/"text"\s*:\s*"([^"]{20,})"/g) || [];
  console.log('Messages count in latest_post:', msgs.length);
  msgs.slice(0, 5).forEach((m, i) => console.log(`${i+1}: ${m}`));
}
