import fs from 'fs';

const p = process.argv[2];
const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
console.log('total lines', lines.length);

function extractText(obj) {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(extractText).join('');
  if (obj?.text) return obj.text;
  if (obj?.content) return extractText(obj.content);
  return '';
}

const users = [];
for (const line of lines) {
  try {
    const j = JSON.parse(line);
    const role = j.role || j.message?.role;
    if (role === 'user') {
      users.push(extractText(j.message?.content ?? j.content ?? j));
    }
  } catch {
    /* skip */
  }
}

console.log('user messages', users.length);
for (const [i, text] of users.entries()) {
  console.log(`\n--- USER ${i + 1} ---\n${text.slice(0, 4000)}`);
}
