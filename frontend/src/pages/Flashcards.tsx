import React, { useState } from 'react';
import { Sparkles, ArrowLeft, ArrowRight, Brain, RotateCcw, Trash2, Library, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useFlashcards } from '../hooks/ai/useFlashcards';

export default function Flashcards() {
  const { cards, isLoading, deleteCard } = useFlashcards();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);

  const handleDelete = async (id: string) => {
    await deleteCard(id);
    if (currentIndex >= cards.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }, 150);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
    }, 150);
  };

  return (
    <div className="w-full h-full flex flex-col items-center pt-8 px-4 sm:px-8 bg-slate-50 dark:bg-[#131314] overflow-y-auto">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[32px] font-bold text-slate-900 dark:text-white font-serif tracking-tight flex items-center gap-3">
              <Library className="w-8 h-8 text-indigo-500" />
              My Flashcards
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Review flashcards you generated from your study materials.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {cards.length > 0 && (
              <button
                onClick={() => {
                  setIsReviewMode(!isReviewMode);
                  setIsFlipped(false);
                  setCurrentIndex(0);
                }}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                {isReviewMode ? (
                  <>
                    <Library className="w-4 h-4" /> View All
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" /> Start Review
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/50">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">No flashcards yet</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm">
              Highlight text in your chat or study materials to automatically generate and save flashcards here.
            </p>
          </div>
        ) : isReviewMode ? (
          /* Review Mode */
          <div className="flex flex-col items-center max-w-2xl mx-auto mt-12 w-full">
            <div className="w-full relative [perspective:1000px] min-h-[300px] mb-8 cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
              <motion.div
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
                className="w-full h-full min-h-[300px] relative [transform-style:preserve-3d]"
              >
                {/* Front */}
                <div className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-8 flex flex-col [backface-visibility:hidden]">
                  <div className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 dark:border-slate-800 pb-2">Front</div>
                  <div className="flex-1 flex items-center justify-center text-center">
                    <p className="text-2xl font-serif text-slate-800 dark:text-slate-100">{cards[currentIndex]?.front}</p>
                  </div>
                  <div className="text-center text-sm text-slate-400 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">Click to flip</div>
                </div>

                {/* Back */}
                <div className="absolute inset-0 w-full h-full bg-indigo-50 dark:bg-indigo-950/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl shadow-sm p-8 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-6 border-b border-indigo-100 dark:border-indigo-800/50 pb-2">Back</div>
                  <div className="flex-1 flex items-center justify-center text-center">
                    <p className="text-xl text-slate-800 dark:text-slate-200">{cards[currentIndex]?.back}</p>
                  </div>
                  <div className="text-center text-sm text-indigo-400 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">Click to flip back</div>
                </div>
              </motion.div>
            </div>

            <div className="flex items-center gap-6 justify-center">
              <button
                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="font-medium text-slate-500 dark:text-slate-400 min-w-[80px] text-center">
                {currentIndex + 1} / {cards.length}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          /* List Mode */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {cards.map((card) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  key={card.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md flex flex-col group transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Card</span>
                    <button
                      onClick={() => handleDelete(card.id)}
                      className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete flashcard"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="mb-4">
                    <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Front</h3>
                    <p className="text-slate-800 dark:text-slate-200 font-medium line-clamp-3">{card.front}</p>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-auto">
                    <h3 className="text-[13px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">Back</h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3">{card.back}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
