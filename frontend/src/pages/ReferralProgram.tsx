import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Users, IndianRupee, ArrowRight, Sparkles } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';
import ReferralBackground from '../components/landing/ReferralBackground';
import { cn } from '../lib/utils';
import { useReducedMotion, motion } from 'motion/react';
import { Underline } from '../components/landing/Annotate';

const EASE = [0.16, 1, 0.3, 1] as const;

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export default function ReferralProgram() {
  useSeo({
    title: `Refer a Friend — ${SITE.name}`,
    description: `Invite friends to ${SITE.name} and earn rewards when they join — refer students preparing for the same exams you are.`,
    url: `${SITE.url}/referral-program`,
  });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased flex flex-col overflow-hidden">
      <ReferralBackground />
      <div className="relative z-10 flex flex-col flex-1">
        <SiteHeader />

      <main className="flex-1">
        <section className="max-w-[800px] mx-auto px-5 sm:px-8 pt-6 sm:pt-10 pb-16 sm:pb-24">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-[12.5px] font-semibold tracking-[0.02em] mb-5">
                <Gift className="w-3.5 h-3.5" aria-hidden />
                Refer & Earn
              </span>
              <h1 className="text-[34px] sm:text-[42px] leading-[1.12] font-semibold tracking-[-0.03em]">
                Learn together. <br className="hidden sm:block" /> Earn <Underline>together</Underline>.
              </h1>
              <p className="mt-5 text-[16px] sm:text-[17.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                Whether you're a student looking for free Pro access or a teacher building your
                network, the Sadhya referral program rewards you every time you bring a friend aboard.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-14 sm:mt-20 grid sm:grid-cols-2 gap-6 sm:gap-8 relative">
              {/* Student Benefits */}
              <motion.div 
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-8 sm:p-10 relative overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 hover:shadow-lg dark:hover:shadow-white/5 transition-all"
              >
                {/* Background Watermark Reacting to Hover */}
                <div className="absolute -top-6 -right-6 opacity-5 dark:opacity-[0.02] group-hover:opacity-10 dark:group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500">
                  <Gift strokeWidth={1} className="w-40 h-40 text-slate-400 dark:text-white" />
                </div>
                {/* Tiny Sparks on Hover */}
                <Sparkles className="absolute top-8 right-8 w-5 h-5 text-[#c8e558] opacity-0 group-hover:opacity-80 transition-opacity duration-300 delay-100" />
                <Sparkles className="absolute bottom-12 right-20 w-4 h-4 text-[#8ab4f8] opacity-0 group-hover:opacity-60 transition-opacity duration-300 delay-200" />

                <div className="absolute -bottom-8 -right-8 opacity-10 dark:opacity-[0.04] group-hover:opacity-0 transition-opacity duration-500">
                  <Users className="w-32 h-32 text-slate-400 dark:text-white" />
                </div>
                <div className="relative z-10">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
                    For Students
                  </span>
                  <h3 className="mt-3 text-[22px] font-semibold">Free Pro Access</h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                    When a friend signs up using your unique referral link, <strong>both of you</strong> instantly
                    receive 7 days of Pro access completely free. No credit card required. Stack as many referrals as you want!
                  </p>
                  <ul className="mt-6 space-y-2 text-[13.5px] text-slate-600 dark:text-gray-300">
                    <li className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" /> 7 free days for you
                    </li>
                    <li className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" /> 7 free days for your friend
                    </li>
                    <li className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" /> Unlock Mock Tests & Podcasts
                    </li>
                  </ul>
                </div>
              </motion.div>

              {/* Teacher Benefits */}
              <motion.div 
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="rounded-3xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141416] p-8 sm:p-10 relative overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 hover:shadow-lg dark:hover:shadow-white/5 transition-all"
              >
                {/* Background Watermark Reacting to Hover */}
                <div className="absolute -top-6 -right-6 opacity-5 dark:opacity-[0.02] group-hover:opacity-10 dark:group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500">
                  <IndianRupee strokeWidth={1} className="w-40 h-40 text-slate-400 dark:text-white" />
                </div>
                {/* Floating Reward Particles on Hover */}
                <div className="absolute top-12 right-12 w-3 h-3 rounded-full bg-[#F4C542] opacity-0 group-hover:opacity-60 group-hover:-translate-y-4 transition-all duration-500" />
                <div className="absolute bottom-16 right-24 w-2 h-2 rounded-full bg-[#F4C542] opacity-0 group-hover:opacity-40 group-hover:-translate-y-6 transition-all duration-500 delay-100" />

                <div className="absolute -bottom-8 -right-8 opacity-10 dark:opacity-[0.04] group-hover:opacity-0 transition-opacity duration-500">
                  <IndianRupee className="w-32 h-32 text-slate-400 dark:text-white" />
                </div>
                <div className="relative z-10">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
                    For Teachers
                  </span>
                  <h3 className="mt-3 text-[22px] font-semibold">Weekly Payouts</h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-slate-500 dark:text-gray-400">
                    Invite peers to teach on Sadhya. For every successful teacher signup and verification,
                    you earn a cash reward. Payouts are automatically processed weekly directly to your bank account via RazorpayX.
                  </p>
                  <ul className="mt-6 space-y-2 text-[13.5px] text-slate-600 dark:text-gray-300">
                    <li className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" /> Track referrals in your dashboard
                    </li>
                    <li className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" /> Automated IMPS bank transfers
                    </li>
                    <li className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" /> No earnings cap
                    </li>
                  </ul>
                </div>
              </motion.div>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-16 sm:mt-20 text-center">
              <h2 className="text-[20px] font-semibold">Ready to start earning?</h2>
              <p className="mt-2 text-[14.5px] text-slate-500 dark:text-gray-400">
                Log in to grab your unique referral link from your dashboard.
              </p>
              <div className="mt-8">
                <Link
                  to="/signin"
                  className="group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 text-[14.5px] font-semibold transition-colors"
                >
                  Log in to get your link
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" strokeWidth={2.25} />
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      </div>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
