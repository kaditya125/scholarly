import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  KeyRound,
  Settings,
  LogOut,
  Camera,
  Check,
  Loader2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Sun,
  Moon,
  Monitor,
  BookOpen,
  Target,
  GraduationCap,
  Clock,
  Phone,
  MapPin,
  Globe,
  Pencil,
  ArrowRight,
  ExternalLink,
  Share2,
} from 'lucide-react';
import { updateProfile, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { useProfile } from '../hooks/api/useProfile';
import { useTheme } from '../lib/ThemeContext';
import { uploadAvatar, UploadProgress } from '../lib/api/avatar';
import { ShareProfileModal } from '../components/profile/ShareProfileModal';
import { cn } from '../lib/utils';
import {
  GOAL_GROUPS,
  BOARDS,
  STREAMS,
  SUBJECTS,
  LEVELS,
  STUDY_TIMES,
  LANGUAGES,
  PreparationLevel,
} from '../lib/onboardingOptions';

type ProfileTab = 'profile' | 'account' | 'academic';

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const { profile, updateProfile: updateAcademicProfile, isUpdating: isUpdatingAcademic } = useProfile();
  const { themePreference, setThemePreference } = useTheme();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Avatar Upload State ──────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadProgress | null>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('err', 'Please select an image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('err', 'File size must be less than 5MB.');
      return;
    }

    try {
      await uploadAvatar(file, (progress) => {
        setUploadState(progress);
      });
      setTimeout(() => {
        refreshUser();
        setUploadState(null);
        showToast('ok', 'Profile photo updated successfully!');
      }, 1200);
    } catch (error: any) {
      setUploadState(null);
      showToast('err', error?.message || 'Avatar upload failed.');
    }
    e.target.value = '';
  };

  // ── Public Profile Form State ─────────────────────────────────────
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(() => localStorage.getItem('profile-bio') || 'Aspiring Scholar passionate about mastering core concepts, solving complex mock problems, and excelling in competitive exams.');
  const [phone, setPhone] = useState(() => localStorage.getItem('profile-phone') || '');
  const [location, setLocation] = useState(() => localStorage.getItem('profile-location') || 'India');
  const [targetExam, setTargetExam] = useState(profile?.goal || profile?.targetExam || 'NEET');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user?.displayName) setFullName(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    if (profile?.goal || profile?.targetExam) {
      setTargetExam(profile.goal || profile.targetExam || 'NEET');
    }
  }, [profile]);

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth.currentUser) return;
    setIsSavingProfile(true);

    try {
      // 1. Update Firebase Auth Display Name
      if (fullName.trim() !== (user?.displayName || '')) {
        await updateProfile(auth.currentUser, { displayName: fullName.trim() });
        refreshUser();
      }

      // 2. Persist local fields
      localStorage.setItem('profile-bio', bio.trim());
      localStorage.setItem('profile-phone', phone.trim());
      localStorage.setItem('profile-location', location.trim());

      // 3. Sync target exam with backend learning profile if changed
      if (targetExam && targetExam !== profile?.goal) {
        await updateAcademicProfile({ goal: targetExam, targetExam });
      }

      showToast('ok', 'Profile changes saved successfully!');
    } catch (err: any) {
      showToast('err', err?.message || 'Could not save profile changes.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ── Account & Security Actions ──────────────────────────────────
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [verifyEmailSent, setVerifyEmailSent] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetEmailSent(true);
      showToast('ok', `Password reset email sent to ${user.email}`);
    } catch (err: any) {
      showToast('err', err?.message || 'Failed to send password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleSendEmailVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyEmailSent(true);
      showToast('ok', 'Verification email sent! Please check your inbox.');
    } catch (err: any) {
      showToast('err', err?.message || 'Could not send verification email.');
    }
  };

  // ── Academic Profile Form State ─────────────────────────────────
  const [academicForm, setAcademicForm] = useState({
    goal: profile?.goal || 'NEET',
    board: profile?.board || 'CBSE',
    classLevel: profile?.classLevel || 'Class 12',
    stream: profile?.stream || 'Science',
    preparationLevel: (profile?.preparationLevel || 'intermediate') as PreparationLevel,
    dailyStudyHours: profile?.dailyStudyHours || 2,
    preferredLanguage: profile?.preferredLanguage || 'English',
  });

  useEffect(() => {
    if (profile) {
      setAcademicForm({
        goal: profile.goal || 'NEET',
        board: profile.board || 'CBSE',
        classLevel: profile.classLevel || 'Class 12',
        stream: profile.stream || 'Science',
        preparationLevel: (profile.preparationLevel || 'intermediate') as PreparationLevel,
        dailyStudyHours: profile.dailyStudyHours || 2,
        preferredLanguage: profile.preferredLanguage || 'English',
      });
    }
  }, [profile]);

  const handleSaveAcademicProfile = async () => {
    try {
      await updateAcademicProfile({
        ...academicForm,
        targetExam: academicForm.goal,
        markComplete: true,
      });
      showToast('ok', 'Academic learning profile updated!');
    } catch (err: any) {
      showToast('err', err?.message || 'Failed to update academic profile.');
    }
  };

  // ── Log Out Confirmation ────────────────────────────────────────
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err: any) {
      showToast('err', 'Failed to log out.');
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar font-sans bg-slate-50 dark:bg-[#131315] text-slate-900 dark:text-slate-100 transition-colors duration-300">
      
      {/* Toast Notification Banner */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              'fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-[13px] font-semibold backdrop-blur-md',
              toast.type === 'ok'
                ? 'bg-emerald-500/90 text-white border-emerald-400/30'
                : 'bg-red-500/90 text-white border-red-400/30'
            )}
          >
            {toast.type === 'ok' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        
        {/* ── Two Column Profile Container ────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">
          
          {/* ═════════════════════════════════════════════════════════
              LEFT COLUMN: Avatar Card & Tab Navigation Rail
             ═════════════════════════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full md:w-72 lg:w-80 shrink-0 bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-6 shadow-2xs flex flex-col items-center text-center"
          >
            {/* Avatar Frame with Camera Edit Badge */}
            <div className="relative mb-4">
              <div
                onClick={handleAvatarClick}
                className="group relative w-32 h-32 rounded-full overflow-hidden bg-slate-100 dark:bg-[#232328] border-4 border-slate-100 dark:border-[#282830] shadow-md flex items-center justify-center cursor-pointer text-4xl font-bold text-[#8ba32b] dark:text-[#c8e558]"
              >
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Profile'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'S'
                )}

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[11px] font-semibold">Change</span>
                </div>

                {/* Upload Progress Spinner Overlay */}
                {uploadState && uploadState.status !== 'done' && (
                  <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white z-10">
                    {uploadState.status === 'processing' && (
                      <>
                        <Loader2 className="w-7 h-7 animate-spin text-[#c8e558] mb-1" />
                        <span className="text-[11px] font-medium">Processing...</span>
                      </>
                    )}
                    {uploadState.status === 'uploading' && (
                      <>
                        <div className="w-10 h-10 rounded-full border-3 border-white/20 border-t-[#c8e558] animate-spin mb-1" />
                        <span className="text-[12px] font-bold">{Math.round(uploadState.progress)}%</span>
                      </>
                    )}
                    {uploadState.status === 'error' && (
                      <>
                        <AlertCircle className="w-6 h-6 text-red-400 mb-1" />
                        <span className="text-[10px] text-center px-1">Failed</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Edit Pencil Icon Badge */}
              <button
                onClick={handleAvatarClick}
                type="button"
                className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 flex items-center justify-center shadow-md border-2 border-white dark:border-[#1a1a1e] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title="Upload new avatar"
                aria-label="Upload new avatar"
              >
                <Pencil className="w-4 h-4" />
              </button>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
              />
            </div>

            {/* User Identity Info */}
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">
              {user?.displayName || 'Scholar Student'}
            </h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-full">
              {user?.email}
            </p>

            {/* Academic Target Tag */}
            <div className="mt-2.5 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] border border-[#8ba32b]/30 dark:border-[#c8e558]/30">
              <Target className="w-3 h-3" />
              <span>{targetExam || 'Competitive Exams'}</span>
            </div>

            {/* ── Navigation Tab Buttons ────────────────────────────── */}
            <div className="w-full mt-6 space-y-2 pt-6 border-t border-slate-100 dark:border-white/[0.06]">
              <button
                onClick={() => setActiveTab('profile')}
                type="button"
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-bold transition-all cursor-pointer shadow-2xs',
                  activeTab === 'profile'
                    ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-[#222227] dark:hover:bg-[#2a2a30] text-slate-700 dark:text-slate-300'
                )}
              >
                <User className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Edit profile</span>
              </button>

              <button
                onClick={() => setActiveTab('account')}
                type="button"
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-bold transition-all cursor-pointer shadow-2xs',
                  activeTab === 'account'
                    ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-[#222227] dark:hover:bg-[#2a2a30] text-slate-700 dark:text-slate-300'
                )}
              >
                <KeyRound className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Account settings</span>
              </button>

              <button
                onClick={() => setActiveTab('academic')}
                type="button"
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-bold transition-all cursor-pointer border shadow-2xs',
                  activeTab === 'academic'
                    ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent shadow-xs'
                    : 'bg-white dark:bg-transparent border-slate-200/90 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                )}
              >
                <GraduationCap className="w-4 h-4 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" />
                <span className="flex-1 text-left">Advance settings</span>
              </button>

              <button
                onClick={() => setIsShareModalOpen(true)}
                type="button"
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-bold text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/[0.08] transition-all cursor-pointer shadow-2xs"
              >
                <Share2 className="w-4 h-4 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" />
                <span className="flex-1 text-left">Share profile</span>
              </button>

              <button
                onClick={() => setIsLogoutModalOpen(true)}
                type="button"
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-bold text-red-600 dark:text-red-400 bg-red-50/70 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 border border-red-200/70 dark:border-red-900/30 transition-all cursor-pointer shadow-2xs"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Keluar (Log out)</span>
              </button>
            </div>
          </motion.div>

          {/* ═════════════════════════════════════════════════════════
              RIGHT COLUMN: Main Settings & Profile Panel Card
             ═════════════════════════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32 }}
            className="flex-1 min-w-0 bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-6 sm:p-8 shadow-2xs"
          >
            {/* ── TAB 1: Public Profile (Edit Profile) ─────────────── */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-6">
                
                {/* Header Title */}
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Public Profile
                  </h1>
                  <div className="h-px w-full bg-slate-100 dark:bg-white/[0.08] mt-3" />
                </div>

                {/* 1. Full Name (Nama) */}
                <div className="space-y-1.5">
                  <label className="block text-[13.5px] font-bold text-slate-900 dark:text-slate-200">
                    Nama (Full Name)
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Rizky / Aditya Kumar"
                    required
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] shadow-2xs transition-all"
                  />
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Use your real name based on your ID card will help you when doing payment or verified mock test certificates.
                  </p>
                </div>

                {/* 2. Bio / About Me */}
                <div className="space-y-1.5">
                  <label className="block text-[13.5px] font-bold text-slate-900 dark:text-slate-200">
                    Bio
                  </label>
                  <textarea
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell your peers and study partners about your academic goals and background..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] shadow-2xs transition-all resize-none leading-relaxed"
                  />
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                    Tell your peers and study partners who visit your profile about your learning focus.
                  </p>
                </div>

                {/* 3. Grid for Phone & Target Exam */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="block text-[13.5px] font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] shadow-2xs transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[13.5px] font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                      Primary Target Goal
                    </label>
                    <select
                      value={targetExam}
                      onChange={(e) => setTargetExam(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] shadow-2xs transition-all"
                    >
                      {GOAL_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 4. Action Buttons */}
                <div className="pt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-6 py-2.5 rounded-full text-[13px] font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-[#c8e558] dark:text-slate-950 dark:hover:bg-[#bcd94c] shadow-xs active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Save Changes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFullName(user?.displayName || '');
                      setBio(localStorage.getItem('profile-bio') || '');
                      setPhone(localStorage.getItem('profile-phone') || '');
                      showToast('ok', 'Form reset to saved values.');
                    }}
                    className="px-5 py-2.5 rounded-full text-[13px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200/90 dark:border-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* ── TAB 2: Account Settings ─────────────────────────── */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                
                {/* Header Title */}
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Account Settings &amp; Security
                  </h1>
                  <div className="h-px w-full bg-slate-100 dark:bg-white/[0.08] mt-3" />
                </div>

                {/* 1. Email Address & Verification */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#202025] border border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Primary Email
                    </div>
                    <div className="text-[14.5px] font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span>{user?.email}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px]">
                      {user?.emailVerified ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Email Verified
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" /> Verification Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {!user?.emailVerified && (
                    <button
                      onClick={handleSendEmailVerification}
                      disabled={verifyEmailSent}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {verifyEmailSent ? 'Verification Link Sent ✓' : 'Send Verification Link'}
                    </button>
                  )}
                </div>

                {/* 2. Password Reset */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#202025] border border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-[13.5px] font-bold text-slate-900 dark:text-white">
                      Password &amp; Authentication
                    </div>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Receive a secure link to update or reset your account password.
                    </p>
                  </div>

                  <button
                    onClick={handleSendPasswordReset}
                    disabled={isSendingReset || resetEmailSent}
                    className="px-4 py-2 rounded-xl text-[12px] font-bold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 hover:opacity-90 transition-all shadow-2xs shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSendingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{resetEmailSent ? 'Reset Link Sent ✓' : 'Reset Password'}</span>
                  </button>
                </div>

                {/* 3. Theme & Appearance Switcher */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#202025] border border-slate-200/80 dark:border-white/10 space-y-3">
                  <div>
                    <div className="text-[13.5px] font-bold text-slate-900 dark:text-white">
                      Appearance &amp; Theme
                    </div>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Customize Sadhya interface for day or nighttime study sessions.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 max-w-md">
                    <button
                      type="button"
                      onClick={() => setThemePreference('light')}
                      className={cn(
                        'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-[12.5px] font-bold transition-all cursor-pointer shadow-2xs',
                        themePreference === 'light'
                          ? 'bg-white text-slate-900 border-slate-400 ring-2 ring-slate-900/10'
                          : 'bg-white/60 dark:bg-white/5 border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-white'
                      )}
                    >
                      <Sun className="w-4 h-4 text-amber-500" />
                      <span>Light</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setThemePreference('dark')}
                      className={cn(
                        'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-[12.5px] font-bold transition-all cursor-pointer shadow-2xs',
                        themePreference === 'dark'
                          ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent'
                          : 'bg-white/60 dark:bg-white/5 border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                      )}
                    >
                      <Moon className="w-4 h-4" />
                      <span>Dark</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setThemePreference('system')}
                      className={cn(
                        'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-[12.5px] font-bold transition-all cursor-pointer shadow-2xs',
                        themePreference === 'system'
                          ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent'
                          : 'bg-white/60 dark:bg-white/5 border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                      )}
                    >
                      <Monitor className="w-4 h-4" />
                      <span>System</span>
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* ── TAB 3: Advance Settings (Academic Profile) ──────── */}
            {activeTab === 'academic' && (
              <div className="space-y-6">
                
                {/* Header Title */}
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Academic &amp; AI Tutor Profile
                  </h1>
                  <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                    This profile personalizes your AI tutor, diagnostic mock papers, and learning roadmap.
                  </p>
                  <div className="h-px w-full bg-slate-100 dark:bg-white/[0.08] mt-3" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Goal */}
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-bold text-slate-900 dark:text-slate-200">
                      Primary Target Goal
                    </label>
                    <select
                      value={academicForm.goal}
                      onChange={(e) => setAcademicForm({ ...academicForm, goal: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13px] text-slate-900 dark:text-white"
                    >
                      {GOAL_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Board */}
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-bold text-slate-900 dark:text-slate-200">
                      Educational Board
                    </label>
                    <select
                      value={academicForm.board}
                      onChange={(e) => setAcademicForm({ ...academicForm, board: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13px] text-slate-900 dark:text-white"
                    >
                      {BOARDS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Preparation Level */}
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-bold text-slate-900 dark:text-slate-200">
                      Preparation Level
                    </label>
                    <select
                      value={academicForm.preparationLevel}
                      onChange={(e) =>
                        setAcademicForm({ ...academicForm, preparationLevel: e.target.value as PreparationLevel })
                      }
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13px] text-slate-900 dark:text-white"
                    >
                      {LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label} ({l.hint})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Daily Study Commitment */}
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" /> Daily Target Hours
                    </label>
                    <select
                      value={academicForm.dailyStudyHours}
                      onChange={(e) =>
                        setAcademicForm({ ...academicForm, dailyStudyHours: parseFloat(e.target.value) })
                      }
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202025] border border-slate-200/90 dark:border-white/10 text-[13px] text-slate-900 dark:text-white"
                    >
                      {STUDY_TIMES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label} / day
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Save Academic Profile Button */}
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleSaveAcademicProfile}
                    disabled={isUpdatingAcademic}
                    className="px-6 py-2.5 rounded-full text-[13px] font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-[#c8e558] dark:text-slate-950 dark:hover:bg-[#bcd94c] shadow-xs active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingAcademic && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Save Academic Settings</span>
                  </button>
                </div>

              </div>
            )}

          </motion.div>

        </div>
      </div>

      {/* ── Log Out Confirmation Modal ───────────────────────────── */}
      <AnimatePresence>
        {isLogoutModalOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
              onClick={() => setIsLogoutModalOpen(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/10 p-6 shadow-2xl space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20">
                  <LogOut className="w-6 h-6" />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Sign out of Sadhya?
                  </h3>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                    You will need to sign back in with your credentials to access your notes and tests.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    onClick={handleLogout}
                    className="flex-1 py-2.5 rounded-full text-[13px] font-bold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer"
                  >
                    Yes, Sign Out
                  </button>
                  <button
                    onClick={() => setIsLogoutModalOpen(false)}
                    className="flex-1 py-2.5 rounded-full text-[13px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Share Profile Modal ──────────────────────────────────── */}
      <ShareProfileModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

    </div>
  );
}
