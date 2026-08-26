import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { BLOG_POSTS, CATEGORIES } from '../content/blogPosts';

/**
 * Blog index.
 *
 * An engineering blog rather than a marketing one: the posts describe how the product actually
 * works, including the parts that failed and were rebuilt. Filtering is client-side over a static
 * list because five posts do not need a CMS, and adding one would be more moving parts than the
 * content justifies.
 */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Blog() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');

  useSeo({
    title: 'Engineering blog — Sadhya',
    description:
      'How Sadhya is built: the retrieval pipeline, where syllabus data comes from, how voice mode works, and the constraints the product holds itself to.',
    url: 'https://sadhya.app/blog',
  });

  const posts = useMemo(
    () => (category === 'All' ? BLOG_POSTS : BLOG_POSTS.filter((p) => p.category === category)),
    [category],
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c]">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Engineering blog
        </p>
        <h1 className="mt-3 text-[34px] sm:text-[42px] leading-[1.1] font-bold tracking-tight text-slate-900 dark:text-white">
          How Sadhya is built
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
          Long-form notes on the parts of this product that were hard: getting a syllabus from the
          commission that set it, answering without inventing, holding a real-time conversation, and
          the failures along the way that shaped each of them.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={
                c === category
                  ? 'px-3.5 py-1.5 rounded-full text-[13px] font-semibold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950'
                  : 'px-3.5 py-1.5 rounded-full text-[13px] font-semibold border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors'
              }
            >
              {c}
            </button>
          ))}
        </div>

        <ul className="mt-10 space-y-2">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                to={`/blog/${p.slug}`}
                className="group block rounded-2xl -mx-4 px-4 py-6 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3 text-[12.5px] text-slate-400 dark:text-slate-500">
                  <span className="font-semibold text-[#8ba32b] dark:text-[#c8e558]">{p.category}</span>
                  <span>{fmt(p.date)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {p.readingMinutes} min
                  </span>
                </div>
                <h2 className="mt-2 text-[21px] font-bold tracking-tight text-slate-900 dark:text-white">
                  {p.title}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {p.summary}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 dark:text-white">
                  Read
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter />
    </div>
  );
}
