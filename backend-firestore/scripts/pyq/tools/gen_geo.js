const fs = require('fs');
const path = require('path');

const srcDir = 'scripts/pyq/ugc_net_public_admin';
const dstDir = 'scripts/pyq/ugc_net_geography';

const files = [
  ['download-official-public-admin.py', 'download-official-geography.py'],
  ['extract-public-admin-papers.py', 'extract-geography-papers.py'],
  ['ingest-public-admin-corpus.ts', 'ingest-geography-corpus.ts'],
  ['publicAdminPatternAnalytics.ts', 'geographyPatternAnalytics.ts'],
  ['generate-public-admin-mock.ts', 'generate-geography-mock.ts'],
  ['index-public-admin-benchmark.ts', 'index-geography-benchmark.ts'],
  ['audit-public-admin-corpus.ts', 'audit-geography-corpus.ts']
];

for (const [src, dst] of files) {
  let content = fs.readFileSync(path.join(srcDir, src), 'utf-8');
  content = content.split('ugc_net_public_admin').join('ugc_net_geography');
  content = content.split('public_admin').join('geography');
  content = content.split('Public_Admin').join('Geography');
  content = content.split('Public Administration').join('Geography');
  content = content.split('public administration').join('geography');
  content = content.split('PUBLIC_ADMIN').join('GEOGRAPHY');
  content = content.split('publicAdminSyllabusTaxonomy').join('geographySyllabusTaxonomy');
  content = content.split('UGC_NET_PUBLIC_ADMIN_TAXONOMY').join('UGC_NET_GEOGRAPHY_TAXONOMY');
  content = content.split('mapQuestionToPublicAdminUnit').join('mapQuestionToGeographyUnit');
  content = content.split("['14', '014']").join("['80', '080']");
  content = content.split("'14'").join("'80'");
  content = content.split(':14:').join(':80:');
  content = content.split('_14').join('_80');
  content = content.split('Code: 14').join('Code: 80');
  content = content.split('Code 14').join('Code 80');
  fs.writeFileSync(path.join(dstDir, dst), content, 'utf-8');
  console.log('Created ' + dst);
}
console.log('All geography scripts successfully written.');
