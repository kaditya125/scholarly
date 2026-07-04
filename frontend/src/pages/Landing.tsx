import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronRight, Star, Target, Brain, Trophy, Users, Check, Lightbulb, Share2, Link as LinkIcon, BookOpen, HelpCircle, MessageSquare, Sparkles, Bot } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

export default function LandingPage() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const toggleMenu = (menu: string) => {
    if (activeMenu === menu) {
      setActiveMenu(null);
    } else {
      setActiveMenu(menu);
    }
  };
  
  return (
    <div className="font-sans text-slate-900 dark:text-slate-100 bg-white dark:bg-[#131314] min-h-screen transition-colors">
      
      {/* Dark Theme Header */}
      <header 
        className="bg-[#1f2937] dark:bg-[#131314] border-b border-white/10 dark:border-white/5 px-8 py-4 sticky top-0 z-50 flex items-center justify-between transition-colors"
        onMouseLeave={() => setActiveMenu(null)}
      >
        <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15"/>
                 <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
            </div>
            <span className="font-bold text-xl tracking-tight text-white uppercase flex items-center gap-2">
               Scholarly <span className="text-[12px] font-medium tracking-normal text-slate-400 capitalize border-l border-slate-600 pl-2">Education</span>
            </span>
        </div>
        
        <div className="hidden md:flex gap-8 items-center text-[13px] font-bold text-slate-300 uppercase tracking-wide h-full">
          <button onMouseEnter={() => setActiveMenu('products')} className={cn("hover:text-white transition-colors py-2 outline-none cursor-default", activeMenu === 'products' && "text-white")}>Products</button>
          <button onMouseEnter={() => setActiveMenu('resources')} className={cn("hover:text-white transition-colors py-2 outline-none cursor-default", activeMenu === 'resources' && "text-white")}>Resources</button>
          <button onMouseEnter={() => setActiveMenu('difference')} className={cn("hover:text-white transition-colors py-2 outline-none cursor-default", activeMenu === 'difference' && "text-white")}>Our Difference</button>
          <a href="#" onMouseEnter={() => setActiveMenu(null)} className="hover:text-white transition-colors py-2">Partner With Us</a>
        </div>

        <div className="flex gap-4 items-center">
          <Link to="/signup" className="hidden md:flex px-6 py-2.5 text-sm font-bold bg-yellow-400 text-slate-900 rounded-full hover:bg-yellow-300 transition-colors">
            Free Trial
          </Link>
          <Link to="/signin" className="text-sm font-medium text-slate-300 hover:text-white transition-colors ml-2">Sign In</Link>
        </div>

        <AnimatePresence>
          {activeMenu === 'products' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 w-full bg-white text-slate-800 border-t border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="max-w-7xl mx-auto px-8 py-10 flex gap-4 md:gap-8 lg:gap-12">
                 <div className="flex-1 bg-slate-50/50 p-6 rounded-lg border border-slate-100">
                    <h3 className="text-slate-500 font-medium tracking-wide mb-6">TRE PRT (1-5)</h3>
                    <ul className="space-y-4 text-[15px] font-semibold text-slate-700 mb-8">
                      <li className="hover:text-teal-600 cursor-pointer">PRT Courses</li>
                      <li className="hover:text-teal-600 cursor-pointer">PRT QBank</li>
                      <li className="hover:text-teal-600 cursor-pointer">PRT Books & Study Guides</li>
                      <li className="hover:text-teal-600 cursor-pointer">PRT Mock Exams</li>
                      <li className="hover:text-teal-600 cursor-pointer">TotalPrep Series</li>
                      <li className="hover:text-teal-600 cursor-pointer">SimpleSheets+</li>
                    </ul>
                    <Link to="/signup" className="block text-center w-full bg-[#e8effd] hover:bg-[#d8e4fc] text-blue-700 font-semibold py-3 rounded transition-colors">
                       Start Your PRT Free Trial
                    </Link>
                 </div>
                 
                 <div className="flex-1 bg-[#f4faee]/50 p-6 rounded-lg border border-[#eef5e6]">
                    <h3 className="text-slate-500 font-medium tracking-wide mb-6">TRE TGT (9-10)</h3>
                    <ul className="space-y-4 text-[15px] font-semibold text-slate-700 mb-8">
                      <li className="hover:text-teal-600 cursor-pointer">TGT Courses</li>
                      <li className="hover:text-teal-600 cursor-pointer">TGT QBank</li>
                      <li className="hover:text-teal-600 cursor-pointer">TGT Books & Study Guides</li>
                      <li className="hover:text-teal-600 cursor-pointer">TGT Mock Exams</li>
                      <li className="hover:text-teal-600 cursor-pointer">TotalPrep Series</li>
                      <li className="hover:text-teal-600 cursor-pointer">SimpleSheets+</li>
                    </ul>
                    <Link to="/signup" className="block text-center w-full bg-[#f0fdf4] hover:bg-[#dcfce7] text-green-700 font-semibold py-3 rounded transition-colors">
                       Start Your TGT Free Trial
                    </Link>
                 </div>

                 <div className="flex-1 bg-[#fff6ed]/50 p-6 rounded-lg border border-[#ffeedd]">
                    <h3 className="text-slate-500 font-medium tracking-wide mb-6">TRE PGT (11-12)</h3>
                    <ul className="space-y-4 text-[15px] font-semibold text-slate-700 mb-8">
                      <li className="hover:text-teal-600 cursor-pointer">PGT Courses</li>
                      <li className="hover:text-teal-600 cursor-pointer">PGT QBank</li>
                      <li className="hover:text-teal-600 cursor-pointer">PGT Books & Study Guides</li>
                      <li className="hover:text-teal-600 cursor-pointer">PGT Mock Exams</li>
                      <li className="hover:text-teal-600 cursor-pointer">TotalPrep Series</li>
                      <li className="hover:text-teal-600 cursor-pointer">SimpleSheets+</li>
                    </ul>
                    <Link to="/signup" className="block text-center w-full bg-[#fff7ed] hover:bg-[#ffedd5] text-orange-700 font-semibold py-3 rounded transition-colors">
                       Start Your PGT Free Trial
                    </Link>
                 </div>

                 <div className="flex-1 p-6">
                    <h3 className="text-slate-500 font-medium tracking-wide mb-6">TRE Product Features</h3>
                    <ul className="space-y-4 text-[15px] font-semibold text-slate-700 mb-8">
                      <li className="hover:text-teal-600 cursor-pointer">Product Tour</li>
                      <li className="hover:text-teal-600 cursor-pointer">Video Lectures</li>
                      <li className="hover:text-teal-600 cursor-pointer">UAsk AI</li>
                      <li className="hover:text-teal-600 cursor-pointer">Mobile App</li>
                      <li className="hover:text-teal-600 cursor-pointer">Flashcards</li>
                      <li className="hover:text-teal-600 cursor-pointer">My Notebook</li>
                      <li className="hover:text-teal-600 cursor-pointer">Study Planner</li>
                    </ul>
                    <div className="border border-slate-200 rounded p-4 flex gap-3 items-center hover:bg-slate-50 cursor-pointer">
                       <div className="bg-slate-100 p-2 rounded shrink-0">
                         <Target className="w-5 h-5 text-slate-500" />
                       </div>
                       <div>
                         <div className="font-semibold text-sm">Try Out a Few</div>
                         <div className="text-xs text-slate-500 mt-0.5">TRE Practice Questions Free!</div>
                       </div>
                    </div>
                 </div>
              </div>
            </motion.div>
          )}

          {activeMenu === 'resources' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 w-full bg-white text-slate-800 border-t border-slate-200 shadow-xl overflow-hidden"
            >
               <div className="max-w-7xl mx-auto px-8 py-10 grid grid-cols-1 md:grid-cols-3 gap-12">
                  <div className="space-y-8 pr-8 border-r border-slate-100">
                     <div className="flex gap-4">
                        <div className="bg-slate-100 p-2.5 rounded h-fit shrink-0">
                           <Share2 className="w-5 h-5 text-slate-700" />
                        </div>
                        <div>
                           <h4 className="font-bold text-[15px] text-slate-800 mb-1 hover:text-blue-600 cursor-pointer">TRE Exam Resource Hub</h4>
                           <p className="text-sm text-slate-500 leading-relaxed">Everything you ever wanted to know about the BPSC TRE Exam in one place.</p>
                        </div>
                     </div>
                     <div className="flex gap-4">
                        <div className="bg-slate-100 p-2.5 rounded h-fit shrink-0">
                           <LinkIcon className="w-5 h-5 text-slate-700" />
                        </div>
                        <div>
                           <h4 className="font-bold text-[15px] text-slate-800 mb-1 hover:text-blue-600 cursor-pointer">Education Careers</h4>
                           <p className="text-sm text-slate-500 leading-relaxed">Explore the top teacher roles and schools for candidates currently enrolled.</p>
                        </div>
                     </div>
                     <div className="flex gap-4">
                        <div className="bg-slate-100 p-2.5 rounded h-fit shrink-0">
                           <BookOpen className="w-5 h-5 text-slate-700" />
                        </div>
                        <div>
                           <h4 className="font-bold text-[15px] text-slate-800 mb-3 hover:text-blue-600 cursor-pointer">Study Schedules</h4>
                           <ul className="space-y-3 text-[14px] font-semibold text-slate-700">
                              <li className="hover:text-blue-600 cursor-pointer">PRT Study Schedule</li>
                              <li className="hover:text-blue-600 cursor-pointer">TGT Study Schedule</li>
                              <li className="hover:text-blue-600 cursor-pointer">PGT Study Schedule</li>
                           </ul>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-6">
                     <div className="text-[15px] font-medium text-slate-500 hover:text-blue-600 cursor-pointer">About Educators</div>
                     <div className="text-[15px] font-medium text-slate-500 hover:text-blue-600 cursor-pointer">About the TRE Exam</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer mt-4">TRE PRT Exam</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">TRE TGT Exam</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">TRE PGT Exam</div>
                  </div>

                  <div className="space-y-6">
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">TRE Requirements</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">Exam Registration & Fees</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">Pass Rates & Scoring</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">BPSC Exam Dates</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">SCERT Curriculum</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">TRE Blog</div>
                     <div className="text-[14px] text-slate-500 hover:text-blue-600 cursor-pointer mt-8 pt-8 border-t border-slate-100">Legacy Products</div>
                     <div className="text-[15px] font-bold text-slate-800 hover:text-blue-600 cursor-pointer">Previous Years</div>
                  </div>
               </div>
            </motion.div>
          )}
          {activeMenu === 'difference' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 w-full bg-white text-slate-800 border-t border-slate-200 shadow-xl overflow-hidden"
            >
               <div className="max-w-4xl mx-auto px-8 py-10 flex flex-col md:flex-row gap-16 md:gap-24">
                  <div className="w-[300px] shrink-0 border-r border-slate-100 pr-12">
                     <h3 className="text-slate-500 font-medium tracking-wide mb-6">About US</h3>
                     <ul className="space-y-6">
                        <li className="flex items-center gap-4 hover:text-teal-600 cursor-pointer group">
                           <div className="text-slate-700 group-hover:text-teal-600 font-bold"><HelpCircle className="w-[22px] h-[22px]"/></div>
                           <span className="font-bold text-[15px] text-slate-800 group-hover:text-teal-600">Why Scholarly Education</span>
                        </li>
                        <li className="flex items-center gap-4 hover:text-teal-600 cursor-pointer group">
                           <div className="text-slate-700 group-hover:text-teal-600 font-bold"><Brain className="w-[22px] h-[22px]"/></div>
                           <span className="font-bold text-[15px] text-slate-800 group-hover:text-teal-600">Active Learning</span>
                        </li>
                        <li className="flex items-center gap-4 hover:text-teal-600 cursor-pointer group">
                           <div className="text-slate-700 group-hover:text-teal-600 font-bold"><Users className="w-[22px] h-[22px]"/></div>
                           <span className="font-bold text-[15px] text-slate-800 group-hover:text-teal-600">Instructors</span>
                        </li>
                        <li className="flex items-center gap-4 hover:text-teal-600 cursor-pointer group">
                           <div className="text-slate-700 group-hover:text-teal-600 font-bold"><MessageSquare className="w-[22px] h-[22px]"/></div>
                           <span className="font-bold text-[15px] text-slate-800 group-hover:text-teal-600 text-left">Customer Success Stories</span>
                        </li>
                     </ul>
                  </div>
                  <div className="flex-1">
                     <h3 className="text-slate-500 font-medium tracking-wide mb-6">Scholarly Programs</h3>
                     <div className="grid grid-cols-2 gap-4 max-w-[360px]">
                        <div className="bg-[#f4f7fe] hover:bg-[#e6effc] py-6 px-4 rounded border border-[#e6f0ff] cursor-pointer transition-colors text-center flex items-center justify-center font-semibold text-slate-800 text-[15px]">
                           FlexiPay
                        </div>
                        <div className="bg-[#f4f7fe] hover:bg-[#e6effc] py-6 px-4 rounded border border-[#e6f0ff] cursor-pointer transition-colors text-center flex items-center justify-center font-semibold text-slate-800 text-[15px]">
                           FreshStart
                        </div>
                        <div className="bg-[#f4f7fe] hover:bg-[#e6effc] py-6 px-4 rounded border border-[#e6f0ff] cursor-pointer transition-colors text-center flex items-center justify-center font-semibold text-slate-800 text-[15px]">
                           Scholarships
                        </div>
                        <div className="bg-[#f4f7fe] hover:bg-[#e6effc] py-6 px-4 rounded border border-[#e6f0ff] cursor-pointer transition-colors text-center flex items-center justify-center font-semibold text-slate-800 text-[15px]">
                           StudyPass
                        </div>
                     </div>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className="bg-[#1f2937] text-white pt-16 pb-24 px-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-slate-800 rounded-full blur-[120px] opacity-20 pointer-events-none -translate-y-1/2 translate-x-1/4" />
        
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center relative z-10">
          <div>
             <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-white text-[13px] font-medium mb-8">
               <div className="relative flex h-4 w-4 items-center justify-center">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-40"></span>
                 <Sparkles className="relative w-4 h-4 text-purple-400" />
               </div>
               Empowered by Next-Gen AI Models
             </div>
             
             <h1 className="text-4xl md:text-5xl lg:text-[52px] font-bold text-white mb-4 leading-[1.1] tracking-tight">
               AI-Powered Learning for <br/> TRE Bihar PRT 2026
             </h1>
             <p className="text-2xl font-medium text-slate-300 mb-6">
               Practice smarter with your personal AI Tutor.
             </p>
             
             <div className="flex items-center gap-2 mb-8">
               <div className="flex text-yellow-500">
                  <Star className="w-5 h-5 fill-current" />
                  <Star className="w-5 h-5 fill-current" />
                  <Star className="w-5 h-5 fill-current" />
                  <Star className="w-5 h-5 fill-current" />
                  <Star className="w-5 h-5 fill-current" />
               </div>
               <span className="text-sm text-yellow-500 font-medium border-b border-yellow-500/30 pb-0.5 cursor-pointer hover:border-yellow-500">700+ Reviews</span>
             </div>

             <p className="text-slate-300 text-[15px] leading-relaxed max-w-lg mb-10">
               Not all BPSC TRE practice platforms are created equal. Scholarly integrates advanced AI to simulate exam-level pressure, deliver real-time personalized insights, and let you chat with intelligent tutors to clarify concepts instantly.
             </p>

             <div className="flex flex-col sm:flex-row items-center gap-4">
               <Link to="/signup" className="w-full sm:w-auto text-center px-8 py-4 bg-yellow-400 text-slate-900 rounded-full font-bold transition-transform hover:-translate-y-0.5">
                 Try Sample Questions
               </Link>
               <Link to="/signup" className="w-full sm:w-auto text-center px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full font-bold transition-all">
                 Start For Free
               </Link>
             </div>
             <p className="text-[11px] text-slate-400 mt-4 text-center sm:text-left sm:ml-[160px]">(No Credit card required)</p>
          </div>

          {/* Hero Visual */}
          <div className="relative h-[400px] w-full mt-16 md:mt-0 hidden lg:flex items-center justify-center">
             <img 
               src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" 
               alt="Scholarly Platform on Multiple Devices" 
               className="w-[90%] max-w-[480px] h-auto object-contain drop-shadow-2xl rounded-xl border border-white/10"
               referrerPolicy="no-referrer"
             />
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-slate-900 text-white py-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-8 flex justify-between items-center text-center divide-x divide-white/10">
           <div className="flex-1 py-2">
             <Users className="w-6 h-6 text-yellow-400 mx-auto mb-3" />
             <div className="font-bold text-xl">5,150+</div>
             <div className="text-[11px] text-slate-400 uppercase tracking-widest mt-1">Questions</div>
           </div>
           <div className="flex-1 py-2">
             <CheckCircle2 className="w-6 h-6 text-yellow-400 mx-auto mb-3" />
             <div className="font-bold text-xl">100%</div>
             <div className="text-[11px] text-slate-400 uppercase tracking-widest mt-1">SCERT Tagged</div>
           </div>
           <div className="flex-1 py-2">
             <Trophy className="w-6 h-6 text-yellow-400 mx-auto mb-3" />
             <div className="font-bold text-xl">9/10</div>
             <div className="text-[11px] text-slate-400 uppercase tracking-widest mt-1">Success Rate</div>
           </div>
        </div>
      </section>

      {/* Methodology Section */}
      <section className="py-24 bg-[#f8fbfa]">
        <div className="max-w-5xl mx-auto px-8 text-center">
           <div className="text-[13px] font-bold text-teal-700 uppercase tracking-widest mb-4">Proven Methodology</div>
           <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
             How Practice Questions Help You Pass the BPSC Exam
           </h2>
           <div className="w-12 h-1 bg-teal-600 mx-auto mb-6"></div>
           <p className="text-slate-600 text-[15px] max-w-3xl mx-auto mb-16 leading-relaxed">
             Stop memorizing and start mastering. Our TRE practice questions simulate exam-level pressure, helping you bridge knowledge gaps and build the confidence to think like the exam.
           </p>

           <div className="grid md:grid-cols-3 gap-6 relative">
              {/* Connector line for desktop */}
              <div className="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-[2px] bg-slate-200 -z-0"></div>

              <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm relative z-10 text-left">
                 <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mb-6 border border-teal-100">
                   <Target className="w-5 h-5 text-teal-600" />
                 </div>
                 <h3 className="font-bold text-lg text-slate-900 mb-3">Identify Weak Areas</h3>
                 <p className="text-sm text-slate-600 leading-relaxed">Know exactly where you stand before exam day with AI-driven performance metrics analyzing your strengths and weaknesses.</p>
              </div>

              <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm relative z-10 text-left">
                 <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center mb-6 border border-purple-100">
                   <Bot className="w-5 h-5 text-purple-600" />
                 </div>
                 <h3 className="font-bold text-lg text-slate-900 mb-3">Scholarly AI Assistant</h3>
                 <p className="text-sm text-slate-600 leading-relaxed">Chat with our advanced AI tutor to create study guides, solve homework, and master complex SCERT concepts effortlessly.</p>
              </div>

              <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm relative z-10 text-left">
                 <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-6 border border-green-100">
                   <Check className="w-5 h-5 text-green-600" />
                 </div>
                 <h3 className="font-bold text-lg text-slate-900 mb-3">Gain Your Confidence</h3>
                 <p className="text-sm text-slate-600 leading-relaxed">Walk in prepared, confident, and fully practiced for the CBT format through personalized mock tests.</p>
              </div>
           </div>
        </div>
      </section>

      {/* Look and Feel */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-8 text-center">
           <div className="text-[13px] font-bold text-teal-700 uppercase tracking-widest mb-4">See Sample Questions</div>
           <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
             See What Real TRE Practice Questions Looks Like
           </h2>
           <div className="w-12 h-1 bg-teal-600 mx-auto mb-6"></div>
           <p className="text-slate-600 text-[15px] mx-auto mb-12 leading-relaxed">
             Get free questions across all subjects. Select your PRT section. Answer a question. Then see a full expert explanation. This is the depth that sets Scholarly apart from every other provider.
           </p>

           <div className="flex justify-center border-b border-slate-200 mb-10">
              <button className="px-6 py-4 text-[15px] font-bold text-teal-700 border-b-2 border-teal-600">PRT (1-5)</button>
              <button className="px-6 py-4 text-[15px] font-bold text-slate-500 hover:text-slate-800">TGT (9-10)</button>
              <button className="px-6 py-4 text-[15px] font-bold text-slate-500 hover:text-slate-800">PGT (11-12)</button>
           </div>
           
           <p className="text-slate-600 text-sm max-w-3xl mx-auto mb-10 leading-relaxed">
             The TRE PRT (1-5) exam is conducted with 150 questions in total asked in a MCQ format with 5 options. It tests foundational knowledge of Language & General Studies.
           </p>

           <div className="flex justify-center gap-2 sm:gap-4 flex-wrap">
              {[1,2,3,4,5,6,7,8].map((q) => (
                <div key={q} className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer transition-colors border", q === 1 ? "bg-teal-50 border-teal-200 text-teal-700" : "bg-white border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-600")}>
                  Q{q}
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* Feature Split - QBank */}
      <section className="py-24 bg-[#f8fbfa] border-y border-slate-200">
         <div className="max-w-7xl mx-auto px-8 text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
              AI-Powered Learning for Every Level
            </h2>
            <div className="w-12 h-1 bg-purple-600 mx-auto mb-6"></div>
         </div>

         <div className="max-w-6xl mx-auto px-8 grid md:grid-cols-2 gap-16 items-center">
            <div>
               <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded text-purple-700 font-bold"><Brain className="w-5 h-5"/></div>
                  <h4 className="text-lg font-bold text-purple-700">Intelligent Engine</h4>
               </div>
               <h3 className="text-3xl font-bold text-slate-900 mb-6">Smart Practice & Analytics</h3>
               <div className="w-12 h-1 bg-purple-600 mb-6"></div>
               <p className="text-[15px] text-slate-600 leading-relaxed mb-8">
                 Supercharge your prep with our AI-powered engine. It analyzes your answers, delivers personalized study recommendations dynamically, and allows you to ask follow-up questions to an intelligent AI Tutor for any complex topic you encounter.
               </p>
               <Link to="/dashboard" className="px-8 py-3.5 bg-purple-600 text-white font-bold rounded-full hover:bg-purple-700 transition-colors inline-block">
                 Try AI Tutor
               </Link>
            </div>
            <div className="relative">
               <div className="aspect-video bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden relative">
                 <div className="absolute top-0 w-full h-8 bg-slate-900 flex items-center px-4 gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                 </div>
                 <div className="p-8 mt-8">
                   <div className="h-4 bg-slate-100 rounded w-3/4 mb-8"></div>
                   <div className="space-y-4">
                     <div className="flex items-center gap-4 border p-4 rounded bg-slate-50 border-slate-200">
                        <div className="w-4 h-4 rounded-full border border-slate-400"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                     </div>
                     <div className="flex items-center gap-4 border p-4 rounded bg-green-50 border-green-200">
                        <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                        <div className="h-3 bg-slate-200 rounded w-1/3"></div>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
         </div>
      </section>

      {/* Quality Info */}
      <section className="py-24 bg-white">
         <div className="max-w-5xl mx-auto px-8">
            <div className="text-center mb-16">
              <div className="text-[13px] font-bold text-teal-700 uppercase tracking-widest mb-4">Question Quality</div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Why Scholarly Questions Are The Industry's Gold Standard
              </h2>
              <div className="w-12 h-1 bg-teal-600 mx-auto mb-6"></div>
              <p className="text-slate-600 text-[15px] mx-auto max-w-3xl leading-relaxed">
                Not all practice questions are equal. Here's what makes Scholarly's QBank practice questions the benchmark every other provider is measured against.
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-4 border border-slate-200 rounded-xl overflow-hidden mb-12">
               <button className="flex-1 py-4 px-6 text-center bg-teal-600 text-white font-bold flex flex-col items-center justify-center gap-2">
                 <Users className="w-5 h-5" />
                 Expert-Authored Content
               </button>
               <button className="flex-1 py-4 px-6 text-center bg-slate-50 text-teal-700 font-bold hover:bg-slate-100 transition-colors flex flex-col items-center justify-center gap-2">
                 <Brain className="w-5 h-5" />
                 In-Depth Explanations
               </button>
               <button className="flex-1 py-4 px-6 text-center bg-slate-50 text-teal-700 font-bold hover:bg-slate-100 transition-colors flex flex-col items-center justify-center gap-2">
                 <Target className="w-5 h-5" />
                 100% SCERT Tagged
               </button>
            </div>

            <div className="flex items-center gap-12 max-w-3xl mx-auto">
               <div className="flex-1">
                 <div className="inline-block border-b-2 border-teal-600 pb-2 mb-6">
                   <h3 className="text-2xl font-bold text-slate-900">Written by Active Educators</h3>
                 </div>
                 <p className="text-slate-600 text-[15px] leading-relaxed">
                   Every question comes from education professionals who've taken and passed the BPSC exams, not freelance writers. That <span className="font-bold text-slate-900">expertise</span> shows up in every question you practice, ensuring alignment with the latest exam trends.
                 </p>
               </div>
               <div className="hidden md:block w-48 h-48 rounded-full bg-slate-100 overflow-hidden border-4 border-white shadow-lg shrink-0">
                  <img src="https://i.pravatar.cc/300?img=11" alt="Expert" className="w-full h-full object-cover" />
               </div>
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-slate-300 py-16 px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
              <div>
                 <h4 className="font-bold text-white mb-6 text-lg tracking-wide">Company</h4>
                 <ul className="space-y-4 text-sm font-medium">
                   <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Leadership Team</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Testimonials</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Work with Us</a></li>
                 </ul>
              </div>
              <div>
                 <h4 className="font-bold text-white mb-6 text-lg tracking-wide">Resources</h4>
                 <ul className="space-y-4 text-sm font-medium">
                   <li><a href="#" className="hover:text-white transition-colors">System Requirements</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Terms of Use</a></li>
                 </ul>
              </div>
              <div>
                 <h4 className="font-bold text-white mb-6 text-lg tracking-wide">Connect</h4>
                 <ul className="space-y-4 text-sm font-medium">
                   <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Forums</a></li>
                 </ul>
              </div>
           </div>

           <div className="pt-8 border-t border-slate-700/50 text-[11px] leading-relaxed text-slate-500">
             The Bihar Public Service Commission (BPSC) does not endorse, promote, or warrant the accuracy or quality of the products or services offered by Scholarly Education. BPSC Teacher Recruitment Exam (TRE) are trademarks owned by the Bihar Government. Scholarly Education and its services are neither affiliated with nor endorsed by the BPSC.
             <div className="mt-4">
               © Scholarly Education, LLC
             </div>
           </div>
        </div>
      </footer>
    </div>
  );
}
