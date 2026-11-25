import {
  computeCountryMilitary,
  computeEconomyProjection,
  getIndigenousOrAllyWeaponCost,
} from '../shared/advisor.js';
import {
  CALENDAR_MONTHS_FA,
  createInitialCountries,
  INFRASTRUCTURE_CATALOG,
  INITIAL_CHOKEPOINTS,
  REAL_WORLD_EVENTS,
  WEAPONS_CATALOG,
} from '../shared/realWorldData.js';
import {
  AlertPosture,
  ChokepointId,
  CountryId,
  CountryState,
  DefconLevel,
  GameOrder,
  GameRoomState,
  GameSettings,
  IntelReport,
  MapVisualEvent,
  NewsItem,
  RevealedSnapshot,
  TradeOffer,
  UNResolution,
} from '../shared/types.js';
import { castAIVotesOnResolution, generateAINationOrders } from './aiNations.js';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-4)}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function createNewRoomState(
  roomCode: string,
  roomName: string,
  hostId: string,
  hostName: string,
  settings: GameSettings
): GameRoomState {
  const countries = createInitialCountries();
  const chokepoints = JSON.parse(JSON.stringify(INITIAL_CHOKEPOINTS));

  const room: GameRoomState = {
    roomCode,
    roomName: roomName || `اتاق جنگ ${roomCode}`,
    createdAt: Date.now(),
    phase: 'LOBBY',
    round: 1,
    calendarLabelFa: CALENDAR_MONTHS_FA[0],
    phaseEndsAt: null,
    defcon: 5,
    settings,
    players: [
      {
        id: hostId,
        name: hostName,
        isHost: true,
        isGM: settings.gmMode === 'HUMAN',
        countryId: null,
        connected: true,
      },
    ],
    countries,
    chokepoints,
    market: {
      oilPriceUsd: 82,
      gasPriceIndex: 100,
      foodPriceIndex: 100,
      globalTension: 18,
    },
    news: [
      {
        id: uid('news'),
        round: 1,
        monthLabelFa: CALENDAR_MONTHS_FA[0],
        timestamp: Date.now(),
        agencyFa: 'شورای امنیت سازمان ملل',
        category: 'WORLD_EVENT',
        breaking: true,
        headlineFa: 'آغاز عصر جدید ژئوپولیتیک جهانی؛ سران قدرت‌های بزرگ وارد اتاق فرمان شدند',
        bodyFa:
          'بازار جهانی نفت با نرخ ۸۲ دلار در هر بشکه کار خود را آغاز کرد. تمامی تنگه‌های استراتژیک باز هستند و سرویس‌های اطلاعاتی جهان در آماده‌باش کامل به سر می‌برند.',
        involvedCountries: [],
      },
    ],
    visualEvents: [],
    trades: [],
    messages: [],
    resolutions: [],
    winnerSummaryFa: null,
    rankings: [],
  };

  updateRankingsAndDefcon(room);
  return room;
}

export function updateRankingsAndDefcon(room: GameRoomState): void {
  const t = room.market.globalTension;
  let defcon: DefconLevel = 5;
  if (t >= 82) defcon = 1;
  else if (t >= 64) defcon = 2;
  else if (t >= 45) defcon = 3;
  else if (t >= 26) defcon = 4;
  room.defcon = defcon;

  const list = Object.values(room.countries).map((c) => {
    const mil = computeCountryMilitary(c);
    const economicScore = Math.round(
      c.treasuryB * 0.45 +
        c.gdpB * 0.22 +
        (c.oilReserve + c.gasReserve + c.foodReserve) * 0.18 +
        Object.values(c.infrastructure).reduce((a, b) => a + b, 0) * 9
    );
    const militaryScore = Math.round(
      mil.attackScore * 0.55 + mil.defenseScore * 0.45 + c.warheads * 18 + c.techLevel * 14
    );
    const stabilityScore = Math.round(c.approval * 2.2 + c.powerGrid * 1.1);
    const influenceScore = Math.round(
      c.allies.length * 28 + c.intelLevel * 12 + c.cyberShield * 0.8 - c.sanctionedBy.length * 14
    );
    const score = c.isEliminated
      ? 0
      : Math.max(10, economicScore + militaryScore + stabilityScore + influenceScore);

    return {
      countryId: c.id,
      score,
      economicScore,
      militaryScore,
      stabilityScore,
      influenceScore,
    };
  });

  list.sort((a, b) => b.score - a.score);
  room.rankings = list;
}

export function addIntel(
  country: CountryState,
  round: number,
  severity: IntelReport['severity'],
  titleFa: string,
  detailFa: string,
  revealedCountry?: CountryId
): void {
  country.intelReports.unshift({
    id: uid('intel'),
    round,
    timestamp: Date.now(),
    severity,
    titleFa,
    detailFa,
    revealedCountry,
  });
  if (country.intelReports.length > 30) {
    country.intelReports.length = 30;
  }
}

export function addNews(
  room: GameRoomState,
  partial: Omit<NewsItem, 'id' | 'round' | 'monthLabelFa' | 'timestamp'>
): void {
  room.news.unshift({
    ...partial,
    id: uid('news'),
    round: room.round,
    monthLabelFa: room.calendarLabelFa,
    timestamp: Date.now(),
  });
  if (room.news.length > 60) {
    room.news.length = 60;
  }
}

function captureSnapshot(room: GameRoomState, target: CountryState): RevealedSnapshot {
  const mil = computeCountryMilitary(target);
  const topWeapons = Object.entries(target.weapons)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([weaponId, count]) => ({ weaponId, count }));

  return {
    round: room.round,
    treasuryB: target.treasuryB,
    oilReserve: target.oilReserve,
    gasReserve: target.gasReserve,
    warheads: target.warheads,
    nuclearProgress: target.nuclearProgress,
    militaryPowerScore: mil.attackScore + mil.defenseScore,
    topWeapons,
  };
}

export function calculateOrderCost(country: CountryState, draft: Partial<GameOrder>): {
  valid: boolean;
  costB: number;
  summaryFa: string;
  errorFa?: string;
} {
  switch (draft.kind) {
    case 'BUILD_INFRA': {
      if (!draft.infraType) return { valid: false, costB: 0, summaryFa: '', errorFa: 'نوع زیرساخت نامشخص است.' };
      const spec = INFRASTRUCTURE_CATALOG[draft.infraType];
      if (country.infrastructure[draft.infraType] >= spec.maxLevel) {
        return { valid: false, costB: 0, summaryFa: '', errorFa: 'این زیرساخت به حداکثر سطح رسیده است.' };
      }
      return { valid: true, costB: spec.costB, summaryFa: `احداث ${spec.nameFa}` };
    }

    case 'PRODUCE_WEAPON': {
      if (!draft.weaponId) return { valid: false, costB: 0, summaryFa: '', errorFa: 'تسلیحات انتخاب نشده است.' };
      const spec = WEAPONS_CATALOG[draft.weaponId];
      if (!spec) return { valid: false, costB: 0, summaryFa: '', errorFa: 'تسلیحات نامعتبر است.' };
      const qty = clamp(draft.quantity || 1, 1, 5);
      const access = getIndigenousOrAllyWeaponCost(country, draft.weaponId);
      if (!access.canBuildDirectly) {
        return {
          valid: false,
          costB: 0,
          summaryFa: '',
          errorFa: `این سلاح ساخت بومی شما نیست؛ از طریق دیپلماسی از کشور سازنده سفارش خرید ثبت کنید.`,
        };
      }
      const total = access.finalCostB * qty;
      return {
        valid: true,
        costB: total,
        summaryFa: `${access.isAllyLicensed ? 'خرید تحت لیسانس' : 'تولید بومی'} ${qty}× ${spec.nameFa}`,
      };
    }

    case 'FLIGHT_MISSION': {
      const target = draft.targetCountry || country.id;
      if (draft.flightType === 'CAP_PATROL') {
        return { valid: true, costB: 6, summaryFa: 'پرواز گشت هوایی ۲۴ ساعته (CAP) بر فراز کشور' };
      }
      if (draft.flightType === 'RECON_FLIGHT') {
        return { valid: true, costB: 9, summaryFa: `پرواز شناسایی و عکس‌برداری راداری بر فراز ${target}` };
      }
      if (draft.flightType === 'AIRLIFT') {
        return { valid: true, costB: 16, summaryFa: `پل هوایی ترابری و ارسال پدافند اضطراری به ${target}` };
      }
      if (draft.flightType === 'AIRSTRIKE') {
        const hasAir = Object.entries(country.weapons).some(([id, cnt]) => {
          const s = WEAPONS_CATALOG[id];
          return cnt > 0 && s && (s.category === 'FIGHTER' || s.category === 'BOMBER');
        });
        if (!hasAir) {
          return {
            valid: false,
            costB: 0,
            summaryFa: '',
            errorFa: 'برای حمله هوایی حداقل به یک اسکادران جنگنده یا بمب‌افکن نیاز دارید!',
          };
        }
        return { valid: true, costB: 15, summaryFa: `عملیات بمباران هوایی علیه زیرساخت‌های ${target}` };
      }
      return { valid: false, costB: 0, summaryFa: '', errorFa: 'نوع پرواز نامعتبر است.' };
    }

    case 'MILITARY_STRIKE': {
      if (!draft.targetCountry || draft.targetCountry === country.id) {
        return { valid: false, costB: 0, summaryFa: '', errorFa: 'کشور هدف نامعتبر است.' };
      }
      if (draft.strikeType === 'DRONE_SWARM') {
        return { valid: true, costB: 10, summaryFa: `حمله موج انبوه پهپادی برای اشباع پدافند ${draft.targetCountry}` };
      }
      if (draft.strikeType === 'CRUISE_MISSILE') {
        return { valid: true, costB: 16, summaryFa: `شلیک موشک‌های کروز نقطه‌زن به ${draft.targetCountry}` };
      }
      if (draft.strikeType === 'BALLISTIC_MISSILE') {
        return { valid: true, costB: 22, summaryFa: `حمله موشکی بالستیک/هایپرسونیک به ${draft.targetCountry}` };
      }
      if (draft.strikeType === 'NAVAL_STRIKE') {
        return { valid: true, costB: 18, summaryFa: `عملیات دریایی و محاصره بنادر ${draft.targetCountry}` };
      }
      if (draft.strikeType === 'GROUND_OFFENSIVE') {
        return { valid: true, costB: 26, summaryFa: `عملیات زمینی و تهاجم زرهی علیه خطوط ${draft.targetCountry}` };
      }
      if (draft.strikeType === 'NUCLEAR_STRIKE') {
        if (country.warheads <= 0) {
          return {
            valid: false,
            costB: 0,
            summaryFa: '',
            errorFa: 'کشور شما فاقد کلاهک هسته‌ای عملیاتی است!',
          };
        }
        return { valid: true, costB: 35, summaryFa: `☢️ فرمان ضربه استراتژیک هسته‌ای به ${draft.targetCountry}` };
      }
      return { valid: false, costB: 0, summaryFa: '', errorFa: 'نوع حمله مشخص نیست.' };
    }

    case 'CYBER_ATTACK': {
      if (!draft.targetCountry || draft.targetCountry === country.id) {
        return { valid: false, costB: 0, summaryFa: '', errorFa: 'هدف سایبری نامعتبر است.' };
      }
      const mapCost: Record<string, [number, string]> = {
        STUXNET_SABOTAGE: [18, `ارسال ویروس صنعتی (سبک استاکس‌نت) به تاسیسات ${draft.targetCountry}`],
        GRID_BLACKOUT: [15, `بدافزار خاموشی شبکه برق شهرهای ${draft.targetCountry}`],
        RADAR_BLIND: [14, `حمله سایبری و کور کردن رادار پدافند ${draft.targetCountry}`],
        CENTRAL_BANK_HACK: [16, `نفوذ سایبری به بانک مرکزی و بورس ${draft.targetCountry}`],
      };
      const entry = draft.cyberType ? mapCost[draft.cyberType] : undefined;
      if (!entry) return { valid: false, costB: 0, summaryFa: '', errorFa: 'نوع حمله سایبری نامعتبر است.' };
      return { valid: true, costB: entry[0], summaryFa: entry[1] };
    }

    case 'ESPIONAGE_OP': {
      if (draft.espionageType === 'COUNTER_INTEL_SWEEP') {
        return { valid: true, costB: 10, summaryFa: 'عملیات گسترده حفاظت اطلاعات و شکار جاسوسان در داخل کشور' };
      }
      if (!draft.targetCountry || draft.targetCountry === country.id) {
        return { valid: false, costB: 0, summaryFa: '', errorFa: 'کشور هدف عملیات اطلاعاتی نامعتبر است.' };
      }
      const mapEsp: Record<string, [number, string]> = {
        DEEP_RECON: [10, `نفوذ اطلاعاتی و کشف آمار سرّی ارتش و ذخایر ${draft.targetCountry}`],
        ASSASSINATE_SCIENTIST: [22, `عملیات ترور دانشمند ارشد هسته‌ای/تسلیحاتی در ${draft.targetCountry}`],
        ASSASSINATE_COMMANDER: [24, `عملیات ترور فرمانده ارشد نظامی در ${draft.targetCountry}`],
        COVERT_SABOTAGE: [16, `خرابکاری مخفی و تحریک ناآرامی در ${draft.targetCountry}`],
      };
      const entry = draft.espionageType ? mapEsp[draft.espionageType] : undefined;
      if (!entry) return { valid: false, costB: 0, summaryFa: '', errorFa: 'نوع عملیات اطلاعاتی نامشخص است.' };
      return { valid: true, costB: entry[0], summaryFa: entry[1] };
    }

    case 'DOMESTIC_POLICY': {
      if (draft.policyType === 'WELFARE_PACKAGE') {
        return { valid: true, costB: 18, summaryFa: 'بسته رفاهی و یارانه معیشتی مردم (+۱۰٪ رضایت عمومی)' };
      }
      if (draft.policyType === 'SECURITY_CRACKDOWN') {
        return { valid: true, costB: 12, summaryFa: 'حکومت نظامی و استقرار نیروهای امنیتی در شهرها' };
      }
      if (draft.policyType === 'TECH_RND_INVEST') {
        return { valid: true, costB: 28, summaryFa: 'سرمایه‌گذاری کلان در فناوری‌های دفاعی و هوش مصنوعی' };
      }
      if (draft.policyType === 'NUCLEAR_PROGRAM_PUSH') {
        return { valid: true, costB: 36, summaryFa: 'شتاب‌دهی غنی‌سازی اورانیوم و برنامه هسته‌ای' };
      }
      if (draft.policyType === 'TOGGLE_CHOKEPOINT') {
        return {
          valid: true,
          costB: 6,
          summaryFa: `تغییر وضعیت تنگه استراتژیک به حالت ${
            draft.chokepointStatus === 'BLOCKADED'
              ? 'مسدود نظامی'
              : draft.chokepointStatus === 'RESTRICTED'
              ? 'بازرسی محدود'
              : 'آزاد'
          }`,
        };
      }
      return { valid: false, costB: 0, summaryFa: '', errorFa: 'سیاست داخلی نامعتبر است.' };
    }

    default:
      return { valid: false, costB: 0, summaryFa: '', errorFa: 'دستور نامعتبر است.' };
  }
}

export function queuePlayerOrder(
  room: GameRoomState,
  countryId: CountryId,
  draft: Partial<GameOrder>
): { ok: boolean; errorFa?: string; order?: GameOrder } {
  if (room.phase !== 'PLANNING') {
    return { ok: false, errorFa: 'ثبت دستور جدید فقط در فاز برنامه‌ریزی امکان‌پذیر است.' };
  }
  const country = room.countries[countryId];
  if (!country || country.isEliminated) {
    return { ok: false, errorFa: 'کشور فعال نیست.' };
  }
  if (country.orders.length >= 6) {
    return { ok: false, errorFa: 'حداکثر ۶ فرمان استراتژیک در هر ماه قابل ثبت است.' };
  }

  const calc = calculateOrderCost(country, draft);
  if (!calc.valid) {
    return { ok: false, errorFa: calc.errorFa || 'فرمان نامعتبر است.' };
  }
  if (country.treasuryB < calc.costB) {
    return {
      ok: false,
      errorFa: `بودجه کافی نیست! هزینه این فرمان $${calc.costB}B است اما خزانه شما $${country.treasuryB}B موجودی دارد.`,
    };
  }

  country.treasuryB -= calc.costB;
  const order: GameOrder = {
    id: uid('ord'),
    actor: countryId,
    kind: draft.kind!,
    targetCountry: draft.targetCountry,
    infraType: draft.infraType,
    weaponId: draft.weaponId,
    quantity: draft.quantity,
    flightType: draft.flightType,
    strikeType: draft.strikeType,
    targetSector: draft.targetSector || 'MILITARY_BASES',
    cyberType: draft.cyberType,
    espionageType: draft.espionageType,
    policyType: draft.policyType,
    chokepointStatus: draft.chokepointStatus,
    summaryFa: calc.summaryFa,
    costB: calc.costB,
  };
  country.orders.push(order);
  return { ok: true, order };
}

export function cancelPlayerOrder(
  room: GameRoomState,
  countryId: CountryId,
  orderId: string
): boolean {
  if (room.phase !== 'PLANNING') return false;
  const country = room.countries[countryId];
  if (!country) return false;
  const idx = country.orders.findIndex((o) => o.id === orderId);
  if (idx === -1) return false;
  const [removed] = country.orders.splice(idx, 1);
  country.treasuryB += removed.costB;
  return true;
}

export function executeAcceptedTrade(room: GameRoomState, offer: TradeOffer): { ok: boolean; errorFa?: string } {
  const fromC = room.countries[offer.from];
  const toC = room.countries[offer.to];
  if (!fromC || !toC) return { ok: false, errorFa: 'کشورهای معامله نامعتبرند.' };

  if (offer.offerType === 'ALLIANCE') {
    if (offer.priceB > 0) {
      if (fromC.treasuryB < offer.priceB) return { ok: false, errorFa: 'بودجه پیشنهاددهنده کافی نیست.' };
      fromC.treasuryB -= offer.priceB;
      toC.treasuryB += offer.priceB;
    }
    if (!fromC.allies.includes(toC.id)) fromC.allies.push(toC.id);
    if (!toC.allies.includes(fromC.id)) toC.allies.push(fromC.id);
    fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
    toC.sanctionedBy = toC.sanctionedBy.filter((id) => id !== fromC.id);
    if (!fromC.airspaceOpenTo.includes(toC.id)) fromC.airspaceOpenTo.push(toC.id);
    if (!toC.airspaceOpenTo.includes(fromC.id)) toC.airspaceOpenTo.push(fromC.id);

    addNews(room, {
      agencyFa: 'فرانس‌پرس دیپلماتیک',
      category: 'DIPLOMACY',
      breaking: true,
      headlineFa: `پیمان دفاعی تاریخی میان ${fromC.flag} ${fromC.nameFa} و ${toC.flag} ${toC.nameFa} امضا شد!`,
      bodyFa: 'دو کشور متعهد به همکاری نظامی، گشایش کریدورهای هوایی و انتقال فناوری دفاعی شدند.',
      involvedCountries: [fromC.id, toC.id],
    });
    return { ok: true };
  }

  if (offer.offerType === 'AIRSPACE') {
    if (offer.priceB > 0) {
      if (fromC.treasuryB < offer.priceB) return { ok: false, errorFa: 'بودجه کافی نیست.' };
      fromC.treasuryB -= offer.priceB;
      toC.treasuryB += offer.priceB;
    }
    if (!toC.airspaceOpenTo.includes(fromC.id)) toC.airspaceOpenTo.push(fromC.id);
    toC.airspaceClosedTo = toC.airspaceClosedTo.filter((id) => id !== fromC.id);
    return { ok: true };
  }

  if (offer.offerType === 'LIFT_SANCTION') {
    if (offer.priceB > 0) {
      if (fromC.treasuryB < offer.priceB) return { ok: false, errorFa: 'بودجه کافی نیست.' };
      fromC.treasuryB -= offer.priceB;
      toC.treasuryB += offer.priceB;
    }
    fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
    toC.sanctionedBy = toC.sanctionedBy.filter((id) => id !== fromC.id);
    addNews(room, {
      agencyFa: 'رویترز اقتصادی',
      category: 'DIPLOMACY',
      breaking: false,
      headlineFa: `توافق تنش‌زدایی: تحریم‌های متقابل میان ${fromC.nameFa} و ${toC.nameFa} لغو شد`,
      bodyFa: 'بازارهای مالی از بازگشایی مسیرهای بانکی و تجاری بین دو کشور استقبال کردند.',
      involvedCountries: [fromC.id, toC.id],
    });
    return { ok: true };
  }

  if (offer.offerType === 'WEAPON' && offer.weaponId) {
    const spec = WEAPONS_CATALOG[offer.weaponId];
    if (!spec) return { ok: false, errorFa: 'سلاح یافت نشد.' };
    const qty = Math.max(1, offer.amount || 1);
    const buyer = offer.direction === 'BUY' ? fromC : toC;
    const seller = offer.direction === 'BUY' ? toC : fromC;

    if (buyer.treasuryB < offer.priceB) {
      return { ok: false, errorFa: `خزانه ${buyer.nameFa} بودجه کافی ($${offer.priceB}B) ندارد.` };
    }

    // If seller is indigenous manufacturer, it produces for export (paying manufacturing cost); otherwise transfers from stock
    if (spec.originCountry === seller.id) {
      const mfgCost = Math.round(spec.unitCostB * 0.65 * qty);
      buyer.treasuryB -= offer.priceB;
      seller.treasuryB += offer.priceB - mfgCost;
      buyer.weapons[spec.id] = (buyer.weapons[spec.id] || 0) + qty;
    } else {
      if ((seller.weapons[spec.id] || 0) < qty) {
        return { ok: false, errorFa: `${seller.nameFa} موجودی کافی از این سلاح در انبار خود ندارد.` };
      }
      buyer.treasuryB -= offer.priceB;
      seller.treasuryB += offer.priceB;
      seller.weapons[spec.id] -= qty;
      buyer.weapons[spec.id] = (buyer.weapons[spec.id] || 0) + qty;
    }

    room.visualEvents.push({
      id: uid('vis'),
      round: room.round,
      from: seller.coordinates,
      to: buyer.coordinates,
      fromCountry: seller.id,
      toCountry: buyer.id,
      kind: 'TRADE',
      labelFa: `تحویل ${qty}× ${spec.nameEn}`,
    });

    addNews(room, {
      agencyFa: 'جینز دیفنس (اخبار دفاعی)',
      category: 'DIPLOMACY',
      breaking: offer.priceB >= 40,
      headlineFa: `معامله بزرگ تسلیحاتی: ${seller.flag} ${seller.nameFa} محموله «${spec.nameFa}» به ${buyer.flag} ${buyer.nameFa} تحویل داد`,
      bodyFa: `ارزش این قرارداد دفاعی حدود ${offer.priceB} میلیارد دلار برآورد شده است.`,
      involvedCountries: [seller.id, buyer.id],
    });
    return { ok: true };
  }

  // Resource transfer (OIL, GAS, FOOD, URANIUM)
  const seller = offer.direction === 'SELL' ? fromC : toC;
  const buyer = offer.direction === 'SELL' ? toC : fromC;
  const qty = Math.max(5, offer.amount);

  if (buyer.treasuryB < offer.priceB) {
    return { ok: false, errorFa: `خزانه ${buyer.nameFa} بودجه کافی ندارد.` };
  }

  const getRes = (c: CountryState) =>
    offer.offerType === 'OIL'
      ? c.oilReserve
      : offer.offerType === 'GAS'
      ? c.gasReserve
      : offer.offerType === 'FOOD'
      ? c.foodReserve
      : c.uraniumReserve;

  const addRes = (c: CountryState, delta: number) => {
    if (offer.offerType === 'OIL') c.oilReserve += delta;
    else if (offer.offerType === 'GAS') c.gasReserve += delta;
    else if (offer.offerType === 'FOOD') c.foodReserve += delta;
    else if (offer.offerType === 'URANIUM') c.uraniumReserve += delta;
  };

  if (getRes(seller) < qty) {
    return { ok: false, errorFa: `ذخیره ${seller.nameFa} برای تحویل این محموله کافی نیست.` };
  }

  addRes(seller, -qty);
  addRes(buyer, qty);
  buyer.treasuryB -= offer.priceB;
  seller.treasuryB += offer.priceB;

  const resNameFa =
    offer.offerType === 'OIL'
      ? 'نفت خام'
      : offer.offerType === 'GAS'
      ? 'گاز طبیعی'
      : offer.offerType === 'FOOD'
      ? 'غلات و مواد غذایی'
      : 'اورانیوم';

  room.visualEvents.push({
    id: uid('vis'),
    round: room.round,
    from: seller.coordinates,
    to: buyer.coordinates,
    fromCountry: seller.id,
    toCountry: buyer.id,
    kind: 'TRADE',
    labelFa: `صادرات ${qty} واحد ${resNameFa}`,
  });

  addIntel(
    seller,
    room.round,
    'SUCCESS',
    `قرارداد فروش ${resNameFa} انجام شد`,
    `${qty} واحد ${resNameFa} به ${buyer.nameFa} صادر شد و $${offer.priceB}B به خزانه واریز گردید.`
  );
  addIntel(
    buyer,
    room.round,
    'SUCCESS',
    `محموله وارداتی ${resNameFa} دریافت شد`,
    `${qty} واحد ${resNameFa} از ${seller.nameFa} وارد ذخایر استراتژیک کشور شد.`
  );
  return { ok: true };
}

/**
 * Called when all human players mark ready OR planning timer expires.
 * Runs AI orders, checks early cyber radar blinding, and decides whether a 30s Radar Alert phase triggers!
 */
export function prepareEndOfPlanning(room: GameRoomState): 'RADAR_ALERT' | 'GM_REVIEW' | 'READY_TO_RESOLVE' {
  generateAINationOrders(room);

  // Reset incoming alert flags
  for (const c of Object.values(room.countries)) {
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
  }

  // Pre-evaluate RADAR_BLIND cyber attacks so blinding radar actually suppresses the 30s warning!
  for (const actor of Object.values(room.countries)) {
    for (const ord of actor.orders) {
      if (ord.kind === 'CYBER_ATTACK' && ord.cyberType === 'RADAR_BLIND' && ord.targetCountry) {
        const target = room.countries[ord.targetCountry];
        if (!target) continue;
        const attackRoll = actor.cyberShield * 0.55 + actor.infrastructure.CYBER_HQ * 6 + Math.random() * 28;
        const defenseRoll = target.cyberShield * 0.65 + target.infrastructure.CYBER_HQ * 5;
        if (attackRoll > defenseRoll) {
          target.radarIntegrity = clamp(target.radarIntegrity - 58, 10, 100);
          addIntel(
            actor,
            room.round,
            'SUCCESS',
            `رادارهای ${target.nameFa} با موفقیت کور شد!`,
            'بدافزار جنگ الکترونیک شبکه هشدار سریع هدف را از کار انداخت؛ حملات این ماه بدون هشدار قبلی اصابت خواهند کرد.'
          );
          addIntel(
            target,
            room.round,
            'CRITICAL',
            'اختلال شدید سایبری در شبکه رادار کشور!',
            'بدافزار ناشناس ارتباط بین سایت‌های راداری را قطع کرد؛ دید هشدار سریع به شدت کاهش یافت.'
          );
        } else {
          addIntel(
            actor,
            room.round,
            'WARNING',
            `حمله سایبری به رادار ${target.nameFa} دفع شد`,
            'فایروال پدافندی کشور هدف مانع از نفوذ بدافزار به شبکه رادار شد.'
          );
        }
      }
    }
  }

  // Detect kinetic incoming threats against human-controlled countries whose radar is operational
  let anyHumanAlerted = false;
  for (const actor of Object.values(room.countries)) {
    for (const ord of actor.orders) {
      const isKinetic =
        (ord.kind === 'MILITARY_STRIKE' && ord.targetCountry) ||
        (ord.kind === 'FLIGHT_MISSION' && ord.flightType === 'AIRSTRIKE' && ord.targetCountry);
      if (!isKinetic || !ord.targetCountry) continue;

      const target = room.countries[ord.targetCountry];
      if (!target || target.playerId === null || !target.isOnline) continue;

      // Check radar integrity & stealth evasion
      if (target.radarIntegrity < 45) continue;

      const threatLabel =
        ord.strikeType === 'NUCLEAR_STRIKE'
          ? `🚨 پرتاب کلاهک بالستیک استراتژیک مشکوک به هسته‌ای از مبدا ${actor.nameFa}!`
          : ord.strikeType === 'BALLISTIC_MISSILE'
          ? `🚀 شناسایی شلیک موشک‌های بالستیک/هایپرسونیک از سمت ${actor.nameFa}`
          : ord.strikeType === 'DRONE_SWARM'
          ? `🛸 شناسایی موج بزرگ پهپادهای انتحاری در مرزهای هوایی`
          : ord.flightType === 'AIRSTRIKE'
          ? `✈️ رهگیری راداری پرواز تهاجمی به سمت حریم هوایی کشور`
          : `⚠️ شناسایی عملیات نظامی نزدیک‌شونده علیه زیرساخت‌های کشور`;

      target.incomingAlertActive = true;
      target.incomingThreatsSummaryFa.push(threatLabel);
      anyHumanAlerted = true;
    }
  }

  if (anyHumanAlerted) {
    room.phase = 'RADAR_ALERT';
    room.phaseEndsAt = Date.now() + 30_000;
    return 'RADAR_ALERT';
  }

  if (room.settings.gmMode === 'HUMAN' && room.players.some((p) => p.isGM && p.connected)) {
    room.phase = 'GM_REVIEW';
    room.phaseEndsAt = null;
    return 'GM_REVIEW';
  }

  return 'READY_TO_RESOLVE';
}

export function applyAlertPosture(
  room: GameRoomState,
  countryId: CountryId,
  posture: AlertPosture
): { ok: boolean; errorFa?: string } {
  if (room.phase !== 'RADAR_ALERT') {
    return { ok: false, errorFa: 'فاز واکنش اضطراری رادار به پایان رسیده است.' };
  }
  const c = room.countries[countryId];
  if (!c || !c.incomingAlertActive) {
    return { ok: false, errorFa: 'هشدار راداری فعالی برای کشور شما وجود ندارد.' };
  }

  if (posture === 'MAX_INTERCEPT') {
    if (c.treasuryB < 10) return { ok: false, errorFa: 'حداقل ۱۰ میلیارد دلار برای شلیک حداکثری پدافند نیاز است.' };
    if (c.alertPosture !== 'MAX_INTERCEPT') c.treasuryB -= 10;
    c.alertPosture = 'MAX_INTERCEPT';
    return { ok: true };
  }
  if (posture === 'SCRAMBLE_FIGHTERS') {
    if (c.oilReserve < 10) return { ok: false, errorFa: 'ذخیره سوخت کافی برای بلند کردن فوری جنگنده‌ها نیست.' };
    if (c.alertPosture !== 'SCRAMBLE_FIGHTERS') c.oilReserve -= 8;
    c.alertPosture = 'SCRAMBLE_FIGHTERS';
    return { ok: true };
  }
  if (posture === 'COUNTER_SALVO') {
    if (c.treasuryB < 14) return { ok: false, errorFa: 'حداقل ۱۴ میلیارد دلار برای شلیک فوری متقابل نیاز است.' };
    if (c.alertPosture !== 'COUNTER_SALVO') c.treasuryB -= 14;
    c.alertPosture = 'COUNTER_SALVO';
    return { ok: true };
  }

  c.alertPosture = 'NORMAL';
  return { ok: true };
}

/**
 * Resolves all orders of the current round in realistic geopolitical & military sequence.
 */
export function resolveCurrentRound(room: GameRoomState): void {
  const newVisuals: MapVisualEvent[] = [];
  const counterIntelBoost: Partial<Record<CountryId, number>> = {};
  const saturationPenalty: Partial<Record<CountryId, number>> = {};
  const attackedByMap: Partial<Record<CountryId, CountryId[]>> = {};

  const allOrders: GameOrder[] = [];
  for (const c of Object.values(room.countries)) {
    if (!c.isEliminated) {
      allOrders.push(...c.orders);
    }
  }

  // 1. Domestic Policies, Infrastructure & Weapon Production
  for (const ord of allOrders) {
    const actor = room.countries[ord.actor];
    if (!actor) continue;

    if (ord.kind === 'BUILD_INFRA' && ord.infraType) {
      const spec = INFRASTRUCTURE_CATALOG[ord.infraType];
      actor.infrastructure[ord.infraType] = clamp(actor.infrastructure[ord.infraType] + 1, 0, spec.maxLevel);
      if (ord.infraType === 'POWER_PLANT') actor.powerGrid = clamp(actor.powerGrid + 15, 0, 100);
      if (ord.infraType === 'RADAR_NETWORK') actor.radarIntegrity = clamp(actor.radarIntegrity + 20, 0, 100);
      if (ord.infraType === 'CYBER_HQ') actor.cyberShield = clamp(actor.cyberShield + 8, 0, 98);
      if (ord.infraType === 'WELFARE_HUB') actor.approval = clamp(actor.approval + 8, 0, 100);
      if (ord.infraType === 'NUCLEAR_FACILITY') {
        actor.nuclearProgress = clamp(actor.nuclearProgress + 18, 0, 100);
        actor.uraniumReserve += 15;
        if (actor.nuclearProgress >= 100 && actor.warheads === 0) {
          actor.warheads = 2;
          room.market.globalTension = clamp(room.market.globalTension + 16, 0, 100);
          addNews(room, {
            agencyFa: 'آژانس بین‌المللی انرژی اتمی (فوری)',
            category: 'WAR',
            breaking: true,
            headlineFa: `زلزله ژئوپولیتیک: ${actor.flag} ${actor.nameFa} به بازدارندگی کامل هسته‌ای دست یافت!`,
            bodyFa: 'سنسورهای لرزه‌نگاری جهانی تکمیل چرخه کلاهک استراتژیک این کشور را تایید کردند.',
            involvedCountries: [actor.id],
          });
        }
      }
      addIntel(actor, room.round, 'SUCCESS', `بهره‌برداری از ${spec.nameFa}`, `${spec.effectSummaryFa} وارد مدار کشور شد.`);
    }

    if (ord.kind === 'PRODUCE_WEAPON' && ord.weaponId) {
      const qty = clamp(ord.quantity || 1, 1, 5);
      const spec = WEAPONS_CATALOG[ord.weaponId];
      if (spec) {
        actor.weapons[spec.id] = (actor.weapons[spec.id] || 0) + qty;
        addIntel(
          actor,
          room.round,
          'SUCCESS',
          `تحویل «${spec.nameFa}» به ارتش`,
          `${qty} واحد عملیاتی (${spec.batchLabelFa}) به سازمان رزم کشور ملحق شد.`
        );
      }
    }

    if (ord.kind === 'DOMESTIC_POLICY') {
      if (ord.policyType === 'WELFARE_PACKAGE') {
        actor.approval = clamp(actor.approval + 10, 0, 100);
        addIntel(actor, room.round, 'SUCCESS', 'افزایش رضایت عمومی', 'توزیع بسته رفاهی رضایت مردم را ۱۰٪ افزایش داد.');
      } else if (ord.policyType === 'SECURITY_CRACKDOWN') {
        counterIntelBoost[actor.id] = (counterIntelBoost[actor.id] || 0) + 25;
        actor.approval = clamp(actor.approval - 3, 0, 100);
      } else if (ord.policyType === 'TECH_RND_INVEST') {
        actor.techLevel = clamp(actor.techLevel + 1, 1, 10);
        actor.cyberShield = clamp(actor.cyberShield + 4, 0, 98);
      } else if (ord.policyType === 'NUCLEAR_PROGRAM_PUSH') {
        actor.nuclearProgress = clamp(actor.nuclearProgress + 22, 0, 100);
        room.market.globalTension = clamp(room.market.globalTension + 7, 0, 100);
        if (actor.nuclearProgress >= 100) {
          actor.warheads += 2;
          addNews(room, {
            agencyFa: 'رویترز امنیتی',
            category: 'WAR',
            breaking: true,
            headlineFa: `گسترش زرادخانه اتمی: ${actor.flag} ${actor.nameFa} کلاهک‌های استراتژیک جدید تولید کرد`,
            bodyFa: 'تنش جهانی در پی افزایش ظرفیت بازدارندگی هسته‌ای بالا رفت.',
            involvedCountries: [actor.id],
          });
        }
      } else if (ord.policyType === 'TOGGLE_CHOKEPOINT' && ord.chokepointStatus) {
        const controlled = Object.values(room.chokepoints).find((cp) => cp.controller === actor.id);
        if (controlled) {
          controlled.status = ord.chokepointStatus;
          if (ord.chokepointStatus === 'BLOCKADED') {
            room.market.globalTension = clamp(room.market.globalTension + 15, 0, 100);
            addNews(room, {
              agencyFa: 'بلومبرگ فوری',
              category: 'ECONOMY',
              breaking: true,
              headlineFa: `شوک بزرگ به بازار انرژی: ${actor.flag} ${actor.nameFa} عبور از «${controlled.nameFa}» را مسدود کرد!`,
              bodyFa: controlled.descriptionFa,
              involvedCountries: [actor.id],
            });
          } else {
            addNews(room, {
              agencyFa: 'رویترز دریایی',
              category: 'ECONOMY',
              breaking: false,
              headlineFa: `وضعیت تردد در «${controlled.nameFa}» توسط ${actor.nameFa} به حالت ${
                ord.chokepointStatus === 'OPEN' ? 'آزاد' : 'بازرسی امنیتی'
              } تغییر یافت`,
              bodyFa: 'نفتکش‌ها و کشتی‌های تجاری برنامه حرکتی جدید دریافت کردند.',
              involvedCountries: [actor.id],
            });
          }
        }
      }
    }

    if (ord.kind === 'ESPIONAGE_OP' && ord.espionageType === 'COUNTER_INTEL_SWEEP') {
      counterIntelBoost[actor.id] = (counterIntelBoost[actor.id] || 0) + 30;
      addIntel(
        actor,
        room.round,
        'INFO',
        'گشت سراسری ضدجاسوسی فعال شد',
        `${actor.agencyNameFa} حلقه‌های حفاظتی اطراف دانشمندان و مراکز حساس را تشدید کرد.`
      );
    }
  }

  // 2. Cyber Attacks (except RADAR_BLIND which already ran pre-alert, though we add visual arc)
  for (const ord of allOrders) {
    if (ord.kind !== 'CYBER_ATTACK' || !ord.targetCountry || !ord.cyberType) continue;
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry];
    if (!actor || !target) continue;

    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'CYBER',
      labelFa:
        ord.cyberType === 'STUXNET_SABOTAGE'
          ? 'ویروس صنعتی'
          : ord.cyberType === 'GRID_BLACKOUT'
          ? 'بدافزار قطع برق'
          : ord.cyberType === 'RADAR_BLIND'
          ? 'جمینگ سایبری رادار'
          : 'هک بانک مرکزی',
    });

    if (ord.cyberType === 'RADAR_BLIND') continue; // Already resolved in prepareEndOfPlanning

    const attackScore = actor.cyberShield * 0.6 + actor.infrastructure.CYBER_HQ * 6 + Math.random() * 30;
    const defenseScore = target.cyberShield * 0.65 + target.infrastructure.CYBER_HQ * 5 + 8;
    const succeeded = attackScore >= defenseScore;
    const traced = Math.random() * 100 < target.cyberShield * 0.55;

    if (succeeded) {
      if (ord.cyberType === 'STUXNET_SABOTAGE') {
        target.nuclearProgress = clamp(target.nuclearProgress - 16, 0, 100);
        if (target.infrastructure.REFINERY > 1 && Math.random() < 0.5) {
          target.infrastructure.REFINERY -= 1;
        }
        addIntel(
          actor,
          room.round,
          'SUCCESS',
          `ویروس صنعتی تاسیسات ${target.nameFa} را فلج کرد!`,
          'سانتریفیوژها و کنترلرهای صنعتی هدف دچار خرابی زنجیره‌ای شدند (-۱۶٪ پیشرفت هسته‌ای).'
        );
        addIntel(
          target,
          room.round,
          'CRITICAL',
          'کشف بدافزار پیشرفته در سانتریفیوژها و پالایشگاه‌ها!',
          traced
            ? `ردپای کدهای مخرب به واحد سایبری ${actor.nameFa} رسید!`
            : 'منشا حمله سایبری به دلیل استفاده از سرورهای واسطه مخفی ماند.'
        );
        addNews(room, {
          agencyFa: 'واشنگتن‌پست سایبری',
          category: 'CYBER',
          breaking: true,
          headlineFa: `حمله سایبری بی‌سابقه با بدافزار صنعتی به تاسیسات کلیدی ${target.flag} ${target.nameFa}!`,
          bodyFa: traced
            ? `منابع امنیتی ${target.nameFa} انگشت اتهام را مستقیماً به سوی هکرهای ${actor.nameFa} نشانه رفتند.`
            : 'عامل این حمله پیچیده سایبری هنوز به صورت رسمی شناسایی نشده است.',
          involvedCountries: traced ? [actor.id, target.id] : [target.id],
        });
      } else if (ord.cyberType === 'GRID_BLACKOUT') {
        target.powerGrid = clamp(target.powerGrid - 26, 15, 100);
        target.approval = clamp(target.approval - 9, 0, 100);
        addIntel(actor, room.round, 'SUCCESS', `خاموشی گسترده در شهرهای ${target.nameFa}`, 'شبکه توزیع برق هدف ۲۵٪ سقوط کرد.');
        addIntel(target, room.round, 'CRITICAL', 'خاموشی سراسری بر اثر حمله سایبری به شبکه برق!', 'رضایت مردم کاهش یافت.');
        addNews(room, {
          agencyFa: 'بی‌بی‌سی جهانی',
          category: 'CYBER',
          breaking: true,
          headlineFa: `خاموشی ناگهانی در کلان‌شهرهای ${target.flag} ${target.nameFa} در پی نفوذ بدافزار به شبکه برق`,
          bodyFa: 'بیمارستان‌ها و صنایع به ژنراتورهای اضطراری منتقل شدند.',
          involvedCountries: [target.id],
        });
      } else if (ord.cyberType === 'CENTRAL_BANK_HACK') {
        const stolen = Math.min(target.treasuryB, Math.round(14 + Math.random() * 14));
        target.treasuryB -= stolen;
        actor.treasuryB += Math.round(stolen * 0.75);
        addIntel(
          actor,
          room.round,
          'SUCCESS',
          `سرقت سایبری موفق از شبکه مالی ${target.nameFa}`,
          `$${Math.round(stolen * 0.75)}B از طریق ارزهای دیجیتال ناشناس به خزانه عملیاتی منتقل شد.`
        );
        addIntel(target, room.round, 'WARNING', `اختلال در سوئیفت و بانک مرکزی (-$${stolen}B)`, 'حمله هکری بخشی از ذخایر ارزی را مسدود کرد.');
      }
    } else {
      addIntel(actor, room.round, 'WARNING', `حمله سایبری به ${target.nameFa} توسط فایروال ملی مسدود شد`, 'نفوذ به لایه اصلی ناموفق بود.');
      if (traced) {
        addIntel(target, room.round, 'INFO', `دفع حمله سایبری از مبدا ${actor.nameFa}`, 'قرارگاه سایبری نفوذ را پیش از تخریب خنثی کرد.');
      }
    }
  }

  // 3. Espionage & Targeted Assassinations
  for (const ord of allOrders) {
    if (ord.kind !== 'ESPIONAGE_OP' || !ord.targetCountry || ord.espionageType === 'COUNTER_INTEL_SWEEP') continue;
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry];
    if (!actor || !target || !ord.espionageType) continue;

    const spyPower = actor.intelLevel * 8 + Math.random() * 32;
    const counterPower = target.intelLevel * 6.5 + (counterIntelBoost[target.id] || 0) + 10;
    const succeeded = spyPower >= counterPower;
    const agentsCaptured = !succeeded && counterPower - spyPower > 14;

    if (ord.espionageType === 'DEEP_RECON') {
      if (succeeded) {
        target.knownIntel; // ensure exists
        actor.knownIntel[target.id] = captureSnapshot(room, target);
        addIntel(
          actor,
          room.round,
          'SUCCESS',
          `پرونده فوق‌محرمانه ${target.nameFa} روی میز شما قرار گرفت!`,
          `موجودی خزانه ($${target.treasuryB}B)، کلاهک‌ها (${target.warheads}) و آرایش تسلیحاتی توسط ${actor.agencyCode} کشف شد.`,
          target.id
        );
      } else {
        addIntel(actor, room.round, 'WARNING', `ماموریت شناسایی در ${target.nameFa} ناکام ماند`, 'حلقه امنیتی هدف اجازه دسترسی به اسناد رده‌بالا را نداد.');
      }
    } else if (ord.espionageType === 'ASSASSINATE_SCIENTIST') {
      if (succeeded) {
        target.nuclearProgress = clamp(target.nuclearProgress - 18, 0, 100);
        target.approval = clamp(target.approval - 6, 0, 100);
        room.market.globalTension = clamp(room.market.globalTension + 9, 0, 100);
        addIntel(actor, room.round, 'SUCCESS', `عملیات حذف دانشمند ارشد در ${target.nameFa} انجام شد`, 'پروژه استراتژیک هدف ۱۸٪ به عقب رانده شد.');
        addIntel(target, room.round, 'CRITICAL', 'ترور دانشمند برجسته هسته‌ای/دفاعی در پایتخت!', 'ضربه سنگین به برنامه تحقیقاتی کشور وارد شد.');
        addNews(room, {
          agencyFa: 'الجزیره فوری',
          category: 'ESPIONAGE',
          breaking: true,
          headlineFa: `ترور مرموز دانشمند ارشد استراتژیک در قلب ${target.capitalFa} (${target.flag} ${target.nameFa})!`,
          bodyFa: 'سرویس‌های امنیتی مرزها را بستند و وضعیت فوق‌العاده امنیتی اعلام کردند.',
          involvedCountries: [target.id],
        });
      } else if (agentsCaptured) {
        actor.approval = clamp(actor.approval - 4, 0, 100);
        addNews(room, {
          agencyFa: 'سی‌ان‌ان جهانی',
          category: 'ESPIONAGE',
          breaking: true,
          headlineFa: `رسوایی بزرگ اطلاعاتی: ${target.agencyNameFa} تیم ترور اعزامی ${actor.flag} ${actor.nameFa} را دستگیر کرد!`,
          bodyFa: `انتشار مستندات بازجویی ماموران ${actor.agencyCode} موجی از محکومیت دیپلماتیک ایجاد کرد.`,
          involvedCountries: [actor.id, target.id],
        });
      } else {
        addIntel(actor, room.round, 'WARNING', `تیم عملیاتی در ${target.nameFa} مجبور به لغو ترور و خروج اضطراری شد`, 'حفاظت فیزیکی هدف بسیار سنگین بود.');
      }
    } else if (ord.espionageType === 'ASSASSINATE_COMMANDER') {
      if (succeeded) {
        target.commanderBuff = clamp(target.commanderBuff - 22, -35, 25);
        target.approval = clamp(target.approval - 7, 0, 100);
        room.market.globalTension = clamp(room.market.globalTension + 11, 0, 100);
        addIntel(actor, room.round, 'SUCCESS', `ترور فرمانده ارشد نظامی ${target.nameFa} موفق بود`, 'انسجام فرماندهی ارتش هدف ۲۲٪ تضعیف شد.');
        addNews(room, {
          agencyFa: 'رویترز فوری',
          category: 'ESPIONAGE',
          breaking: true,
          headlineFa: `شوک امنیتی در ${target.flag} ${target.nameFa}: ترور یکی از فرماندهان کلیدی ستاد کل ارتش!`,
          bodyFa: 'زنجیره فرماندهی نظامی این کشور موقتاً دچار اختلال شده است.',
          involvedCountries: [target.id],
        });
      } else if (agentsCaptured) {
        addNews(room, {
          agencyFa: 'تاس / رویترز',
          category: 'ESPIONAGE',
          breaking: true,
          headlineFa: `${target.flag} ${target.nameFa} از متلاشی کردن شبکه ترور وابسته به ${actor.flag} ${actor.nameFa} خبر داد`,
          bodyFa: 'سفیر کشور متهم به وزارت امور خارجه احضار شد.',
          involvedCountries: [actor.id, target.id],
        });
      }
    } else if (ord.espionageType === 'COVERT_SABOTAGE') {
      if (succeeded) {
        target.approval = clamp(target.approval - 12, 0, 100);
        target.oilReserve = Math.max(0, target.oilReserve - 25);
        addIntel(actor, room.round, 'SUCCESS', `خرابکاری مخفی و التهاب داخلی در ${target.nameFa}`, 'رضایت عمومی هدف ۱۲٪ سقوط کرد و به انبار سوخت خسارت وارد شد.');
        addIntel(target, room.round, 'WARNING', 'انفجار مشکوک در انبار سوخت و موج ناآرامی‌های مشکوک!', 'شواهد از مداخله سرویس‌های بیگانه حکایت دارد.');
      }
    }
  }

  // 4. Flights & Airspace Operations (CAP, Recon, Airlift, Airstrike)
  for (const ord of allOrders) {
    if (ord.kind !== 'FLIGHT_MISSION' || !ord.flightType) continue;
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry || ord.actor];
    if (!actor || !target) continue;

    if (ord.flightType === 'CAP_PATROL') {
      actor.commanderBuff = clamp(actor.commanderBuff + 10, -35, 25);
      actor.radarIntegrity = clamp(actor.radarIntegrity + 12, 0, 100);
      continue;
    }

    if (ord.flightType === 'RECON_FLIGHT') {
      newVisuals.push({
        id: uid('vis'),
        round: room.round,
        from: actor.coordinates,
        to: target.coordinates,
        fromCountry: actor.id,
        toCountry: target.id,
        kind: 'RECON',
        labelFa: 'پرواز شناسایی راداری',
      });
      // If airspace closed and target has strong air defense, risk of shootdown!
      const milTarget = computeCountryMilitary(target);
      if (target.airspaceClosedTo.includes(actor.id) && Math.random() * 100 < milTarget.interceptRate * 0.55) {
        addNews(room, {
          agencyFa: 'اسکای‌نیوز فوری',
          category: 'WAR',
          breaking: true,
          headlineFa: `سرنگونی پهپاد شناسایی ${actor.flag} ${actor.nameFa} توسط پدافند هوایی ${target.flag} ${target.nameFa}!`,
          bodyFa: `${target.nameFa} اعلام کرد این پرنده بدون مجوز وارد حریم هوایی بسته شده بود.`,
          involvedCountries: [actor.id, target.id],
        });
      } else {
        actor.knownIntel[target.id] = captureSnapshot(room, target);
        addIntel(
          actor,
          room.round,
          'SUCCESS',
          `تصاویر ماهواره‌ای و هوایی از ${target.nameFa} مخابره شد`,
          'نقشه دقیق پایگاه‌ها، ذخایر و تسلیحات هدف در پنل اطلاعاتی شما باز شد.',
          target.id
        );
      }
      continue;
    }

    if (ord.flightType === 'AIRLIFT') {
      target.oilReserve += 20;
      target.radarIntegrity = clamp(target.radarIntegrity + 15, 0, 100);
      target.commanderBuff = clamp(target.commanderBuff + 12, -35, 25);
      newVisuals.push({
        id: uid('vis'),
        round: room.round,
        from: actor.coordinates,
        to: target.coordinates,
        fromCountry: actor.id,
        toCountry: target.id,
        kind: 'FLIGHT',
        labelFa: 'پل هوایی پشتیبانی نظامی',
      });
      addNews(room, {
        agencyFa: 'رویترز نظامی',
        category: 'DIPLOMACY',
        breaking: false,
        headlineFa: `پل هوایی استراتژیک: هواپیماهای ترابری ${actor.flag} ${actor.nameFa} محموله پدافندی در ${target.flag} ${target.nameFa} تخلیه کردند`,
        bodyFa: 'همکاری لجستیکی دو کشور توان دفاعی مقصد را تقویت کرد.',
        involvedCountries: [actor.id, target.id],
      });
      continue;
    }

    if (ord.flightType === 'AIRSTRIKE') {
      resolveKineticAttack(room, actor, target, 'AIRSTRIKE', ord.targetSector || 'MILITARY_BASES', saturationPenalty, newVisuals);
      attackedByMap[target.id] = [...(attackedByMap[target.id] || []), actor.id];
    }
  }

  // 5. Layered Military Strikes — Drone Swarms run FIRST to saturate enemy air defenses!
  const strikeOrders = allOrders
    .filter((o) => o.kind === 'MILITARY_STRIKE' && o.targetCountry && o.strikeType)
    .sort((a, b) => (a.strikeType === 'DRONE_SWARM' ? -1 : b.strikeType === 'DRONE_SWARM' ? 1 : 0));

  for (const ord of strikeOrders) {
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry!];
    if (!actor || !target || !ord.strikeType) continue;

    resolveKineticAttack(room, actor, target, ord.strikeType, ord.targetSector || 'MILITARY_BASES', saturationPenalty, newVisuals);
    attackedByMap[target.id] = [...(attackedByMap[target.id] || []), actor.id];
  }

  // 5b. Execute Immediate Emergency Counter-Salvos from 30s Radar Alert phase!
  for (const defender of Object.values(room.countries)) {
    if (defender.alertPosture === 'COUNTER_SALVO' && attackedByMap[defender.id]?.length) {
      const primaryAttackerId = attackedByMap[defender.id]![0];
      const attacker = room.countries[primaryAttackerId];
      if (attacker && !attacker.isEliminated) {
        resolveKineticAttack(
          room,
          defender,
          attacker,
          'BALLISTIC_MISSILE',
          'MILITARY_BASES',
          saturationPenalty,
          newVisuals,
          true
        );
      }
    }
  }

  // 6. Finalize Active UN Security Council Resolutions
  for (const res of room.resolutions) {
    if (res.status !== 'ACTIVE') continue;
    castAIVotesOnResolution(room, res);
    if ((res.status as string) === 'VETOED') {
      const vetoer = res.vetoedBy ? room.countries[res.vetoedBy] : null;
      addNews(room, {
        agencyFa: 'شورای امنیت سازمان ملل',
        category: 'DIPLOMACY',
        breaking: true,
        headlineFa: `وتوی قطعنامه در شورای امنیت! ${vetoer?.flag || ''} ${vetoer?.nameFa || ''} قطعنامه علیه ${room.countries[res.target].nameFa} را وتو کرد`,
        bodyFa: res.titleFa,
        involvedCountries: res.vetoedBy ? [res.vetoedBy, res.target] : [res.target],
      });
    } else if (res.votesYes.length > res.votesNo.length) {
      res.status = 'PASSED';
      const targetC = room.countries[res.target];
      if (res.kind === 'GLOBAL_SANCTION' && targetC) {
        for (const voter of res.votesYes.slice(0, 5)) {
          if (!targetC.sanctionedBy.includes(voter)) targetC.sanctionedBy.push(voter);
        }
      } else if (res.kind === 'CEASEFIRE_DEMAND') {
        room.market.globalTension = clamp(room.market.globalTension - 10, 0, 100);
      }
      addNews(room, {
        agencyFa: 'مجمع عمومی سازمان ملل',
        category: 'DIPLOMACY',
        breaking: true,
        headlineFa: `تصویب قطعنامه سازمان ملل با ${res.votesYes.length} رای موافق: ${res.titleFa}`,
        bodyFa: 'مصوبه شورای امنیت بلافاصله لازم‌الاجرا شد.',
        involvedCountries: [res.proposer, res.target],
      });
    } else {
      res.status = 'FAILED';
    }
  }

  // 7. World Market, Chokepoints & Auto World Event
  let targetOilPrice = 80;
  for (const cp of Object.values(room.chokepoints)) {
    if (cp.status === 'BLOCKADED') targetOilPrice += Math.round(cp.oilImpactFactor * 95);
    else if (cp.status === 'RESTRICTED') targetOilPrice += Math.round(cp.oilImpactFactor * 35);
  }
  targetOilPrice += Math.round(room.market.globalTension * 0.45);

  if (room.settings.gmMode === 'AUTO') {
    const ev = REAL_WORLD_EVENTS[(room.round + Math.floor(Math.random() * REAL_WORLD_EVENTS.length)) % REAL_WORLD_EVENTS.length];
    targetOilPrice += ev.oilDeltaUsd;
    room.market.foodPriceIndex = clamp(room.market.foodPriceIndex + ev.foodDelta, 75, 220);
    room.market.globalTension = clamp(room.market.globalTension + ev.tensionDelta, 5, 100);
    addNews(room, {
      agencyFa: ev.agencyFa,
      category: 'WORLD_EVENT',
      breaking: Math.abs(ev.oilDeltaUsd) >= 9,
      headlineFa: ev.headlineFa,
      bodyFa: ev.bodyFa,
      involvedCountries: [],
    });
  }

  room.market.oilPriceUsd = clamp(Math.round(room.market.oilPriceUsd * 0.4 + targetOilPrice * 0.6), 58, 240);
  room.market.gasPriceIndex = clamp(Math.round(85 + (room.market.oilPriceUsd - 70) * 0.9), 75, 250);
  // Natural slight tension decay if peaceful
  if (strikeOrders.length === 0) {
    room.market.globalTension = clamp(room.market.globalTension - 5, 8, 100);
  }

  // 8. Monthly National Economy, Reserves & Public Stability Update
  for (const c of Object.values(room.countries)) {
    if (c.isEliminated) continue;
    const econ = computeEconomyProjection(c, room.market, room.chokepoints);

    c.treasuryB = Math.max(0, c.treasuryB + econ.netIncomeB);
    c.oilReserve += econ.netOil;
    c.gasReserve += econ.netGas;
    c.foodReserve += econ.netFood;

    // Emergency open-market import if reserves hit negative!
    if (c.oilReserve < 0) {
      const emergencyCost = Math.min(c.treasuryB, Math.abs(c.oilReserve) * 0.7);
      c.treasuryB = Math.max(0, c.treasuryB - Math.round(emergencyCost));
      c.oilReserve = 0;
      c.powerGrid = clamp(c.powerGrid - 8, 10, 100);
      c.approval = clamp(c.approval - 7, 0, 100);
      addIntel(c, room.round, 'WARNING', 'بحران کمبود سوخت در کشور!', 'ذخیره نفت به صفر رسید؛ سهمیه‌بندی سوخت باعث نارضایتی عمومی شد.');
    }
    if (c.gasReserve < 0) {
      c.gasReserve = 0;
      c.approval = clamp(c.approval - 5, 0, 100);
    }
    if (c.foodReserve < 0) {
      c.foodReserve = 0;
      c.approval = clamp(c.approval - 9, 0, 100);
      addIntel(c, room.round, 'CRITICAL', 'کمبود شدید مواد غذایی و گرانی کالاهای اساسی!', 'رضایت مردم ۹٪ کاهش یافت.');
    }

    // Gradual recovery of radar, power, and commander buff
    c.radarIntegrity = clamp(c.radarIntegrity + 25, 25, 100);
    c.powerGrid = clamp(c.powerGrid + 4, 15, 100);
    c.commanderBuff = Math.round(c.commanderBuff * 0.4);

    if (c.powerGrid >= 90 && c.foodReserve > 60) {
      c.approval = clamp(c.approval + 2, 0, 100);
    }

    // Check regime collapse if approval hits rock bottom!
    if (c.approval <= 8) {
      c.approval = 42;
      c.treasuryB = Math.round(c.treasuryB * 0.6);
      addNews(room, {
        agencyFa: 'خبرگزاری فوری جهان',
        category: 'WORLD_EVENT',
        breaking: true,
        headlineFa: `انقلاب و سقوط کابینه در ${c.flag} ${c.nameFa} بر اثر بحران شدید داخلی!`,
        bodyFa: 'دولت انتقالی جدید با چالش سنگین بازسازی اقتصادی روبه‌روست.',
        involvedCountries: [c.id],
      });
    }

    // Clear round orders & ready flags
    c.orders = [];
    c.isReady = false;
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
  }

  // Keep latest visual trajectories for map playback!
  room.visualEvents = newVisuals;

  // Advance round or finish campaign
  if (room.round >= room.settings.maxRounds) {
    updateRankingsAndDefcon(room);
    room.phase = 'FINISHED';
    room.phaseEndsAt = null;
    const top = room.rankings[0];
    const winner = room.countries[top.countryId];
    room.winnerSummaryFa = `پایان رقابت جهانی! ${winner.flag} ${winner.nameFa}${
      winner.playerName ? ` (به رهبری ${winner.playerName})` : ''
    } با امتیاز ابرقدرتی ${top.score} جایگاه نخست جهان را فتح کرد!`;
    addNews(room, {
      agencyFa: 'گزارش تاریخ معاصر',
      category: 'WORLD_EVENT',
      breaking: true,
      headlineFa: room.winnerSummaryFa,
      bodyFa: 'موازنه قدرت جهان پس از ماه‌ها رقابت نفس‌گیر اقتصادی، اطلاعاتی و نظامی تثبیت شد.',
      involvedCountries: [winner.id],
    });
    return;
  }

  room.round += 1;
  room.calendarLabelFa = CALENDAR_MONTHS_FA[(room.round - 1) % CALENDAR_MONTHS_FA.length];
  room.phase = 'PLANNING';
  room.phaseEndsAt =
    room.settings.planningTimerSec > 0 ? Date.now() + room.settings.planningTimerSec * 1000 : null;

  updateRankingsAndDefcon(room);
}

function resolveKineticAttack(
  room: GameRoomState,
  actor: CountryState,
  target: CountryState,
  attackKind: string,
  sector: string,
  saturationPenalty: Partial<Record<CountryId, number>>,
  newVisuals: MapVisualEvent[],
  isCounterSalvo = false
): void {
  const atkMil = computeCountryMilitary(actor);
  const defMil = computeCountryMilitary(target);

  // Break alliance & add tension
  actor.allies = actor.allies.filter((id) => id !== target.id);
  target.allies = target.allies.filter((id) => id !== actor.id);
  if (!target.airspaceClosedTo.includes(actor.id)) target.airspaceClosedTo.push(actor.id);

  // Nuclear strike special resolution
  if (attackKind === 'NUCLEAR_STRIKE' && actor.warheads > 0) {
    actor.warheads -= 1;
    room.market.globalTension = 100;
    const intercepted = Math.random() * 100 < Math.max(8, (defMil.interceptRate - (saturationPenalty[target.id] || 0)) * 0.45);

    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'NUCLEAR',
      labelFa: intercepted ? 'رهگیری کلاهک هسته‌ای در لبه جو!' : '☢️ اصابت کلاهک هسته‌ای!',
      intercepted,
    });

    if (intercepted) {
      addNews(room, {
        agencyFa: 'فرماندهی رادار جهانی (فوری)',
        category: 'WAR',
        breaking: true,
        headlineFa: `معجزه پدافندی قرن: سپر ضدبالستیک ${target.flag} ${target.nameFa} کلاهک هسته‌ای شلیک‌شده از ${actor.flag} ${actor.nameFa} را در خارج از جو منهدم کرد!`,
        bodyFa: 'جهان در وضعیت DEFCON 1 قرار گرفت؛ شورای امنیت تشکیل جلسه اضطراری داد.',
        involvedCountries: [actor.id, target.id],
      });
    } else {
      target.gdpB = Math.max(80, Math.round(target.gdpB * 0.58));
      target.powerGrid = clamp(target.powerGrid - 55, 5, 100);
      target.approval = clamp(target.approval - 35, 5, 100);
      target.treasuryB = Math.round(target.treasuryB * 0.55);
      actor.approval = clamp(actor.approval - 14, 5, 100); // Global shock & domestic horror
      // Automatic global sanctions on first nuclear user
      for (const other of Object.values(room.countries)) {
        if (other.id !== actor.id && !other.allies.includes(actor.id) && !actor.sanctionedBy.includes(other.id)) {
          actor.sanctionedBy.push(other.id);
        }
      }
      addNews(room, {
        agencyFa: '🔴 وضعیت اضطراری جهانی (DEFCON 1)',
        category: 'WAR',
        breaking: true,
        headlineFa: `فاجعه اتمی: اصابت کلاهک استراتژیک ${actor.flag} ${actor.nameFa} به خاک ${target.flag} ${target.nameFa} جهان را در بهت فرو برد!`,
        bodyFa: 'خسارات ویرانگر به زیرساخت‌ها و اقتصاد وارد شد و موج تحریم‌های جهانی علیه مهاجم آغاز گردید.',
        involvedCountries: [actor.id, target.id],
      });
    }
    return;
  }

  // Conventional layered warfare
  room.market.globalTension = clamp(room.market.globalTension + 10, 0, 100);

  if (attackKind === 'DRONE_SWARM') {
    saturationPenalty[target.id] = (saturationPenalty[target.id] || 0) + 26;
  }

  const effectiveIntercept = clamp(
    defMil.interceptRate - (saturationPenalty[target.id] || 0) - Math.min(25, atkMil.stealthPower * 2),
    8,
    88
  );

  const penetrationRatio = (100 - effectiveIntercept) / 100;
  const rawPower =
    attackKind === 'DRONE_SWARM'
      ? 22 + (actor.weapons['shahed136'] || 0) * 6
      : attackKind === 'BALLISTIC_MISSILE'
      ? 36 + atkMil.attackScore * 0.14
      : attackKind === 'AIRSTRIKE'
      ? 34 + atkMil.attackScore * 0.15 + atkMil.stealthPower * 1.5
      : attackKind === 'GROUND_OFFENSIVE'
      ? 40 + atkMil.attackScore * 0.18
      : 30 + atkMil.navalPower * 0.2 + atkMil.attackScore * 0.1;

  const damage = Math.round(rawPower * penetrationRatio);
  const heavilyIntercepted = penetrationRatio < 0.34;

  newVisuals.push({
    id: uid('vis'),
    round: room.round,
    from: actor.coordinates,
    to: target.coordinates,
    fromCountry: actor.id,
    toCountry: target.id,
    kind:
      attackKind === 'DRONE_SWARM'
        ? 'DRONE'
        : attackKind === 'AIRSTRIKE'
        ? 'FLIGHT'
        : attackKind === 'NAVAL_STRIKE'
        ? 'NAVAL'
        : 'MISSILE',
    labelFa: isCounterSalvo
      ? 'ضربه متقابل فوری!'
      : attackKind === 'DRONE_SWARM'
      ? 'موج پهپاد انتحاری'
      : attackKind === 'AIRSTRIKE'
      ? 'حمله هوایی'
      : attackKind === 'NAVAL_STRIKE'
      ? 'عملیات دریایی'
      : 'حمله موشکی',
    intercepted: heavilyIntercepted,
  });

  // Apply sector-specific realistic damage
  let damageReportFa = '';
  if (sector === 'REFINERY') {
    const oilLoss = Math.min(target.oilReserve, Math.round(damage * 1.1));
    target.oilReserve -= oilLoss;
    if (damage >= 24 && target.infrastructure.REFINERY > 1) target.infrastructure.REFINERY -= 1;
    damageReportFa = `آتش‌سوزی در پالایشگاه‌ها و از دست رفتن ${oilLoss} واحد ذخیره نفت`;
  } else if (sector === 'POWER_PLANT') {
    const gridDrop = clamp(Math.round(damage * 0.75), 5, 38);
    target.powerGrid = clamp(target.powerGrid - gridDrop, 10, 100);
    target.approval = clamp(target.approval - Math.round(gridDrop * 0.35), 0, 100);
    damageReportFa = `افت ${gridDrop}٪ ظرفیت شبکه برق سراسری`;
  } else if (sector === 'RADAR_NETWORK') {
    const radDrop = clamp(Math.round(damage * 0.9), 8, 50);
    target.radarIntegrity = clamp(target.radarIntegrity - radDrop, 10, 100);
    saturationPenalty[target.id] = (saturationPenalty[target.id] || 0) + 18;
    damageReportFa = `تخریب سایت‌های رادار و افت ${radDrop}٪ پوشش پدافندی`;
  } else if (sector === 'NUCLEAR_FACILITY') {
    const nucDrop = clamp(Math.round(damage * 0.55), 4, 28);
    target.nuclearProgress = clamp(target.nuclearProgress - nucDrop, 0, 100);
    damageReportFa = `آسیب به مجتمع هسته‌ای (-${nucDrop}٪ پیشرفت)`;
  } else {
    // MILITARY_BASES
    const treasuryHit = Math.min(target.treasuryB, Math.round(damage * 0.45));
    target.treasuryB -= treasuryHit;
    target.approval = clamp(target.approval - Math.round(damage * 0.22), 0, 100);
    // Destroy 1 random weapon unit if heavy hit
    const targetWeaponKeys = Object.keys(target.weapons).filter((k) => target.weapons[k] > 0);
    if (damage >= 24 && targetWeaponKeys.length > 0) {
      const wKey = targetWeaponKeys[Math.floor(Math.random() * targetWeaponKeys.length)];
      target.weapons[wKey] -= 1;
      damageReportFa = `انهدام ۱ واحد «${WEAPONS_CATALOG[wKey]?.nameFa || wKey}» و $${treasuryHit}B خسارت نظامی`;
    } else {
      damageReportFa = `$${treasuryHit}B خسارت به پایگاه‌ها و انبارهای مهمات`;
    }
  }

  addIntel(
    actor,
    room.round,
    heavilyIntercepted ? 'WARNING' : 'SUCCESS',
    heavilyIntercepted
      ? `بخش بزرگی از حمله به ${target.nameFa} توسط پدافند رهگیری شد (${effectiveIntercept}٪ رهگیری)`
      : `اصابت موفق به اهداف استراتژیک ${target.nameFa}!`,
    damageReportFa
  );

  addIntel(
    target,
    room.round,
    heavilyIntercepted ? 'INFO' : 'CRITICAL',
    heavilyIntercepted
      ? `پدافند کشور ${effectiveIntercept}٪ پرتابه‌های ${actor.nameFa} را در آسمان شکار کرد!`
      : `اصابت حملات ${actor.nameFa} به خاک کشور!`,
    damageReportFa
  );

  addNews(room, {
    agencyFa: isCounterSalvo ? 'الجزیره فوری' : 'رویترز جنگ و امنیت',
    category: 'WAR',
    breaking: true,
    headlineFa: isCounterSalvo
      ? `پاسخ کوبنده فوری: ${actor.flag} ${actor.nameFa} بلافاصله پایگاه‌های ${target.flag} ${target.nameFa} را هدف موشک قرار داد!`
      : heavilyIntercepted
      ? `نبرد سنگین پدافندی در آسمان ${target.flag} ${target.nameFa}؛ رهگیری گسترده حمله ${actor.flag} ${actor.nameFa}`
      : `انفجارهای مهیب در ${target.flag} ${target.nameFa} در پی حمله نظامی ${actor.flag} ${actor.nameFa}!`,
    bodyFa: `گزارش اولیه میدانی: ${damageReportFa}.`,
    involvedCountries: [actor.id, target.id],
  });
}

/**
 * Enforces strict Fog-of-War & private-message isolation for any non-GM viewer!
 */
export function sanitizeRoomForPlayer(room: GameRoomState, viewerPlayerId: string | null): GameRoomState {
  const player = viewerPlayerId ? room.players.find((p) => p.id === viewerPlayerId) : null;
  const isGodView = Boolean(player?.isGM) || room.phase === 'FINISHED';

  if (isGodView) {
    return room;
  }

  const myCountryId = player?.countryId || null;
  const myCountry = myCountryId ? room.countries[myCountryId] : null;

  const maskedCountries = {} as Record<CountryId, CountryState>;
  for (const [cid, c] of Object.entries(room.countries) as [CountryId, CountryState][]) {
    if (cid === myCountryId) {
      maskedCountries[cid] = c;
      continue;
    }

    const isAlly = Boolean(myCountry?.allies.includes(cid));
    const hasRecentIntel = Boolean(myCountry?.knownIntel[cid]);

    maskedCountries[cid] = {
      ...c,
      // Hide un-scouted rival exact treasury, secret warheads & pending orders!
      treasuryB: isAlly || hasRecentIntel ? c.treasuryB : Math.round(c.treasuryB / 50) * 50,
      warheads: isAlly || hasRecentIntel ? c.warheads : c.nuclearProgress >= 100 ? 1 : 0,
      weapons: isAlly || hasRecentIntel ? c.weapons : {},
      orders: [],
      intelReports: [],
      knownIntel: {},
      incomingThreatsSummaryFa: [],
    };
  }

  const visibleMessages = room.messages.filter((m) => {
    if (m.channel === 'GLOBAL') return true;
    if (!myCountryId) return false;
    return m.fromCountry === myCountryId || m.toCountry === myCountryId;
  });

  const visibleTrades = room.trades.filter((t) => {
    if (!myCountryId) return false;
    return t.from === myCountryId || t.to === myCountryId;
  });

  return {
    ...room,
    countries: maskedCountries,
    messages: visibleMessages,
    trades: visibleTrades,
  };
}
