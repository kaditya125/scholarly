import React, { useMemo, useState } from 'react';
import {
  Search, Loader2, X, FolderOpen, Library, FileText, ScrollText, Layers, Inbox,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useBookLibrary } from '../hooks/ai/useDocuments';
import { useNotebooks } from '../hooks/ai/useNotebook';
import { usePyqSources } from '../hooks/ai/usePyqSources';
import { paperLabel } from '../lib/api/pyq';
import { DocumentTile } from '../components/documents/DocumentTile';
import { DocumentTypeRail } from '../components/documents/DocumentTypeRail';
import { PremiumBookCard } from '../components/documents/PremiumBookCard';
import { SubjectBooksView } from '../components/documents/SubjectBooksView';
import { BookDetailView } from '../components/documents/BookDetailView';
import { BookSummary } from '../lib/api/documents';

const classNum = (c?: string) => (c ? parseInt(c.replace(/\D/g, ''), 10) || 0 : 0);
const EASE = [0.16, 1, 0.3, 1] as const;

type TypeId = 'all' | 'curriculum' | 'mine' | 'papers';

/**
 * Documents.
 *
 * This page used to be the curriculum library and nothing else: subject collections rendered as
 * gradient book covers. Two problems with that as the app's document surface.
 *
 * It only ever showed one kind of document. A user's own uploads live in notebooks and
 * previous-year papers live in the PYQ registry — both already in the backend, neither reachable
 * from here, so "Documents" was a misnomer for a slice of what the product holds.
 *
 * And the covers spent five colour ramps on decoration. The app's accent is a single lime; a grid
 * of pink, blue, purple, orange and teal rectangles competes with it and emphasises nothing. The
 * tiles now carry one accent each and let type and spacing do the work.
 *
 * Structure is a type rail over a shared search and grid, so the three sources read as one
 * library rather than three pages stitched together. Curriculum keeps its existing drill-down
 * (subject -> books -> chapters) because that hierarchy is real and works.
 */
export default function Documents() {
  const navigate = useNavigate();
  const { books, isLoading: booksLoading } = useBookLibrary();
  const { notebooks, isLoading: notebooksLoading } = useNotebooks();
  const { sources: papers, isLoading: papersLoading } = usePyqSources();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeId>('all');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null);

  const q = search.trim().toLowerCase();

  // ── Curriculum, grouped into subject collections ────────────────────────────────────────────
  const collections = useMemo(() => {
    const map = new Map<string, BookSummary[]>();
    for (const b of books) {
      if (!map.has(b.subject)) map.set(b.subject, []);
      map.get(b.subject)!.push(b);
    }
    return Array.from(map.entries())
      .map(([subject, list]) => ({
        subject,
        books: list,
        chapters: list.reduce((n, b) => n + (b.chapterCount || 0), 0),
      }))
      .sort((a, b) => b.books.length - a.books.length || a.subject.localeCompare(b.subject));
  }, [books]);

  // ── Personal notebooks. Archived ones are deliberately excluded: they are still reachable
  //    from the notebook page, but a library view should show what is in use. ─────────────────
  const myNotebooks = useMemo(
    () => (notebooks || []).filter((n: any) => !n.isArchived),
    [notebooks],
  );

  // ── Papers, newest first, only those actually retrievable ───────────────────────────────────
  const availablePapers = useMemo(
    () =>
      (papers || [])
        .filter((p) => p.availabilityStatus !== 'MISSING')
        .sort((a, b) => (b.year || 0) - (a.year || 0) || (a.examName || '').localeCompare(b.examName || '')),
    [papers],
  );

  // ── Search runs across every type, so a query is never silently scoped to the open tab ───────
  const matched = useMemo(() => {
    if (!q) return null;
    return {
      books: books
        .filter((b) =>
          [b.title, b.subject, b.bookName, b.className].some((f) => (f || '').toLowerCase().includes(q)),
        )
        .sort((a, b) => a.subject.localeCompare(b.subject) || classNum(a.className) - classNum(b.className)),
      notebooks: myNotebooks.filter((n: any) => (n.title || '').toLowerCase().includes(q)),
      papers: availablePapers.filter((p) =>
        [p.examName, p.examId, p.subject, p.session, String(p.year)].some((f) =>
          (f || '').toLowerCase().includes(q),
        ),
      ),
    };
  }, [q, books, myNotebooks, availablePapers]);

  const totalChapters = useMemo(
    () => books.reduce((acc, b) => acc + (b.chapterCount || 0), 0),
    [books],
  );
  const myFileCount = useMemo(
    () => myNotebooks.reduce((n: number, nb: any) => n + (nb.stats?.documentCount || 0), 0),
    [myNotebooks],
  );

  const isLoading = booksLoading || notebooksLoading || papersLoading;

  const types = [
    { id: 'all', label: 'All', icon: Layers, count: books.length + myNotebooks.length + availablePapers.length },
    { id: 'curriculum', label: 'Curriculum', icon: Library, count: books.length },
    { id: 'mine', label: 'My documents', icon: FileText, count: myFileCount },
    { id: 'papers', label: 'Question papers', icon: ScrollText, count: availablePapers.length },
  ];

  // ── Drill-downs keep their existing views ───────────────────────────────────────────────────
  if (selectedBook) {
    return (
      <div className="w-full h-full max-w-5xl mx-auto pb-12 pt-4 px-4 sm:px-6">
        <BookDetailView notebookId={selectedBook.notebookId} onBack={() => setSelectedBook(null)} />
      </div>
    );
  }

  if (selectedSubject) {
    return (
      <div className="w-full max-w-7xl mx-auto pb-12 pt-4 px-4 sm:px-6">
        <SubjectBooksView
          subject={selectedSubject}
          books={books.filter((b) => b.subject === selectedSubject)}
          onBack={() => setSelectedSubject(null)}
          onOpenBook={setSelectedBook}
        />
      </div>
    );
  }

  const showCurriculum = type === 'all' || type === 'curriculum';
  const showMine = type === 'all' || type === 'mine';
  const showPapers = type === 'all' || type === 'papers';

  const Section = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
    <section className="mb-9">
      <div className="flex items-baseline gap-2.5 mb-3.5">
        <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white tracking-tight">{title}</h2>
        <span className="text-[12px] text-slate-400 dark:text-slate-500 tabular-nums">{count}</span>
      </div>
      {children}
    </section>
  );

  const Grid = ({ children }: { children: React.ReactNode }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{children}</div>
  );

  const Empty = ({ line }: { line: string }) => (
    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 px-5 py-8 text-center">
      <Inbox className="w-5 h-5 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{line}</p>
    </div>
  );

  return (
    <div className="w-full min-h-full pb-14 bg-slate-50 dark:bg-[#131315] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7">
        {/* ── Header ─────────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20 shrink-0">
                <FolderOpen className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                Documents
              </h1>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-2xl">
              Curriculum textbooks, your own uploads and previous-year papers — read, search and
              start a tutor session from any of them.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] flex items-baseline gap-1.5">
              <span className="text-[12px] text-slate-500 dark:text-slate-400">Chapters</span>
              <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white tabular-nums">
                {totalChapters}
              </span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] flex items-baseline gap-1.5">
              <span className="text-[12px] text-slate-500 dark:text-slate-400">Papers</span>
              <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white tabular-nums">
                {availablePapers.length}
              </span>
            </div>
          </div>
        </div>

        {/* ── Type rail + search ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-8">
          <DocumentTypeRail types={types} active={type} onChange={(id) => setType(id as TypeId)} />

          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search books, uploads and papers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-10 py-2.5 bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
            <span className="text-[13px] text-slate-400">Loading your library…</span>
          </div>
        ) : matched ? (
          // ── Search: results across every type, each labelled so the source is obvious ──
          <AnimatePresence mode="wait">
            <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }}>
              {matched.books.length === 0 && matched.notebooks.length === 0 && matched.papers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
                    <Search className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">
                    Nothing matches “{search.trim()}”
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-[13px] mt-1">
                    Try a subject, class, exam or file name.
                  </p>
                </div>
              ) : (
                <>
                  {matched.books.length > 0 && (
                    <Section title="Curriculum" count={matched.books.length}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {matched.books.map((b, i) => (
                          <PremiumBookCard key={b.notebookId} book={b} onOpen={setSelectedBook} index={i} />
                        ))}
                      </div>
                    </Section>
                  )}
                  {matched.notebooks.length > 0 && (
                    <Section title="My documents" count={matched.notebooks.length}>
                      <Grid>
                        {matched.notebooks.map((n: any, i: number) => (
                          <DocumentTile
                            key={n.id}
                            index={i}
                            icon={FileText}
                            title={n.title}
                            subtitle={`${n.stats?.documentCount ?? 0} file${(n.stats?.documentCount ?? 0) === 1 ? '' : 's'}`}
                            facts={[
                              n.stats?.flashcardsCount ? `${n.stats.flashcardsCount} flashcards` : null,
                              n.stats?.quizCount ? `${n.stats.quizCount} quizzes` : null,
                            ]}
                            onClick={() => navigate(`/notebooks?id=${n.id}`)}
                          />
                        ))}
                      </Grid>
                    </Section>
                  )}
                  {matched.papers.length > 0 && (
                    <Section title="Question papers" count={matched.papers.length}>
                      <Grid>
                        {matched.papers.slice(0, 48).map((p, i) => (
                          <DocumentTile
                            key={p.sourceId}
                            index={i}
                            icon={ScrollText}
                            title={paperLabel(p)}
                            subtitle={p.authority}
                            facts={[p.language, p.documentType]}
                            status={
                              p.availabilityStatus === 'AVAILABLE'
                                ? { label: 'Available', tone: 'ready' }
                                : { label: 'Partial', tone: 'pending' }
                            }
                            onClick={() => navigate(`/tests?exam=${encodeURIComponent(p.examId)}`)}
                          />
                        ))}
                      </Grid>
                    </Section>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={type} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }}>
              {showCurriculum && (
                <Section title="Curriculum collections" count={collections.length}>
                  {collections.length === 0 ? (
                    <Empty line="No curriculum books indexed yet." />
                  ) : (
                    <Grid>
                      {collections.map(({ subject, books: list, chapters }, i) => (
                        <DocumentTile
                          key={subject}
                          index={i}
                          icon={Library}
                          title={subject}
                          subtitle={`${list.length} book${list.length === 1 ? '' : 's'}`}
                          facts={[`${chapters} chapters`]}
                          onClick={() => setSelectedSubject(subject)}
                        />
                      ))}
                    </Grid>
                  )}
                </Section>
              )}

              {showMine && (
                <Section title="My documents" count={myNotebooks.length}>
                  {myNotebooks.length === 0 ? (
                    <Empty line="Nothing uploaded yet — add a PDF or notes from any notebook." />
                  ) : (
                    <Grid>
                      {myNotebooks.map((n: any, i: number) => (
                        <DocumentTile
                          key={n.id}
                          index={i}
                          icon={FileText}
                          title={n.title}
                          subtitle={`${n.stats?.documentCount ?? 0} file${(n.stats?.documentCount ?? 0) === 1 ? '' : 's'}`}
                          facts={[
                            n.stats?.flashcardsCount ? `${n.stats.flashcardsCount} flashcards` : null,
                            n.stats?.quizCount ? `${n.stats.quizCount} quizzes` : null,
                            n.isPinned ? 'Pinned' : null,
                          ]}
                          onClick={() => navigate(`/notebooks?id=${n.id}`)}
                        />
                      ))}
                    </Grid>
                  )}
                </Section>
              )}

              {showPapers && (
                <Section title="Question papers" count={availablePapers.length}>
                  {availablePapers.length === 0 ? (
                    <Empty line="No previous-year papers available yet." />
                  ) : (
                    <Grid>
                      {availablePapers.slice(0, 48).map((p, i) => (
                        <DocumentTile
                          key={p.sourceId}
                          index={i}
                          icon={ScrollText}
                          title={paperLabel(p)}
                          subtitle={p.authority}
                          facts={[p.language, p.documentType]}
                          status={
                            p.availabilityStatus === 'AVAILABLE'
                              ? { label: 'Available', tone: 'ready' }
                              : { label: 'Partial', tone: 'pending' }
                          }
                          onClick={() => navigate(`/tests?exam=${encodeURIComponent(p.examId)}`)}
                        />
                      ))}
                    </Grid>
                  )}
                  {availablePapers.length > 48 && (
                    <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-500">
                      Showing 48 of {availablePapers.length}. Search to narrow by exam or year.
                    </p>
                  )}
                </Section>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
