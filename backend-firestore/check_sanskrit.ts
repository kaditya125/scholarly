import fetch from 'node-fetch'; // wait, node-fetch might not be installed, we can use global fetch in Node 22

async function probe(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.status;
  } catch (e: any) {
    return `ERROR: ${e.message}`;
  }
}

async function main() {
  const codes = [
    // Class 6 Sanskrit (Ruchira 1)
    'fhsk1', 'fhsk', 'fssk', 
    // Class 7 Sanskrit (Ruchira 2)
    'ghsk1', 'ghsk',
    // Class 8 Sanskrit (Ruchira 3)
    'hhsk1', 'hhsk',
    // Class 9 Sanskrit (Shemushi 1)
    'ihsk1', 'ihsk',
    // Class 10 Sanskrit (Shemushi 2)
    'jhsk1', 'jhsk',
    // Class 11 Sanskrit (Bhaswati 1)
    'khbs1', 'khsk1', 'khsh1',
    // Class 12 Sanskrit (Bhaswati 2 / Shashwati 2)
    'lhbs1', 'lhbs2', 'lhsk1', 'lhsk2'
  ];

  console.log('Probing Sanskrit PDF URLs...');
  for (const c of codes) {
    const url = `https://ncert.nic.in/textbook/pdf/${c}01.pdf`;
    const status = await probe(url);
    console.log(`Code: ${c} -> URL: ${url} -> Status: ${status}`);
  }
  process.exit(0);
}

main();
