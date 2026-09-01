import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Clock } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import NightSky from '../components/landing/NightSky';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { BLOG_POSTS, CATEGORIES } from '../content/blogPosts';
import { Underline } from '../components/landing/Annotate';

/**
 * Blog index.
 *
 * An engineering blog rather than a marketing one: the posts describe how the product actually
 * works, including the parts that failed and were rebuilt.
 *
 * ── Why the state lives in the URL ──────────────────────────────────────────────────────────
 * Page and category are search params, not component state. A reader who lands on page 3 and
 * sends someone the link should be sending page 3 — with component state they would be sending
 * page 1 and the recipient would never find what was being pointed at. It also makes the browser
 * back button behave the way a reader expects after paging forward.
 *
 * Filtering is client-side over a static list because a handful of posts do not need a CMS, and
 * adding one would be more moving parts than the content justifies.
 */

const PAGE_SIZE = 6;

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Blog() {
  const [params, setParams] = useSearchParams();

  useSeo({
    title: 'Engineering blog — Sadhya',
    description:
      'How Sadhya is built: the retrieval pipeline, where syllabus data comes from, how voice mode works, and the constraints the product holds itself to.',
    url: 'https://sadhya.app/blog',
  });

  const rawCategory = params.get('category') ?? 'All';
  // An unknown category in the URL is a bad link, not an empty blog — fall back rather than
  // rendering a page that looks like there is nothing here.
  const category = (CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as (typeof CATEGORIES)[number])
    : 'All';

  const filtered = useMemo(
    () => (category === 'All' ? BLOG_POSTS : BLOG_POSTS.filter((p) => p.category === category)),
    [category],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  /*
   * Clamped rather than trusted. ?page=99 and ?page=-2 and ?page=banana all have to resolve to a
   * real page; the alternative is an empty list that reads as "we have no posts".
   */
  const requested = Number.parseInt(params.get('page') ?? '1', 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;

  const posts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const go = (next: { category?: string; page?: number }) => {
    const p = new URLSearchParams(params);
    if (next.category !== undefined) {
      // Changing the filter always returns to page 1. Keeping the page number can land a reader
      // on page 3 of a category that has one page, which looks like an empty blog.
      next.category === 'All' ? p.delete('category') : p.set('category', next.category);
      p.delete('page');
    }
    if (next.page !== undefined) {
      next.page === 1 ? p.delete('page') : p.set('page', String(next.page));
    }
    setParams(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c]">
      <SiteHeader />
      <NightSky />

      <main className="relative z-10 max-w-3xl mx-auto px-6 pt-16 pb-24">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Engineering blog
        </p>
        <h1 className="mt-3 text-[34px] sm:text-[42px] leading-[1.1] font-bold tracking-tight text-slate-900 dark:text-white">
          How Sadhya is <Underline>built</Underline>
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
              onClick={() => go({ category: c })}
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

        {/* One page needs no controls; showing a disabled pager just adds furniture. */}
        {pageCount > 1 && (
          <nav
            className="mt-12 flex items-center justify-between gap-4 border-t border-slate-200 dark:border-white/10 pt-6"
            aria-label="Blog pagination"
          >
            <button
              onClick={() => go({ page: page - 1 })}
              disabled={page === 1}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Previous
            </button>

            <div className="flex items-center gap-1.5">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => go({ page: n })}
                  aria-current={n === page ? 'page' : undefined}
                  className={
                    n === page
                      ? 'w-8 h-8 rounded-full text-[13px] font-bold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950'
                      : 'w-8 h-8 rounded-full text-[13px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors'
                  }
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              onClick={() => go({ page: page + 1 })}
              disabled={page === pageCount}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </nav>
        )}

        <p className="mt-6 text-center text-[12.5px] text-slate-400 dark:text-slate-500">
          {filtered.length} {filtered.length === 1 ? 'post' : 'posts'}
          {category !== 'All' && ` in ${category}`}
          {pageCount > 1 && ` · page ${page} of ${pageCount}`}
        </p>
      </main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
