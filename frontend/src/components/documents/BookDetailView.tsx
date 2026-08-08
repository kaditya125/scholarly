import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Clock3, GraduationCap, ClipboardCheck, Loader2,
  CheckCircle2, Hourglass, ChevronRight, Star, Bookmark, Users, ChevronDown,
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

const DIFFICULTY_STYLE: Record<string, string> = {
  Easy: 'text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/15',
  Medium: 'text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15',
  Hard: 'text-rose-600 dark:text-rose-300 bg-rose-100 dark:bg-rose-500/15',
};

export function BookDetailView({ notebookId, onBack }: BookDetailViewProps) {
  const navigate = useNavigate();
  const { book, isLoading } = useBookDetail(notebookId);
  const [openChapter, setOpenChapter] = useState<BookChapter | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  if (isLoading || !book) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
      </div>
    );
  }

  // A chapter was opened → show its full overview instead of the book's chapter list.
  if (openChapter) {
    return <ChapterOverview book={book} chapter={openChapter} onBack={() => setOpenChapter(null)} />;
  }

  const meta = getSubjectMeta(book.subject);
  
  // Calculate stats
  const completedChapters = book.chapters.filter(ch => ch.status === 'READY').length;
  const totalChapters = book.chapters.length;
  const completionRate = Math.round((completedChapters / totalChapters) * 100);
  
  // Mock review data (replace with real data when available)
  const reviewCount = 148;
  const rating = 4.5;

  const handleLearn = (chapter?: BookChapter) => {
    const params = new URLSearchParams({ notebookId: book.notebookId, notebookTitle: book.bookName || book.title });
    if (chapter) {
      // Scope the learning pane to this chapter and pre-select it.
      params.set('chapter', chapter.sourceId);
      params.set('prompt', `Let's start with "${chapterLabel(chapter)}". Give me a clear overview of what it covers, then let's go through it together.`);
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

  // Open the in-app PDF reader + AI Question Scanner for a specific chapter.
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
  
  // Truncate description to ~200 chars
  const shortDescription = book.description.length > 200 
    ? book.description.slice(0, 200) + '...' 
    : book.description;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 overflow-y-auto custom-scrollbar">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Hero Section - Book Detail inspired by Sapiens template */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-8">
        {/* Left: Book Cover */}
        <div className="lg:w-[280px] shrink-0 flex items-start justify-center lg:justify-start">
          <div className="w-full max-w-[240px] aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 dark:border-white/5">
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
          {/* Bookmark icon */}
          <button
            onClick={() => setIsBookmarked(!isBookmarked)}
            className="absolute top-0 right-0 w-11 h-11 rounded-xl flex items-center justify-center bg-white/10 dark:bg-white/10 border border-white/20 dark:border-white/10 hover:border-orange-300 dark:hover:border-orange-500/40 transition-all hover:shadow-md group backdrop-blur-sm"
            aria-label="Bookmark"
          >
            <Bookmark 
              className={cn(
                "w-5 h-5 transition-colors",
                isBookmarked 
                  ? "fill-orange-500 text-orange-500" 
                  : "text-slate-400 dark:text-gray-400 group-hover:text-orange-500"
              )} 
            />
          </button>

          {/* Title */}
          <h1 className="text-[32px] lg:text-[36px] font-bold text-slate-900 dark:text-white leading-[1.1] mb-3 pr-12">
            {book.bookName || book.title}
          </h1>

          {/* Author / Class */}
          {book.className && (
            <p className="text-[15px] font-semibold text-slate-600 dark:text-gray-400 mb-4">
              By NCERT Board
            </p>
          )}

          {/* Genre/Subject Badge */}
          <div className="mb-4">
            <span className="inline-block text-[13px] font-semibold text-slate-600 dark:text-gray-400">
              Genres/<span className={cn("font-bold", meta.accent.split(' ').find(c => c.startsWith('text-')))}>{book.subject}</span>
            </span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1 mb-5">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "w-5 h-5",
                  i < Math.floor(rating) 
                    ? "fill-orange-400 text-orange-400" 
                    : i < rating 
                      ? "fill-orange-400 text-orange-400 opacity-50"
                      : "text-slate-300 dark:text-gray-600"
                )}
              />
            ))}
          </div>

          {/* Description */}
          <div className="mb-6">
            <p className="text-[14.5px] text-slate-700 dark:text-gray-300 leading-relaxed">
              {showFullDescription ? book.description : shortDescription}
              {book.description.length > 200 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="ml-2 text-[14.5px] font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1"
                >
                  {showFullDescription ? 'View less' : 'View more'}
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showFullDescription && "rotate-180")} />
                </button>
              )}
            </p>
          </div>

          {/* Stats: Reviews + Chapters + Time */}
          <div className="flex items-center gap-5 mb-6">
            {/* Mock user avatars + reviews */}
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-slate-900 dark:border-[#0a0a0b] overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500"
                  >
                    {/* Placeholder avatar */}
                  </div>
                ))}
              </div>
              <span className="text-[14px] font-semibold text-orange-600 dark:text-orange-400">
                {reviewCount} reviews
              </span>
            </div>
          </div>

          {/* Primary CTA */}
          <button
            onClick={() => handleLearn()}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl text-[15px] font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-100"
          >
            <GraduationCap className="w-5 h-5" /> 
            Read now
          </button>
        </div>
      </div>

      {/* Secondary Actions Bar */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => handleTakeTest(book.bookName || book.title)}
          className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/40 text-slate-200 dark:text-gray-200 rounded-xl text-[14px] font-semibold transition-all hover:shadow-md backdrop-blur-sm"
        >
          <ClipboardCheck className="w-4 h-4" /> Take a full test
        </button>
        <div className="flex items-center gap-2.5 px-5 py-3 bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 text-slate-200 dark:text-gray-300 rounded-xl text-[14px] font-semibold backdrop-blur-sm">
          <BookOpen className="w-4 h-4" /> {totalChapters} chapters
        </div>
        {book.estimatedStudyHours > 0 && (
          <div className="flex items-center gap-2.5 px-5 py-3 bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 text-slate-200 dark:text-gray-300 rounded-xl text-[14px] font-semibold backdrop-blur-sm">
            <Clock3 className="w-4 h-4" /> ~{book.estimatedStudyHours}h study time
          </div>
        )}
        {completedChapters > 0 && (
          <div className="flex items-center gap-2.5 px-5 py-3 bg-emerald-500/20 dark:bg-emerald-500/10 border border-emerald-400/30 dark:border-emerald-500/20 text-emerald-300 dark:text-emerald-400 rounded-xl text-[14px] font-semibold backdrop-blur-sm">
            <CheckCircle2 className="w-4 h-4" /> {completionRate}% complete
          </div>
        )}
      </div>

      {/* Chapters — shown as PDF file cards */}
      <h2 className="text-[18px] font-bold text-slate-900 dark:text-gray-100 mb-4">Chapters</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 mb-8">
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
    </motion.div>
  );
}
