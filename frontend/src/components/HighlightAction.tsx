import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { addFlashcard } from '../lib/flashcards';

export default function HighlightAction() {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Small timeout to allow selection to register
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim();
        
        if (text && text.length > 5 && sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          setSelection({
            text,
            x: rect.left + rect.width / 2,
            y: rect.top - 10
          });
        } else {
          setSelection(null);
        }
      }, 50);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Don't close if clicking on the tooltip itself
      if ((e.target as HTMLElement).closest('#highlight-tooltip')) return;
      setSelection(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('touchstart', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('touchstart', handleMouseDown);
    };
  }, []);

  const handleCreateFlashcard = () => {
    if (!selection) return;
    
    setIsGenerating(true);
    
    // Simulate AI generating a flashcard from the text
    setTimeout(() => {
      const isDefinition = selection.text.includes(' is ') || selection.text.includes(' means ') || selection.text.includes(' are ');
      let front = selection.text.substring(0, 40) + '...';
      let back = selection.text;
      
      if (isDefinition) {
        const parts = selection.text.split(/ is | means | are /i);
        if (parts.length >= 2) {
          front = "What is " + parts[0].trim() + "?";
          back = parts.slice(1).join(" is ").trim();
        }
      } else {
         front = "Explain: " + selection.text.substring(0, 30) + "...";
      }

      addFlashcard({ front, back });
      
      setIsGenerating(false);
      setShowSuccess(true);
      
      setTimeout(() => {
        setShowSuccess(false);
        setSelection(null);
        window.getSelection()?.removeAllRanges();
      }, 1500);
    }, 1000);
  };

  return (
    <AnimatePresence>
      {selection && (
        <motion.div
          id="highlight-tooltip"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed z-50 flex items-center shadow-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden"
          style={{ 
            left: Math.max(10, selection.x - 100), 
            top: Math.max(10, selection.y - 50) 
          }}
        >
          {showSuccess ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-medium text-sm">
              <Check className="w-4 h-4" />
              Saved to Flashcards
            </div>
          ) : (
            <button
              onClick={handleCreateFlashcard}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-medium text-sm transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Make Flashcard
                </>
              )}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
