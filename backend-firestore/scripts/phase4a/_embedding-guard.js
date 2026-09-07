"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROBE_VECTOR = exports.PROBE_DIMENSION = void 0;
exports.acquireIndexerLock = acquireIndexerLock;
exports.releaseIndexerLock = releaseIndexerLock;
exports.readLock = readLock;
exports.requireNoIndexer = requireNoIndexer;
exports.countVectorsByExam = countVectorsByExam;
exports.sampleVectorMetadata = sampleVectorMetadata;
/**
 * One place that decides when a script may spend embedding quota.
 *
 * gemini-embedding is limited per MINUTE across the whole project, so every caller shares one
 * budget: the indexer, verification scripts, audit tools, and the API's own boot warmup. An audit
 * script that embeds a throwaway string to count vectors is spending the indexer's budget, and
 * that is precisely how a live 797-vector run was pushed into 429 mid-flight.
 *
 * The rule this module enforces:
 *
 *   COUNTING AND STATUS  -> never embeds. Pinecone applies a metadata filter regardless of what
 *                           the query vector contains, so a constant of the right dimension
 *                           returns the same matches with meaningless scores. Counts are exact;
 *                           only the ORDER is nonsense, and nothing here reads the order.
 *
 *   SEMANTIC RETRIEVAL   -> embeds, but must first declare itself with requireNoIndexer(). If an
 *                           indexer holds the lock, the caller is refused rather than quietly
 *                           competing with a job that has hours invested in it.
 *
 * The lock is advisory and file-based, which is enough because these are operator-run scripts on
 * one machine. It is NOT a distributed lock and must not be relied on as one.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const env_1 = require("../../src/config/env");
const pinecone_service_1 = require("../../src/services/rag/pinecone.service");
/** Pinecone's dimension. A mismatch throws, which is a louder and better failure than silence. */
exports.PROBE_DIMENSION = 768;
/**
 * A constant stand-in for an embedding. Non-zero because some vector stores reject an all-zero
 * query; the value is otherwise arbitrary and carries no meaning.
 */
exports.PROBE_VECTOR = new Array(exports.PROBE_DIMENSION).fill(0.02);
const LOCK = path.join(__dirname, '.indexer.lock');
/**
 * Backstop only, deliberately far longer than any real run.
 *
 * Liveness is decided by whether the recorded PID still exists, not by elapsed time — these jobs
 * legitimately run for hours (797 vectors at ~10s each is over two hours, and the queued batch is
 * longer still). An earlier 30-minute cutoff here declared a perfectly healthy indexer stale and
 * let the guard wave through exactly the concurrent embedding it exists to prevent.
 *
 * This remains only to cover PID reuse after an unclean shutdown, where a recycled pid could make
 * a dead lock look alive indefinitely.
 */
const LOCK_STALE_MS = 12 * 60 * 60 * 1000;
function acquireIndexerLock(label) {
    const existing = readLock();
    if (existing) {
        throw new Error(`an indexer is already running (${existing.label}, pid ${existing.pid}, ` +
            `${Math.round((Date.now() - existing.startedAt) / 60000)}m). Refusing to start a second one.`);
    }
    const lock = { pid: process.pid, label, startedAt: Date.now() };
    fs.writeFileSync(LOCK, JSON.stringify(lock));
    const drop = () => releaseIndexerLock();
    process.on('exit', drop);
    process.on('SIGINT', () => { drop(); process.exit(130); });
    process.on('SIGTERM', () => { drop(); process.exit(143); });
}
function releaseIndexerLock() {
    try {
        if (readLockRaw()?.pid === process.pid)
            fs.unlinkSync(LOCK);
    }
    catch { /* already gone */ }
}
function readLockRaw() {
    try {
        return JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    }
    catch {
        return null;
    }
}
/** The live lock, or null when absent, stale, or owned by a process that no longer exists. */
function readLock() {
    const l = readLockRaw();
    if (!l)
        return null;
    if (Date.now() - l.startedAt > LOCK_STALE_MS)
        return null;
    try {
        process.kill(l.pid, 0);
    }
    catch {
        return null;
    } // signal 0 only tests existence
    return l;
}
/**
 * Refuse to spend embedding quota while an indexer holds the lock.
 * Call this before ANY generateEmbedding in a script that is not itself the indexer.
 */
function requireNoIndexer(operation) {
    const l = readLock();
    if (!l)
        return;
    throw new Error(`${operation} needs a real embedding, but "${l.label}" is indexing (pid ${l.pid}).\n` +
        `  Embedding quota is per-minute and shared, so this would compete with it.\n` +
        `  Wait for it to finish, or use a counting-only check that costs no quota.`);
}
/** Vector count for one exam. Zero embedding cost. */
async function countVectorsByExam(examId, cap = 2000) {
    const m = await pinecone_service_1.pineconeService.queryVectors(exports.PROBE_VECTOR, cap, { examId }, env_1.env.PINECONE_NAMESPACE);
    return m?.length ?? 0;
}
/** Metadata for one exam's vectors, for ownership/privacy checks. Zero embedding cost. */
async function sampleVectorMetadata(examId, n = 5) {
    const m = await pinecone_service_1.pineconeService.queryVectors(exports.PROBE_VECTOR, n, { examId }, env_1.env.PINECONE_NAMESPACE);
    return (m || []).map((x) => x.metadata);
}
