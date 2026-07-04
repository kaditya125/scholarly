import React, { useState } from 'react';
import { LearningAsset } from '../../types';
import { Layers, Target, Map as MapIcon, FileText, Clock, Mic, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AssetViewerProps {
  asset: LearningAsset;
  onBack?: () => void;
}

export function AssetViewer({ asset, onBack }: AssetViewerProps) {
  
  const renderContent = () => {
    switch (asset.type) {
      case 'FLASHCARDS':
        return <FlashcardViewer cards={asset.content?.cards || []} />;
      case 'QUIZ':
        return <QuizViewer questions={asset.content?.questions || []} />;
      case 'NOTES':
      case 'SUMMARY':
      case 'PODCAST':
        return (
          <div className="prose prose-sm md:prose-base dark:prose-invert max-w-4xl mx-auto p-6 bg-white dark:bg-[#1a1a1b] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm mt-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
               {typeof asset.content === 'string' ? asset.content : asset.content?.text || asset.content?.script || ''}
            </ReactMarkdown>
          </div>
        );
      default:
        return (
          <div className="p-8 text-center text-slate-500">
             Renderer for {asset.type} coming soon.
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-[#121212] p-6 custom-scrollbar">
       <div className="max-w-5xl mx-auto w-full">
         <button 
           onClick={onBack}
           className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-gray-300 transition-colors"
         >
           <ChevronLeft className="w-4 h-4" /> Back to Assets
         </button>
         
         <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              {asset.type === 'FLASHCARDS' && <Layers className="w-6 h-6" />}
              {asset.type === 'QUIZ' && <Target className="w-6 h-6" />}
              {asset.type === 'NOTES' && <FileText className="w-6 h-6" />}
              {asset.type === 'PODCAST' && <Mic className="w-6 h-6" />}
              {asset.type === 'SUMMARY' && <FileText className="w-6 h-6" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{asset.title}</h1>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-1">{asset.type}</p>
            </div>
         </div>
         
         {renderContent()}
       </div>
    </div>
  );
}

function FlashcardViewer({ cards }: { cards: any[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards || cards.length === 0) return <p>No flashcards found.</p>;

  const handleNext = () => {
    setFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const handlePrev = () => {
    setFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const card = cards[currentIndex];

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center mt-10">
       <div 
         onClick={() => setFlipped(!flipped)}
         className="w-full aspect-[3/2] cursor-pointer group perspective-1000"
       >
         <div className={`relative w-full h-full transition-all duration-500 transform-style-3d ${flipped ? 'rotate-y-180' : ''}`}>
           {/* Front */}
           <div className="absolute inset-0 backface-hidden bg-white dark:bg-[#1a1a1b] rounded-3xl border border-slate-200 dark:border-white/10 shadow-lg flex items-center justify-center p-10 text-center">
             <h3 className="text-2xl font-bold text-slate-800 dark:text-gray-100">{card.front}</h3>
             <p className="absolute bottom-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Click to flip</p>
           </div>
           
           {/* Back */}
           <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 dark:bg-indigo-900 rounded-3xl border border-indigo-500 dark:border-indigo-700 shadow-lg flex items-center justify-center p-10 text-center">
             <div className="prose prose-invert max-w-none">
               <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.back}</ReactMarkdown>
             </div>
           </div>
         </div>
       </div>
       
       <div className="flex items-center gap-6 mt-8">
         <button onClick={handlePrev} className="p-3 rounded-full bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-600 dark:text-gray-300">
           <ChevronLeft className="w-6 h-6" />
         </button>
         <span className="text-sm font-bold text-slate-500">
           {currentIndex + 1} / {cards.length}
         </span>
         <button onClick={handleNext} className="p-3 rounded-full bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-600 dark:text-gray-300">
           <ChevronRight className="w-6 h-6" />
         </button>
       </div>
    </div>
  );
}

function QuizViewer({ questions }: { questions: any[] }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions || questions.length === 0) return <p>No questions found.</p>;

  const handleSelect = (qIndex: number, option: string) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [qIndex]: option }));
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) score++;
    });
    return score;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 mt-6">
       {questions.map((q, i) => (
         <div key={i} className="bg-white dark:bg-[#1a1a1b] p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
           <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
             <span className="text-indigo-600 dark:text-indigo-400 mr-2">{i + 1}.</span> {q.question}
           </h3>
           <div className="space-y-3">
             {q.options.map((opt: string, j: number) => {
               const isSelected = answers[i] === opt;
               const isCorrect = q.correctAnswer === opt;
               let btnClass = "w-full text-left p-4 rounded-xl border font-medium transition-all ";
               
               if (!submitted) {
                 btnClass += isSelected 
                   ? "bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300" 
                   : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-black/20 dark:border-white/5 dark:text-gray-300 dark:hover:bg-white/5";
               } else {
                 if (isCorrect) {
                   btnClass += "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400";
                 } else if (isSelected && !isCorrect) {
                   btnClass += "bg-red-50 border-red-300 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400";
                 } else {
                   btnClass += "bg-slate-50 border-slate-200 text-slate-400 dark:bg-black/20 dark:border-white/5 dark:text-gray-500 opacity-50";
                 }
               }
               
               return (
                 <button key={j} onClick={() => handleSelect(i, opt)} className={btnClass} disabled={submitted}>
                   {opt}
                 </button>
               );
             })}
           </div>
           
           {submitted && (
             <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5">
               <p className="text-sm text-slate-600 dark:text-gray-300">
                 <span className="font-bold mr-2 text-slate-900 dark:text-white">Explanation:</span>
                 {q.explanation}
               </p>
             </div>
           )}
         </div>
       ))}
       
       <div className="sticky bottom-6 flex justify-center mt-10">
         {!submitted ? (
           <button 
             onClick={() => setSubmitted(true)}
             disabled={Object.keys(answers).length !== questions.length}
             className="px-8 py-3 rounded-full bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/25 disabled:bg-slate-300 disabled:shadow-none transition-all"
           >
             Submit Quiz
           </button>
         ) : (
           <div className="bg-white dark:bg-[#1a1a1b] px-8 py-4 rounded-full border border-slate-200 dark:border-white/10 shadow-lg flex items-center gap-4">
             <span className="text-lg font-bold text-slate-700 dark:text-gray-200">Your Score:</span>
             <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{calculateScore()} / {questions.length}</span>
             <button 
               onClick={() => { setSubmitted(false); setAnswers({}); }}
               className="ml-4 px-4 py-2 rounded-full bg-slate-100 dark:bg-white/10 text-sm font-bold text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
             >
               Retake
             </button>
           </div>
         )}
       </div>
    </div>
  );
}
