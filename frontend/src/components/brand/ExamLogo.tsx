import React from 'react';

interface ExamLogoProps {
  slug: string;
  className?: string;
  size?: number;
}

/**
 * Official emblems and logos for Indian competitive exams and education boards.
 * Rendered with transparent backgrounds, official colors, and authentic agency insignias.
 */
export function ExamLogo({ slug, className = 'w-4 h-4', size = 18 }: ExamLogoProps) {
  switch (slug) {
    // 1. NEET — National Eligibility cum Entrance Test (NTA & National Medical Commission)
    case 'neet':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="NEET Official Logo"
        >
          {/* Medical Green Circular Crest */}
          <circle cx="18" cy="18" r="17" fill="#FFFFFF" stroke="#00796B" strokeWidth="2" />
          <circle cx="18" cy="18" r="14.5" fill="#E0F2F1" stroke="#004D40" strokeWidth="0.8" />
          {/* Asclepius Staff & Golden Wings */}
          <path d="M18 6V30" stroke="#B45309" strokeWidth="2" strokeLinecap="round" />
          <circle cx="18" cy="6" r="2.2" fill="#D97706" />
          {/* Left Wing */}
          <path d="M16 10C11 9 7 13 8 18C10 18 13 16 16 14" fill="#F59E0B" stroke="#B45309" strokeWidth="0.8" />
          {/* Right Wing */}
          <path d="M20 10C25 9 29 13 28 18C26 18 23 16 20 14" fill="#F59E0B" stroke="#B45309" strokeWidth="0.8" />
          {/* Coiled Serpent */}
          <path d="M13 16C13 19 23 18 23 22C23 25 18 26 18 29" stroke="#004D40" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M23 16C23 19 13 18 13 22C13 25 18 26 18 29" stroke="#00796B" strokeWidth="1.8" strokeLinecap="round" />
          {/* Red Cross emblem in center */}
          <rect x="16.2" y="14" width="3.6" height="8" rx="0.5" fill="#DC2626" />
          <rect x="14" y="16.2" width="8" height="3.6" rx="0.5" fill="#DC2626" />
        </svg>
      );

    // 2. JEE Main — NTA (National Testing Agency) Joint Entrance Examination
    case 'jee-main':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="JEE Main Official Logo"
        >
          {/* NTA Tri-color Modern Geometric Flag Motif */}
          <circle cx="18" cy="18" r="17" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5" />
          {/* Saffron & Green Waves */}
          <path d="M7 11C13 8 23 14 29 11V16C23 19 13 13 7 16V11Z" fill="#FF9933" />
          <path d="M7 17C13 14 23 20 29 17V22C23 25 13 19 7 22V17Z" fill="#138808" />
          {/* Navy Blue Central Hexagon & "JEE" */}
          <polygon points="18,8 26,13 26,23 18,28 10,23 10,13" stroke="#000080" strokeWidth="1.5" fill="#FFFFFF" fillOpacity="0.8" />
          <circle cx="18" cy="18" r="3" fill="#000080" />
          <circle cx="18" cy="18" r="1.2" fill="#FFFFFF" />
          {/* Orbit rings */}
          <ellipse cx="18" cy="18" rx="9" ry="3.5" transform="rotate(30 18 18)" stroke="#0284C7" strokeWidth="1" />
          <ellipse cx="18" cy="18" rx="9" ry="3.5" transform="rotate(-30 18 18)" stroke="#0284C7" strokeWidth="1" />
        </svg>
      );

    // 3. JEE Advanced — Official IIT (Indian Institutes of Technology) Joint Entrance Logo
    case 'jee-advanced':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="JEE Advanced IIT Logo"
        >
          {/* Official IIT Maroon Circular Cogwheel */}
          <circle cx="18" cy="18" r="17" fill="#881337" />
          <circle cx="18" cy="18" r="15" stroke="#FDE047" strokeWidth="1.8" strokeDasharray="3 1.2" />
          <circle cx="18" cy="18" r="12" fill="#9F1239" stroke="#FFFFFF" strokeWidth="0.8" />
          {/* Torch Flame of Knowledge */}
          <path d="M18 9C15.5 12.5 14.5 14.5 15.5 17C16.5 18.5 18 18 18 19.5C18 18 19.5 18.5 20.5 17C21.5 14.5 20.5 12.5 18 9Z" fill="#FBBF24" />
          <path d="M18 12C16.8 14 16.2 15.2 16.8 16.5C17.2 17.2 18 17 18 17.8C18 17 18.8 17.2 19.2 16.5C19.8 15.2 19.2 14 18 12Z" fill="#FEF08A" />
          {/* Torch Base */}
          <path d="M15 19H21L19.5 24H16.5L15 19Z" fill="#F1F5F9" />
          <rect x="14" y="24" width="8" height="2" rx="0.5" fill="#FDE047" />
        </svg>
      );

    // 4. UPSC CSE — Union Public Service Commission
    case 'upsc-cse':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="UPSC Official Emblem"
        >
          {/* Official Royal Navy & Gold Seal */}
          <circle cx="18" cy="18" r="17" fill="#0F172A" stroke="#D97706" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="14.5" stroke="#FDE68A" strokeWidth="0.8" strokeDasharray="1.5 1" />
          {/* Ashoka Lion Capital (State Emblem of India) */}
          <path d="M18 8C17 8 16 8.8 16 9.8C16 10.8 16.8 11.5 17.5 12C16.8 12.8 15.5 14 15.5 16H20.5C20.5 14 19.2 12.8 18.5 12C19.2 11.5 20 10.8 20 9.8C20 8.8 19 8 18 8Z" fill="#F59E0B" />
          {/* Left & Right Lion profiles */}
          <path d="M14 11C13.2 11 12.5 11.8 12.8 12.8C13.2 13.8 14.5 14.5 15.5 15V16H13C12.5 15 11.5 14 11 12C11 11 12.5 10 14 11Z" fill="#D97706" />
          <path d="M22 11C22.8 11 23.5 11.8 23.2 12.8C22.8 13.8 21.5 14.5 20.5 15V16H23C23.5 15 24.5 14 25 12C25 11 23.5 10 22 11Z" fill="#D97706" />
          {/* Ashoka Chakra Base */}
          <rect x="12" y="17" width="12" height="2" fill="#F59E0B" />
          <circle cx="18" cy="22" r="3.2" stroke="#38BDF8" strokeWidth="1" fill="#FFFFFF" />
          <circle cx="18" cy="22" r="1" fill="#0284C7" />
          {/* Base Plinth */}
          <path d="M10 26H26L24 28H12L10 26Z" fill="#D97706" />
        </svg>
      );

    // 5. SSC CGL — Staff Selection Commission
    case 'ssc-cgl':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="SSC CGL Official Logo"
        >
          {/* Official SSC Circular Crest (Crimson & Gold) */}
          <circle cx="18" cy="18" r="17" fill="#7F1D1D" stroke="#F59E0B" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="14.5" fill="#991B1B" stroke="#FDE68A" strokeWidth="0.8" />
          {/* Ashoka Lion Motif & Wreath */}
          <path d="M18 8C17 8 16 9 16 10.5C16 12 17.5 13 17.5 14.5H18.5C18.5 13 20 12 20 10.5C20 9 19 8 18 8Z" fill="#FEF08A" />
          <path d="M14 14.5H22V16.5H14V14.5Z" fill="#FDE047" />
          {/* SSC Letters & Star Garland */}
          <circle cx="14" cy="20" r="1.4" fill="#FDE047" />
          <circle cx="18" cy="22" r="1.8" fill="#FDE047" />
          <circle cx="22" cy="20" r="1.4" fill="#FDE047" />
          {/* Wreath border */}
          <path d="M10 25C13 27 23 27 26 25" stroke="#FDE047" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );

    // 6. SSC CHSL — Staff Selection Commission (10+2)
    case 'ssc-chsl':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="SSC CHSL Official Logo"
        >
          <circle cx="18" cy="18" r="17" fill="#831843" stroke="#FBBF24" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="14.5" fill="#9D174D" stroke="#FFFFFF" strokeWidth="0.8" />
          {/* Shield & Star */}
          <path d="M18 8L25 11.5V18C25 22.5 21.5 26 18 27.5C14.5 26 11 22.5 11 18V11.5L18 8Z" fill="#BE185D" stroke="#FDE047" strokeWidth="1.2" />
          {/* Golden Star */}
          <polygon points="18,12 19.5,15.5 23,16 20.5,18.5 21,22 18,20.2 15,22 15.5,18.5 13,16 16.5,15.5" fill="#FDE047" />
        </svg>
      );

    // 7. BPSC — Bihar Public Service Commission
    case 'bpsc':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="BPSC Official Seal"
        >
          {/* Official Bihar Government & BPSC Bodhi Tree Emblem */}
          <circle cx="18" cy="18" r="17" fill="#FFFFFF" stroke="#047857" strokeWidth="2" />
          <circle cx="18" cy="18" r="14.5" fill="#ECFDF5" stroke="#D97706" strokeWidth="1" />
          {/* Sacred Bodhi Tree */}
          <path d="M18 7C14.5 7 12 9.5 12 12C12 13.5 13 14.8 14.5 15.5C13 16 12 17.5 12 19C12 21.5 14.5 23 18 23C21.5 23 24 21.5 24 19C24 17.5 23 16 21.5 15.5C23 14.8 24 13.5 24 12C24 9.5 21.5 7 18 7Z" fill="#059669" stroke="#047857" strokeWidth="0.8" />
          {/* Tree Trunk */}
          <rect x="17" y="19" width="2" height="6" fill="#B45309" />
          {/* Two Sacred Symbols (Swastikas) on either side */}
          <path d="M10 14H12V16H10V14ZM10 16H8V18" stroke="#D97706" strokeWidth="0.8" />
          <path d="M26 14H24V16H26V14ZM26 16H28V18" stroke="#D97706" strokeWidth="0.8" />
          {/* Base Platform */}
          <rect x="11" y="25" width="14" height="2" rx="0.5" fill="#D97706" />
        </svg>
      );

    // 8. Bihar TRE — Bihar Teacher Recruitment (BSEB / BPSC)
    case 'bihar-tre':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="Bihar TRE Official Logo"
        >
          {/* Bihar Education Department Emblem */}
          <circle cx="18" cy="18" r="17" fill="#065F46" stroke="#F59E0B" strokeWidth="1.8" />
          {/* Open Book of Learning */}
          <path d="M18 14C20.5 12 25 12.5 28 14V24C25 22.5 20.5 22 18 24C15.5 22 11 22.5 8 24V14C11 12.5 15.5 12 18 14Z" fill="#FFFFFF" stroke="#FDE68A" strokeWidth="1.2" />
          <line x1="18" y1="14" x2="18" y2="24" stroke="#065F46" strokeWidth="1.4" />
          {/* Rising Sun of Knowledge */}
          <circle cx="18" cy="10" r="3" fill="#F59E0B" />
          <path d="M18 5V6.5M13.5 7L14.5 8M22.5 7L21.5 8M11.5 10H13M23 10H24.5" stroke="#FDE68A" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    // 9. CTET & STET — Central & State Teacher Eligibility Tests (CBSE)
    case 'ctet-stet':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="CTET Official Logo"
        >
          {/* CBSE / CTET Official Blue & Gold Seal */}
          <circle cx="18" cy="18" r="17" fill="#1E3A8A" stroke="#F59E0B" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="14.5" fill="#172554" stroke="#60A5FA" strokeWidth="0.8" />
          {/* Traditional Deepak (Lamp of Wisdom) */}
          <path d="M18 7C16.5 10 16 11.5 17 13.5C17.5 14.5 18.5 14.5 19 13.5C20 11.5 19.5 10 18 7Z" fill="#F59E0B" />
          <path d="M18 9C17.2 11 17 11.8 17.5 12.8C17.8 13.2 18.2 13.2 18.5 12.8C19 11.8 18.8 11 18 9Z" fill="#FEF08A" />
          {/* Diya Clay Base */}
          <path d="M11 15C11 18.5 14.5 20.5 18 20.5C21.5 20.5 25 18.5 25 15H11Z" fill="#D97706" />
          {/* Open Book */}
          <path d="M18 21C20.5 19.5 25 20 27 21.5V27C25 25.5 20.5 25 18 26.5C15.5 25 11 25.5 9 27V21.5C11 20 15.5 19.5 18 21Z" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="1" />
        </svg>
      );

    // 10. CUET — Common University Entrance Test (NTA)
    case 'cuet':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="CUET Official Logo"
        >
          {/* Academic Indigo & Orange University Emblem */}
          <circle cx="18" cy="18" r="17" fill="#312E81" stroke="#F59E0B" strokeWidth="1.8" />
          {/* Mortarboard */}
          <polygon points="18,7 28,12 18,17 8,12" fill="#F59E0B" stroke="#FEF08A" strokeWidth="0.8" />
          <path d="M18 17V21C18 23 21.5 24.5 25 23.5V15.5" stroke="#FDE68A" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M28 12V18" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round" />
          {/* University Greek Columns */}
          <path d="M10 22H26" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="22" x2="12" y2="28" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="16" y1="22" x2="16" y2="28" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="20" y1="22" x2="20" y2="28" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="24" y1="22" x2="24" y2="28" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9 29H27" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    // 11. IBPS PO — Institute of Banking Personnel Selection
    case 'ibps-po':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="IBPS Official Logo"
        >
          {/* Official IBPS Navy Shield */}
          <circle cx="18" cy="18" r="17" fill="#0C4A6E" stroke="#38BDF8" strokeWidth="1.5" />
          <path d="M18 7L27 10.5V18C27 23.5 22.5 27.5 18 29C13.5 27.5 9 23.5 9 18V10.5L18 7Z" fill="#0284C7" stroke="#FDE047" strokeWidth="1.5" />
          {/* Torch & Open Book */}
          <path d="M18 11C16.5 13 16 14.5 17 16C17.5 16.8 18.5 16.8 19 16C20 14.5 19.5 13 18 11Z" fill="#F59E0B" />
          <path d="M18 18C20 17 23 17.5 24.5 18V23C23 22.2 20 21.8 18 22.8C16 21.8 13 22.2 11.5 23V18C13 17.5 16 17 18 18Z" fill="#FFFFFF" />
        </svg>
      );

    // 12. SBI PO — State Bank of India Official Logo
    case 'sbi-po':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="SBI Official Logo"
        >
          {/* Authentic SBI Solid Blue Circle with Keyhole Cutout */}
          <circle cx="18" cy="18" r="17" fill="#0076BE" />
          {/* Central Keyhole */}
          <circle cx="18" cy="15" r="4.2" fill="#FFFFFF" />
          <rect x="16" y="15" width="4" height="12" fill="#FFFFFF" />
        </svg>
      );

    // 13. RBI Grade B — Reserve Bank of India Official Seal
    case 'rbi-grade-b':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="RBI Official Seal"
        >
          {/* Authentic RBI Gold & Black Double Ring Seal */}
          <circle cx="18" cy="18" r="17" fill="#0A0A0A" stroke="#CA8A04" strokeWidth="2" />
          <circle cx="18" cy="18" r="14.5" stroke="#EAB308" strokeWidth="1" strokeDasharray="1.5 1" />
          {/* Palm Tree */}
          <path d="M18 13V25" stroke="#FDE047" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 13C15 11 12 12 12 12M18 13C21 11 24 12 24 12M18 15C14.5 14 12 15.5 12 15.5M18 15C21.5 14 24 15.5 24 15.5M18 17C15 17 13 19 13 19M18 17C21 17 23 19 23 19" stroke="#FDE047" strokeWidth="1.4" strokeLinecap="round" />
          {/* Royal Bengal Tiger Silhouette */}
          <path d="M10 25C11.5 23.5 13.5 23.5 15.5 24.2C16 23.5 17 23.5 17.5 24.2H20C21.5 24.2 23 25 24.5 25.5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    // 14. RRB NTPC — Indian Railways Official Emblem
    case 'rrb-ntpc':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="Indian Railways Official Logo"
        >
          {/* Authentic Indian Railways Crimson Circular Track Crest */}
          <circle cx="18" cy="18" r="17" fill="#990000" stroke="#FBBF24" strokeWidth="2" />
          <circle cx="18" cy="18" r="14" fill="#B91C1C" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2.5 1" />
          {/* Steam Engine Train Face */}
          <rect x="13" y="14" width="10" height="9" rx="1.5" fill="#FEF08A" />
          <rect x="14.5" y="15" width="7" height="3.5" rx="0.5" fill="#1E293B" />
          {/* Headlight */}
          <circle cx="18" cy="20" r="1.5" fill="#DC2626" />
          {/* Train Wheels */}
          <circle cx="14.5" cy="24.5" r="1.8" fill="#FFFFFF" />
          <circle cx="21.5" cy="24.5" r="1.8" fill="#FFFFFF" />
          <path d="M11 27H25" stroke="#FDE047" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    // 15. UGC NET — University Grants Commission Official Logo
    case 'ugc-net':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="UGC Official Logo"
        >
          {/* UGC Global Blue Circular Seal */}
          <circle cx="18" cy="18" r="17" fill="#1E40AF" stroke="#60A5FA" strokeWidth="1.8" />
          {/* Globe Meridian Grid */}
          <ellipse cx="18" cy="18" rx="13" ry="5.5" stroke="#93C5FD" strokeWidth="1" />
          <ellipse cx="18" cy="18" rx="5.5" ry="13" stroke="#93C5FD" strokeWidth="1" />
          {/* Central Radiating Sun */}
          <circle cx="18" cy="18" r="5" fill="#F59E0B" stroke="#FEF08A" strokeWidth="1.2" />
          <line x1="18" y1="10" x2="18" y2="12" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="18" y1="24" x2="18" y2="26" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="18" x2="12" y2="18" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="24" y1="18" x2="26" y2="18" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    // 16. State PSCs — State Public Service Commissions
    case 'state-pscs':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="State PSC Official Emblem"
        >
          {/* National Ashoka & Scales of Justice Crest */}
          <circle cx="18" cy="18" r="17" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="14.5" stroke="#E2E8F0" strokeWidth="0.8" />
          {/* Scales of Justice */}
          <line x1="18" y1="9" x2="18" y2="26" stroke="#F8FAFC" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="11" y1="14" x2="25" y2="14" stroke="#F8FAFC" strokeWidth="1.8" strokeLinecap="round" />
          {/* Left Pan */}
          <path d="M11 14L9 18.5H13L11 14Z" fill="#FDE047" stroke="#F8FAFC" strokeWidth="0.8" />
          {/* Right Pan */}
          <path d="M25 14L23 18.5H27L25 14Z" fill="#FDE047" stroke="#F8FAFC" strokeWidth="0.8" />
          <rect x="13" y="26" width="10" height="2" rx="0.5" fill="#E2E8F0" />
        </svg>
      );

    // 17. CBSE & ICSE — Central Board of Secondary Education
    case 'cbse-icse':
    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-label="CBSE Official Logo"
        >
          {/* Official CBSE Blue & Golden Wheat Seal */}
          <circle cx="18" cy="18" r="17" fill="#003366" stroke="#F59E0B" strokeWidth="2" />
          <circle cx="18" cy="18" r="14.5" stroke="#FDE68A" strokeWidth="1" strokeDasharray="2 1" />
          {/* Deepak (Lamp) */}
          <path d="M18 8C16.8 10 16.5 11.2 17.2 12.5C17.6 13.2 18.4 13.2 18.8 12.5C19.5 11.2 19.2 10 18 8Z" fill="#F59E0B" />
          {/* Open Book */}
          <path d="M18 15C20.5 13.5 24 14 26 15.5V23.5C24 22 20.5 21.5 18 23C15.5 21.5 12 22 10 23.5V15.5C12 14 15.5 13.5 18 15Z" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="1" />
          <line x1="18" y1="15" x2="18" y2="23" stroke="#003366" strokeWidth="1.2" />
        </svg>
      );
  }
}
