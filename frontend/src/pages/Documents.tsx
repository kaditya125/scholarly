import { useMemo, useState } from 'react';
import { Search, LibraryBig, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBookLibrary } from '../hooks/ai/useDocuments';
import { CollectionCard } from '../components/documents/CollectionCard';
import { PremiumBookCard } from '../components/documents/PremiumBookCard';
import { SubjectBooksView } from '../components/documents/SubjectBooksView';
import { BookDetailView } from '../components/documents/BookDetailView';
import { BookSummary } from '../lib/api/documents';

const classNum = (c?: string) => (c ? parseInt(c.replace(/\D/g, ''), 10) || 0 : 0);

export default function Documents() {
  const { books, isLoading } = useBookLibrary();
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null);

  // Group books into subject "collections" (sorted by book count desc, then name).
  const collections = useMemo(() => {
    const map = new Map<string, BookSummary[]>();
    for (const b of books) {
      if (!map.has(b.subject)) map.set(b.subject, []);
      map.get(b.subject)!.push(b);
    }
    return Array.from(map.entries())
      .map(([subject, list]) => ({ subject, books: list }))
      .sort((a, b) => b.books.length - a.books.length || a.subject.localeCompare(b.subject));
  }, [books]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return books
      .filter((b) => b.title.toLowerCase().includes(q) || b.subject.toLowerCase().includes(q) || (b.bookName || '').toLowerCase().includes(q) || (b.className || '').toLowerCase().includes(q))
      .sort((a, b) => a.subject.localeCompare(b.subject) || classNum(a.className) - classNum(b.className));
  }, [books, search]);

  // ── Level 3: single book detail (chapters, learn, test) ──
  if (selectedBook) {
    return (
      <div className="w-full h-full max-w-5xl mx-auto">
        <BookDetailView notebookId={selectedBook.notebookId} onBack={() => setSelectedBook(null)} />
      </div>
    );
  }

  // ── Level 2: a subject's books as premium cards ──
  if (selectedSubject) {
    const subjectBooks = books.filter((b) => b.subject === selectedSubject);
    return (
      <div className="w-full max-w-7xl mx-auto">
        <SubjectBooksView
          subject={selectedSubject}
          books={subjectBooks}
          onBack={() => setSelectedSubject(null)}
          onOpenBook={setSelectedBook}
        />
      </div>
    );
  }

  // ── Level 1: collections home ──
  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[26px] md:text-[30px] font-bold text-slate-900 dark:text-white flex items-center gap-3 mb-1.5">
          <LibraryBig className="w-7 h-7 text-indigo-500" /> Documents
        </h1>
        <p className="text-slate-500 dark:text-gray-400 text-[14.5px]">
          Your curriculum, organized into subject collections. Open one to browse its books, then learn any chapter or take a test.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-7 max-w-xl">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search across collections..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-xl text-[13.5px] text-slate-800 dark:text-gray-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
        </div>
      ) : books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
            <LibraryBig className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-[16px] font-bold text-slate-700 dark:text-gray-200">No books in your library yet</h3>
          <p className="text-slate-500 dark:text-gray-400 max-w-md mt-2 text-[13.5px]">
            Once your curriculum is ingested, every textbook shows up here as a browsable collection.
          </p>
        </div>
      ) : search.trim() ? (
        // Search → flat premium results across all subjects
        searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-[15px] font-bold text-slate-700 dark:text-gray-200">No books match “{search.trim()}”</h3>
            <p className="text-slate-500 dark:text-gray-400 text-[13px] mt-1">Try a different subject, class, or title.</p>
          </div>
        ) : (
          <>
            <p className="text-[13px] font-medium text-slate-500 dark:text-gray-400 mb-4">
              {searchResults.length} book{searchResults.length > 1 ? 's' : ''} found
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-4 gap-y-8 pb-10">
              {searchResults.map((book, i) => (
                <PremiumBookCard key={book.notebookId} book={book} onOpen={setSelectedBook} index={i} />
              ))}
            </div>
          </>
        )
      ) : (
        // Collections grid
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8 pb-10"
          >
            {collections.map(({ subject, books: subjectBooks }, i) => (
              <CollectionCard key={subject} subject={subject} books={subjectBooks} onOpen={setSelectedSubject} index={i} />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
