import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";

/** Rotating student testimonials shown on the image side of the auth pages. Swap the `image`
 *  URLs for real branded photos whenever they're available — picsum keeps them stable for now. */
const TESTIMONIALS = [
  {
    quote:
      "Sadhya's AI tutor broke every tough concept down until it finally clicked — and the mock tests felt exactly like the real TRE.",
    name: "Priya Kumari",
    role: "TRE PRT Qualifier",
    org: "Patna, Bihar",
    image: "https://picsum.photos/seed/sadhya-auth-a/1200/1600",
  },
  {
    quote:
      "I stopped memorising and started understanding. The reasoning tutor shows every step and cites the exact SCERT chapter it used.",
    name: "Amit Ranjan",
    role: "TRE TGT Aspirant",
    org: "Gaya, Bihar",
    image: "https://picsum.photos/seed/sadhya-auth-b/1200/1600",
  },
  {
    quote:
      "The adaptive quizzes kept hitting my weak areas until they weren't weak any more. Best prep decision I made all year.",
    name: "Sneha Verma",
    role: "TRE PGT Qualifier",
    org: "Muzaffarpur, Bihar",
    image: "https://picsum.photos/seed/sadhya-auth-c/1200/1600",
  },
];

/** The right-hand showcase panel: a full-bleed image with a rotating testimonial overlay and
 *  prev/next controls. Hidden below `lg` so the form takes the full width on small screens. */
export function AuthShowcase() {
  const [index, setIndex] = useState(0);
  const t = TESTIMONIALS[index];
  const go = (delta: number) =>
    setIndex((prev) => (prev + delta + TESTIMONIALS.length) % TESTIMONIALS.length);

  return (
    <div className="relative hidden overflow-hidden bg-slate-100 lg:block lg:w-1/2">
      {/* Background image (cross-fades between testimonials) */}
      <AnimatePresence>
        <motion.img
          key={t.image}
          src={t.image}
          alt=""
          referrerPolicy="no-referrer"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />

      {/* Testimonial overlay */}
      <div className="absolute inset-x-0 bottom-0 p-10 text-white xl:p-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <blockquote className="max-w-xl text-2xl font-semibold leading-[1.25] tracking-tight xl:text-[32px]">
              {t.quote}
            </blockquote>
            <div className="mt-8 flex items-end justify-between gap-6">
              <div>
                <div className="text-lg font-semibold xl:text-xl">{t.name}</div>
                <div className="mt-1 text-[13.5px] text-white/70">{t.role}</div>
                <div className="text-[13.5px] text-white/70">{t.org}</div>
              </div>
              <div className="flex gap-0.5 pb-1">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="h-4 w-4 fill-white text-white" />
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous testimonial"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 text-white transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next testimonial"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 text-white transition-colors hover:bg-white/10"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
