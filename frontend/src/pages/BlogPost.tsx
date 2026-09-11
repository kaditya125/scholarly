import { Link, useParams, Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Clock } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SkyAmbience from '../components/landing/sky';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { getPost, BLOG_POSTS } from '../content/blogPosts';

/**
 * A single blog post.
 *
 * Markdown is rendered with explicit element styling rather than a typography plugin, so code
 * blocks and tables — which most of these posts lean on heavily — are readable on both themes and
 * scroll inside their own container instead of stretching the page sideways on a phone.
 */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPost(slug) : undefined;

  useSeo({
    title: post ? `${post.title} — Sadhya` : 'Blog — Sadhya',
    description: post?.summary ?? 'Engineering notes from Sadhya.',
    url: post ? `https://sadhya.app/blog/${post.slug}` : 'https://sadhya.app/blog',
  });

  // An unknown slug is a wrong URL, not an error state worth its own page.
  if (!post) return <Navigate to="/blog" replace />;

  const others = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c]">
      <SiteHeader />
      <SkyAmbience />

      <main className="relative z-10 max-w-3xl mx-auto px-6 pt-12 pb-24 font-sans">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All posts
        </Link>

        <div className="mt-8 flex items-center gap-2.5 text-[12px] text-slate-400 dark:text-slate-500 font-medium">
          <span className="text-[#6ca855] dark:text-[#c8e558]">{post.category}</span>
          <span>·</span>
          <span>{fmt(post.date)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> {post.readingMinutes} min read
          </span>
        </div>

        <h1 className="mt-3 text-[28px] sm:text-[36px] leading-[1.18] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
          {post.title}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-slate-600 dark:text-slate-300">
          {post.summary}
        </p>

        <hr className="my-10 border-slate-100 dark:border-white/10" />

        <article className="text-[15.5px] sm:text-[16px] leading-[1.78] text-slate-700 dark:text-slate-300">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h2 className="mt-14 mb-5 pt-8 border-t border-slate-100 dark:border-white/10 text-[24px] sm:text-[26px] font-semibold tracking-[-0.025em] text-slate-900 dark:text-white">
                  {children}
                </h2>
              ),
              h2: ({ children }) => (
                <h2 className="mt-12 mb-4 text-[21px] sm:text-[23px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-8 mb-3 text-[17px] sm:text-[18px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  {children}
                </h3>
              ),
              p: ({ children }) => <p className="my-5">{children}</p>,
              ul: ({ children }) => <ul className="my-5 pl-5 list-disc space-y-2">{children}</ul>,
              ol: ({ children }) => <ol className="my-5 pl-5 list-decimal space-y-2">{children}</ol>,
              strong: ({ children }) => (
                <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>
              ),
              a: ({ href, children }) => (
                <a href={href} className="underline decoration-slate-300 hover:decoration-slate-900 dark:decoration-white/30 dark:hover:decoration-white transition-colors">
                  {children}
                </a>
              ),
              code: ({ children, className }) =>
                className ? (
                  <code className="font-mono text-[13px]">{children}</code>
                ) : (
                  <code className="font-mono text-[13px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.08] text-slate-800 dark:text-slate-200">
                    {children}
                  </code>
                ),
              pre: ({ children }) => (
                <pre className="my-6 p-4 rounded-xl overflow-x-auto bg-slate-950 text-slate-100 dark:bg-black/60 border border-slate-800/80 dark:border-white/10 text-[13px] leading-relaxed">
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-6 pl-4 border-l-2 border-[#6ca855] dark:border-[#c8e558] text-slate-600 dark:text-slate-400 italic">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="my-6 overflow-x-auto border border-slate-100 dark:border-white/10 rounded-lg">
                  <table className="w-full text-[14px] border-collapse">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="text-left font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/15 py-2.5 px-4 bg-slate-50/50 dark:bg-white/[0.02]">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="align-top border-b border-slate-100 dark:border-white/[0.07] py-2.5 px-4">
                  {children}
                </td>
              ),
              hr: () => <hr className="my-10 border-slate-100 dark:border-white/10" />,
            }}
          >
            {post.body}
          </ReactMarkdown>
        </article>

        <hr className="my-12 border-slate-100 dark:border-white/10" />

        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Keep reading
        </p>
        <ul className="mt-5 space-y-4">
          {others.map((p) => (
            <li key={p.slug}>
              <Link to={`/blog/${p.slug}`} className="group block">
                <span className="text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {p.title}
                </span>
                <span className="block mt-1 text-[13.5px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {p.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
