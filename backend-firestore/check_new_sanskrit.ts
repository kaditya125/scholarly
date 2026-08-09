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
  const books = [
    { name: 'Sharada (Class 9)', prefix: 'ihsh1', maxChaps: 12 },
    { name: 'Abhyaswaan Bhav (Class 9)', prefix: 'isab1', maxChaps: 12 }
  ];

  for (const b of books) {
    console.log(`\nProbing ${b.name}...`);
    for (let c = 1; c <= b.maxChaps; c++) {
      const chap = String(c).padStart(2, '0');
      const url = `https://ncert.nic.in/textbook/pdf/${b.prefix}${chap}.pdf`;
      const status = await probe(url);
      console.log(`Chapter ${c} -> ${url} -> Status: ${status}`);
    }
  }
  process.exit(0);
}

main();
