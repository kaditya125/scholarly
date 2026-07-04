import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Github } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { auth, googleProvider, githubProvider, signInWithPopup } from "../lib/firebase";

export default function Signin() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
      navigate("/dashboard");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to sign in with Google.");
    }
  };

  const handleGithubSignIn = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, githubProvider);
      navigate("/dashboard");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to sign in with GitHub.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#131314] flex font-sans transition-colors duration-300">
      {/* Left Sidebar - Branding (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1f2937] text-white flex-col justify-between p-12 relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-400/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-16">
            <div className="flex items-center justify-center">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15"/>
                 <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
            </div>
            <span className="font-bold text-xl tracking-tight text-white uppercase flex items-center gap-2">
               Scholarly <span className="text-[12px] font-medium tracking-normal text-slate-400 capitalize border-l border-slate-600 pl-2">Education</span>
            </span>
          </Link>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl font-bold mb-6 leading-tight">
              Welcome back.
            </h1>
            <p className="text-slate-300 text-lg mb-12 max-w-md">
              Sign in to continue your preparation and pick up right where you left off.
            </p>
            
            <div className="space-y-6">
              {[
                "100% SCERT aligned syllabus coverage",
                "Detailed performance analytics and insights",
                "Simulated real exam testing environment"
              ].map((feature, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.15 + 0.3 }}
                  className="flex items-center gap-4"
                >
                  <div className="bg-teal-500/20 p-1 rounded-full">
                    <CheckCircle2 className="w-5 h-5 text-teal-400" />
                  </div>
                  <span className="text-slate-200 font-medium">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
        
        <div className="relative z-10 text-sm text-slate-500 font-medium">
          © {new Date().getFullYear()} Scholarly Education. All rights reserved.
        </div>
      </div>
      
      {/* Right Content - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 border-l border-transparent dark:border-white/5">
        <motion.div 
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="text-center lg:text-left mb-10">
             <div className="flex items-center justify-center lg:hidden mb-8">
               <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15" className="dark:fill-yellow-400" />
                 <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#1f2937" className="dark:stroke-yellow-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Sign in to your account</h2>
            <p className="text-slate-500 dark:text-gray-400">Welcome back! Please enter your details.</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4 mb-6 relative">
            <button
               onClick={handleGoogleSignIn}
               className="w-full bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-800 dark:text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors shadow-sm"
             >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                 <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                 <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                 <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
               </svg>
               Sign in with Google
            </button>

            <button
              onClick={handleGithubSignIn}
              className="w-full bg-[#24292e] hover:bg-[#2f363d] dark:bg-[#24292e] border border-transparent dark:border-white/10 dark:hover:bg-white/5 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors shadow-sm"
            >
              <Github className="w-5 h-5 text-white" />
              Sign in with GitHub
            </button>
          </div>

          <div className="relative flex items-center mb-6">
            <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 dark:text-gray-500 text-sm font-medium">Or continue with email</span>
            <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
          </div>

          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 dark:text-gray-300">Email Address</label>
              <input 
                type="email" 
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1f1f1f] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 dark:focus:border-indigo-500 transition-colors shadow-sm"
                placeholder="john@example.com"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center border-none rounded">
                <label className="text-sm font-semibold text-slate-700 dark:text-gray-300">Password</label>
                <a href="#" className="text-xs text-teal-600 dark:text-indigo-400 font-semibold hover:underline">Forgot password?</a>
              </div>
              <div className="relative">
                <input 
                  type="password" 
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1f1f1f] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 dark:focus:border-indigo-500 transition-colors shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
            
            <div className="pt-2">
              <Link
                to="/dashboard"
                className="w-full bg-yellow-400 hover:bg-yellow-300 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-slate-900 dark:text-white font-bold py-3.5 px-4 rounded-lg transition-colors flex justify-center items-center gap-2 shadow-sm"
              >
                Sign In
              </Link>
            </div>
          </form>

          <p className="mt-8 text-center text-slate-500 dark:text-gray-400 text-sm">
            Don't have an account? <Link to="/signup" className="text-teal-600 dark:text-indigo-400 font-bold hover:underline">Sign up</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
