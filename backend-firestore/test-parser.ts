import { FileParserService } from './src/services/fileParser.service.js';

async function test() {
  try {
    console.log("Testing FileParserService...");
    // Just a dummy base64 string
    const result = await FileParserService.extractText("dGVzdA==", "text/plain", "test.txt");
    console.log("Result:", result);
  } catch (e) {
    console.error("Crash:", e);
  }
}
test();
