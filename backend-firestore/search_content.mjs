import fs from 'fs';

const content = fs.readFileSync('C:\\Users\\aditya kumar\\.gemini\\antigravity\\brain\\b60330a0-4faa-401b-8afe-935330a9d1a4\\.system_generated\\steps\\2263\\content.md', 'utf-8');
const regex = /if\(pm=="([a-z0-9]+)"\)\s*\{\s*document\.write\("[^"]+<strong>([^<]+)<\/strong>/g;

let match;
console.log('All Sanskrit/Shemushi/Ruchira/Bhaswati/Shashwati/Class 9 books found in content.md:');
while ((match = regex.exec(content)) !== null) {
  const code = match[1];
  const name = match[2];
  
  const matchesFilter = 
    code.startsWith('i') || // Class 9
    name.toLowerCase().includes('sanskrit') ||
    name.toLowerCase().includes('shemushi') ||
    name.toLowerCase().includes('ruchira') ||
    name.toLowerCase().includes('bhaswati') ||
    name.toLowerCase().includes('shashwati');
    
  if (matchesFilter) {
    console.log(`- Code: ${code} | Name: ${name}`);
  }
}
process.exit(0);
