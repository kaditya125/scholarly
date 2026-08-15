import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Clock3, GraduationCap, ClipboardCheck, Loader2,
  CheckCircle2, Hourglass, ChevronRight, Star, Bookmark, Users, ChevronDown,
  Sparkles
} from 'lucide-react';
import { motion } from 'motion/react';
import { useBookDetail } from '../../hooks/ai/useDocuments';
import { BookChapter, chapterLabel } from '../../lib/api/documents';
import { BookCover } from './BookCover';
import { ChapterOverview } from './ChapterOverview';
import { ChapterFileCard } from './ChapterFileCard';
import { getSubjectMeta } from './subjectMeta';
import { cn } from '../../lib/utils';

interface BookDetailViewProps {
  notebookId: string;
  onBack: () => void;
}

export function BookDetailView({ notebookId, onBack }: BookDetailViewProps) {
  const navigate = useNavigate();
  const { book, isLoading } = useBookDetail(notebookId);
  const [openChapter, setOpenChapter] = useState<BookChapter | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  if (isLoading || !book) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
        <span className="text-[13px] text-slate-400">Loading course textbook…</span>
      </div>
    );
  }

  // A chapter was opened → show its full overview instead of the book's chapter list.
  if (openChapter) {
    return <ChapterOverview book={book} chapter={openChapter} onBack={() => setOpenChapter(null)} />;
  }

  const meta = getSubjectMeta(book.subject);

  // Calculate stats
  const completedChapters = book.chapters.filter((ch) => ch.status === 'READY').length;
  const totalChapters = book.chapters.length;
  const completionRate = Math.round((completedChapters / Math.max(1, totalChapters)) * 100);

  const reviewCount = 148;
  const rating = 4.8;

  const handleLearn = (chapter?: BookChapter) => {
    const params = new URLSearchParams({
      notebookId: book.notebookId,
      notebookTitle: book.bookName || book.title,
    });
    if (chapter) {
      params.set('chapter', chapter.sourceId);
      params.set(
        'prompt',
        `Let's start with "${chapterLabel(chapter)}". Give me a clear overview of what it covers, then let's go through it together.`,
      );
    }
    navigate(`/chat?${params.toString()}`);
  };

  const handleTakeTest = (chapterTitle: string) => {
    navigate('/test', {
      state: {
        mode: 'exam',
        topic: chapterTitle,
        notebookId: book.notebookId,
        notebookTitle: book.bookName || book.title,
      },
    });
  };

  const handleRead = (chapter: BookChapter) => {
    const params = new URLSearchParams({
      notebookId: book.notebookId,
      sourceId: chapter.sourceId,
      title: chapterLabel(chapter),
      book: book.bookName || book.title,
      subject: book.subject,
    });
    navigate(`/read?${params.toString()}`);
  };

  const shortDescription =
    book.description.length > 200 ? book.description.slice(0, 200) + '...' : book.description;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 overflow-y-auto custom-scrollbar">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#1a1a1e] text-[13px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232328] transition-all mb-6 cursor-pointer shadow-2xs active:scale-98"
      >
        <ArrowLeft className="w-4 h-4" /> Back to books
      </button>

      {/* Hero Section */}
      <div className="bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-6 sm:p-8 shadow-2xs mb-8">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
          {/* Left: Book Cover */}
          <div className="lg:w-[240px] shrink-0 flex items-start justify-center lg:justify-start">
            <div className="w-full max-w-[220px] aspect-[3/4] rounded-2xl overflow-hidden shadow-xl border-2 border-slate-200/80 dark:border-white/10">
              <BookCover
                notebookId={book.notebookId}
                subject={book.subject}
                title={book.bookName || book.title}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Right: Book Info */}
          <div className="flex-1 relative">
            {/* Bookmark button */}
            <button
              onClick={() => setIsBookmarked(!isBookmarked)}
              className={cn(
                'absolute top-0 right-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer shadow-2xs',
                isBookmarked
                  ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 border-rose-200 dark:border-rose-500/30'
                  : 'bg-slate-50 dark:bg-[#232328] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-slate-200/80 dark:border-white/[0.08]'
              )}
              title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Book'}
            >
              <Bookmark className={cn('w-4 h-4', isBookmarked && 'fill-rose-600')} />
            </button>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight mb-2 pr-12 tracking-tight">
              {book.bookName || book.title}
            </h1>

            {/* Subject & Author */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] border border-[#8ba32b]/25 dark:border-[#c8e558]/25">
                {book.subject}
              </span>
              {book.className && (
                <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                  · {book.className} (NCERT Curriculum)
                </span>
              )}
            </div>

            {/* Rating */}
            <div className="flex items-center gap-1.5 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'w-4 h-4',
                    i < Math.floor(rating)
                      ? 'fill-amber-500 text-amber-500'
                      : 'text-slate-300 dark:text-slate-600'
                  )}
                />
              ))}
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200 ml-1">{rating}</span>
              <span className="text-[12px] text-slate-400 dark:text-slate-500">({reviewCount} student ratings)</span>
            </div>

            {/* Description */}
            <p className="text-[13.5px] text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              {showFullDescription ? book.description : shortDescription}
              {book.description.length > 200 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="ml-2 text-[13px] font-bold text-slate-900 dark:text-white hover:text-[#8ba32b] dark:hover:text-[#c8e558] transition-colors cursor-pointer inline-flex items-center gap-0.5"
                >
                  {showFullDescription ? 'Show less' : 'Read more'}
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showFullDescription && 'rotate-180')} />
                </button>
              )}
            </p>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleLearn()}
                className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 rounded-full text-[13.5px] font-bold transition-all shadow-md hover:opacity-90 cursor-pointer active:scale-98"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Start AI Learning Session</span>
              </button>

              <button
                onClick={() => handleTakeTest(book.bookName || book.title)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-50 dark:bg-[#232328] border border-slate-200/90 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 rounded-full text-[13px] font-bold transition-all hover:bg-slate-100 dark:hover:bg-[#2b2b32] cursor-pointer shadow-2xs active:scale-98"
              >
                <ClipboardCheck className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
                <span>Full Book Mock Test</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Chapters</div>
          <div className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
            <span>{totalChapters} Total</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Study Hours</div>
          <div className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Clock3 className="w-4 h-4 text-amber-500" />
            <span>~{book.estimatedStudyHours || 24}h</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Indexed Content</div>
          <div className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
            <span>{completionRate}% Ready</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">AI Question Scan</div>
          <div className="text-[16px] font-bold text-[#8ba32b] dark:text-[#c8e558] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            <span>Active</span>
          </div>
        </div>
      </div>

      {/* Chapters Grid */}
      <div className="mb-8">
        <h2 className="text-[18px] font-bold text-slate-900 dark:text-white mb-4">
          Course Chapters ({totalChapters})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {book.chapters.map((ch, i) => (
            <ChapterFileCard
              key={ch.sourceId}
              book={book}
              chapter={ch}
              index={i}
              onRead={() => handleRead(ch)}
              onLearn={() => handleLearn(ch)}
              onTest={() => handleTakeTest(chapterLabel(ch))}
              onOpen={() => setOpenChapter(ch)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
