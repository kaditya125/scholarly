async function main() {
  const url = 'https://ncert.nic.in/textbook/pdf/gesc101.pdf';
  console.log('Fetching', url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('Status:', res.status, res.statusText);
    if (res.ok) {
      console.log('Size:', (await res.arrayBuffer()).byteLength);
    }
  } catch (e) {
    console.error(e);
  }
}
main();
