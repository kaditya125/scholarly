import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Sparkles, Send, Target, Layers, Headphones, CheckCircle2, Bot, Link as LinkIcon, Network, ListTree, ArrowDown, Type } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DemoCallout } from './DemoCallout';
import demoData from './demo-data.json';

export function InteractiveDemo() {
  const [step, setStep] = useState(0);
  const data = demoData.scenario;

  useEffect(() => {
    const sequence = async () => {
      // Step 0: Reset state (wait 1s)
      setStep(0);
      await new Promise(r => setTimeout(r, 800));

      // Step 1: Prompt appears & starts typing
      setStep(1);
      await new Promise(r => setTimeout(r, 2000)); // typing takes ~2s

      // Step 2: "Sending" & timeline begins
      setStep(2);
      await new Promise(r => setTimeout(r, 1500));

      // Step 3: Execution Plan slides in
      setStep(3);
      await new Promise(r => setTimeout(r, 2000));

      // Step 4: Knowledge Graph animates
      setStep(4);
      await new Promise(r => setTimeout(r, 2500));

      // Step 5: Streaming Response
      setStep(5);
      await new Promise(r => setTimeout(r, 3000));

      // Step 6: Learning Actions appear & final callouts
      setStep(6);
    };

    sequence();
    const interval = setInterval(sequence, 15000); // Loop every 15 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-24 bg-[#f8fafc] dark:bg-[#131314] overflow-hidden relative">
      <div className="max-w-5xl mx-auto px-8">
        
        <div className="text-center mb-16 relative">
           <motion.div 
             initial={{ opacity: 0, y: 20 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: true }}
             className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-[13px] font-bold tracking-wide uppercase mb-6"
           >
             <Sparkles className="w-4 h-4" /> The Reasoning Engine
           </motion.div>
           <h2 className="text-4xl md:text-[52px] font-bold text-slate-900 dark:text-white tracking-tight leading-[1.1] mb-5">
             Watch Sadhya <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">Think</span>.
           </h2>
           <p className="text-slate-500 dark:text-gray-400 text-[16px] max-w-xl mx-auto leading-relaxed">
             Unlike standard AI, Sadhya plans its approach, searches a verified knowledge graph, and tailors the explanation to your mastery level.
           </p>
        </div>

        {/* The Interactive Demo Canvas */}
        <div className="relative mx-auto max-w-4xl rounded-3xl bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] p-6 sm:p-10 min-h-[600px] flex flex-col">
          
          {/* Top: The Prompt Input */}
          <div className="relative mb-8">
            <DemoCallout show={step >= 1 && step < 3} text="Uses your personal notebook context" direction="top-right" delay={0.2} />
            
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-[#2a2a2b] border border-slate-100 dark:border-white/5 relative z-10">
               <div className="flex items-center gap-2">
                 <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                   <LinkIcon className="w-3 h-3" /> {data.contextChip}
                 </span>
               </div>
               
               <div className="flex items-end justify-between gap-4 min-h-[44px]">
                 <div className="flex-1 text-[15px] text-slate-800 dark:text-gray-200 font-medium">
                   {step === 0 && <span className="text-slate-400">Ask a question...</span>}
                   {step >= 1 && (
                     <TypewriterText text={data.promptText} delay={30} start={step >= 1} />
                   )}
                   {step === 1 && (
                     <motion.span 
                       animate={{ opacity: [1, 0, 1] }} 
                       transition={{ repeat: Infinity, duration: 0.8 }}
                       className="inline-block w-0.5 h-4 bg-indigo-500 ml-0.5 translate-y-1"
                     />
                   )}
                 </div>
                 
                 <div className="relative">
                    <DemoCallout show={step === 2} text="Initiates GraphRAG reasoning" direction="top-left" delay={0.1} />
                    <motion.button 
                      animate={step === 2 ? { scale: [1, 1.1, 1], backgroundColor: ["#4f46e5", "#818cf8", "#4f46e5"] } : {}}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0",
                        step >= 2 ? "bg-indigo-600 text-white" : "bg-slate-200 dark:bg-white/10 text-slate-400"
                      )}
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                 </div>
               </div>
            </div>
          </div>

          {/* Middle: The Engine (Timeline & Graph) */}
          <div className="flex-1 flex flex-col lg:flex-row gap-6 mb-8">
            
            {/* Left: Execution Timeline */}
            <div className="flex-1 flex flex-col gap-4 relative">
              <AnimatePresence>
                {step >= 2 && (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[12px] font-bold uppercase tracking-widest text-slate-400 mb-2"
                  >
                    Reasoning Engine
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-4">
                <AnimatePresence>
                  {step >= 2 && data.timelineStages.map((stage, i) => (
                    <motion.div 
                      key={stage.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.4 }}
                      className="relative"
                    >
                      {/* Only show callout if this specific step is active, or at the end for the first one just to demonstrate */}
                      <DemoCallout 
                        show={step === 3 && i === 1 || step === 4 && i === 2} 
                        text={stage.callout} 
                        direction={stage.calloutPos as any} 
                        delay={0.3} 
                      />
                      <div className="flex items-center gap-3">
                        <motion.div 
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: (i * 0.4) + 0.3, type: "spring" }}
                          className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 z-10"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </motion.div>
                        <div className="text-[13.5px] font-bold text-slate-700 dark:text-gray-200 bg-slate-50 dark:bg-[#2a2a2b] px-4 py-2 rounded-xl flex-1 border border-slate-100 dark:border-white/5">
                          {stage.label}
                        </div>
                      </div>
                      {i < data.timelineStages.length - 1 && (
                        <div className="absolute left-3 top-6 bottom-[-16px] w-px bg-slate-200 dark:bg-white/10 -z-0" />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Execution Plan */}
              <AnimatePresence>
                {step >= 3 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                    className="mt-4 relative"
                  >
                    <DemoCallout show={step === 3} text={data.planCallout} direction="right" delay={1.2} />
                    <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-3 text-indigo-700 dark:text-indigo-400 text-[12px] font-bold">
                        <ListTree className="w-4 h-4" /> Execution Plan
                      </div>
                      <div className="space-y-2">
                        {data.executionPlan.map((plan, i) => (
                          <motion.div 
                            key={plan.step}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1 + (i * 0.3) }}
                            className="flex items-center gap-2 text-[12.5px] font-medium text-indigo-900 dark:text-indigo-200"
                          >
                            <span className="w-5 h-5 rounded-full bg-white dark:bg-black/20 flex items-center justify-center text-[10px] shrink-0">
                              {plan.step}
                            </span>
                            {plan.task}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: Knowledge Graph Visualization */}
            <div className="flex-1 relative flex items-center justify-center min-h-[200px] border border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50/50 dark:bg-black/20">
              <AnimatePresence>
                 {step >= 4 && (
                   <motion.div
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     className="relative w-full h-full flex items-center justify-center p-6"
                   >
                      <DemoCallout show={step === 4} text="Traverses SCERT syllabus concepts" direction="top-left" delay={0.5} />
                      
                      {/* Fake Graph SVG */}
                      <svg viewBox="0 0 200 200" className="w-full max-w-[200px] aspect-square overflow-visible">
                        {/* Edges */}
                        <motion.line x1="100" y1="100" x2="40" y2="60" stroke="#818cf8" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 1 }} />
                        <motion.line x1="100" y1="100" x2="160" y2="50" stroke="#818cf8" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.7, duration: 1 }} />
                        <motion.line x1="100" y1="100" x2="150" y2="150" stroke="#818cf8" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.9, duration: 1 }} />
                        <motion.line x1="100" y1="100" x2="50" y2="140" stroke="#818cf8" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.1, duration: 1 }} />
                        
                        <motion.line x1="40" y1="60" x2="50" y2="140" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 1.5 }} />
                        <motion.line x1="160" y1="50" x2="150" y2="150" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 1.5 }} />

                        {/* Nodes */}
                        <motion.circle cx="100" cy="100" r="14" fill="#4f46e5" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }} />
                        
                        <motion.circle cx="40" cy="60" r="10" fill="#a5b4fc" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring' }} />
                        <motion.circle cx="160" cy="50" r="12" fill="#a5b4fc" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.0, type: 'spring' }} />
                        <motion.circle cx="150" cy="150" r="8" fill="#a5b4fc" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2, type: 'spring' }} />
                        <motion.circle cx="50" cy="140" r="10" fill="#a5b4fc" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.4, type: 'spring' }} />

                        {/* Pulse effect on center node */}
                        <motion.circle cx="100" cy="100" r="20" fill="none" stroke="#4f46e5" strokeWidth="2" animate={{ scale: [1, 2], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.5 }} />
                      </svg>
                      
                      {/* Floating Labels */}
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="absolute top-[20%] left-[10%] text-[10px] font-bold text-slate-500 bg-white/80 dark:bg-black/50 px-2 py-0.5 rounded-full">Superposition</motion.div>
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="absolute top-[15%] right-[10%] text-[10px] font-bold text-slate-500 bg-white/80 dark:bg-black/50 px-2 py-0.5 rounded-full">Qubits</motion.div>
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="absolute bottom-[20%] right-[15%] text-[10px] font-bold text-slate-500 bg-white/80 dark:bg-black/50 px-2 py-0.5 rounded-full">Quantum Gates</motion.div>
                   </motion.div>
                 )}
                 {step < 4 && (
                    <div className="flex flex-col items-center justify-center text-slate-300 dark:text-gray-600 gap-3">
                      <Network className="w-8 h-8" />
                      <span className="text-[12px] font-semibold uppercase tracking-widest">Awaiting Graph</span>
                    </div>
                 )}
              </AnimatePresence>
            </div>
          </div>

          {/* Bottom: The Streaming Response */}
          <div className="relative mt-auto border-t border-slate-100 dark:border-white/5 pt-6">
             <DemoCallout show={step >= 5} text={data.responseCallout} direction="bottom-right" delay={1.5} />
             
             <AnimatePresence>
               {step >= 5 && (
                 <motion.div 
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   className="flex gap-4"
                 >
                   <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-600 flex items-center justify-center shrink-0">
                     <Bot className="w-4 h-4" />
                   </div>
                   <div className="flex-1 space-y-4">
                     <div className="text-[14.5px] leading-relaxed text-slate-800 dark:text-gray-200">
                        <TypewriterText text={data.response} delay={15} start={true} />
                     </div>
                     
                     {/* Citations */}
                     <motion.div 
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       transition={{ delay: 2.5 }}
                       className="flex flex-wrap gap-2"
                     >
                       {data.citations.map((cite) => (
                         <span key={cite} className="inline-flex items-center text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md border border-slate-200 dark:border-white/10 hover:border-indigo-300 transition-colors cursor-pointer">
                           {cite}
                         </span>
                       ))}
                     </motion.div>
                     
                     {/* Learning Actions */}
                     <AnimatePresence>
                       {step >= 6 && (
                         <motion.div 
                           initial={{ opacity: 0, y: 10 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ delay: 0.5 }}
                           className="flex flex-wrap gap-3 pt-4 border-t border-slate-100 dark:border-white/5"
                         >
                           {data.learningActions.map((action, i) => (
                             <motion.button 
                               key={action.label}
                               initial={{ opacity: 0, scale: 0.9 }}
                               animate={{ opacity: 1, scale: 1 }}
                               transition={{ delay: 0.5 + (i * 0.1), type: 'spring' }}
                               className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#2a2a2b] border border-slate-200 dark:border-white/10 text-[12px] font-bold text-slate-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm"
                             >
                               {/* Render matching icon based on string */}
                               {action.icon === 'Brain' && <Brain className="w-3.5 h-3.5" />}
                               {action.icon === 'Target' && <Target className="w-3.5 h-3.5" />}
                               {action.icon === 'Layers' && <Layers className="w-3.5 h-3.5" />}
                               {action.icon === 'Headphones' && <Headphones className="w-3.5 h-3.5" />}
                               {action.label}
                             </motion.button>
                           ))}
                         </motion.div>
                       )}
                     </AnimatePresence>

                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

        </div>
      </div>
    </section>
  );
}

// Helper to simulate typing effect smoothly
function TypewriterText({ text, delay = 30, start = false }: { text: string; delay?: number; start?: boolean }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    if (!start) {
      setDisplayedText("");
      return;
    }
    
    let i = 0;
    setDisplayedText("");
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i));
      i++;
      if (i > text.length) clearInterval(interval);
    }, delay);

    return () => clearInterval(interval);
  }, [text, delay, start]);

  return <>{displayedText}</>;
}
