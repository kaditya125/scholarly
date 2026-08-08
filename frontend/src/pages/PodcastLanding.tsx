import { motion } from 'motion/react';
import { Sparkles, Mic, FileText, Youtube, File, ArrowRight, Headphones, Globe, Users, Languages, Check, Play } from 'lucide-react';

interface PodcastLandingProps {
  onGetStarted: () => void;
}

export default function PodcastLanding({ onGetStarted }: PodcastLandingProps) {
  return (
    <div className="w-full h-full overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-[#0a0a0b] dark:via-[#0f0f10] dark:to-[#0a0a0b]">
      {/* Hero Section */}
      <div className="relative pt-12 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Simple Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mb-6"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 text-orange-700 dark:text-orange-400 text-xs font-medium">
              <Sparkles className="w-3 h-3" />
              <span>AI Podcast Generator</span>
            </div>
          </motion.div>

          {/* Clean Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-5"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 leading-tight">
              Create studio-quality podcasts<br className="hidden md:block" />with AI in minutes
            </h1>
          </motion.div>

          {/* Simple Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-[15px] text-slate-600 dark:text-gray-400 text-center mb-7 max-w-xl mx-auto leading-relaxed"
          >
            Turn any content into natural-sounding podcasts. No scripts, no voice talent, no editing.
          </motion.p>

          {/* Simple CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-3 flex-wrap mb-10"
          >
            <button
              onClick={onGetStarted}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <span>Get started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-gray-300 text-sm font-medium transition-colors">
              <Play className="w-4 h-4" />
              <span>Listen to demo</span>
            </button>
          </motion.div>

          {/* Simple Input Example */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="max-w-2xl mx-auto"
          >
            <div className="rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-[#141415] p-4 shadow-sm">
              <div className="flex items-start gap-3 mb-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] text-slate-700 dark:text-gray-300">
                    "Create a 10-minute educational podcast with a casual host"
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-gray-500 ml-11">
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">English</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">Casual tone</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">10 minutes</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Content Types */}
      <div className="relative py-12 px-6 bg-slate-100/50 dark:bg-[#0f0f10]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Turn any content into a podcast
            </h2>
            <p className="text-sm text-slate-600 dark:text-gray-400">
              Upload articles, videos, documents, or paste text
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Globe, label: 'Website', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
              { icon: Youtube, label: 'YouTube', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' },
              { icon: FileText, label: 'PDF', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30' },
              { icon: File, label: 'Article', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' }
            ].map((item, idx) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-[#141415] p-4 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center mb-2.5`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <p className="text-xs font-medium text-slate-700 dark:text-gray-300">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="relative py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Everything you need
            </h2>
            <p className="text-sm text-slate-600 dark:text-gray-400">
              Professional podcasts with minimal effort
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                title: 'Realistic AI voices',
                description: 'Choose from multiple natural-sounding voices in 20+ languages',
                icon: Mic
              },
              {
                title: 'Auto-generated transcripts',
                description: 'Get accurate transcripts with timestamps automatically',
                icon: FileText
              },
              {
                title: 'Quick generation',
                description: 'Create a complete podcast episode in just a few minutes',
                icon: Sparkles
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-[#141415] p-5"
              >
                <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center mb-3">
                  <feature.icon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
                  {feature.title}
                </h3>
                <p className="text-[13px] text-slate-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="relative py-12 px-6 bg-slate-100/50 dark:bg-[#0f0f10]">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 text-center">
            {[
              { stat: '10K+', label: 'Hours generated' },
              { stat: '15M+', label: 'Creators using' },
              { stat: '20+', label: 'Languages' }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{item.stat}</div>
                <div className="text-xs text-slate-600 dark:text-gray-400">{item.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="relative py-12 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Ready to create your first podcast?
          </h2>
          <p className="text-sm text-slate-600 dark:text-gray-400 mb-6">
            Join thousands of creators transforming content into engaging audio
          </p>
          <button
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium shadow-sm transition-colors"
          >
            <span>Get started for free</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-gray-400">
            {['No credit card', 'Quick setup', 'Cancel anytime'].map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
