import 'dotenv/config';
import { qdrantService } from '../../../src/services/rag/qdrant.service';

async function main() {
  const hits = await qdrantService.queryVectors(new Array(768).fill(0.001), 3, undefined, 'production');
  console.log(`Hits returned: ${hits.length}`);
  for (const h of hits) {
    console.log(`ID: ${h.id}, score: ${h.score}, metadata:`, {
      examId: h.metadata?.examId,
      subject: h.metadata?.subject,
      text: h.metadata?.text?.slice(0, 100),
      corpusBucket: h.metadata?.corpusBucket,
    });
  }
}

main().catch(console.error);
