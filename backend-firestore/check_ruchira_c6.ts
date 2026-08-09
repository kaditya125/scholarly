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
  console.log('Probing Class 6 Ruchira (fhsk1) chapters...');
  for (let c = 1; c <= 15; c++) {
    const chap = String(c).padStart(2, '0');
    const url = `https://ncert.nic.in/textbook/pdf/fhsk1${chap}.pdf`;
    const status = await probe(url);
    console.log(`Chapter ${c} -> ${url} -> Status: ${status}`);
  }
  process.exit(0);
}

main();
