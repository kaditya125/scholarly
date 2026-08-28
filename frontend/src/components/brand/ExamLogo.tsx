import React from 'react';

interface ExamLogoProps {
  slug: string;
  className?: string;
  size?: number;
}

/**
 * Official vector logos and seals for each competitive exam and board covered in EXAM_CATALOG.
 * Crafted with authentic colors, conducting body insignias, and sharp vector geometry.
 */
export function ExamLogo({ slug, className = 'w-4 h-4', size = 16 }: ExamLogoProps) {
  switch (slug) {
    // 1. NEET — National Eligibility cum Entrance Test (NTA / Medical Council)
    case 'neet':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="NEET Logo"
        >
          <rect width="32" height="32" rx="7" fill="#0D5C3A" />
          {/* Medical Caduceus Staff & Wings */}
          <path d="M16 4V28M16 4C14.5 4 13.5 5 13.5 6.5C13.5 8 14.5 9 16 9C17.5 9 18.5 8 18.5 6.5C18.5 5 17.5 4 16 4Z" stroke="#F6C343" strokeWidth="1.8" strokeLinecap="round" />
          {/* Left Wing */}
          <path d="M14 9C9 9 5 12 6 16C8 16 11 14 14 12" stroke="#F6C343" strokeWidth="1.5" strokeLinecap="round" />
          {/* Right Wing */}
          <path d="M18 9C23 9 27 12 26 16C24 16 21 14 18 12" stroke="#F6C343" strokeWidth="1.5" strokeLinecap="round" />
          {/* Entwined Serpents */}
          <path d="M11 15C11 18 21 17 21 21C21 24 16 25 16 27" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M21 15C21 18 11 17 11 21C11 24 16 25 16 27" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
          {/* Red Cross Accent */}
          <circle cx="16" cy="16" r="3.5" fill="#E53E3E" />
          <path d="M16 14V18M14 16H18" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    // 2. JEE Main — Joint Entrance Examination Main (NTA)
    case 'jee-main':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="JEE Main Logo"
        >
          <rect width="32" height="32" rx="7" fill="#0A2540" />
          {/* Atomic Orbits representing Engineering Science */}
          <ellipse cx="16" cy="16" rx="11" ry="4.5" transform="rotate(30 16 16)" stroke="#00D4B2" strokeWidth="1.4" />
          <ellipse cx="16" cy="16" rx="11" ry="4.5" transform="rotate(-30 16 16)" stroke="#FF8A00" strokeWidth="1.4" />
          <ellipse cx="16" cy="16" rx="11" ry="4.5" transform="rotate(90 16 16)" stroke="#635BFF" strokeWidth="1.4" />
          {/* Nucleus */}
          <circle cx="16" cy="16" r="3" fill="#FFFFFF" />
          <circle cx="16" cy="16" r="1.5" fill="#FF8A00" />
        </svg>
      );

    // 3. JEE Advanced — IIT Joint Entrance Examination
    case 'jee-advanced':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="JEE Advanced IIT Logo"
        >
          <rect width="32" height="32" rx="7" fill="#881337" />
          {/* IIT Cogwheel / Flame Emblem */}
          <circle cx="16" cy="16" r="9.5" stroke="#FDE047" strokeWidth="1.5" strokeDasharray="3.5 2" />
          <circle cx="16" cy="16" r="7" stroke="#FFFFFF" strokeWidth="1.2" />
          {/* Central Torch Flame */}
          <path d="M16 8C14 11 13 13 14 15C14.8 16.5 16 16 16 17C16 16 17.2 16.5 18 15C19 13 18 11 16 8Z" fill="#F59E0B" />
          <path d="M16 11C15 12.5 14.5 13.5 15 14.5C15.5 15.2 16 15 16 15.5C16 15 16.5 15.2 17 14.5C17.5 13.5 17 12.5 16 11Z" fill="#FEF08A" />
          {/* Base of Torch */}
          <path d="M13.5 18H18.5L17.5 23H14.5L13.5 18Z" fill="#E2E8F0" />
          <path d="M12.5 23H19.5V24.5H12.5V23Z" fill="#FDE047" />
        </svg>
      );

    // 4. UPSC CSE — Union Public Service Commission
    case 'upsc-cse':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="UPSC Logo"
        >
          <rect width="32" height="32" rx="7" fill="#1E1B4B" />
          {/* Circular Gold Seal */}
          <circle cx="16" cy="16" r="11" stroke="#D97706" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="9" stroke="#FDE68A" strokeWidth="0.8" />
          {/* Ashoka Lion Capital Motif */}
          <path d="M16 9C15.2 9 14.5 9.5 14.5 10.3C14.5 11 15 11.5 15.5 12C15 12.5 14 13.5 14 15H18C18 13.5 17 12.5 16.5 12C17 11.5 17.5 11 17.5 10.3C17.5 9.5 16.8 9 16 9Z" fill="#F59E0B" />
          <rect x="13.5" y="16" width="5" height="1.5" rx="0.5" fill="#F59E0B" />
          {/* Ashoka Chakra Base */}
          <circle cx="16" cy="20" r="2.5" stroke="#38BDF8" strokeWidth="0.8" />
          <circle cx="16" cy="20" r="0.8" fill="#38BDF8" />
          {/* Base Plinth */}
          <path d="M11 23.5H21V25H11V23.5Z" fill="#F59E0B" />
        </svg>
      );

    // 5. SSC CGL — Staff Selection Commission
    case 'ssc-cgl':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="SSC CGL Logo"
        >
          <rect width="32" height="32" rx="7" fill="#7C2D12" />
          {/* Circular Wreath / Star Crest */}
          <circle cx="16" cy="16" r="11.5" stroke="#FBBF24" strokeWidth="1.2" />
          <circle cx="16" cy="16" r="9.5" stroke="#FFFFFF" strokeWidth="0.8" strokeDasharray="1.5 1" />
          {/* National Ashoka Lion Shape */}
          <path d="M14 10C14 9 15 8 16 8C17 8 18 9 18 10C18 11 17.5 11.8 17 12.5V14.5H15V12.5C14.5 11.8 14 11 14 10Z" fill="#FEF08A" />
          <path d="M12 14.5H20V16H12V14.5Z" fill="#FEF08A" />
          {/* Three Stars */}
          <circle cx="13" cy="19" r="1" fill="#FBBF24" />
          <circle cx="16" cy="20" r="1.3" fill="#FBBF24" />
          <circle cx="19" cy="19" r="1" fill="#FBBF24" />
          {/* Pedestal */}
          <path d="M11 23H21L19.5 24.5H12.5L11 23Z" fill="#FEF08A" />
        </svg>
      );

    // 6. SSC CHSL — Staff Selection Commission (10+2)
    case 'ssc-chsl':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="SSC CHSL Logo"
        >
          <rect width="32" height="32" rx="7" fill="#991B1B" />
          <circle cx="16" cy="16" r="11" stroke="#FCD34D" strokeWidth="1.3" />
          {/* Shield & Quill */}
          <path d="M16 7L22 10V15.5C22 19.5 19.5 23 16 24.5C12.5 23 10 19.5 10 15.5V10L16 7Z" fill="#7F1D1D" stroke="#FCD34D" strokeWidth="1" />
          {/* Star and Book */}
          <path d="M16 11L17.2 13.5L20 13.8L18 15.7L18.5 18.5L16 17.2L13.5 18.5L14 15.7L12 13.8L14.8 13.5L16 11Z" fill="#FCD34D" />
          <path d="M12 20.5C14 19.8 18 19.8 20 20.5" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    // 7. BPSC — Bihar Public Service Commission
    case 'bpsc':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="BPSC Logo"
        >
          <rect width="32" height="32" rx="7" fill="#064E3B" />
          {/* Bihar State Seal — Bodhi Tree & Gateway */}
          <circle cx="16" cy="16" r="11" stroke="#F59E0B" strokeWidth="1.4" />
          {/* Bodhi Tree Canopy */}
          <path d="M16 7C13 7 11 9 11 11.5C11 13 12 14 13.5 14.5C12 15 11 16.5 11 18C11 20 13 21 16 21C19 21 21 20 21 18C21 16.5 20 15 18.5 14.5C20 14 21 13 21 11.5C21 9 19 7 16 7Z" fill="#10B981" stroke="#FDE68A" strokeWidth="0.8" />
          {/* Tree Trunk */}
          <rect x="15" y="18" width="2" height="5" fill="#D97706" />
          {/* Base Bar */}
          <rect x="10" y="23" width="12" height="1.8" rx="0.5" fill="#F59E0B" />
        </svg>
      );

    // 8. Bihar TRE — Bihar Teacher Recruitment Exam (BSEB / BPSC)
    case 'bihar-tre':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="Bihar TRE Logo"
        >
          <rect width="32" height="32" rx="7" fill="#047857" />
          {/* Open Book of Education with Rising Sun */}
          <path d="M16 11C18 9 22 9.5 24 10.5V20.5C22 19.5 18 19 16 21C14 19 10 19.5 8 20.5V10.5C10 9.5 14 9 16 11Z" fill="#F0FDF4" stroke="#FBBF24" strokeWidth="1.2" />
          <line x1="16" y1="11" x2="16" y2="21" stroke="#047857" strokeWidth="1.2" />
          {/* Sun of Knowledge */}
          <circle cx="16" cy="7.5" r="2.5" fill="#F59E0B" />
          <path d="M16 3.5V4.5M12.5 5L13.2 5.7M19.5 5L18.8 5.7M11 7.5H12M20 7.5H21" stroke="#F59E0B" strokeWidth="1" strokeLinecap="round" />
          {/* Teacher Pen / Quill */}
          <path d="M22 15L24 13L25.5 14.5L23.5 16.5L22 15Z" fill="#F59E0B" />
        </svg>
      );

    // 9. CTET & STET — Central & State Teacher Eligibility Tests (CBSE)
    case 'ctet-stet':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="CTET & STET Logo"
        >
          <rect width="32" height="32" rx="7" fill="#1E3A8A" />
          {/* Traditional Indian Diya / Lamp of Wisdom */}
          <path d="M16 7C14.5 9.5 14 11 15 12.5C15.5 13.2 16.5 13.2 17 12.5C18 11 17.5 9.5 16 7Z" fill="#F59E0B" />
          <path d="M16 9C15.3 10.5 15 11.2 15.5 12C15.8 12.4 16.2 12.4 16.5 12C17 11.2 16.7 10.5 16 9Z" fill="#FEF08A" />
          {/* Diya Base */}
          <path d="M10 14C10 17 13 18.5 16 18.5C19 18.5 22 17 22 14H10Z" fill="#D97706" />
          {/* Open Book Foundation */}
          <path d="M16 19C18 17.5 22 18 24 19V25C22 24 18 23.5 16 25C14 23.5 10 24 8 25V19C10 18 14 17.5 16 19Z" fill="#FFFFFF" stroke="#60A5FA" strokeWidth="1" />
        </svg>
      );

    // 10. CUET — Common University Entrance Test (NTA)
    case 'cuet':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="CUET Logo"
        >
          <rect width="32" height="32" rx="7" fill="#312E81" />
          {/* University Pillars & Graduation Cap */}
          <path d="M16 6L25 10.5L16 15L7 10.5L16 6Z" fill="#F59E0B" />
          <path d="M16 15V18.5C16 20.5 19 21.5 22 20.5V13.5" stroke="#FDE68A" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M25 10.5V16.5" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round" />
          {/* University Greek Pillars */}
          <path d="M9 20H23" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M11 20V25M15 20V25M17 20V25M21 20V25" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M8 26H24" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );

    // 11. IBPS PO — Institute of Banking Personnel Selection
    case 'ibps-po':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="IBPS PO Logo"
        >
          <rect width="32" height="32" rx="7" fill="#0C4A6E" />
          {/* IBPS Classic Shield */}
          <path d="M16 6L24 9V16C24 21 20 25 16 26.5C12 25 8 21 8 16V9L16 6Z" fill="#0369A1" stroke="#FCD34D" strokeWidth="1.4" />
          {/* Flame of Knowledge */}
          <path d="M16 10C14.5 12 14 13.5 15 15C15.5 15.8 16.5 15.8 17 15C18 13.5 17.5 12 16 10Z" fill="#F59E0B" />
          {/* Open Book */}
          <path d="M16 17C17.5 16 20 16.5 21.5 17V21C20 20.5 17.5 20 16 21C14.5 20 12 20.5 10.5 21V17C12 16.5 14.5 16 16 17Z" fill="#FFFFFF" />
          <line x1="16" y1="17" x2="16" y2="21" stroke="#0369A1" strokeWidth="0.8" />
        </svg>
      );

    // 12. SBI PO — State Bank of India
    case 'sbi-po':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="SBI Logo"
        >
          {/* Official SBI Blue Circle */}
          <rect width="32" height="32" rx="7" fill="#FFFFFF" />
          <circle cx="16" cy="16" r="12" fill="#0076BE" />
          {/* Official Keyhole Cutout */}
          <circle cx="16" cy="14" r="3.2" fill="#FFFFFF" />
          <path d="M14.5 14H17.5V23.5H14.5V14Z" fill="#FFFFFF" />
        </svg>
      );

    // 13. RBI Grade B — Reserve Bank of India
    case 'rbi-grade-b':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="RBI Logo"
        >
          <rect width="32" height="32" rx="7" fill="#0F172A" />
          {/* Official Double Ring Seal */}
          <circle cx="16" cy="16" r="12" stroke="#EAB308" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="10" stroke="#CA8A04" strokeWidth="0.8" fill="#1E293B" />
          {/* Palm Tree */}
          <path d="M16 12V22" stroke="#FDE047" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16 12C14 10 11 11 11 11M16 12C18 10 21 11 21 11M16 14C13 13 11 14.5 11 14.5M16 14C19 13 21 14.5 21 14.5M16 16C13.5 16 12 18 12 18M16 16C18.5 16 20 18 20 18" stroke="#FDE047" strokeWidth="1.2" strokeLinecap="round" />
          {/* Bengal Tiger Silhouette under the Palm Tree */}
          <path d="M9 22C10 21 12 21 14 21.5C14.5 21 15 21 15.5 21.5H18C19 21.5 20 22 21 22.5" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );

    // 14. RRB NTPC — Indian Railways Recruitment Board
    case 'rrb-ntpc':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="Indian Railways RRB Logo"
        >
          <rect width="32" height="32" rx="7" fill="#991B1B" />
          {/* Railway Cog Wheel & Track Circle */}
          <circle cx="16" cy="16" r="11" stroke="#FBBF24" strokeWidth="1.5" strokeDasharray="3 1.5" />
          <circle cx="16" cy="16" r="8.5" fill="#B91C1C" stroke="#FFFFFF" strokeWidth="0.8" />
          {/* Steam Engine Train Silhouette */}
          <path d="M12 18H20V20.5H12V18Z" fill="#FDE047" />
          <path d="M13 14H19L19.5 18H12.5L13 14Z" fill="#FFFFFF" />
          <rect x="14.5" y="11" width="3" height="3" rx="0.5" fill="#FDE047" />
          <circle cx="14" cy="21.5" r="1.5" fill="#FFFFFF" />
          <circle cx="18" cy="21.5" r="1.5" fill="#FFFFFF" />
        </svg>
      );

    // 15. UGC NET — University Grants Commission
    case 'ugc-net':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="UGC NET Logo"
        >
          <rect width="32" height="32" rx="7" fill="#1E40AF" />
          {/* UGC Global Academic Emblem */}
          <circle cx="16" cy="16" r="11" stroke="#60A5FA" strokeWidth="1.2" />
          {/* Globe Lines */}
          <ellipse cx="16" cy="16" rx="10.5" ry="4.5" stroke="#93C5FD" strokeWidth="0.8" />
          <ellipse cx="16" cy="16" rx="4.5" ry="10.5" stroke="#93C5FD" strokeWidth="0.8" />
          {/* Central Sun of Knowledge */}
          <circle cx="16" cy="16" r="4.5" fill="#F59E0B" stroke="#FEF08A" strokeWidth="1" />
          <path d="M16 9.5V11M16 21V22.5M9.5 16H11M21 16H22.5" stroke="#FDE68A" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    // 16. State PSCs — State Public Service Commissions
    case 'state-pscs':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="State PSCs Logo"
        >
          <rect width="32" height="32" rx="7" fill="#334155" />
          {/* Scales of Justice & Ashoka Emblem */}
          <circle cx="16" cy="16" r="11" stroke="#94A3B8" strokeWidth="1.2" />
          {/* Pillar / Scales */}
          <line x1="16" y1="8" x2="16" y2="23" stroke="#F1F5F9" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="12" x2="22" y2="12" stroke="#F1F5F9" strokeWidth="1.5" strokeLinecap="round" />
          {/* Left Pan */}
          <path d="M10 12L8.5 16H11.5L10 12Z" fill="#CBD5E1" stroke="#F1F5F9" strokeWidth="0.8" />
          {/* Right Pan */}
          <path d="M22 12L20.5 16H23.5L22 12Z" fill="#CBD5E1" stroke="#F1F5F9" strokeWidth="0.8" />
          {/* Base */}
          <rect x="12" y="23" width="8" height="2" rx="0.5" fill="#E2E8F0" />
        </svg>
      );

    // 17. CBSE & ICSE — Board Curricula Class 6-12
    case 'cbse-icse':
    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="CBSE & ICSE Logo"
        >
          <rect width="32" height="32" rx="7" fill="#1E3A8A" />
          {/* CBSE Circular Emblem */}
          <circle cx="16" cy="16" r="11" stroke="#FBBF24" strokeWidth="1.4" />
          {/* Open Book */}
          <path d="M16 13C18 11.5 21 12 23 13V21C21 20 18 19.5 16 21C14 19.5 11 20 9 21V13C11 12 14 11.5 16 13Z" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="0.8" />
          <line x1="16" y1="13" x2="16" y2="21" stroke="#1E3A8A" strokeWidth="1" />
          {/* Flame of Education */}
          <path d="M16 7C14.8 8.8 14.5 10 15.2 11C15.6 11.6 16.4 11.6 16.8 11C17.5 10 17.2 8.8 16 7Z" fill="#F59E0B" />
        </svg>
      );
  }
}
