/**
 * J.4 — a retrieved payload must be proven to BE a document before it can become provenance.
 *
 * MEASURED, NOT HYPOTHETICAL. ssc.gov.in answers HTTP 200 for every path. A request for
 * `/files/portal/latest/CGL_2026_Notice.pdf` and one for a deliberately invented filename both
 * returned the site's Angular homepage — byte-identical, 80,649 bytes of text/html, both hashing
 * to SHA-256 16ec671c…
 *
 * Without these checks the archiver would have downloaded that homepage, hashed it into a real
 * non-empty digest, stored it under a storagePath, and satisfied every provenance rule J.2 added —
 * because those rules verify a hash exists and is not the empty digest, NOT that the bytes are the
 * document anyone asked for. The extractor would then have been handed a homepage and asked for a
 * syllabus, and whatever it invented would have carried full provenance.
 */
import {
  ExamDocumentStorageService, DocumentRetrievalError,
} from '../../src/services/exam/examDocumentStorage.service';

const svc = new ExamDocumentStorageService();
const pdf = (bytes = 4096) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes, 0x20)]);
const check = (buffer: Buffer, contentType = 'application/pdf') =>
  svc.assertRetrievedDocument({ buffer, contentType, sourceUrl: 'https://ssc.gov.in/x.pdf' });

describe('soft-404 detection', () => {
  it('THE REGRESSION: rejects the SSC homepage served in place of a PDF', () => {
    const homepage = Buffer.from(
      '<!doctype html>\n<html lang="en" data-critters-container>\n  <head>\n' +
      '    <title>Home | Staff Selection Commission | GoI</title>\n'.padEnd(80_649, ' '),
    );
    expect(() => check(homepage, 'text/html')).toThrow(DocumentRetrievalError);
    try { check(homepage, 'text/html'); } catch (e: any) {
      expect(e.code).toBe('HTML_INSTEAD_OF_DOCUMENT');
    }
  });

  it('rejects HTML even when the server claims application/pdf', () => {
    // A soft-404 sets Content-Type just as confidently as a real response, so the header cannot be
    // trusted — the magic bytes are the only evidence.
    const html = Buffer.from('<html><head><title>Not found</title></head></html>'.padEnd(5000, ' '));
    try { check(html, 'application/pdf'); throw new Error('should have thrown'); }
    catch (e: any) { expect(e.code).toBe('HTML_INSTEAD_OF_DOCUMENT'); }
  });

  it('rejects a non-PDF binary payload', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(5000)]);
    try { check(png, 'image/png'); throw new Error('should have thrown'); }
    catch (e: any) { expect(e.code).toBe('NOT_A_PDF'); }
  });

  it('rejects an empty response', () => {
    try { check(Buffer.alloc(0)); throw new Error('should have thrown'); }
    catch (e: any) { expect(e.code).toBe('EMPTY_RESPONSE'); }
  });

  it('rejects a stub too small to be an official notice', () => {
    try { check(pdf(10)); throw new Error('should have thrown'); }
    catch (e: any) { expect(e.code).toBe('SUSPICIOUSLY_SMALL'); }
  });

  it('accepts a genuine PDF payload', () => {
    expect(() => check(pdf())).not.toThrow();
  });

  it('nothing is hashed or stored before the payload is proven — the check precedes upload', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/exam/examDocumentStorage.service.ts'), 'utf8',
    );
    const guard = src.indexOf('this.assertRetrievedDocument(');
    const upload = src.indexOf('const result = await this.uploadDocumentBuffer(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(upload);
  });
});

/**
 * The hash must be reproducible from the stored bytes — that is the whole point of provenance.
 */
describe('hash reproducibility', () => {
  it('the same bytes always produce the same digest', () => {
    const buf = pdf();
    expect(svc.computeHash(buf)).toBe(svc.computeHash(Buffer.from(buf)));
  });

  it('different bytes produce different digests', () => {
    expect(svc.computeHash(pdf(4096))).not.toBe(svc.computeHash(pdf(4097)));
  });

  it('is a real SHA-256 of the content, not of any metadata', () => {
    const crypto = require('crypto');
    const buf = pdf();
    expect(svc.computeHash(buf)).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
  });
});

/**
 * Silent truncation is removed: an over-long document fails loudly rather than being cut and
 * published as if complete.
 */
describe('no silent truncation', () => {
  it('the extraction path no longer slices the document', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/exam/syllabusIngestion.service.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/rawText\.slice\(0,\s*50000\)/);
    expect(src).toMatch(/MAX_EXTRACTION_CHARS/);
    expect(src).toMatch(/Refusing to truncate/);
  });
});
