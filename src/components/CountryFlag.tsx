import React from 'react';
import { CountryId } from '../../shared/types';

// Crisp cross-platform SVG flags so Windows (which lacks Unicode flag emojis) renders authentic flags!
const FLAG_COLORS: Record<CountryId, [string, string, string]> = {
  IR: ['#239f40', '#ffffff', '#da0000'],
  US: ['#b22234', '#ffffff', '#3c3b6e'],
  RU: ['#ffffff', '#0039a6', '#d52b1e'],
  CN: ['#de2910', '#ffde00', '#de2910'],
  GB: ['#012169', '#ffffff', '#c8102e'],
  FR: ['#002395', '#ffffff', '#ed2939'],
  DE: ['#111111', '#dd0000', '#ffce00'],
  IL: ['#0038b8', '#ffffff', '#0038b8'],
  TR: ['#e30a17', '#ffffff', '#e30a17'],
  SA: ['#006c35', '#ffffff', '#006c35'],
  IN: ['#ff9933', '#ffffff', '#138808'],
  JP: ['#ffffff', '#bc002d', '#ffffff'],
  KP: ['#024fa2', '#ed1c27', '#024fa2'],
  KR: ['#ffffff', '#cd2e3a', '#0047a0'],
  EG: ['#ce1126', '#ffffff', '#111111'],
  BR: ['#009c3b', '#ffdf00', '#002776'],
};

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
  JP: 'ژاپن',
  KP: 'کره‌شمالی',
  KR: 'کره‌جنوبی',
  EG: 'مصر',
  BR: 'برزیل',
};

interface CountryFlagProps {
  countryId: CountryId;
  size?: 'sm' | 'md' | 'lg';
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ countryId, size = 'md' }) => {
  const [c1, c2, c3] = FLAG_COLORS[countryId] || ['#334155', '#94a3b8', '#334155'];
  const dims =
    size === 'sm'
      ? 'w-5 h-3.5 rounded-[3px]'
      : size === 'lg'
      ? 'w-9 h-6 rounded-md'
      : 'w-6 h-4 rounded-[4px]';

  if (countryId === 'JP') {
    return (
      <svg viewBox="0 0 30 20" className={`${dims} shrink-0 inline-block border border-white/20 shadow-sm`}>
        <rect width="30" height="20" fill="#ffffff" />
        <circle cx="15" cy="10" r="5.5" fill="#bc002d" />
      </svg>
    );
  }

  if (countryId === 'CN' || countryId === 'TR') {
    return (
      <svg viewBox="0 0 30 20" className={`${dims} shrink-0 inline-block border border-white/20 shadow-sm`}>
        <rect width="30" height="20" fill={c1} />
        <circle cx={countryId === 'TR' ? '13' : '8'} cy="10" r="4.2" fill={c2} />
      </svg>
    );
  }

  if (countryId === 'FR') {
    return (
      <svg viewBox="0 0 30 20" className={`${dims} shrink-0 inline-block border border-white/20 shadow-sm`}>
        <rect width="10" height="20" x="0" fill={c1} />
        <rect width="10" height="20" x="10" fill={c2} />
        <rect width="10" height="20" x="20" fill={c3} />
      </svg>
    );
  }

  if (countryId === 'BR') {
    return (
      <svg viewBox="0 0 30 20" className={`${dims} shrink-0 inline-block border border-white/20 shadow-sm`}>
        <rect width="30" height="20" fill={c1} />
        <polygon points="15,3 26,10 15,17 4,10" fill={c2} />
        <circle cx="15" cy="10" r="3.6" fill={c3} />
      </svg>
    );
  }

  if (countryId === 'US') {
    return (
      <svg viewBox="0 0 30 20" className={`${dims} shrink-0 inline-block border border-white/20 shadow-sm`}>
        <rect width="30" height="20" fill="#b22234" />
        <rect width="30" height="3" y="3" fill="#ffffff" />
        <rect width="30" height="3" y="9" fill="#ffffff" />
        <rect width="30" height="3" y="15" fill="#ffffff" />
        <rect width="13" height="11" x="0" y="0" fill="#3c3b6e" />
      </svg>
    );
  }

  if (countryId === 'GB') {
    return (
      <svg viewBox="0 0 30 20" className={`${dims} shrink-0 inline-block border border-white/20 shadow-sm`}>
        <rect width="30" height="20" fill="#012169" />
        <path d="M0,0 L30,20 M30,0 L0,20" stroke="#ffffff" strokeWidth="3.5" />
        <path d="M15,0 V20 M0,10 H30" stroke="#ffffff" strokeWidth="5" />
        <path d="M15,0 V20 M0,10 H30" stroke="#c8102e" strokeWidth="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 30 20" className={`${dims} shrink-0 inline-block border border-white/20 shadow-sm`}>
      <rect width="30" height="6.7" y="0" fill={c1} />
      <rect width="30" height="6.7" y="6.65" fill={c2} />
      <rect width="30" height="6.7" y="13.3" fill={c3} />
    </svg>
  );
};
