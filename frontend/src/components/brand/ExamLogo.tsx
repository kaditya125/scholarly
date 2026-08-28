import React, { useState } from 'react';

interface ExamLogoProps {
  slug: string;
  className?: string;
  size?: number;
}

/**
 * Official logo image mapping for each exam from public/ folder.
 */
const OFFICIAL_IMAGE_MAP: Record<string, string> = {
  'neet': '/nta.webp',
  'jee-main': '/nta.webp',
  'jee-advanced': '/advance.webp',
  'upsc-cse': '/upsc.webp',
  'ssc-cgl': '/ssc cgl.webp',
  'ssc-chsl': '/ssc chsl.webp',
  'bpsc': '/bpsc.webp',
  'bihar-tre': '/bpsc tre.webp',
  'ctet-stet': '/ctet.webp',
  'cuet': '/nta.webp',
  'ibps-po': '/ibps.webp',
  'sbi-po': '/sbi.webp',
  'rbi-grade-b': '/rbi.webp',
  'rrb-ntpc': '/rrb.webp',
  'ugc-net': '/ugc net.webp',
  'state-pscs': '/upsc.webp',
  'cbse-icse': '/cbse.webp',
};

/**
 * Official logos for Indian competitive exams and education boards.
 * Uses official webp logos placed in public directory with vector SVG fallbacks.
 */
export function ExamLogo({ slug, className = 'w-5 h-5', size = 20 }: ExamLogoProps) {
  const [error, setError] = useState(false);
  const imageSrc = OFFICIAL_IMAGE_MAP[slug];

  if (imageSrc && !error) {
    return (
      <img
        src={imageSrc}
        alt={`${slug} logo`}
        width={size}
        height={size}
        onError={() => setError(true)}
        className={`${className} object-contain shrink-0`}
        loading="lazy"
      />
    );
  }

  // Vector Fallback
  switch (slug) {
    case 'neet':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#FFFFFF" stroke="#00796B" strokeWidth="2" />
          <path d="M18 6V30" stroke="#B45309" strokeWidth="2" strokeLinecap="round" />
          <rect x="16.2" y="14" width="3.6" height="8" rx="0.5" fill="#DC2626" />
          <rect x="14" y="16.2" width="8" height="3.6" rx="0.5" fill="#DC2626" />
        </svg>
      );
    case 'jee-main':
    case 'cuet':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5" />
          <path d="M7 11C13 8 23 14 29 11V16C23 19 13 13 7 16V11Z" fill="#FF9933" />
          <path d="M7 17C13 14 23 20 29 17V22C23 25 13 19 7 22V17Z" fill="#138808" />
        </svg>
      );
    case 'jee-advanced':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#881337" />
          <circle cx="18" cy="18" r="15" stroke="#FDE047" strokeWidth="1.8" strokeDasharray="3 1.2" />
        </svg>
      );
    case 'upsc-cse':
    case 'state-pscs':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#0F172A" stroke="#D97706" strokeWidth="1.8" />
          <circle cx="18" cy="22" r="3.2" stroke="#38BDF8" strokeWidth="1" fill="#FFFFFF" />
        </svg>
      );
    case 'sbi-po':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#0076BE" />
          <circle cx="18" cy="15" r="4.2" fill="#FFFFFF" />
          <rect x="16" y="15" width="4" height="12" fill="#FFFFFF" />
        </svg>
      );
    case 'rbi-grade-b':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#0A0A0A" stroke="#CA8A04" strokeWidth="2" />
          <path d="M18 13V25" stroke="#FDE047" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'rrb-ntpc':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#990000" stroke="#FBBF24" strokeWidth="2" />
          <circle cx="18" cy="14" fill="#B91C1C" stroke="#FFFFFF" strokeWidth="1" />
        </svg>
      );
    case 'bpsc':
    case 'bihar-tre':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#FFFFFF" stroke="#047857" strokeWidth="2" />
          <path d="M18 7C14.5 7 12 9.5 12 12C12 13.5 13 14.8 14.5 15.5C13 16 12 17.5 12 19C12 21.5 14.5 23 18 23C21.5 23 24 21.5 24 19C24 17.5 23 16 21.5 15.5C23 14.8 24 13.5 24 12C24 9.5 21.5 7 18 7Z" fill="#059669" stroke="#047857" strokeWidth="0.8" />
        </svg>
      );
    case 'ssc-cgl':
    case 'ssc-chsl':
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#7F1D1D" stroke="#F59E0B" strokeWidth="1.8" />
        </svg>
      );
    case 'cbse-icse':
    case 'ctet-stet':
    case 'ugc-net':
    case 'ibps-po':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="18" cy="18" r="17" fill="#003366" stroke="#F59E0B" strokeWidth="2" />
          <path d="M18 15C20.5 13.5 24 14 26 15.5V23.5C24 22 20.5 21.5 18 23C15.5 21.5 12 22 10 23.5V15.5C12 14 15.5 13.5 18 15Z" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="1" />
        </svg>
      );
  }
}
