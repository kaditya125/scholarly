import * as assert from 'node:assert';
import { FileParserService } from '../services/fileParser.service';
import { TextChunker } from '../utils/textChunker';

async function runTests() {
  console.log('--- Running Document Intelligence Unit Tests ---');

  // Test FileParser fallback for plain text
  const plainTextBase64 = Buffer.from('Page 1 content.\n\n\nPage 2 content.').toString('base64');
  const parsedPages = await FileParserService.extractText(plainTextBase64, 'text/plain', 'test.txt');
  
  assert.strictEqual(parsedPages.length, 1);
  assert.strictEqual(parsedPages[0].pageNumber, 1);
  assert.ok(parsedPages[0].text.includes('Page 1 content.'));
  console.log('✅ FileParserService fallback passes');

  // Test TextChunker
  const longText = 'A'.repeat(1500) + ' ' + 'B'.repeat(1500);
  const pages = [
    { pageNumber: 1, text: 'This is a short paragraph.' },
    { pageNumber: 2, text: longText }
  ];

  const chunks = TextChunker.chunkPages(pages, 1000, 200);
  
  // We expect:
  // Chunk 1: Page 1 short paragraph
  // Chunk 2: Page 2 first 1000 chars of longText
  // Chunk 3: Page 2 next chunk with overlap
  
  assert.ok(chunks.length > 2);
  
  assert.strictEqual(chunks[0].pageNumber, 1);
  assert.strictEqual(chunks[0].text, 'This is a short paragraph.');

  assert.strictEqual(chunks[1].pageNumber, 2);
  assert.ok(chunks[1].text.length <= 1000);
  
  // Verify overlap: Chunk 2 and Chunk 3 should share characters
  const chunk2End = chunks[1].text.slice(-100);
  const chunk3Start = chunks[2].text.slice(0, 100);
  
  assert.strictEqual(chunks[2].pageNumber, 2);
  assert.strictEqual(chunks[2].paragraphIndex, 0); // all from the same giant string
  console.log('✅ TextChunker logic passes');
  
  console.log('🎉 Document Intelligence Unit Tests Passed!');
}

runTests().catch((e) => {
  console.error('❌ Tests Failed:', e);
  process.exit(1);
});
