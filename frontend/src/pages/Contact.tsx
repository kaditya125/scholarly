import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Clock, ShieldAlert, Building2, ArrowRight, Scale, Copy, Check, Send, Sparkles, MessageSquare, Loader2 } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { SITE } from '../lib/siteConfig';
import { useSeo } from '../lib/useSeo';
import { api } from '../lib/api/client';

const CHANNELS = [
  {
    id: 'support' as const,
    icon: Mail,
    title: 'Support',
    body: 'Trouble with your account, a payment, or something that isn’t working.',
    email: SITE.email.support,
    badge: 'Response within 2–4h',
  },
  {
    id: 'sales' as const,
    icon: Building2,
    title: 'Schools & institutions',
    body: 'Bulk seats, teacher admin dashboards, custom curriculum and invoicing.',
    email: SITE.email.sales,
    badge: 'Institutional inquiries',
  },
  {
    id: 'security' as const,
    icon: ShieldAlert,
    title: 'Security',
    body: 'Report a vulnerability or security concern to our engineering team.',
    email: SITE.email.security,
    badge: 'Direct to engineering',
  },
  {
    id: 'privacy' as const,
    icon: Scale,
    title: 'Privacy & legal',
    body: 'Data requests, grievance officer escalations, and compliance.',
    email: SITE.email.privacy,
    badge: 'Statutory officer',
  },
];

export default function Contact() {
  useSeo({
    title: `Contact Us — ${SITE.name}`,
    description: `Get in touch with ${SITE.name} — support, sales, security, and general enquiries.`,
    url: `${SITE.url}/contact`,
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [selectedChannel, setSelectedChannel] = useState<'support' | 'sales' | 'security' | 'privacy'>('support');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, emailToCopy: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(emailToCopy);
    setCopiedEmail(emailToCopy);
    setTimeout(() => setCopiedEmail(null), 2200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorMsg('Please fill in your name, email, and message.');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/api/contact/send-inquiry', {
        name: name.trim(),
        email: email.trim(),
        channel: selectedChannel,
        subject: subject.trim() || `Inquiry regarding ${selectedChannel}`,
        message: message.trim(),
      });

      setSuccessMsg('Your message has been delivered directly to our team. We will reply to your email shortly.');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      console.error('Failed to submit contact form', err);
      setErrorMsg(err?.response?.data?.error || 'Failed to send message. Please email us directly or try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased selection:bg-[#c8e558]/30">
      <SiteHeader />

      <main className="max-w-[1160px] mx-auto px-5 sm:px-8">
        <header className="pt-14 sm:pt-20 pb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
            Direct Support Channels
          </div>
          <h1 className="text-[34px] sm:text-[46px] leading-[1.08] font-semibold tracking-[-0.035em]">
            Talk to us
          </h1>
          <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-slate-500 dark:text-gray-400">
            A real person reads every one of these. Send a direct message below or click any channel to copy its dedicated address.
          </p>
        </header>

        {/* ── Interactive Contact Grid & Live Form ──────────────────────── */}
        <div className="grid lg:grid-cols-12 gap-8 pb-16">
          
          {/* Left Column: 4 Channels */}
          <div className="lg:col-span-5 flex flex-col gap-3.5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-1">
              Select Department
            </h2>
            {CHANNELS.map((c) => {
              const isSelected = selectedChannel === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedChannel(c.id);
                    setSuccessMsg(null);
                  }}
                  className={`cursor-pointer rounded-2xl border p-5 transition-all text-left group relative ${
                    isSelected
                      ? 'border-slate-900 dark:border-[#c8e558] bg-slate-50 dark:bg-white/[0.04] shadow-sm'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex w-9 h-9 rounded-xl items-center justify-center ${
                        isSelected 
                          ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900' 
                          : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200'
                      }`}>
                        <c.icon className="w-4 h-4" strokeWidth={2} />
                      </span>
                      <div>
                        <h3 className="text-[15.5px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">
                          {c.title}
                        </h3>
                        <span className="text-[11.5px] font-medium text-slate-400 dark:text-gray-400">
                          {c.badge}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, c.email)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
                      title="Copy email address"
                      aria-label={`Copy ${c.email}`}
                    >
                      {copiedEmail === c.email ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <p className="mt-2.5 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
                    {c.body}
                  </p>

                  <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-slate-200/60 dark:border-white/5 text-[12.5px]">
                    <span className="font-mono text-slate-600 dark:text-gray-300">
                      {c.email}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-900 dark:text-[#c8e558] group-hover:translate-x-0.5 transition-transform">
                      {isSelected ? 'Selected' : 'Select'} <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Direct Messaging Form */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight">Send a Direct Message</h2>
                    <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
                      To: <strong className="text-slate-900 dark:text-white font-mono">{selectedChannel}@sadhya.app</strong>
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                  Online
                </span>
              </div>

              {successMsg ? (
                <div className="py-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-7 h-7" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Message Delivered!</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-gray-300 max-w-md mx-auto">
                    {successMsg}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSuccessMsg(null)}
                    className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  {errorMsg && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-xs font-medium">
                      {errorMsg}
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12.5px] font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                        Your Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Aditya Kumar"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/30"
                      />
                    </div>

                    <div>
                      <label className="block text-[12.5px] font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                        Your Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief summary of your inquiry"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can we help you?"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/30 resize-y"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <p className="text-[11.5px] text-slate-400 dark:text-gray-500">
                      SLA: Replies arrive within 2–4 hours.
                    </p>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Delivering...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send Message
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* ── Registered details ─────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 pb-20 sm:pb-28">
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 sm:p-7 bg-white dark:bg-[#141416]">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Registered Office</h2>
            <div className="mt-5 space-y-4">
              <div className="flex gap-3">
                <MapPin className="w-4 h-4 mt-1 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
                <div className="text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
                  <p className="font-medium text-slate-900 dark:text-white">{SITE.legalEntity}</p>
                  <p>{SITE.address.line1}</p>
                  <p>{SITE.address.line2}</p>
                  <p>{SITE.address.city} {SITE.address.postalCode}</p>
                  <p>{SITE.address.state}, {SITE.address.country}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Phone className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
                <a href={`tel:${SITE.phone.replace(/\s/g, '')}`} className="text-[14px] text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                  {SITE.phone}
                </a>
              </div>

              <div className="flex gap-3">
                <Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
                <p className="text-[14px] text-slate-600 dark:text-gray-300">{SITE.supportHours}</p>
              </div>

              {(SITE.cin || SITE.gstin) && (
                <div className="pt-2 space-y-1 text-[13px] text-slate-500 dark:text-gray-400">
                  {SITE.cin && <p>CIN: {SITE.cin}</p>}
                  {SITE.gstin && <p>GSTIN: {SITE.gstin}</p>}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-6 sm:p-7">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Grievance Officer</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
              As required by the Digital Personal Data Protection Act, 2023 and the Information
              Technology Act, 2000, you can escalate any complaint about your personal data to our
              Grievance Officer at{' '}
              <a href={`mailto:${SITE.email.privacy}`} className="font-medium text-slate-900 dark:text-white underline underline-offset-2">
                {SITE.email.privacy}
              </a>
              .
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
              We acknowledge complaints within 48 hours and aim to resolve them within 30 days.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/privacy" className="text-[13.5px] font-medium text-slate-900 dark:text-white underline underline-offset-2">
                Privacy policy
              </Link>
              <Link to="/terms" className="text-[13.5px] font-medium text-slate-900 dark:text-white underline underline-offset-2">
                Terms of service
              </Link>
              <Link to="/refunds" className="text-[13.5px] font-medium text-slate-900 dark:text-white underline underline-offset-2">
                Refunds
              </Link>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
