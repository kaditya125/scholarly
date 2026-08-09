import fetch from 'node-fetch';

async function probe(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.status;
  } catch (e: any) {
    return 500;
  }
}

async function getChaptersCount(prefix: string): Promise<number> {
  let count = 0;
  for (let c = 1; c <= 25; c++) {
    const chap = String(c).padStart(2, '0');
    const url = `https://ncert.nic.in/textbook/pdf/${prefix}${chap}.pdf`;
    const status = await probe(url);
    if (status === 200) {
      count = c;
    } else {
      // Allow a single missing gap just in case, but usually sequential
      const nextChap = String(c + 1).padStart(2, '0');
      const nextUrl = `https://ncert.nic.in/textbook/pdf/${prefix}${nextChap}.pdf`;
      const nextStatus = await probe(nextUrl);
      if (nextStatus !== 200) {
        break;
      }
    }
  }
  return count;
}

async function main() {
  const books = [
    { name: 'Class 6 Sanskrit (Kaushal Bodh)', prefix: 'fskkb1' },
    { name: 'Class 7 Sanskrit (Ruchira)', prefix: 'ghsk1' },
    { name: 'Class 8 Sanskrit (Ruchira)', prefix: 'hhsk1' },
    { name: 'Class 9 Sanskrit (Sharada)', prefix: 'ihsh1' },
    { name: 'Class 10 Sanskrit (Shemushi)', prefix: 'jhsk1' },
    { name: 'Class 11 Sanskrit (Bhaswati)', prefix: 'khsk1' },
    { name: 'Class 11 Sanskrit (Shashwati)', prefix: 'khsk2' },
    { name: 'Class 12 Sanskrit (Bhaswati)', prefix: 'lhsk1' },
    { name: 'Class 12 Sanskrit (Shashwati)', prefix: 'lhsk2' }
  ];

  console.log('Determining available chapters count for each Sanskrit book...');
  for (const b of books) {
    const chaps = await getChaptersCount(b.prefix);
    console.log(`- Prefix: ${b.prefix} | Title: ${b.name} | Active Chapters: ${chaps}`);
  }
  process.exit(0);
}

main();
