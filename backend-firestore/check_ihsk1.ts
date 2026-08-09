import fetch from 'node-fetch';

async function probe(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.status;
  } catch (e: any) {
    return `ERROR: ${e.message}`;
  }
}

async function main() {
  const urls = [
    'https://ncert.nic.in/textbook/pdf/ihsk1cc.pdf',
    'https://ncert.nic.in/textbook/pdf/ihsk101.pdf',
    'https://ncert.nic.in/textbook/pdf/ihsk102.pdf',
    'https://ncert.nic.in/textbook/pdf/ihsk1ps.pdf',
  ];
  for (const url of urls) {
    const status = await probe(url);
    console.log(`URL: ${url} -> Status: ${status}`);
  }
  process.exit(0);
}

main();
