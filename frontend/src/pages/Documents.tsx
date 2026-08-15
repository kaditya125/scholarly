import React, { useMemo, useState } from 'react';
import { Search, LibraryBig, Loader2, X, FolderOpen, BookOpen, Sparkles, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBookLibrary } from '../hooks/ai/useDocuments';
import { CollectionCard } from '../components/documents/CollectionCard';
import { PremiumBookCard } from '../components/documents/PremiumBookCard';
import { SubjectBooksView } from '../components/documents/SubjectBooksView';
import { BookDetailView } from '../components/documents/BookDetailView';
import { BookSummary } from '../lib/api/documents';
import { cn } from '../lib/utils';

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
      .filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.subject.toLowerCase().includes(q) ||
          (b.bookName || '').toLowerCase().includes(q) ||
          (b.className || '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.subject.localeCompare(b.subject) || classNum(a.className) - classNum(b.className));
  }, [books, search]);

  const totalChapters = useMemo(() => books.reduce((acc, b) => acc + (b.chapterCount || 0), 0), [books]);

  // ── Level 3: single book detail (chapters, learn, test) ──
  if (selectedBook) {
    return (
      <div className="w-full h-full max-w-5xl mx-auto pb-12 pt-4 px-4 sm:px-6">
        <BookDetailView notebookId={selectedBook.notebookId} onBack={() => setSelectedBook(null)} />
      </div>
    );
  }

  // ── Level 2: a subject's books as premium cards ──
  if (selectedSubject) {
    const subjectBooks = books.filter((b) => b.subject === selectedSubject);
    return (
      <div className="w-full max-w-7xl mx-auto pb-12 pt-4 px-4 sm:px-6">
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
    <div className="w-full min-h-full pb-14 bg-slate-50 dark:bg-[#131315] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7">
        {/* ── Top Header ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20 shrink-0">
                <FolderOpen className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                Curriculum Documents &amp; Library
              </h1>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Explore syllabus textbooks organized into subject collections — read chapters, scan questions, or start AI tutor sessions.
            </p>
          </div>

          {/* Quick Stats Chips */}
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Books:</span>
              <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">{books.length}</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Indexed Chapters:</span>
              <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">{totalChapters}</span>
            </div>
          </div>
        </div>

        {/* ── Search Bar ───────────────────────────────────────── */}
        <div className="relative mb-8 max-w-xl">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search across collections by book title, subject, or class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-10 py-2.5 bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] shadow-2xs transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Content Grid / States ────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
            <span className="text-[13px] text-slate-400">Loading your curriculum library…</span>
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-8 shadow-2xs">
            <div className="w-16 h-16 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mb-4 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
              <LibraryBig className="w-8 h-8" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">No books in your library yet</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mt-1.5 text-[13px] leading-relaxed">
              Once your curriculum textbooks are indexed, each course appears here as an interactive subject collection.
            </p>
          </div>
        ) : search.trim() ? (
          // Search → flat premium results across all subjects
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-8 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-[16px] font-bold text-slate-800 dark:text-slate-200">No books match “{search.trim()}”</h3>
              <p className="text-slate-500 dark:text-slate-400 text-[13px] mt-1">Try a different subject, class, or title.</p>
            </div>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 mb-4">
                {searchResults.length} book{searchResults.length > 1 ? 's' : ''} found
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3.5 pb-12">
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
                <CollectionCard
                  key={subject}
                  subject={subject}
                  books={subjectBooks}
                  onOpen={setSelectedSubject}
                  index={i}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
