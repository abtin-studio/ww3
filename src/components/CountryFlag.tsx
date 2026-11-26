import React from 'react';
import { CountryId } from '../../shared/types';

export const SHORT_NAME_FA: Record<CountryId, string> = {
  IR: 'ایران',
  US: 'آمریکا',
  RU: 'روسیه',
  CN: 'چین',
  GB: 'بریتانیا',
  FR: 'فرانسه',
  DE: 'آلمان',
  IL: 'اسرائیل',
  TR: 'ترکیه',
  SA: 'عربستان',
  IN: 'هند',
  PK: 'پاکستان',
  UA: 'اوکراین',
  JP: 'ژاپن',
  KP: 'کره‌شمالی',
  KR: 'کره‌جنوبی',
  EG: 'مصر',
  BR: 'برزیل',
  CA: 'کانادا',
  AU: 'استرالیا',
};

export const EMPIRE_COLORS: Record<CountryId, string> = {
  IR: '#10b981',
  US: '#2563eb',
  RU: '#dc2626',
  CN: '#e11d48',
  GB: '#4f46e5',
  FR: '#0284c7',
  DE: '#eab308',
  IL: '#38bdf8',
  TR: '#f43f5e',
  SA: '#16a34a',
  IN: '#f97316',
  PK: '#15803d',
  UA: '#facc15',
  JP: '#fb7185',
  KP: '#991b1b',
  KR: '#06b6d4',
  EG: '#d97706',
  BR: '#22c55e',
  CA: '#ef4444',
  AU: '#6366f1',
};

interface CountryFlagProps {
  countryId: CountryId;
  size?: 'sm' | 'md' | 'lg';
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ countryId, size = 'md' }) => {
  const dims =
    size === 'sm'
      ? 'w-5 h-3.5 rounded-[3px]'
      : size === 'lg'
      ? 'w-10 h-7 rounded-md'
      : 'w-6 h-4 rounded-[4px]';
  const baseCls = `${dims} shrink-0 inline-block border border-white/20 shadow-sm overflow-hidden`;

  switch (countryId) {
    case 'IR':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="8" y="0" fill="#239f40" />
          <rect width="36" height="8" y="8" fill="#ffffff" />
          <rect width="36" height="8" y="16" fill="#da0000" />
          <line x1="0" y1="7.6" x2="36" y2="7.6" stroke="#ffffff" strokeWidth="0.45" strokeDasharray="1.2 0.8" />
          <line x1="0" y1="16.4" x2="36" y2="16.4" stroke="#ffffff" strokeWidth="0.45" strokeDasharray="1.2 0.8" />
          {/* Stylized Red National Emblem */}
          <g fill="none" stroke="#da0000" strokeWidth="1.1" strokeLinecap="round">
            <line x1="18" y1="9.2" x2="18" y2="14.8" />
            <path d="M16.2,9.8 C14.9,11.2 15.1,13.4 16.8,14.4" />
            <path d="M19.8,9.8 C21.1,11.2 20.9,13.4 19.2,14.4" />
            <path d="M17.1,10.1 C16.0,11.4 16.2,13.1 17.5,14.1" />
            <path d="M18.9,10.1 C20.0,11.4 19.8,13.1 18.5,14.1" />
          </g>
        </svg>
      );

    case 'US':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#b22234" />
          {[1, 3, 5, 7, 9, 11].map((i) => (
            <rect key={i} width="36" height={24 / 13} y={(i * 24) / 13} fill="#ffffff" />
          ))}
          <rect width="15.5" height={(7 * 24) / 13} x="0" y="0" fill="#3c3b6e" />
          {[2.5, 5.5, 8.5, 11.5, 14].map((x) =>
            [2.4, 5.2, 8.0, 10.6].map((y) => (
              <circle key={`${x}-${y}`} cx={x - 0.5} cy={y} r="0.65" fill="#ffffff" />
            ))
          )}
        </svg>
      );

    case 'RU':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="8" y="0" fill="#ffffff" />
          <rect width="36" height="8" y="8" fill="#0039a6" />
          <rect width="36" height="8" y="16" fill="#d52b1e" />
        </svg>
      );

    case 'CN':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#de2910" />
          <polygon
            points="7,3.2 8.1,6.5 11.5,6.5 8.8,8.5 9.8,11.8 7,9.8 4.2,11.8 5.2,8.5 2.5,6.5 5.9,6.5"
            fill="#ffde00"
          />
          <circle cx="13.5" cy="3.2" r="0.95" fill="#ffde00" />
          <circle cx="15.4" cy="5.6" r="0.95" fill="#ffde00" />
          <circle cx="15.4" cy="8.8" r="0.95" fill="#ffde00" />
          <circle cx="13.5" cy="11.2" r="0.95" fill="#ffde00" />
        </svg>
      );

    case 'GB':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#012169" />
          <path d="M0,0 L36,24 M36,0 L0,24" stroke="#ffffff" strokeWidth="4.5" />
          <path d="M0,0 L36,24 M36,0 L0,24" stroke="#c8102e" strokeWidth="2.2" />
          <path d="M18,0 V24 M0,12 H36" stroke="#ffffff" strokeWidth="6.8" />
          <path d="M18,0 V24 M0,12 H36" stroke="#c8102e" strokeWidth="4" />
        </svg>
      );

    case 'FR':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="12" height="24" x="0" fill="#002395" />
          <rect width="12" height="24" x="12" fill="#ffffff" />
          <rect width="12" height="24" x="24" fill="#ed2939" />
        </svg>
      );

    case 'DE':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="8" y="0" fill="#111111" />
          <rect width="36" height="8" y="8" fill="#dd0000" />
          <rect width="36" height="8" y="16" fill="#ffce00" />
        </svg>
      );

    case 'IL':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#ffffff" />
          <rect width="36" height="3.6" y="2.2" fill="#0038b8" />
          <rect width="36" height="3.6" y="18.2" fill="#0038b8" />
          {/* Authentic Star of David */}
          <polygon points="18,7.2 22.2,14.4 13.8,14.4" fill="none" stroke="#0038b8" strokeWidth="1.25" />
          <polygon points="18,16.8 22.2,9.6 13.8,9.6" fill="none" stroke="#0038b8" strokeWidth="1.25" />
        </svg>
      );

    case 'TR':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#e30a17" />
          <circle cx="14.2" cy="12" r="5.6" fill="#ffffff" />
          <circle cx="15.7" cy="12" r="4.5" fill="#e30a17" />
          <polygon
            points="22.8,12 20.1,12.9 21.7,10.6 21.7,13.4 20.1,11.1"
            fill="#ffffff"
          />
          <polygon
            points="21.5,9.5 22.2,11.3 24.1,11.3 22.6,12.4 23.1,14.2 21.5,13.1 19.9,14.2 20.4,12.4 18.9,11.3 20.8,11.3"
            fill="#ffffff"
          />
        </svg>
      );

    case 'SA':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#006c35" />
          {/* Stylized White Script Band & Sword */}
          <rect x="8.5" y="6.8" width="19" height="1.5" rx="0.7" fill="#ffffff" opacity="0.92" />
          <rect x="10.5" y="9.5" width="15" height="1.4" rx="0.7" fill="#ffffff" opacity="0.85" />
          <line x1="10" y1="15.8" x2="25.5" y2="15.8" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="24" y="14.5" width="2.3" height="2.6" rx="0.5" fill="#ffffff" />
        </svg>
      );

    case 'IN':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="8" y="0" fill="#ff9933" />
          <rect width="36" height="8" y="8" fill="#ffffff" />
          <rect width="36" height="8" y="16" fill="#138808" />
          <circle cx="18" cy="12" r="3" fill="none" stroke="#000080" strokeWidth="0.9" />
          <circle cx="18" cy="12" r="0.8" fill="#000080" />
          <path d="M18,9 V15 M15,12 H21 M15.9,9.9 L20.1,14.1 M20.1,9.9 L15.9,14.1" stroke="#000080" strokeWidth="0.5" />
        </svg>
      );

    case 'PK':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="9" height="24" x="0" fill="#ffffff" />
          <rect width="27" height="24" x="9" fill="#01411c" />
          <circle cx="22" cy="12" r="5.4" fill="#ffffff" />
          <circle cx="23.6" cy="10.8" r="4.8" fill="#01411c" />
          <polygon
            points="25.2,7.8 25.8,9.4 27.5,9.4 26.1,10.4 26.6,12 25.2,11 23.8,12 24.3,10.4 22.9,9.4 24.6,9.4"
            fill="#ffffff"
          />
        </svg>
      );

    case 'UA':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="12" y="0" fill="#005bbb" />
          <rect width="36" height="12" y="12" fill="#ffd500" />
        </svg>
      );

    case 'JP':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#ffffff" />
          <circle cx="18" cy="12" r="6.6" fill="#bc002d" />
        </svg>
      );

    case 'KP':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="4" y="0" fill="#024fa2" />
          <rect width="36" height="1.2" y="4" fill="#ffffff" />
          <rect width="36" height="13.6" y="5.2" fill="#ed1c27" />
          <rect width="36" height="1.2" y="18.8" fill="#ffffff" />
          <rect width="36" height="4" y="20" fill="#024fa2" />
          <circle cx="12.5" cy="12" r="4.8" fill="#ffffff" />
          <polygon
            points="12.5,7.8 13.6,10.8 16.8,10.8 14.2,12.6 15.2,15.6 12.5,13.8 9.8,15.6 10.8,12.6 8.2,10.8 11.4,10.8"
            fill="#ed1c27"
          />
        </svg>
      );

    case 'KR':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#ffffff" />
          {/* Taegeuk Red/Blue Circle */}
          <path d="M13,12 A5,5 0 0,1 23,12 Z" fill="#cd2e3a" />
          <path d="M13,12 A5,5 0 0,0 23,12 Z" fill="#0047a0" />
          <circle cx="15.5" cy="12" r="2.5" fill="#cd2e3a" />
          <circle cx="20.5" cy="12" r="2.5" fill="#0047a0" />
          {/* 4 Black Trigrams */}
          <g stroke="#111111" strokeWidth="1.1" strokeLinecap="round">
            <line x1="8.5" y1="6.8" x2="11.2" y2="4.5" />
            <line x1="9.5" y1="8.0" x2="12.2" y2="5.7" />
            <line x1="24.8" y1="4.5" x2="27.5" y2="6.8" />
            <line x1="23.8" y1="5.7" x2="26.5" y2="8.0" />
            <line x1="8.5" y1="17.2" x2="11.2" y2="19.5" />
            <line x1="9.5" y1="16.0" x2="12.2" y2="18.3" />
            <line x1="24.8" y1="19.5" x2="27.5" y2="17.2" />
            <line x1="23.8" y1="18.3" x2="26.5" y2="16.0" />
          </g>
        </svg>
      );

    case 'EG':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="8" y="0" fill="#ce1126" />
          <rect width="36" height="8" y="8" fill="#ffffff" />
          <rect width="36" height="8" y="16" fill="#111111" />
          {/* Eagle of Saladin */}
          <path d="M18,9.2 L20,10.8 L19.4,14.5 L16.6,14.5 L16,10.8 Z" fill="#c09300" />
        </svg>
      );

    case 'BR':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#009c3b" />
          <polygon points="18,3 32,12 18,21 4,12" fill="#ffdf00" />
          <circle cx="18" cy="12" r="4.6" fill="#002776" />
          <path d="M13.6,11.3 Q18,9.8 22.4,12.7" fill="none" stroke="#ffffff" strokeWidth="1" />
        </svg>
      );

    case 'CA':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="9" height="24" x="0" fill="#ff0000" />
          <rect width="18" height="24" x="9" fill="#ffffff" />
          <rect width="9" height="24" x="27" fill="#ff0000" />
          {/* Maple Leaf */}
          <path
            d="M18,4.8 L19.4,8.2 L22.2,7.6 L20.8,10.6 L23.5,11.8 L20.2,14.2 L20.8,16.2 L18.5,15.8 L18.5,19.2 L17.5,19.2 L17.5,15.8 L15.2,16.2 L15.8,14.2 L12.5,11.8 L15.2,10.6 L13.8,7.6 L16.6,8.2 Z"
            fill="#ff0000"
          />
        </svg>
      );

    case 'AU':
      return (
        <svg viewBox="0 0 36 24" className={baseCls}>
          <rect width="36" height="24" fill="#00008b" />
          {/* Union Jack Canton */}
          <g>
            <rect width="16" height="11" x="0" y="0" fill="#012169" />
            <path d="M0,0 L16,11 M16,0 L0,11" stroke="#ffffff" strokeWidth="2.1" />
            <path d="M0,0 L16,11 M16,0 L0,11" stroke="#c8102e" strokeWidth="1" />
            <path d="M8,0 V11 M0,5.5 H16" stroke="#ffffff" strokeWidth="3.2" />
            <path d="M8,0 V11 M0,5.5 H16" stroke="#c8102e" strokeWidth="1.8" />
          </g>
          {/* Commonwealth Star & Southern Cross */}
          <circle cx="8" cy="17.5" r="2.1" fill="#ffffff" />
          <circle cx="27" cy="5.5" r="1.15" fill="#ffffff" />
          <circle cx="23.5" cy="10.5" r="1.15" fill="#ffffff" />
          <circle cx="30.5" cy="9.8" r="1.1" fill="#ffffff" />
          <circle cx="27" cy="18.2" r="1.25" fill="#ffffff" />
          <circle cx="28.8" cy="13.2" r="0.7" fill="#ffffff" />
        </svg>
      );
  }
};
