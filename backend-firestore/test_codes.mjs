async function main() {
  const codes = [
    'fecu101', 'fecu01', 'fecu1', 'fecu11',
    'fegp101', 'fegp01', 'fegp1', 'fegp11',
    'gegp101', 'gegp01', 'gegp1', 'gegp11',
    'gecu101', 'gecu01', 'gecu1', 'gecu11'
  ];
  
  for (const c of codes) {
    const url = `https://ncert.nic.in/textbook/pdf/${c}.pdf`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      console.log(c, '->', res.status);
    } catch(e) {
      console.log(c, '-> ERROR', e.message);
    }
  }
}
main();
