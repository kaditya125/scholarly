/**
 * Vector-store namespaces. The ONE place these names are spelled.
 *
 * In Qdrant a namespace is the `pinecone_namespace` payload key (PINECONE_NAMESPACE_KEY in
 * qdrantFilter.ts), applied as a mandatory `must` condition on every read. The key keeps its
 * historical name because every existing point carries it; renaming it would mean rewriting the
 * payload of the whole collection for no behavioural gain.
 */

/** Reference textbooks (Lucent, S. Chand, H.C. Verma, Irodov, …). Written only by scripts/reference/books/. */
export const REFERENCE_BOOK_NAMESPACE = 'reference_books';

/** `corpusBucket` payload value every reference-book chunk carries — a second guard on top of the namespace. */
export const REFERENCE_BOOK_CORPUS_BUCKET = 'REFERENCE_BOOK';
