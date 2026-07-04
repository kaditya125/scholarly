import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";

export default function Pricing() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-6 relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-yellow-400/10 rounded-full blur-[100px] pointer-events-none" />

        <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            Back to Home
        </Link>
        
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center z-10"
        >
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
                Pricing page <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-yellow-400">coming soon</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
                We are currently crafting the best valuable plans for our users. Stay tuned for updates!
            </p>
        </motion.div>
    </div>
  );
}
