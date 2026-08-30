import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Check, X, Loader2, Camera, Monitor, Sun, Moon, ShieldCheck, ShieldAlert,
  Mail, KeyRound, LogOut, Trash2, CreditCard, Github,
  BadgeCheck, MapPin, Globe, Pencil, ArrowUpRight, Bot, BookOpen, FileText, Layers, GraduationCap,
  ChevronLeft, Printer, BarChart2, TrendingUp, Sparkles, Target
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { updateProfile, sendPasswordResetEmail, sendEmailVerification, deleteUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { uploadAvatar, UploadProgress } from '../lib/api/avatar';
import { cn } from '../lib/utils';
import { api } from '../lib/api/client';
import { NotificationsPanel } from '../components/settings/NotificationsPanel';
import { LearningProfileSettings } from '../components/settings/LearningProfileSettings';
import { usePolicyConsent } from '../lib/hooks/usePolicyConsent';
import { SADHYA_POLICIES, CURRENT_POLICY_METADATA } from '../content/policies/policyData';

type TabId = 'profile' | 'learning' | 'analytics' | 'general' | 'billing' | 'notifications' | 'apps' | 'security' | 'policies';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'About Me' },
  { id: 'learning', label: 'Learning Profile' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'general', label: 'General' },
  { id: 'billing', label: 'Plan & Billing' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'apps', label: 'Apps' },
  { id: 'security', label: 'Security' },
  { id: 'policies', label: 'Terms & Policies' },
];

const EXAMS = [
  { value: 'prt', label: 'TRE PRT (Class 1-5)' },
  { value: 'tgt', label: 'TRE TGT (Class 9-10)' },
  { value: 'pgt', label: 'TRE PGT (Class 11-12)' },
];

export default function Settings() {
  const { user, logout, refreshUser, role } = useAuth();
  const isTeacher = role === 'teacher';
  // Same page, mounted under both /settings (student) and /teach/settings (teacher — see
  // App.tsx) — internal links below must resolve inside whichever shell rendered them.
  const homePath = isTeacher ? '/teach' : '/dashboard';
  const chatPath = isTeacher ? '/teach/chat' : '/chat';
  const notebooksPath = isTeacher ? '/teach/notebooks' : '/notebooks';
  const testsPath = isTeacher ? '/teach/tests' : '/tests';
  const visibleTabs = isTeacher ? TABS.filter((t) => t.id !== 'learning') : TABS;
  const { themePreference, setThemePreference } = useTheme();
  const { consentStatus } = usePolicyConsent(!!user);
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>('profile');
  const [searchParams] = useSearchParams();
  // Deep-link support: /settings?tab=learning opens the Learning Profile tab (used by the
  // dashboard "complete your profile" card and other CTAs).
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
  }, [searchParams]);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ---- General: profile ----
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [exam, setExam] = useState(() => localStorage.getItem('target-exam') || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadProgress | null>(null);

  useEffect(() => { setDisplayName(user?.displayName || ''); }, [user?.displayName]);

  const saveProfile = async () => {
    if (!auth.currentUser) return;
    setSavingProfile(true);
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      localStorage.setItem('target-exam', exam);
      refreshUser();
      showToast('ok', 'Profile updated');
    } catch (e: any) {
      showToast('err', e?.message || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('err', 'Please choose an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('err', 'Image must be under 5MB'); return; }
    try {
      await uploadAvatar(file, (p) => setUploadState(p));
      setTimeout(() => { refreshUser(); setUploadState(null); showToast('ok', 'Photo updated'); }, 1200);
    } catch {
      setUploadState(null);
      showToast('err', 'Upload failed');
    }
    e.target.value = '';
  };

  // ---- About Me (editable, persisted locally) ----
  const [editAbout, setEditAbout] = useState(false);
  const [bio, setBio] = useState(() => localStorage.getItem('profile-bio') || '');
  const [location, setLocation] = useState(() => localStorage.getItem('profile-location') || '');
  const [website, setWebsite] = useState(() => localStorage.getItem('profile-website') || '');
  const [skills, setSkills] = useState(() => localStorage.getItem('profile-skills') || '');
  const [savingAbout, setSavingAbout] = useState(false);

  const saveAbout = async () => {
    setSavingAbout(true);
    try {
      if (auth.currentUser && displayName.trim() !== (user?.displayName || '')) {
        await updateProfile(auth.currentUser, { displayName: displayName.trim() });
        refreshUser();
      }
      localStorage.setItem('profile-bio', bio.trim());
      localStorage.setItem('profile-location', location.trim());
      localStorage.setItem('profile-website', website.trim());
      localStorage.setItem('profile-skills', skills.trim());
      localStorage.setItem('target-exam', exam);
      setEditAbout(false);
      showToast('ok', 'Profile saved');
    } catch (e: any) {
      showToast('err', e?.message || 'Could not save profile');
    } finally {
      setSavingAbout(false);
    }
  };

  const skillList = skills.split(',').map((s) => s.trim()).filter(Boolean);
  const examLabelOf = (v: string) => EXAMS.find((x) => x.value === v)?.label;

  // ---- Billing (real subscription + payment history from the payments API) ----
  const [promoDismissed, setPromoDismissed] = useState(() => localStorage.getItem('promo-annual-dismissed') === '1');
  const dismissPromo = () => { setPromoDismissed(true); localStorage.setItem('promo-annual-dismissed', '1'); };
  const [sub, setSub] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    api.get('/payments/subscription').then((r) => setSub(r.data)).catch(() => {});
    api.get('/payments/history').then((r) => setPayments(r.data?.payments || [])).catch(() => {});
  }, [user]);
  const isPro = !!sub?.isPro;
  const subInfo = sub?.subscription || null;
  const fmtDate = (ms?: number | null) =>
    ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const planPrice = subInfo?.amountRupees != null ? `₹${Number(subInfo.amountRupees).toLocaleString('en-IN')}` : '₹499';

  // Invoice rows: real payments when available, otherwise synthesize one from the active
  // subscription so a Pro user always sees their purchase even if /payments/history isn't up.
  const historyRows: any[] = payments.length > 0
    ? payments
    : (isPro && subInfo ? [{
        orderId: subInfo.orderId, planId: subInfo.plan, planName: subInfo.planName || 'Sadhya Pro',
        billing: subInfo.billing, amountRupees: subInfo.amountRupees, currency: 'INR',
        status: 'paid', method: subInfo.method, paymentId: subInfo.paymentId,
        createdAt: subInfo.activatedAt, paidAt: subInfo.activatedAt,
      }] : []);

  /** Opens a printable, self-contained invoice for a paid payment. */
  const printInvoice = (p: any) => {
    const w = window.open('', '_blank', 'width=820,height=920');
    if (!w) { showToast('err', 'Allow pop-ups to print the invoice.'); return; }
    const amount = p.amountRupees != null ? `\u20b9${Number(p.amountRupees).toLocaleString('en-IN')}` : '\u2014';
    const dateStr = fmtDate(p.paidAt || p.createdAt);
    const billing = p.orderType === 'class_purchase' ? 'One-time' : (p.billing === 'yearly' ? 'Yearly' : 'Monthly');
    const invNo = String(p.paymentId || p.orderId || 'INV').replace(/[^a-zA-Z0-9_]/g, '');
    const name = user?.displayName || (isTeacher ? 'Sadhya Teacher' : 'Sadhya Student');
    const email = user?.email || '';
    const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(invNo)}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;padding:48px;max-width:760px;margin:0 auto}
        .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
        .brand{display:flex;align-items:center;gap:10px}
        .logo{width:40px;height:40px;border-radius:10px;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px}
        .brand h1{font-size:20px;font-weight:700}
        .brand span{display:block;font-size:12px;color:#64748b;font-weight:500}
        .inv-title{text-align:right}
        .inv-title h2{font-size:24px;font-weight:700}
        .inv-title .no{color:#64748b;font-size:13px;margin-top:2px}
        .meta{display:flex;justify-content:space-between;gap:24px;margin-bottom:36px;font-size:13px;color:#475569}
        .meta .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:4px;font-weight:600}
        .meta strong{color:#0f172a}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px}
        th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;border-bottom:1px solid #e2e8f0;padding:0 0 10px}
        td{padding:14px 0;border-bottom:1px solid #f1f5f9}
        .right{text-align:right}
        .totals{margin-left:auto;width:260px;font-size:14px}
        .totals .row{display:flex;justify-content:space-between;padding:8px 0}
        .totals .grand{border-top:2px solid #0f172a;margin-top:6px;padding-top:12px;font-weight:700;font-size:16px}
        .badge{display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px}
        .foot{margin-top:48px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.6}
      </style></head><body>
      <div class="top">
        <div class="brand"><div class="logo">S</div><div><h1>Sadhya</h1><span>Sadhya Education</span></div></div>
        <div class="inv-title"><h2>Invoice</h2><div class="no">#${esc(invNo)}</div><div style="margin-top:8px"><span class="badge">${p.status === 'paid' ? 'PAID' : esc(String(p.status || '').toUpperCase())}</span></div></div>
      </div>
      <div class="meta">
        <div><div class="lbl">Issue date</div><strong>${esc(dateStr)}</strong></div>
        <div><div class="lbl">Billed to</div><strong>${esc(name)}</strong><div>${esc(email)}</div></div>
        <div><div class="lbl">Payment</div><strong>Razorpay${p.method ? ' \u00b7 ' + esc(String(p.method).toUpperCase()) : ''}</strong>${p.paymentId ? `<div>${esc(p.paymentId)}</div>` : ''}</div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="right">Billing</th><th class="right">Amount</th></tr></thead>
        <tbody><tr><td>${esc(p.planName || 'Sadhya Pro')}${p.orderType === 'class_purchase' ? '' : ' subscription'}</td><td class="right">${billing}</td><td class="right">${amount}</td></tr></tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${amount}</span></div>
        <div class="row"><span>Tax</span><span>Inclusive</span></div>
        <div class="row grand"><span>Total paid</span><span>${amount}</span></div>
      </div>
      <div class="foot">Thank you for subscribing to Sadhya Pro. This is a computer-generated invoice and does not require a signature.<br/>For any billing questions, contact support@sadhya.app.</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  };
  const [showPlans, setShowPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // ---- Account meta ----
  const meta = useMemo(() => {
    const providers = user?.providerData?.map((p) => p.providerId) || [];
    const createdMs = user?.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;
    return {
      providers,
      hasPassword: providers.includes('password'),
      primary: providers[0] || 'password',
      joinLong: createdMs ? new Date(createdMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      emailVerified: !!user?.emailVerified,
      initial: (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase(),
    };
  }, [user]);

  // ---- Security actions ----
  const [busy, setBusy] = useState<string | null>(null);
  const resendVerification = async () => {
    if (!auth.currentUser) return;
    setBusy('verify');
    try { await sendEmailVerification(auth.currentUser); showToast('ok', 'Verification email sent'); }
    catch (e: any) { showToast('err', e?.message || 'Failed to send'); }
    finally { setBusy(null); }
  };
  const resetPassword = async () => {
    if (!user?.email) return;
    setBusy('password');
    try { await sendPasswordResetEmail(auth, user.email); showToast('ok', `Password reset link sent to ${user.email}`); }
    catch (e: any) { showToast('err', e?.message || 'Failed to send reset link'); }
    finally { setBusy(null); }
  };
  const handleSignOut = async () => { await logout(); navigate('/signin'); };
  const handleDelete = async () => {
    if (!auth.currentUser) return;
    if (!window.confirm('This permanently deletes your account and cannot be undone. Continue?')) return;
    setBusy('delete');
    try { await deleteUser(auth.currentUser); navigate('/'); }
    catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') showToast('err', 'For security, sign in again, then retry deleting your account.');
      else showToast('err', e?.message || 'Could not delete account');
    } finally { setBusy(null); }
  };

  const providerLabel = (id: string) => (id === 'google.com' ? 'Google' : id === 'github.com' ? 'GitHub' : id === 'phone' ? 'Phone' : 'Email & Password');

  return (
    <div className="max-w-4xl mx-auto w-full pb-16">
      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={cn('fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg flex items-center gap-2',
            toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')}
        >
          {toast.type === 'ok' ? <Check className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          {toast.msg}
        </motion.div>
      )}

      {/* Header */}
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
      <p className="text-slate-500 dark:text-gray-400 text-[14px] mt-1">
        Customize your settings to manage preferences, security, notifications, and more.
      </p>

      {/* Tabs */}
      <div className="flex items-center gap-1 mt-6 border-b border-slate-200 dark:border-white/10 overflow-x-auto">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn('relative px-4 py-3 text-[14px] font-medium whitespace-nowrap transition-colors',
              tab === t.id ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200')}
          >
            {t.label}
            {tab === t.id && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-slate-900 dark:bg-white rounded-full" />}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === 'learning' && !isTeacher && <LearningProfileSettings />}

        {tab === 'analytics' && !isTeacher && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-2">
                    <TrendingUp className="w-3.5 h-3.5" /> Performance & Diagnostics
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Student Learning Analytics & Performance
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 max-w-xl">
                    View your comprehensive exam readiness grade, projected score boosts, syllabus mastery breakdown, and priority topics for revision.
                  </p>
                </div>

                <Link
                  to="/analytics"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 text-xs font-bold shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all shrink-0"
                >
                  <BarChart2 className="w-4 h-4" />
                  <span>Launch Full Analytics</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="space-y-6">
            {/* Header card */}
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="relative shrink-0">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-3xl font-bold text-indigo-600 dark:text-indigo-300">
                    {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : meta.initial}
                  </div>
                  {meta.emailVerified && (
                    <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-white dark:bg-[#1a1a1b] flex items-center justify-center">
                      <BadgeCheck className="w-5 h-5 text-indigo-500 fill-indigo-500/15" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">{user?.displayName || (isTeacher ? 'Teacher' : 'Student')}</h2>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                  </div>
                  <p className="text-[14px] text-slate-500 dark:text-gray-400 mt-0.5">
                    {bio ? bio.split('\n')[0].slice(0, 90) : isTeacher ? `Educator${location ? ` based in ${location}` : ''}` : `TRE aspirant${location ? ` based in ${location}` : ''}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isTeacher && (
                    <Link to="/analytics" className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <BarChart2 className="w-4 h-4 text-indigo-500" />
                      Analytics
                    </Link>
                  )}
                  <Link to={homePath} className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    View dashboard
                  </Link>
                  <button onClick={() => setEditAbout((v) => !v)} className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg bg-neutral-900 dark:bg-white dark:text-neutral-900 text-white hover:opacity-90 transition-opacity">
                    {editAbout ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    {editAbout ? 'Cancel' : 'Edit profile'}
                  </button>
                </div>
              </div>
            </div>

            {/* Two-column body */}
            <div className="grid md:grid-cols-3 gap-6">
              {/* Left: Experience + About me */}
              <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6 space-y-6">
                {!isTeacher && (
                  <div>
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-2">Preparing for</h3>
                    <div className="flex items-center gap-2 text-[14px] text-slate-600 dark:text-gray-300">
                      <GraduationCap className="w-4 h-4 text-indigo-500 shrink-0" />
                      {examLabelOf(exam) || 'Set your target exam in the General tab'}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-2">About me</h3>
                  {editAbout ? (
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={5}
                      placeholder="Tell others about yourself — your goals, background, and what you're working towards."
                      className={cn(inputCls, 'resize-none leading-relaxed')}
                    />
                  ) : (
                    <p className="text-[14px] leading-relaxed text-slate-600 dark:text-gray-300 whitespace-pre-wrap">
                      {bio || "You haven't added a bio yet. Click Edit profile to introduce yourself."}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Skills / Location / Website / Email */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6 space-y-5">
                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-2">Skills &amp; strengths</h4>
                  {editAbout ? (
                    <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. Mathematics, Pedagogy, GK" className={inputCls} />
                  ) : skillList.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {skillList.map((s) => (
                        <span key={s} className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300">{s}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-slate-400">No skills added</p>
                  )}
                </div>

                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-2">Location</h4>
                  {editAbout ? (
                    <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" className={inputCls} />
                  ) : (
                    <div className="flex items-center gap-2 text-[14px] text-slate-600 dark:text-gray-300">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      {location || <span className="text-slate-400">Not set</span>}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-2">Website</h4>
                  {editAbout ? (
                    <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={inputCls} />
                  ) : website ? (
                    <a href={/^https?:\/\//.test(website) ? website : `https://${website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[14px] text-indigo-600 dark:text-indigo-400 hover:underline break-all">
                      <Globe className="w-4 h-4 shrink-0" /> {website} <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 text-[14px] text-slate-400"><Globe className="w-4 h-4 shrink-0" /> Not set</div>
                  )}
                </div>

                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-2">Email</h4>
                  <a href={`mailto:${user?.email}`} className="inline-flex items-center gap-1.5 text-[14px] text-slate-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 break-all">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" /> {user?.email}
                  </a>
                </div>

                <div className="pt-1">
                  {editAbout ? (
                    <button onClick={saveAbout} disabled={savingAbout} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                      {savingAbout && <Loader2 className="w-4 h-4 animate-spin" />} Save profile
                    </button>
                  ) : (
                    <Link to={chatPath} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      {isTeacher ? 'Ask the AI Assistant' : 'Ask the AI Tutor'}
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Account facts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Member since', value: meta.joinLong },
                { label: 'Plan', value: 'Free' },
                { label: 'Sign-in', value: providerLabel(meta.primary) },
                { label: 'Email', value: meta.emailVerified ? 'Verified' : 'Unverified' },
              ].map((f) => (
                <div key={f.label} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-4">
                  <div className="text-[12px] text-slate-400 dark:text-gray-500">{f.label}</div>
                  <div className="text-[14px] font-semibold text-slate-900 dark:text-white mt-0.5 truncate">{f.value}</div>
                </div>
              ))}
            </div>

            {/* Quick access (case-studies-style grid) */}
            <div>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-3">Quick access</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {(isTeacher ? [
                  { icon: Bot, label: 'AI Assistant', to: chatPath, grad: 'from-indigo-500 to-violet-600' },
                  { icon: BookOpen, label: 'Notebooks', to: notebooksPath, grad: 'from-blue-500 to-cyan-500' },
                  { icon: FileText, label: 'Tests', to: testsPath, grad: 'from-emerald-500 to-teal-600' },
                  { icon: Layers, label: 'Classes', to: '/teach/classes', grad: 'from-fuchsia-500 to-purple-600' },
                ] : [
                  { icon: Bot, label: 'AI Tutor', to: '/chat', grad: 'from-indigo-500 to-violet-600' },
                  { icon: BookOpen, label: 'Notebooks', to: '/notebooks', grad: 'from-blue-500 to-cyan-500' },
                  { icon: FileText, label: 'Mock Tests', to: '/tests', grad: 'from-emerald-500 to-teal-600' },
                  { icon: Layers, label: 'Flashcards', to: '/flashcards', grad: 'from-fuchsia-500 to-purple-600' },
                ]).map((q) => (
                  <Link key={q.label} to={q.to} className="group relative rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 aspect-[4/3] p-4 flex flex-col justify-between hover:-translate-y-0.5 transition-transform">
                    <div className={cn('absolute inset-0 bg-gradient-to-br opacity-90', q.grad)} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
                    <q.icon className="relative w-6 h-6 text-white" />
                    <div className="relative flex items-center justify-between text-white">
                      <span className="font-semibold text-[14px]">{q.label}</span>
                      <ArrowUpRight className="w-4 h-4 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'general' && (
          <div className="space-y-8">
            {/* Profile */}
            <Section title="Profile" desc="Your public identity across Sadhya.">
              <div className="flex items-center gap-5 mb-6">
                <div className="relative group w-20 h-20 rounded-full overflow-hidden bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-2xl font-bold text-indigo-600 dark:text-indigo-300 cursor-pointer shrink-0"
                  onClick={() => fileInputRef.current?.click()}>
                  {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : meta.initial}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadState && uploadState.status !== 'done'
                      ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                      : <Camera className="w-5 h-5 text-white" />}
                  </div>
                </div>
                <div>
                  <div className="text-[14px] font-medium text-slate-900 dark:text-white">Profile photo</div>
                  <div className="text-[12.5px] text-slate-500 dark:text-gray-400">PNG, JPG or WebP, up to 5MB</div>
                  <button onClick={() => fileInputRef.current?.click()} className="mt-2 text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Change photo
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onAvatarPick} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full name">
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className={inputCls} />
                </Field>
                <Field label="Email">
                  <input value={user?.email || ''} disabled className={cn(inputCls, 'opacity-60 cursor-not-allowed')} />
                </Field>
                {!isTeacher && (
                  <Field label="Target exam">
                    <select value={exam} onChange={(e) => setExam(e.target.value)} className={inputCls}>
                      <option value="">Select your exam…</option>
                      {EXAMS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <div className="mt-5">
                <button onClick={saveProfile} disabled={savingProfile}
                  className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                  {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
                </button>
              </div>
            </Section>

            {/* Theme */}
            <Section title="Theme" desc="Choose how Sadhya looks to you.">
              <div className="grid grid-cols-3 gap-3 max-w-md">
                {[{ id: 'system', label: 'System', icon: Monitor }, { id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }].map((o) => (
                  <button key={o.id} onClick={() => setThemePreference(o.id as any)}
                    className={cn('flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-colors',
                      themePreference === o.id ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20')}>
                    <o.icon className={cn('w-5 h-5', themePreference === o.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-gray-400')} />
                    <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200">{o.label}</span>
                  </button>
                ))}
              </div>
            </Section>
          </div>
        )}

        {tab === 'billing' && !showPlans && (
          <div className="space-y-8">
            {/* Subscription */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">Subscription</h2>
                <button onClick={() => setShowPlans(true)} className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">View plans</button>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-slate-900 dark:text-white">{isPro ? 'Pro' : 'Free'}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">Active</span>
                  </div>
                  <div className="text-[12.5px] text-slate-500 dark:text-gray-400">
                    {isPro ? `Valid till ${fmtDate(subInfo?.currentPeriodEnd)}` : 'No expiry'}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-5">
                  <div className="flex items-center gap-4">
                    <div className={cn('w-14 h-14 rounded-full border-4 -rotate-45', isPro ? 'border-emerald-500/80 border-t-transparent' : 'border-indigo-500/70 border-t-transparent')} />
                    <div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{isPro ? 'Sadhya Pro' : 'Free plan'}</div>
                      <div className="text-[13px] text-slate-500 dark:text-gray-400">
                        {isPro ? 'Unlimited GraphRAG tutor, AI studio & adaptive mock tests' : 'Unlimited AI chat & practice within fair use'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-slate-900 dark:text-white">{isPro ? planPrice : '₹0'}</div>
                    {isPro && <div className="text-[12px] text-slate-400">{subInfo?.billing === 'yearly' ? 'per year' : 'per month'}</div>}
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-3">
                  <span className="text-[13px] text-slate-500 dark:text-gray-400">
                    {isPro
                      ? <>Renews on {fmtDate(subInfo?.currentPeriodEnd)} · billed {subInfo?.billing === 'yearly' ? 'yearly' : 'monthly'}</>
                      : <>Questions? Check out the <button onClick={() => navigate('/pricing')} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Billing FAQ</button></>}
                  </span>
                  {!isPro && (
                    <button onClick={() => navigate('/checkout?plan=pro')} className="shrink-0 px-4 py-2 text-[12.5px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">Upgrade to Pro</button>
                  )}
                </div>
              </div>
            </div>

            {/* Promo */}
            {!promoDismissed && !isPro && (
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-bold text-slate-900 dark:text-white">Get 1 month FREE</div>
                  <div className="text-[13px] text-slate-500 dark:text-gray-400">Pay annually and get more credits</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigate('/pricing')} className="px-4 py-2 text-[13px] font-semibold text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 rounded-lg hover:opacity-90 transition-opacity">View Details</button>
                  <button onClick={dismissPromo} aria-label="Dismiss" className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            {/* Payment Info */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">Payment Information</h2>
                <button onClick={() => navigate('/pricing')} className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Edit</button>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] divide-y divide-slate-100 dark:divide-white/10">
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-[13px] text-slate-500 dark:text-gray-400">Payment method</span>
                  <span className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-gray-200">
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    {isPro ? `Razorpay${subInfo?.method ? ` · ${String(subInfo.method).toUpperCase()}` : ''}` : 'No card on file'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-4">
                  <span className="text-[13px] text-slate-500 dark:text-gray-400">Billing email</span>
                  <span className="text-[13px] text-slate-700 dark:text-gray-200">{user?.email || '—'}</span>
                </div>
                {isPro && subInfo?.paymentId && (
                  <div className="flex items-center justify-between px-5 py-4">
                    <span className="text-[13px] text-slate-500 dark:text-gray-400">Last payment ID</span>
                    <span className="text-[13px] text-slate-700 dark:text-gray-200 font-mono">{subInfo.paymentId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Billing history */}
            <div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white mb-3">Billing History</h2>
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] overflow-hidden">
                <div className="grid grid-cols-6 px-5 py-3 bg-slate-50 dark:bg-white/[0.03] text-[12px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  <span className="col-span-2">Invoice</span><span>Date</span><span>Amount</span><span>Status</span><span className="text-right">Invoice</span>
                </div>
                {historyRows.length > 0 ? (
                  historyRows.map((p) => (
                    <div key={p.orderId || p.paymentId} className="grid grid-cols-6 px-5 py-4 text-[13px] text-slate-700 dark:text-gray-200 items-center border-t border-slate-100 dark:border-white/5">
                      <span className="col-span-2 font-medium truncate pr-2">
                        {p.planName || 'Sadhya Pro'} · {p.orderType === 'class_purchase' ? 'One-time' : (p.billing === 'yearly' ? 'Yearly' : 'Monthly')}
                      </span>
                      <span className="text-slate-500 dark:text-gray-400">{fmtDate(p.paidAt || p.createdAt)}</span>
                      <span className="text-slate-700 dark:text-gray-200">{p.amountRupees != null ? `₹${Number(p.amountRupees).toLocaleString('en-IN')}` : '—'}</span>
                      <span>
                        {p.status === 'paid'
                          ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Paid</span>
                          : <span className="text-amber-600 dark:text-amber-400 capitalize">{p.status}</span>}
                      </span>
                      <span className="text-right">
                        {p.status === 'paid' && (
                          <button onClick={() => printInvoice(p)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                            <Printer className="w-3.5 h-3.5" /> Print
                          </button>
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-6 px-5 py-4 text-[13px] text-slate-700 dark:text-gray-200 items-center border-t border-slate-100 dark:border-white/5">
                    <span className="col-span-2 font-medium">Free Plan</span>
                    <span className="text-slate-500 dark:text-gray-400">{meta.joinLong}</span>
                    <span className="text-slate-500 dark:text-gray-400">₹0</span>
                    <span><span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Active</span></span>
                    <span />
                  </div>
                )}
              </div>
              <p className="text-[12px] text-slate-400 mt-2">
                {historyRows.length > 0 ? 'Showing your Razorpay payments. Click Print to download an invoice.' : "You're on the Free plan — no paid invoices yet."}
              </p>
            </div>
          </div>
        )}

        {tab === 'billing' && showPlans && (
          <div>
            <button onClick={() => setShowPlans(false)} className="flex items-center gap-1.5 text-[14px] font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white mb-6">
              <ChevronLeft className="w-4 h-4" /> View plans
            </button>

            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-2">Pricing plans</h3>
            <div className="text-[13px] text-slate-500 dark:text-gray-400 space-y-1 mb-6">
              <p>Your current plan is <span className="font-semibold text-slate-700 dark:text-gray-200">{isPro ? 'Pro' : 'Free'}</span>.</p>
              <p>Upgrade any time — your progress, notebooks and history carry over.</p>
              <p>Want to compare features in plans? <button onClick={() => navigate('/pricing')} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Check out our Pricing page</button></p>
            </div>

            <div className="space-y-3">
              <PlanRow current={!isPro} name="Free plan" note={!isPro ? '(current)' : undefined} desc="Everything you need to start preparing with AI — tutoring, quizzes and flashcards." priceBig="Free" priceSub="forever" />
              {isPro ? (
                <PlanRow current name="Pro" note="(current)" desc="Unlimited GraphRAG AI tutor, video & image studio, and adaptive weak-area mock tests." priceBig="₹499" priceSub="per month" />
              ) : (
                <PlanRow
                  selectable id="pro" name="Pro"
                  desc="Unlimited GraphRAG AI tutor, video & image studio, and adaptive weak-area mock tests."
                  priceBig="₹499" priceSub="per month"
                  selected={selectedPlan === 'pro'} onSelect={() => setSelectedPlan('pro')}
                />
              )}
              <PlanRow
                selectable id="institution" name="Institution"
                desc="Everything in Pro plus an admin dashboard, bulk seats and custom curriculum ingestion."
                priceBig="₹2,499" priceSub="per month"
                selected={selectedPlan === 'institution'} onSelect={() => setSelectedPlan('institution')}
              />

              {/* Enterprise dark card */}
              <div className="rounded-2xl bg-neutral-900 text-white p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[15px] font-bold">Enterprise</div>
                  <p className="text-[13px] text-neutral-300 mt-1 max-w-md leading-snug">Ideal for large institutions & networks. Volume discounts, custom onboarding, SSO and unlimited seats.</p>
                </div>
                <a href="mailto:support@sadhya.app" className="shrink-0 px-4 py-2 rounded-lg bg-white text-neutral-900 text-[11px] font-bold uppercase tracking-wide hover:opacity-90 transition-opacity">Talk to sales</a>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => { if (selectedPlan) showToast('ok', `${selectedPlan === 'pro' ? 'Pro' : 'Institution'} selected — billing isn't enabled yet. Contact support to upgrade.`); }}
                disabled={!selectedPlan}
                className="px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                Choose plan
              </button>
            </div>
          </div>
        )}

        {tab === 'notifications' && <NotificationsPanel />}

        {tab === 'apps' && (
          <Section title="Connected accounts" desc="Sign-in providers and integrations linked to your account.">
            <div className="space-y-3">
              {[
                { id: 'google.com', name: 'Google', icon: <GoogleGlyph /> },
                { id: 'github.com', name: 'GitHub', icon: <Github className="w-5 h-5 text-slate-800 dark:text-white" /> },
              ].map((acc) => {
                const connected = meta.providers.includes(acc.id);
                return (
                  <div key={acc.id} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center">{acc.icon}</div>
                      <div>
                        <div className="text-[14px] font-medium text-slate-900 dark:text-white">{acc.name}</div>
                        <div className="text-[12.5px] text-slate-500 dark:text-gray-400">{connected ? 'Used to sign in to your account' : 'Not connected'}</div>
                      </div>
                    </div>
                    {connected
                      ? <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"><Check className="w-3 h-3" /> Connected</span>
                      : <span className="text-[12.5px] text-slate-400">—</span>}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {tab === 'security' && (
          <div className="space-y-8">
            <Section title="Sign-in method" desc="How you access your Sadhya account.">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <KeyRound className="w-5 h-5 text-slate-500 dark:text-gray-400" />
                  <div>
                    <div className="text-[14px] font-medium text-slate-900 dark:text-white">{providerLabel(meta.primary)}</div>
                    <div className="text-[12.5px] text-slate-500 dark:text-gray-400">{user?.email}</div>
                  </div>
                </div>
                {meta.emailVerified
                  ? <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"><ShieldCheck className="w-3 h-3" /> Verified</span>
                  : <button onClick={resendVerification} disabled={busy === 'verify'} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
                      {busy === 'verify' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Verify email
                    </button>}
              </div>
            </Section>

            <Section title="Password" desc={meta.hasPassword ? 'Send a reset link to your email.' : `Your password is managed by ${providerLabel(meta.primary)}.`}>
              <button
                onClick={resetPassword}
                disabled={!meta.hasPassword || busy === 'password'}
                className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {busy === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Reset password
              </button>
            </Section>

            <Section title="Sessions" desc="Sign out of Sadhya on this device.">
              <button onClick={handleSignOut} className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </Section>

            <div className="rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50/40 dark:bg-red-500/[0.06] p-5">
              <h3 className="text-[15px] font-bold text-red-700 dark:text-red-400">Delete account</h3>
              <p className="text-[13px] text-red-600/80 dark:text-red-400/70 mt-1 mb-4">Permanently remove your account and all associated data. This cannot be undone.</p>
              <button onClick={handleDelete} disabled={busy === 'delete'} className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete my account
              </button>
            </div>
          </div>
        )}

        {tab === 'policies' && (
          <div className="space-y-8">
            <Section
              title="Your Accepted Platform Policies"
              desc="The terms, AI guidelines, and community policies governing your Sadhya account."
            >
              <div className="rounded-xl border border-slate-200 dark:border-white/10 p-5 bg-slate-50/50 dark:bg-white/[0.02] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#6ca855]/10 dark:bg-[#c8e558]/10 text-[#6ca855] dark:text-[#c8e558] flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[14px] font-bold text-slate-900 dark:text-white">
                        Version {consentStatus?.lastAcceptedVersion || CURRENT_POLICY_METADATA.version}
                      </div>
                      <div className="text-[12px] text-slate-500 dark:text-gray-400">
                        {consentStatus?.lastAcceptedAt
                          ? `Accepted on ${new Date(consentStatus.lastAcceptedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                          : `Status: Current Version (${CURRENT_POLICY_METADATA.version})`}
                      </div>
                    </div>
                  </div>

                  <Link
                    to="/policies"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-semibold hover:opacity-90 transition-opacity"
                  >
                    <span>Transparency Center</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="border-t border-slate-200/60 dark:border-white/5 pt-4">
                  <p className="text-[13px] text-slate-600 dark:text-gray-300 leading-relaxed">
                    Sadhya is built around transparency. You can review any individual policy clause or explore how our AI reasoning and adaptive tests function in detail.
                  </p>
                </div>
              </div>
            </Section>

            <Section
              title="Sadhya Platform Policy Directory"
              desc="Direct access to all 13 official platform guidelines."
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {SADHYA_POLICIES.map((p) => (
                  <Link
                    key={p.id}
                    to={`/policies?section=${p.id}`}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1f1f21] hover:border-slate-300 dark:hover:border-white/20 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[14px] font-semibold text-slate-900 dark:text-white group-hover:text-[#6ca855] dark:group-hover:text-[#c8e558] transition-colors">
                          {p.title}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-gray-400">
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-slate-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                        {p.summary}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[12px] text-slate-400 group-hover:text-slate-700 dark:group-hover:text-gray-200">
                      <span>Read clause</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1f1f1f] text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors';

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6">
      <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">{title}</h2>
      {desc && <p className="text-[13px] text-slate-500 dark:text-gray-400 mt-0.5 mb-5">{desc}</p>}
      {children}
    </section>
  );
}

function PlanRow({ current, selectable, name, note, desc, priceBig, priceSub, selected, onSelect }: {
  current?: boolean; selectable?: boolean; id?: string; name: string; note?: string; desc: string;
  priceBig: string; priceSub: string; selected?: boolean; onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!selectable}
      className={cn(
        'w-full text-left rounded-2xl border p-5 flex items-start justify-between gap-4 transition-colors bg-white dark:bg-[#1a1a1b]',
        current
          ? 'border-slate-300 dark:border-white/25'
          : selected
            ? 'border-indigo-400 dark:border-indigo-500/50 ring-1 ring-indigo-200 dark:ring-indigo-500/20'
            : 'border-slate-200 dark:border-white/10',
        selectable && 'hover:border-slate-300 dark:hover:border-white/20 cursor-pointer'
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-slate-900 dark:text-white">{name}</span>
          {note && <span className="text-[12px] text-slate-400">{note}</span>}
        </div>
        <p className="text-[13px] text-slate-500 dark:text-gray-400 mt-1 max-w-md leading-snug">{desc}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{priceBig}</div>
        <div className="text-[12px] text-slate-400">{priceSub}</div>
      </div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-slate-700 dark:text-gray-300 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
