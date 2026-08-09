import fs from 'fs';

const logPath = 'C:\\Users\\aditya kumar\\.gemini\\antigravity\\brain\\0b510e2d-089c-425e-802a-50895e026db4\\.system_generated\\tasks\\task-1898.log';
if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, 'utf-8');
  console.log(content.split('\n').slice(-50).join('\n'));
} else {
  console.log('Log file not found');
}
process.exit(0);
