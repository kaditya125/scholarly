import fs from 'fs';
const content = fs.readFileSync('C:\\Users\\aditya kumar\\.gemini\\antigravity\\brain\\b60330a0-4faa-401b-8afe-935330a9d1a4\\.system_generated\\steps\\2263\\content.md', 'utf-8');
const regex = /if\(pm=="([a-z0-9]+)"\)\s*\{\s*document\.write\("[^"]+<strong>([^<]+)<\/strong>/g;
let match;
while ((match = regex.exec(content)) !== null) {
  const code = match[1];
  const name = match[2];
  if (name.toLowerCase().includes('math') || name.toLowerCase().includes('science') || name.toLowerCase().includes('looking') || name.toLowerCase().includes('evs')) {
    console.log(code, name);
  }
}
