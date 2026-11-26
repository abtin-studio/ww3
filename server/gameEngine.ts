import {
  computeCountryMilitary,
  computeEconomyProjection,
  evaluateCovertOpDetails,
  evaluateMilitaryOpDetails,
  estimateMinorOpSuccessPct,
  getEmergencyActionCost,
  getGlobalSpotPrices,
  getIndigenousOrAllyWeaponCost,
  getInfraNextCost,
  getMaxBuildsPerRound,
  getUpgradeNextCost,
} from '../shared/advisor.js';
import {
  createInitialCoalitions,
  createInitialCountries,
  createInitialMinorNations,
  getCalendarLabelFa,
  INFRASTRUCTURE_CATALOG,
  INITIAL_CHOKEPOINTS,
  REAL_WORLD_EVENTS,
  UPGRADE_TRACKS,
  WEAPONS_CATALOG,
} from '../shared/realWorldData.js';
import {
  AlertPosture,
  BattleOutcomeLog,
  ChokepointStatus,
  CountryId,
  CountryState,
  CovertOpType,
  DefconLevel,
  EmergencyActionKind,
  GameOrder,
  GameRoomState,
  GameSettings,
  InfrastructureType,
  IntelReport,
  MapVisualEvent,
  MilitaryOpType,
  MinorNationOpType,
  NewsItem,
  ResolutionKind,
  RevealedSnapshot,
  RoundSummaryForCountry,
  StrikeTargetSector,
  TradeOffer,
  UNResolution,
  UpgradeTrack,
} from '../shared/types.js';
import { castAIVotesOnResolution, runLivingWorldAITurn } from './aiNations.js';

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
  const minorNations = createInitialMinorNations();
  const coalitions = createInitialCoalitions();
  const chokepoints = JSON.parse(JSON.stringify(INITIAL_CHOKEPOINTS));
  const cal = getCalendarLabelFa(1);

  const room: GameRoomState = {
    schemaVersion: 3,
    roomCode,
    roomName: roomName || `اتاق جنگ ${roomCode}`,
    createdAt: Date.now(),
    phase: 'LOBBY',
    round: 1,
    calendarLabelFa: cal,
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
    minorNations,
    coalitions,
    chokepoints,
    market: {
      oilPriceUsd: 82,
      gasPriceIndex: 100,
      foodPriceIndex: 100,
      globalTension: 20,
    },
    news: [
      {
        id: uid('news'),
        round: 1,
        monthLabelFa: cal,
        timestamp: Date.now(),
        agencyFa: 'رویترز جهانی / شورای امنیت سازمان ملل',
        category: 'WORLD_EVENT',
        breaking: true,
        headlineFa: `آغاز کارزار بزرگ جهانی (${settings.difficulty === 'EXTREME' ? 'درجه سختی فوق‌سنگین' : settings.difficulty === 'HARD' ? 'درجه سختی چالشی' : 'متعادل'})؛ ۱۹۵ کشور روی نقشه زنده شدند`,
        bodyFa:
          'تمامی ۲۰ قدرت بزرگ و بیش از ۱۵۵ کشور مستقل جهان در وضعیت فعال قرار گرفتند. بورس جهانی نفت با نرخ ۸۲ دلار بازگشایی شد و سامانه‌های اطلاعاتی، هوافضا، دریایی و زمینی آماده دریافت فرامین هستند.',
        involvedCountries: [],
      },
    ],
    battles: [],
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
  if (t >= 84) defcon = 1;
  else if (t >= 66) defcon = 2;
  else if (t >= 46) defcon = 3;
  else if (t >= 28) defcon = 4;
  room.defcon = defcon;

  const annexedCountByCountry: Partial<Record<CountryId, number>> = {};
  for (const m of Object.values(room.minorNations)) {
    if (m.conqueredBy) {
      annexedCountByCountry[m.conqueredBy] = (annexedCountByCountry[m.conqueredBy] || 0) + 1;
    }
  }
  for (const c of Object.values(room.countries)) {
    if (c.conqueredBy) {
      annexedCountByCountry[c.conqueredBy] = (annexedCountByCountry[c.conqueredBy] || 0) + 2;
    }
  }

  const list = Object.values(room.countries).map((c) => {
    const mil = computeCountryMilitary(c);
    const upgradeSum = Object.values(c.upgrades).reduce((a, b) => a + b, 0);
    const territoriesCount = annexedCountByCountry[c.id] || 0;

    const economicScore = Math.round(
      c.treasuryB * 0.42 +
        c.gdpB * 0.24 +
        (c.oilReserve + c.gasReserve + c.foodReserve) * 0.14 +
        Object.values(c.infrastructure).reduce((a, b) => a + b, 0) * 11 +
        territoriesCount * 38
    );
    const militaryScore = Math.round(
      mil.attackScore * 0.52 + mil.defenseScore * 0.45 + c.warheads * 18 + upgradeSum * 11
    );
    const stabilityScore = Math.round(
      c.approval * 2.1 + c.powerGrid * 1.0 + c.integrityPct * 0.9 - c.devastation * 1.6
    );
    const influenceScore = Math.round(
      c.allies.length * 24 +
        territoriesCount * 28 +
        c.upgrades.INTELLIGENCE * 14 +
        c.upgrades.CYBER_AI * 14 -
        c.sanctionedBy.length * 11
    );

    const score = c.isEliminated
      ? 0
      : Math.max(10, economicScore + militaryScore + stabilityScore + influenceScore);

    return {
      countryId: c.id,
      score,
      economicScore,
      militaryScore,
      stabilityScore: Math.max(0, stabilityScore),
      influenceScore,
      territoriesCount,
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
  if (country.intelReports.length > 40) {
    country.intelReports.length = 40;
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
  if (room.news.length > 90) {
    room.news.length = 90;
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
    devastation: target.devastation,
    integrityPct: target.integrityPct,
    militaryPowerScore: mil.attackScore + mil.defenseScore,
    topWeapons,
  };
}

function damageCountryInfra(
  target: CountryState,
  preferred: InfrastructureType[],
  amount = 1
): string[] {
  const damagedNames: string[] = [];
  for (let i = 0; i < amount; i++) {
    const availPref = preferred.filter((t) => target.infrastructure[t] > 0);
    const fallback = (Object.keys(INFRASTRUCTURE_CATALOG) as InfrastructureType[]).filter(
      (t) => target.infrastructure[t] > 0
    );
    const pool = availPref.length > 0 ? availPref : fallback;
    if (pool.length === 0) break;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    target.infrastructure[picked] -= 1;
    target.damagedInfra[picked] = (target.damagedInfra[picked] || 0) + 1;
    damagedNames.push(INFRASTRUCTURE_CATALOG[picked].nameFa);
  }
  return damagedNames;
}

function eliminateCollapsedCountry(
  room: GameRoomState,
  target: CountryState,
  reasonFa: string,
  conqueror: CountryState | null,
  worldHighlightsFa: string[]
): void {
  if (target.isEliminated) return;
  target.isEliminated = true;
  target.eliminatedRound = room.round;
  target.eliminatedReasonFa = reasonFa;
  target.conqueredBy = conqueror ? conqueror.id : null;
  target.orders = [];
  target.isReady = false;
  target.incomingAlertActive = false;
  target.incomingThreatsSummaryFa = [];

  if (conqueror && !conqueror.isEliminated) {
    const seizedCash = Math.round(target.treasuryB * 0.55);
    const seizedOil = Math.round(target.oilReserve * 0.5);
    target.treasuryB -= seizedCash;
    target.oilReserve -= seizedOil;
    conqueror.treasuryB += seizedCash;
    conqueror.oilReserve += seizedOil;
    conqueror.gdpB += Math.round(target.gdpB * 0.25);

    // Transfer minor territories held by the defeated power
    for (const m of Object.values(room.minorNations)) {
      if (m.conqueredBy === target.id) {
        m.conqueredBy = conqueror.id;
      }
    }
  }

  // Reassign any chokepoint controlled by an eliminated state to conqueror or OPEN international control
  for (const cp of Object.values(room.chokepoints)) {
    if (cp.controller === target.id) {
      if (conqueror) {
        cp.controller = conqueror.id;
      } else {
        cp.status = 'OPEN';
      }
    }
  }

  const headline = conqueror
    ? `🏴 سقوط تاریخی پایتخت ${target.nameFa}! ارتش ${conqueror.nameFa} خاک این کشور را ضمیمه کرد و دولت آن از رقابت حذف شد!`
    : `🔥 فروپاشی کامل کابینه و سقوط دولت در ${target.nameFa}! این کشور از صحنه رقابت جهانی حذف شد!`;

  worldHighlightsFa.push(headline);
  addNews(room, {
    agencyFa: 'خبرگزاری فوری رویترز / الجزیره (فوق‌العاده)',
    category: 'WAR',
    breaking: true,
    headlineFa: headline,
    bodyFa: reasonFa,
    involvedCountries: conqueror ? [conqueror.id, target.id] : [target.id],
  });
}

// ============================================================================
// INSTANT ECONOMIC, DOCTRINE, RECONSTRUCTION, DIPLOMACY & COALITION ACTIONS
// ============================================================================

export function instantUpgradeTrack(
  room: GameRoomState,
  countryId: CountryId,
  track: UpgradeTrack
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const spec = UPGRADE_TRACKS[track];
  if (!c || c.isEliminated || !spec) return { ok: false, errorFa: 'کشور یا دکترین نامعتبر است.' };
  if (room.phase !== 'PLANNING') return { ok: false, errorFa: 'ارتقا فقط در فاز برنامه‌ریزی ماه مجاز است.' };

  if (c.upgradesUsedThisRound >= 1) {
    return {
      ok: false,
      errorFa: 'ظرفیت پژوهش ملی این ماه تکمیل شده است (حداکثر ۱ جهش دکترین در هر ماه). در ماه بعد ادامه دهید!',
    };
  }

  const cur = c.upgrades[track] || 0;
  if (cur >= spec.maxLevel) {
    return { ok: false, errorFa: `${spec.nameFa} به سقف نهایی (سطح ${spec.maxLevel}) رسیده است!` };
  }
  const cost = getUpgradeNextCost(c, track, room.settings.difficulty);
  if (c.treasuryB < cost) {
    return { ok: false, errorFa: `بودجه کافی نیست! نیاز به $${cost}B دارید (موجودی: $${c.treasuryB}B).` };
  }

  c.treasuryB -= cost;
  c.upgradesUsedThisRound += 1;
  const nextLv = cur + 1;
  c.upgrades[track] = nextLv;

  if (track === 'CYBER_AI') c.cyberShield = clamp(c.cyberShield + 5, 0, 99);
  if (track === 'INTELLIGENCE') c.intelLevel = clamp(c.intelLevel + 1, 1, 12);
  if (track === 'AEROSPACE') c.techLevel = clamp(c.techLevel + 1, 1, 12);
  if (track === 'INDUSTRY') c.gdpB += 32;
  if (track === 'NUCLEAR') {
    c.nuclearProgress = clamp(nextLv * 20, c.nuclearProgress, 100);
    if (nextLv === 3) {
      c.powerGrid = clamp(c.powerGrid + 16, 0, 100);
    }
    if (nextLv === 5 || nextLv === 7 || nextLv === 9 || nextLv === 10) {
      c.nuclearProgress = 100;
      c.warheads += 2;
      room.market.globalTension = clamp(room.market.globalTension + 10, 0, 100);
      addNews(room, {
        agencyFa: 'آژانس بین‌المللی انرژی اتمی (IAEA)',
        category: 'WAR',
        breaking: nextLv === 5,
        headlineFa:
          nextLv === 5
            ? `جهش استراتژیک اتمی: ${c.nameFa} به کلاهک هسته‌ای عملیاتی دست یافت!`
            : `ارتقای زرادخانه استراتژیک ${c.nameFa} به سطح ${nextLv} (+۲ کلاهک جدید)`,
        bodyFa: 'سنسورهای لرزه‌نگاری و گزارش‌های بازرسان بین‌المللی توسعه کلاهک‌های جدید را تایید کردند.',
        involvedCountries: [c.id],
      });
    }
  }

  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `⭐ «${spec.nameFa}» به سطح ${nextLv}/${spec.maxLevel} ارتقا یافت!`,
  };
}

export function instantBuildInfra(
  room: GameRoomState,
  countryId: CountryId,
  infraType: InfrastructureType
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const spec = INFRASTRUCTURE_CATALOG[infraType];
  if (!c || c.isEliminated || !spec) return { ok: false, errorFa: 'زیرساخت نامعتبر است.' };
  if (room.phase !== 'PLANNING') return { ok: false, errorFa: 'ساخت‌وساز فقط در فاز برنامه‌ریزی مجاز است.' };

  const maxBuilds = getMaxBuildsPerRound(c);
  if (c.buildsUsedThisRound >= maxBuilds) {
    return {
      ok: false,
      errorFa: `ظرفیت عمرانی این ماه پر شده (${maxBuilds}/${maxBuilds}). با ارتقای «ابرصنعت» ظرفیت ماهانه را بیشتر کنید یا در ماه بعد بسازید!`,
    };
  }

  const costInfo = getInfraNextCost(c, infraType, room.settings.difficulty);
  if (!costInfo.isRebuild && c.infrastructure[infraType] >= spec.maxLevel) {
    return {
      ok: false,
      errorFa: 'این زیرساخت در سقف سطح قرار دارد؛ برای ترمیم خسارات جنگ از دکمه‌های «بازسازی اضطراری» استفاده کنید.',
    };
  }
  if (c.treasuryB < costInfo.costB) {
    return { ok: false, errorFa: `بودجه کافی نیست ($${costInfo.costB}B مورد نیاز است).` };
  }

  c.treasuryB -= costInfo.costB;
  c.buildsUsedThisRound += 1;
  if (costInfo.isRebuild && c.damagedInfra[infraType] > 0) {
    c.damagedInfra[infraType] -= 1;
    c.devastation = clamp(c.devastation - 9, 0, 100);
  }
  c.infrastructure[infraType] += 1;

  if (infraType === 'POWER_PLANT') c.powerGrid = clamp(c.powerGrid + 16, 0, 100);
  if (infraType === 'WELFARE_HUB') {
    c.approval = clamp(c.approval + 9, 0, 100);
    c.devastation = clamp(c.devastation - 8, 0, 100);
    c.foodReserve += 20;
  }
  if (infraType === 'RADAR_NETWORK') c.radarIntegrity = 100;
  if (infraType === 'CYBER_HQ') c.cyberShield = clamp(c.cyberShield + 8, 0, 99);
  if (infraType === 'REFINERY') {
    c.oilReserve += 20;
    c.gasReserve += 15;
  }
  if (infraType === 'NUCLEAR_FACILITY') {
    c.nuclearProgress = clamp(c.nuclearProgress + 18, 0, 100);
    c.uraniumReserve += 15;
    if (c.nuclearProgress >= 100 && c.warheads === 0 && c.upgrades.NUCLEAR >= 4) {
      c.warheads = 2;
      c.upgrades.NUCLEAR = Math.max(5, c.upgrades.NUCLEAR);
    }
  }

  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: costInfo.isRebuild
      ? `🔧 ویرانه‌های «${spec.nameFa}» با موفقیت بازسازی شد (سطح ${c.infrastructure[infraType]})!`
      : `🏗️ «${spec.nameFa}» احداث شد و به سطح ${c.infrastructure[infraType]} رسید!`,
  };
}

export function instantEmergencyAction(
  room: GameRoomState,
  countryId: CountryId,
  kind: EmergencyActionKind
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  if (!c || c.isEliminated) return { ok: false, errorFa: 'کشور غیرفعال است.' };
  const cost = getEmergencyActionCost(c, kind);
  if (c.treasuryB < cost) {
    return { ok: false, errorFa: `بودجه کافی برای عملیات بازسازی اضطراری نیست ($${cost}B لازم است).` };
  }

  c.treasuryB -= cost;
  if (kind === 'REPAIR_GRID') {
    c.powerGrid = clamp(c.powerGrid + 24, 0, 100);
    c.devastation = clamp(c.devastation - 14, 0, 100);
    updateRankingsAndDefcon(room);
    return { ok: true, messageFa: `⚡ شبکه برق سراسری +۲۴٪ ترمیم شد و ویرانی کاهش یافت!` };
  }
  if (kind === 'REPAIR_RADAR_CYBER') {
    c.radarIntegrity = clamp(c.radarIntegrity + 45, 0, 100);
    c.cyberShield = clamp(c.cyberShield + 12, 0, 99);
    c.securityAlertBonus = clamp(c.securityAlertBonus + 10, 0, 28);
    updateRankingsAndDefcon(room);
    return { ok: true, messageFa: `📡 رادارها، سپر سایبری و تور ضدجاسوسی کشور بازسازی و تقویت شدند!` };
  }

  // NATIONAL_RELIEF
  c.approval = clamp(c.approval + 14, 0, 100);
  c.devastation = clamp(c.devastation - 20, 0, 100);
  c.regimeCrisisStreak = 0;
  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `🏥 بسته امداد و بازسازی ملی اجرا شد (+۱۴٪ رضایت مردم و -۲۰٪ بحران ویرانی)!`,
  };
}

export function instantProduceWeapon(
  room: GameRoomState,
  countryId: CountryId,
  weaponId: string,
  qty = 1
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const spec = WEAPONS_CATALOG[weaponId];
  if (!c || c.isEliminated || !spec) return { ok: false, errorFa: 'تسلیحات نامعتبر است.' };

  const count = clamp(qty, 1, 5);
  const access = getIndigenousOrAllyWeaponCost(c, weaponId, room.settings.difficulty);
  if (!access.canBuildDirectly) {
    return {
      ok: false,
      errorFa: 'این سامانه بومی یا تحت لیسانس متحدان شما نیست؛ از دکمه سفارش خرید از کشور سازنده استفاده کنید.',
    };
  }
  if (access.lockedReasonFa) {
    return { ok: false, errorFa: `پیش‌نیاز فناوری: ${access.lockedReasonFa}` };
  }

  const totalCost = access.finalCostB * count;
  if (c.treasuryB < totalCost) {
    return { ok: false, errorFa: `بودجه کافی نیست! نیاز به $${totalCost}B دارید.` };
  }

  c.treasuryB -= totalCost;
  c.weapons[weaponId] = (c.weapons[weaponId] || 0) + count;
  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `🎖️ ${count}× «${spec.nameFa}» وارد سازمان رزم کشور شما شد!`,
  };
}

export function instantSpotTrade(
  room: GameRoomState,
  countryId: CountryId,
  resource: 'OIL' | 'GAS' | 'FOOD' | 'URANIUM',
  mode: 'BUY' | 'SELL'
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  if (!c || c.isEliminated) return { ok: false, errorFa: 'کشور غیرفعال است.' };
  const spot = getGlobalSpotPrices(room.market);
  const sanctionDiscount = c.sanctionedBy.length > 0 ? 0.88 : 1;

  if (mode === 'BUY') {
    const cost =
      resource === 'OIL'
        ? spot.oilBuy50B
        : resource === 'GAS'
        ? spot.gasBuy50B
        : resource === 'FOOD'
        ? spot.foodBuy50B
        : spot.uraniumBuy20B;
    const qty = resource === 'URANIUM' ? 20 : 50;

    if (c.treasuryB < cost) {
      return { ok: false, errorFa: `بودجه خزانه کافی نیست ($${cost}B لازم است).` };
    }
    c.treasuryB -= cost;
    if (resource === 'OIL') c.oilReserve += qty;
    else if (resource === 'GAS') c.gasReserve += qty;
    else if (resource === 'FOOD') c.foodReserve += qty;
    else c.uraniumReserve += qty;

    updateRankingsAndDefcon(room);
    return { ok: true, messageFa: `🛒 +${qty} واحد از بورس جهانی خریداری شد (-$${cost}B)` };
  } else {
    if (resource === 'URANIUM') {
      return { ok: false, errorFa: 'فروش اورانیوم در بورس آزاد مجاز نیست؛ از قرارداد دوجانبه استفاده کنید.' };
    }
    const qty = 50;
    const rawGain =
      resource === 'OIL' ? spot.oilSell50B : resource === 'GAS' ? spot.gasSell50B : spot.foodSell50B;
    const gain = Math.max(8, Math.round(rawGain * sanctionDiscount));

    if (resource === 'OIL') {
      if (c.oilReserve < qty) return { ok: false, errorFa: 'حداقل ۵۰ واحد نفت در انبار نیاز دارید.' };
      c.oilReserve -= qty;
    } else if (resource === 'GAS') {
      if (c.gasReserve < qty) return { ok: false, errorFa: 'حداقل ۵۰ واحد گاز در انبار نیاز دارید.' };
      c.gasReserve -= qty;
    } else {
      if (c.foodReserve < qty) return { ok: false, errorFa: 'حداقل ۵۰ واحد غلات در انبار نیاز دارید.' };
      c.foodReserve -= qty;
    }

    c.treasuryB += gain;
    updateRankingsAndDefcon(room);
    return { ok: true, messageFa: `💰 ۵۰ واحد در بورس جهانی فروخته شد و +$${gain}B نقد به خزانه آمد!` };
  }
}

export function instantSetChokepoint(
  room: GameRoomState,
  countryId: CountryId,
  status: ChokepointStatus
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const cp = Object.values(room.chokepoints).find((x) => x.controller === countryId);
  if (!cp) return { ok: false, errorFa: 'کشور شما کنترل تنگه استراتژیک ندارد.' };
  if (cp.status === status) return { ok: true, messageFa: 'وضعیت تنگه بدون تغییر ماند.' };

  cp.status = status;
  const actor = room.countries[countryId];
  if (status === 'BLOCKADED') {
    room.market.oilPriceUsd = clamp(room.market.oilPriceUsd + Math.round(cp.oilImpactFactor * 55), 60, 245);
    room.market.foodPriceIndex = clamp(room.market.foodPriceIndex + 8, 75, 230);
    room.market.globalTension = clamp(room.market.globalTension + 15, 0, 100);
    addNews(room, {
      agencyFa: 'بلومبرگ فوری / رویترز انرژی',
      category: 'ECONOMY',
      breaking: true,
      headlineFa: `شوک بزرگ انرژی! ناوگان دریایی ${actor.nameFa} «${cp.nameFa}» را مسدود کرد (نفت: $${room.market.oilPriceUsd})`,
      bodyFa: `${cp.descriptionFa} بهای جهانی نفت و بیمه کشتیرانی بلافاصله جهش یافت.`,
      involvedCountries: [countryId],
    });
  } else if (status === 'RESTRICTED') {
    room.market.oilPriceUsd = clamp(room.market.oilPriceUsd + 10, 60, 240);
    addNews(room, {
      agencyFa: 'رویترز دریایی',
      category: 'ECONOMY',
      breaking: false,
      headlineFa: `برقراری ایست بازرسی نظامی توسط ${actor.nameFa} در «${cp.nameFa}»`,
      bodyFa: 'عبور نفتکش‌ها تحت کنترل امنیتی قرار گرفت و نرخ جهانی انرژی افزایش یافت.',
      involvedCountries: [countryId],
    });
  } else {
    room.market.oilPriceUsd = clamp(room.market.oilPriceUsd - 14, 65, 240);
    addNews(room, {
      agencyFa: 'رویترز انرژی',
      category: 'ECONOMY',
      breaking: false,
      headlineFa: `بازگشایی کامل مسیر کشتیرانی بین‌المللی در «${cp.nameFa}» توسط ${actor.nameFa}`,
      bodyFa: 'فشار تورمی از بازار جهانی انرژی و کالا کاسته شد.',
      involvedCountries: [countryId],
    });
  }

  updateRankingsAndDefcon(room);
  return { ok: true, messageFa: `وضعیت «${cp.nameFa}» بروزرسانی شد.` };
}

export function instantMinorDiplomacyPact(
  room: GameRoomState,
  countryId: CountryId,
  minorId: string
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const actor = room.countries[countryId];
  const minor = room.minorNations[minorId];
  if (!actor || actor.isEliminated || !minor) {
    return { ok: false, errorFa: 'کشور هدف یافت نشد.' };
  }
  if (minor.conqueredBy) {
    return {
      ok: false,
      errorFa: `خاک ${minor.nameFa} در اشغال نظامی است؛ برای آزادسازی یا تصرف از عملیات نظامی/کودتا استفاده کنید.`,
    };
  }
  if (minor.alignedWith === actor.id) {
    return { ok: false, errorFa: `${minor.nameFa} هم‌اکنون متحد و پایگاه برون‌مرزی شماست.` };
  }

  const costB = Math.max(16, Math.round(minor.gdpB * 0.085));
  if (actor.treasuryB < costB) {
    return { ok: false, errorFa: `بودجه کافی نیست ($${costB}B سرمایه‌گذاری دیپلماتیک لازم است).` };
  }

  actor.treasuryB -= costB;
  minor.alignedWith = actor.id;
  addNews(room, {
    agencyFa: 'فرانس‌پرس دیپلماتیک',
    category: 'DIPLOMACY',
    breaking: false,
    headlineFa: `امضای پیمان همکاری اقتصادی و پایگاه لجستیکی میان ${actor.nameFa} و ${minor.nameFa}`,
    bodyFa: `${minor.nameFa} به جرگه شرکای راهبردی ${actor.nameFa} پیوست.`,
    involvedCountries: [actor.id],
  });
  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `🤝 پیمان نفوذ و پایگاه برون‌مرزی با «${minor.nameFa}» امضا شد!`,
  };
}

export function createCoalition(
  room: GameRoomState,
  leaderId: CountryId,
  nameFa: string
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const leader = room.countries[leaderId];
  if (!leader || leader.isEliminated) return { ok: false, errorFa: 'کشور نامعتبر است.' };
  const cleanName = nameFa.trim().slice(0, 36);
  if (cleanName.length < 3) return { ok: false, errorFa: 'نام ائتلاف باید حداقل ۳ حرف باشد.' };
  if (leader.treasuryB < 25) return { ok: false, errorFa: 'تاسیس دبیرخانه ائتلاف جدید $25B هزینه دارد.' };

  // Remove from old coalition if any
  if (leader.coalitionId && room.coalitions[leader.coalitionId]) {
    room.coalitions[leader.coalitionId].members = room.coalitions[leader.coalitionId].members.filter(
      (m) => m !== leaderId
    );
  }

  leader.treasuryB -= 25;
  const cid = uid('coal');
  room.coalitions[cid] = {
    id: cid,
    nameFa: cleanName,
    leader: leaderId,
    members: [leaderId],
    createdRound: room.round,
  };
  leader.coalitionId = cid;

  addNews(room, {
    agencyFa: 'آسوشیتدپرس (دیپلماسی جهانی)',
    category: 'DIPLOMACY',
    breaking: true,
    headlineFa: `اعلام موجودیت ائتلاف جدید جهانی: «${cleanName}» به رهبری ${leader.nameFa}!`,
    bodyFa: 'سایر کشورها می‌توانند از پنل دیپلماسی به این پیمان مشترک بپیوندند.',
    involvedCountries: [leaderId],
  });
  updateRankingsAndDefcon(room);
  return { ok: true, messageFa: `🛡️ ائتلاف «${cleanName}» رسماً تاسیس شد!` };
}

export function joinCoalition(
  room: GameRoomState,
  countryId: CountryId,
  coalitionId: string
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const coal = room.coalitions[coalitionId];
  if (!c || c.isEliminated || !coal) return { ok: false, errorFa: 'ائتلاف یافت نشد.' };
  if (coal.members.includes(countryId)) return { ok: true, messageFa: 'شما عضو این ائتلاف هستید.' };

  const leader = room.countries[coal.leader];
  if (leader && (leader.sanctionedBy.includes(countryId) || c.sanctionedBy.includes(leader.id))) {
    return {
      ok: false,
      errorFa: `به علت تحریم متقابل با رهبر ائتلاف (${leader.nameFa}) امکان عضویت وجود ندارد.`,
    };
  }

  if (c.coalitionId && room.coalitions[c.coalitionId]) {
    room.coalitions[c.coalitionId].members = room.coalitions[c.coalitionId].members.filter(
      (m) => m !== countryId
    );
  }

  coal.members.push(countryId);
  c.coalitionId = coalitionId;
  for (const memberId of coal.members) {
    if (memberId === countryId) continue;
    const mem = room.countries[memberId];
    if (mem && !mem.isEliminated) {
      if (!c.allies.includes(memberId)) c.allies.push(memberId);
      if (!mem.allies.includes(countryId)) mem.allies.push(countryId);
    }
  }

  addNews(room, {
    agencyFa: 'رویترز دیپلماتیک',
    category: 'DIPLOMACY',
    breaking: false,
    headlineFa: `پیوستن رسمی ${c.nameFa} به ائتلاف «${coal.nameFa}»`,
    bodyFa: 'همکاری دفاعی، اطلاعاتی و تولید تسلیحات تحت لیسانس میان اعضا برقرار شد.',
    involvedCountries: [countryId, coal.leader],
  });
  updateRankingsAndDefcon(room);
  return { ok: true, messageFa: `🤝 کشور شما رسماً عضو «${coal.nameFa}» شد!` };
}

export function createResolutionSpec(
  proposer: CountryState,
  target: CountryState,
  kind: ResolutionKind
): Pick<UNResolution, 'committeeFa' | 'titleFa' | 'effectSummaryFa'> {
  switch (kind) {
    case 'GLOBAL_SANCTION':
      return {
        committeeFa: 'شورای امنیت سازمان ملل',
        titleFa: `قطعنامه تحریم اقتصادی فراگیر علیه ${target.nameFa}`,
        effectSummaryFa: 'اعمال تحریم چندجانبه بانکی و تجاری علیه کشور هدف (قابل وتو توسط ۵ عضو دائم).',
      };
    case 'CONDEMN_AGGRESSION':
      return {
        committeeFa: 'مجمع عمومی سازمان ملل',
        titleFa: `قطعنامه محکومیت تجاوز نظامی و نقض منشور ملل توسط ${target.nameFa}`,
        effectSummaryFa: 'کاهش ۱۰٪ مشروعیت و رضایت بین‌المللی کشور هدف.',
      };
    case 'CEASEFIRE_DEMAND':
      return {
        committeeFa: 'کمیته عالی صلح و امنیت ژنو',
        titleFa: `نشست فوری آتش‌بس و کاهش تنش با محوریت ${target.nameFa}`,
        effectSummaryFa: 'کاهش ۱۸ واحدی تنش جهانی و بهبود ثبات بازارها.',
      };
    case 'OPEC_OIL_CUT':
      return {
        committeeFa: 'کمیته مشترک انرژی و اوپک‌پلاس',
        titleFa: `رای‌گیری اوپک‌پلاس برای کاهش سهمیه تولید و جهش قیمت نفت (+$22)`,
        effectSummaryFa: 'افزایش فوری ۲۲ دلاری بهای هر بشکه نفت خام به نفع صادرکنندگان انرژی.',
      };
    case 'OPEC_OIL_BOOST':
      return {
        committeeFa: 'آژانس بین‌المللی انرژی و گروه ۲۰',
        titleFa: `طرح افزایش عرضه جهانی نفت برای مهار تورم انرژی (-$18)`,
        effectSummaryFa: 'کاهش ۱۸ دلاری بهای نفت خام به نفع کشورهای صنعتی واردکننده.',
      };
    case 'EMERGENCY_AID_PACKAGE':
      return {
        committeeFa: 'صندوق امداد و بازسازی سازمان ملل',
        titleFa: `بسته کمک بشردوستانه و بازسازی $45B برای ${target.nameFa}`,
        effectSummaryFa: 'اعطای +$45B کمک بازسازی، +۱۰٪ رضایت و -۱۸٪ ویرانی به کشور هدف.',
      };
    case 'IAEA_INSPECTION':
      return {
        committeeFa: 'شورای حکام آژانس انرژی اتمی (IAEA)',
        titleFa: `قطعنامه بازرسی ویژه از تاسیسات هسته‌ای ${target.nameFa}`,
        effectSummaryFa: 'توقف ۱۵٪ پیشرفت غنی‌سازی هدف یا تحریم بین‌المللی در صورت عدم تمکین (قابل وتو).',
      };
  }
}

// ============================================================================
// QUEUED STRATEGIC MILITARY, COVERT & WORLD CONQUEST OPERATIONS
// ============================================================================

export function queuePlayerOrder(
  room: GameRoomState,
  countryId: CountryId,
  draft: {
    kind: 'MILITARY_OPERATION' | 'COVERT_OPERATION' | 'MINOR_NATION_OPERATION';
    targetCountry?: CountryId;
    targetMinorId?: string;
    militaryType?: MilitaryOpType;
    targetSector?: StrikeTargetSector;
    covertType?: CovertOpType;
    minorOpType?: MinorNationOpType;
  }
): { ok: boolean; errorFa?: string; order?: GameOrder } {
  if (room.phase !== 'PLANNING') {
    return { ok: false, errorFa: 'ثبت عملیات جدید فقط در فاز برنامه‌ریزی ماه جاری مجاز است.' };
  }
  const actor = room.countries[countryId];
  if (!actor || actor.isEliminated) return { ok: false, errorFa: 'کشور شما غیرفعال است.' };
  if (actor.orders.length >= 4) {
    return { ok: false, errorFa: 'حداکثر ۴ عملیات راهبردی در هر ماه قابل برنامه‌ریزی است.' };
  }

  // === WORLD MINOR NATION CONQUEST / COUP ===
  if (draft.kind === 'MINOR_NATION_OPERATION' && draft.targetMinorId && draft.minorOpType) {
    const minor = room.minorNations[draft.targetMinorId];
    if (!minor) return { ok: false, errorFa: 'کشور هدف روی نقشه یافت نشد.' };
    if (minor.conqueredBy === actor.id) {
      return { ok: false, errorFa: `خاک ${minor.nameFa} هم‌اکنون ضمیمه قلمرو شماست!` };
    }
    const winPct = estimateMinorOpSuccessPct(actor, minor, draft.minorOpType, room.countries);
    const costB = draft.minorOpType === 'CONQUER_ANNEX' ? 28 : 18;
    if (actor.treasuryB < costB) {
      return { ok: false, errorFa: `بودجه کافی نیست ($${costB}B نیاز است).` };
    }
    actor.treasuryB -= costB;
    const order: GameOrder = {
      id: uid('ord'),
      actor: countryId,
      kind: 'MINOR_NATION_OPERATION',
      targetMinorId: minor.id,
      minorOpType: draft.minorOpType,
      estimatedSuccessPct: winPct,
      summaryFa:
        draft.minorOpType === 'CONQUER_ANNEX'
          ? `⚔️ لشکرکشی و ضمیمه‌سازی خاک «${minor.nameFa}»`
          : `🕵️ کودتای اطلاعاتی و هم‌پیمان کردن «${minor.nameFa}»`,
      expectedImpactFa:
        draft.minorOpType === 'CONQUER_ANNEX'
          ? `تصرف کامل خاک ${minor.nameFa} و افزودن منابع نفت/اقتصاد آن به امپراتوری شما`
          : `تغییر رژیم سیاسی ${minor.nameFa} به دولت هم‌سو با کشور شما`,
      costB,
    };
    actor.orders.push(order);
    return { ok: true, order };
  }

  // === MAJOR POWER MILITARY & COVERT OPERATIONS ===
  if (!draft.targetCountry) return { ok: false, errorFa: 'کشور هدف مشخص نشده است.' };
  const target = room.countries[draft.targetCountry];
  if (!target || target.isEliminated || actor.id === target.id) {
    return { ok: false, errorFa: 'کشور هدف نامعتبر یا حذف‌شده است.' };
  }

  let costB = 18;
  let summaryFa = '';
  let expectedImpactFa = '';
  let estimatedSuccessPct = 50;
  let traceRiskPct: number | undefined;

  if (draft.kind === 'MILITARY_OPERATION' && draft.militaryType) {
    const details = evaluateMilitaryOpDetails(actor, target, draft.militaryType, room.round);
    estimatedSuccessPct = details.winPct;
    const sector = draft.targetSector || 'MILITARY_BASES';
    const sectorFa =
      sector === 'REFINERY'
        ? 'پالایشگاه‌ها و نفت'
        : sector === 'POWER_PLANT'
        ? 'نیروگاه‌ها و شبکه برق'
        : sector === 'ARMS_FACTORY'
        ? 'مجتمع صنایع دفاعی'
        : sector === 'AIR_DEFENSE_NET'
        ? 'شبکه رادار و پدافند'
        : 'پایگاه‌ها و تسلیحات ارتش';

    if (draft.militaryType === 'AIR_SORTIE') {
      costB = 18;
      summaryFa = `✈️ عملیات جنگنده‌ها و بمباران هوایی «${sectorFa}» در ${target.nameFa}`;
      expectedImpactFa = 'سرکوب ۳۲٪ پدافند هوایی دشمن + بمباران دقیق زیرساخت انتخابی با اسکادران‌های هوایی';
    } else if (draft.militaryType === 'MISSILE_DRONE_STRIKE') {
      costB = 20;
      summaryFa = `🚀 حمله موشکی و پهپادی ترکیبی به «${sectorFa}» در ${target.nameFa}`;
      expectedImpactFa = `اشباع پدافند و انهدام مستقیم ۱ سطح زیرساخت ${sectorFa}`;
    } else if (draft.militaryType === 'NAVAL_BLOCKADE_STRIKE') {
      costB = 22;
      summaryFa = `⚓ عملیات دریایی و محاصره بنادر ${target.nameFa}`;
      expectedImpactFa = 'انهدام ناوگان دریایی دشمن + کاهش ۳۸٪ درآمد صادرات دریابرد هدف در این ماه';
    } else if (draft.militaryType === 'GROUND_CONQUEST') {
      costB = 34;
      summaryFa = `🚜 تهاجم زمینی و کشورگشایی علیه ${target.nameFa}`;
      expectedImpactFa = 'تصرف ۲۸٪ تا ۳۸٪ خاک هدف، غنیمت خزانه و نفت (در ۰٪ خاک = سقوط و الحاق کامل کشور هدف!)';
    } else if (draft.militaryType === 'NUCLEAR_STRIKE') {
      if (actor.warheads <= 0) {
        return { ok: false, errorFa: 'کشور شما کلاهک هسته‌ای عملیاتی ندارد! دکترین هسته‌ای را به سطح ۵ برسانید.' };
      }
      costB = 45;
      summaryFa = `☢️ شلیک کلاهک استراتژیک هسته‌ای به ${target.nameFa}`;
      expectedImpactFa = 'انهدام گسترده زیرساخت‌ها و +۴۲٪ بحران ویرانی در هدف، اما وضعیت DEFCON 1 و تحریم جهانی!';
    }
  } else if (draft.kind === 'COVERT_OPERATION' && draft.covertType) {
    const details = evaluateCovertOpDetails(actor, target, draft.covertType);
    estimatedSuccessPct = details.winPct;
    traceRiskPct = details.tracePct;

    switch (draft.covertType) {
      case 'SAT_RECON':
        costB = 9;
        summaryFa = `📡 اشراف اطلاعاتی و ماهواره‌ای روی ${target.nameFa}`;
        expectedImpactFa = 'کشف خزانه، کلاهک‌ها و ویرانی + ۱۵٪ افزایش دقت حملات نظامی تا ۳ دور';
        break;
      case 'INSURGENCY_PSYOPS':
        costB = 16;
        summaryFa = `🔥 جنگ روانی و تحریک ناآرامی داخلی در ${target.nameFa}`;
        expectedImpactFa = 'کاهش ۱۴٪ رضایت مردم و افزایش ۱۲٪ شاخص بحران رژیم هدف (کاملاً مخفی در صورت عدم ردیابی)';
        break;
      case 'BLACKOUT_VIRUS':
        costB = 16;
        summaryFa = `⚡ ویروس سایبری Blackout علیه برق و رادار ${target.nameFa}`;
        expectedImpactFa = 'حذف هشدار آژیر رادار هدف + قطع ۲۶٪ شبکه برق شهرها';
        break;
      case 'TREASURY_HEIST':
        costB = 18;
        summaryFa = `🏦 سرقت سایبری از بانک مرکزی ${target.nameFa}`;
        expectedImpactFa = 'انتقال مستقیم $22B تا $42B از خزانه دشمن به خزانه شما';
        break;
      case 'STUXNET_SABOTAGE':
        costB = 22;
        summaryFa = `🧬 خرابکاری صنعتی استاکس‌نت در تاسیسات ${target.nameFa}`;
        expectedImpactFa = '-۲۵٪ پیشرفت هسته‌ای هدف و تخریب ۱ سطح کارخانه دفاعی یا راکتور';
        break;
      case 'ASSASSINATE_COMMANDER':
        costB = 24;
        summaryFa = `🎖️ ترور هدفمند فرمانده ارشد ارتش ${target.nameFa}`;
        expectedImpactFa = 'فلج کردن زنجیره فرماندهی دشمن (-۲۵٪ توان دفاعی و رهگیری در این ماه)';
        break;
      case 'ASSASSINATE_SCIENTIST':
        costB = 22;
        summaryFa = `🔬 ترور دانشمندان هسته‌ای و هوافضای ${target.nameFa}`;
        expectedImpactFa = '-۲۸٪ پیشرفت هسته‌ای و عقب‌گرد برنامه‌های راهبردی هدف';
        break;
      case 'ASSASSINATE_MINISTER':
        costB = 26;
        summaryFa = `🏛️ ترور مقامات ارشد سیاسی و امنیتی در پایتخت ${target.nameFa}`;
        expectedImpactFa = 'شوک شدید به کابینه هدف (-۱۶٪ رضایت مردم و +۱۶٪ بحران سقوط دولت)';
        break;
    }
  } else {
    return { ok: false, errorFa: 'نوع عملیات مشخص نشده است.' };
  }

  if (actor.treasuryB < costB) {
    return { ok: false, errorFa: `بودجه کافی نیست ($${costB}B نیاز است).` };
  }

  actor.treasuryB -= costB;
  const order: GameOrder = {
    id: uid('ord'),
    actor: countryId,
    kind: draft.kind,
    targetCountry: draft.targetCountry,
    militaryType: draft.militaryType,
    targetSector: draft.targetSector || 'MILITARY_BASES',
    covertType: draft.covertType,
    estimatedSuccessPct,
    traceRiskPct,
    summaryFa,
    expectedImpactFa,
    costB,
  };
  actor.orders.push(order);
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
  if (!fromC || !toC || fromC.isEliminated || toC.isEliminated) {
    return { ok: false, errorFa: 'کشورهای معامله غیرفعال هستند.' };
  }

  if (offer.offerType === 'ALLIANCE') {
    if (offer.priceB > 0) {
      if (fromC.treasuryB < offer.priceB) return { ok: false, errorFa: 'بودجه کافی نیست.' };
      fromC.treasuryB -= offer.priceB;
      toC.treasuryB += offer.priceB;
    }
    if (!fromC.allies.includes(toC.id)) fromC.allies.push(toC.id);
    if (!toC.allies.includes(fromC.id)) toC.allies.push(fromC.id);
    fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
    toC.sanctionedBy = toC.sanctionedBy.filter((id) => id !== fromC.id);

    addNews(room, {
      agencyFa: 'فرانس‌پرس دیپلماتیک',
      category: 'DIPLOMACY',
      breaking: true,
      headlineFa: `پیمان دفاعی مشترک میان ${fromC.nameFa} و ${toC.nameFa} به امضا رسید!`,
      bodyFa: 'دو کشور همکاری نظامی، تبادل اطلاعات و تولید تحت لیسانس تسلیحات را آغاز کردند.',
      involvedCountries: [fromC.id, toC.id],
    });
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

    if (spec.originCountry === seller.id) {
      const mfgCost = Math.round(spec.unitCostB * 0.6 * qty);
      buyer.treasuryB -= offer.priceB;
      seller.treasuryB += offer.priceB - mfgCost;
      buyer.weapons[spec.id] = (buyer.weapons[spec.id] || 0) + qty;
    } else {
      if ((seller.weapons[spec.id] || 0) < qty) {
        return { ok: false, errorFa: `${seller.nameFa} موجودی کافی از این سلاح ندارد.` };
      }
      buyer.treasuryB -= offer.priceB;
      seller.treasuryB += offer.priceB;
      seller.weapons[spec.id] -= qty;
      buyer.weapons[spec.id] = (buyer.weapons[spec.id] || 0) + qty;
    }

    addNews(room, {
      agencyFa: 'جینز دیفنس ویکلی',
      category: 'DIPLOMACY',
      breaking: false,
      headlineFa: `تحویل محموله نظامی: ${seller.nameFa} سامانه «${spec.nameFa}» را به ${buyer.nameFa} صادر کرد`,
      bodyFa: `ارزش قرارداد دفاعی: $${offer.priceB}B.`,
      involvedCountries: [seller.id, buyer.id],
    });
    return { ok: true };
  }

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
    return { ok: false, errorFa: `ذخیره ${seller.nameFa} برای تحویل کافی نیست.` };
  }

  addRes(seller, -qty);
  addRes(buyer, qty);
  buyer.treasuryB -= offer.priceB;
  seller.treasuryB += offer.priceB;
  return { ok: true };
}

// ============================================================================
// TARGETED RADAR ALERT & FULL ROUND RESOLUTION (ZERO-LOCK & ZERO-LEAK!)
// ============================================================================

type PreResolvedOrder = GameOrder & {
  _preResult?: 'HIT' | 'BLOCKED';
  _preTraced?: boolean;
};

export function prepareEndOfPlanning(room: GameRoomState): {
  next: 'RADAR_ALERT' | 'GM_REVIEW' | 'READY_TO_RESOLVE';
  alertedCountryIds: CountryId[];
} {
  for (const c of Object.values(room.countries)) {
    (c as CountryState & { _approvalBeforeClash?: number; _devBeforeClash?: number })._approvalBeforeClash = c.approval;
    (c as CountryState & { _devBeforeClash?: number })._devBeforeClash = c.devastation;
  }

  runLivingWorldAITurn(room, {
    onChokepointNews: (ctrl, cpNameFa, nextStatus, oilPrice) => {
      if (nextStatus === 'BLOCKADED') {
        addNews(room, {
          agencyFa: 'بلومبرگ فوری / رویترز انرژی',
          category: 'ECONOMY',
          breaking: true,
          headlineFa: `🚨 اقدام متقابل دریایی: ${ctrl.nameFa} در پی تشدید فشارها «${cpNameFa}» را به روی نفتکش‌ها بست! (نفت: $${oilPrice})`,
          bodyFa: 'انسداد این آبراه استراتژیک بهای جهانی نفت و مواد غذایی را به‌شدت افزایش داد.',
          involvedCountries: [ctrl.id],
        });
      } else if (nextStatus === 'RESTRICTED') {
        addNews(room, {
          agencyFa: 'رویترز دریایی',
          category: 'ECONOMY',
          breaking: false,
          headlineFa: `نیروی دریایی ${ctrl.nameFa} بازرسی نظامی کشتی‌ها در «${cpNameFa}» را آغاز کرد`,
          bodyFa: 'نرخ حمل‌ونقل دریایی و بهای انرژی در بازارهای جهانی افزایش یافت.',
          involvedCountries: [ctrl.id],
        });
      } else {
        addNews(room, {
          agencyFa: 'رویترز انرژی',
          category: 'ECONOMY',
          breaking: false,
          headlineFa: `بازگشایی مسیر ترانزیت دریایی در «${cpNameFa}» توسط ${ctrl.nameFa}`,
          bodyFa: 'کشتیرانی بین‌المللی به حالت عادی بازگشت.',
          involvedCountries: [ctrl.id],
        });
      }
    },
  });

  for (const c of Object.values(room.countries)) {
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
    c.alertPostureCostPaidB = 0;
    c.alertPostureConfirmed = false;
  }

  // Pre-run BLACKOUT_VIRUS (with strict trace privacy!) & ASSASSINATE_COMMANDER before radar & air defense checks!
  for (const actor of Object.values(room.countries)) {
    if (actor.isEliminated) continue;
    for (const rawOrd of actor.orders) {
      const ord = rawOrd as PreResolvedOrder;
      if (ord.kind === 'COVERT_OPERATION' && ord.covertType === 'BLACKOUT_VIRUS' && ord.targetCountry) {
        const target = room.countries[ord.targetCountry];
        if (!target || target.isEliminated) continue;
        const details = evaluateCovertOpDetails(actor, target, 'BLACKOUT_VIRUS');
        const hit = Math.random() * 100 < details.winPct;
        const traced = Math.random() * 100 < details.tracePct;
        ord._preResult = hit ? 'HIT' : 'BLOCKED';
        ord._preTraced = traced;
        if (hit) {
          target.radarIntegrity = clamp(target.radarIntegrity - 65, 8, 100);
          target.powerGrid = clamp(target.powerGrid - 26, 10, 100);
          target.approval = clamp(target.approval - 7, 0, 100);
          target.devastation = clamp(target.devastation + 8, 0, 100);
        }
      }
    }
  }

  const alertedCountryIds: CountryId[] = [];
  for (const actor of Object.values(room.countries)) {
    if (actor.isEliminated) continue;
    for (const ord of actor.orders) {
      if (ord.kind !== 'MILITARY_OPERATION' || !ord.targetCountry) continue;
      const target = room.countries[ord.targetCountry];
      if (!target || target.isEliminated || target.playerId === null || !target.isOnline) continue;
      if (target.radarIntegrity < 45) continue; // Blinded by cyber blackout!

      const label =
        ord.militaryType === 'NUCLEAR_STRIKE'
          ? `☢️ هشدار قرمز فضایی: پرتاب کلاهک هسته‌ای از مبدا ${actor.nameFa}!`
          : ord.militaryType === 'GROUND_CONQUEST'
          ? `🚜 لشکرکشی سنگین زرهی و زمینی ارتش ${actor.nameFa} به سوی مرزهای شما!`
          : ord.militaryType === 'NAVAL_BLOCKADE_STRIKE'
          ? `⚓ نزدیک شدن ناوگان رزمی ${actor.nameFa} برای حمله و محاصره بنادر شما!`
          : ord.militaryType === 'AIR_SORTIE'
          ? `✈️ نفوذ اسکادران‌های جنگنده و بمب‌افکن ${actor.nameFa} به حریم هوایی شما!`
          : `🚀 شناسایی موج موشک‌ها و پهپادهای تهاجمی از مبدا ${actor.nameFa}!`;

      target.incomingAlertActive = true;
      target.incomingThreatsSummaryFa.push(label);
      if (!alertedCountryIds.includes(target.id)) {
        alertedCountryIds.push(target.id);
      }
    }
  }

  if (alertedCountryIds.length > 0) {
    room.phase = 'RADAR_ALERT';
    room.phaseEndsAt = Date.now() + 18_000;
    return { next: 'RADAR_ALERT', alertedCountryIds };
  }

  if (room.settings.gmMode === 'HUMAN' && room.players.some((p) => p.isGM && p.connected)) {
    room.phase = 'GM_REVIEW';
    room.phaseEndsAt = null;
    return { next: 'GM_REVIEW', alertedCountryIds: [] };
  }

  return { next: 'READY_TO_RESOLVE', alertedCountryIds: [] };
}

export function applyAlertPosture(
  room: GameRoomState,
  countryId: CountryId,
  posture: AlertPosture
): { ok: boolean; allConfirmed: boolean; errorFa?: string } {
  if (room.phase !== 'RADAR_ALERT') {
    return { ok: false, allConfirmed: false, errorFa: 'پنجره واکنش اضطراری پایان یافته است.' };
  }
  const c = room.countries[countryId];
  if (!c || !c.incomingAlertActive) {
    return { ok: false, allConfirmed: false, errorFa: 'هشدار راداری فعالی برای کشور شما وجود ندارد.' };
  }

  c.treasuryB += c.alertPostureCostPaidB;
  c.alertPostureCostPaidB = 0;

  const costMap: Record<AlertPosture, number> = {
    NORMAL: 0,
    MAX_INTERCEPT: 10,
    SCRAMBLE_FIGHTERS: 8,
    COUNTER_SALVO: 14,
  };
  const needed = costMap[posture];
  if (c.treasuryB < needed) {
    return { ok: false, allConfirmed: false, errorFa: `بودجه کافی نیست ($${needed}B لازم است).` };
  }

  c.treasuryB -= needed;
  c.alertPostureCostPaidB = needed;
  c.alertPosture = posture;
  c.alertPostureConfirmed = true;

  const allAlertedHumans = Object.values(room.countries).filter(
    (x) => x.incomingAlertActive && !x.isEliminated && x.playerId !== null && x.isOnline
  );
  const allConfirmed = allAlertedHumans.every((x) => x.alertPostureConfirmed);

  return { ok: true, allConfirmed };
}

function loseRandomWeaponUnit(country: CountryState, preferredCats?: string[]): string | null {
  const candidates = Object.keys(country.weapons).filter((wId) => {
    if (country.weapons[wId] <= 0) return false;
    if (!preferredCats) return true;
    const spec = WEAPONS_CATALOG[wId];
    return spec && preferredCats.includes(spec.category);
  });
  const pool =
    candidates.length > 0 ? candidates : Object.keys(country.weapons).filter((k) => country.weapons[k] > 0);
  if (pool.length === 0) return null;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  country.weapons[picked] -= 1;
  return WEAPONS_CATALOG[picked]?.nameFa || picked;
}

export function resolveCurrentRound(room: GameRoomState): void {
  const resolvedRoundNum = room.round;
  const resolvedMonthLabel = room.calendarLabelFa;
  const newVisuals: MapVisualEvent[] = [];
  const roundBattles: BattleOutcomeLog[] = [];
  const worldHighlightsFa: string[] = [];
  const seadPenalty: Partial<Record<CountryId, number>> = {};
  const attackedByMap: Partial<Record<CountryId, CountryId[]>> = {};

  const summaries = {} as Record<CountryId, RoundSummaryForCountry>;
  const prevApprovals = {} as Record<CountryId, number>;
  const prevDevs = {} as Record<CountryId, number>;

  for (const c of Object.values(room.countries)) {
    const ext = c as CountryState & { _approvalBeforeClash?: number; _devBeforeClash?: number };
    prevApprovals[c.id] = ext._approvalBeforeClash ?? c.approval;
    prevDevs[c.id] = ext._devBeforeClash ?? c.devastation;
    delete ext._approvalBeforeClash;
    delete ext._devBeforeClash;
    c.maritimeBlockaded = false;
    summaries[c.id] = {
      roundResolved: resolvedRoundNum,
      monthLabelFa: resolvedMonthLabel,
      netIncomeB: 0,
      autoSoldOilB: 0,
      netOilDelta: 0,
      approvalDelta: 0,
      devastationDelta: 0,
      myOperations: [],
      incomingAttacks: [],
      worldHighlightsFa: [],
    };
  }

  const allOrders: PreResolvedOrder[] = [];
  for (const c of Object.values(room.countries)) {
    if (!c.isEliminated) allOrders.push(...(c.orders as PreResolvedOrder[]));
  }

  // =========================================================================
  // 1. RESOLVE COVERT, CYBER & ASSASSINATION OPS (STRICT COUNTER-INTEL TRACE!)
  // =========================================================================
  for (const ord of allOrders) {
    if (ord.kind !== 'COVERT_OPERATION' || !ord.covertType || !ord.targetCountry) continue;
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry];
    if (!actor || !target || actor.isEliminated || target.isEliminated) continue;

    const details = evaluateCovertOpDetails(actor, target, ord.covertType);
    const succeeded =
      ord._preResult !== undefined ? ord._preResult === 'HIT' : Math.random() * 100 < details.winPct;
    const traced =
      ord._preTraced !== undefined ? ord._preTraced : Math.random() * 100 < details.tracePct;

    // Visual trajectory on map: ONLY shown to actor & GM unless traced!
    newVisuals.push({
      id: uid('vis'),
      round: resolvedRoundNum,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: ord.covertType === 'SAT_RECON' ? 'RECON' : 'CYBER',
      labelFa: ord.summaryFa,
      intercepted: !succeeded,
      secretActorOnly: !traced,
    });

    // Target security goes on heightened counter-intel alert for next round after any covert attempt!
    if (ord.covertType !== 'SAT_RECON') {
      target.securityAlertBonus = clamp((target.securityAlertBonus || 0) + 12, 0, 28);
    }

    const attackerIdForTarget: CountryId | null = traced ? actor.id : null;
    const attackerLabelForTarget = traced
      ? `${actor.nameFa} (کشف ردپا توسط ${target.agencyCode}!)`
      : '🕵️ مهاجم ناشناس (عدم وجود ردپای قابل ردیابی)';

    if (traced && ord.covertType !== 'SAT_RECON') {
      target.lastAttackedBy = actor.id;
      addIntel(
        target,
        resolvedRoundNum,
        'CRITICAL',
        `🔍 ردیابی موفق عامل حمله مخفی: ${actor.nameFa}`,
        `واحد ضدجاسوسی و فایروال ملی (${target.agencyCode}) مستندات قطعی دست داشتن سرویس اطلاعاتی ${actor.nameFa} (${actor.agencyCode}) را کشف کرد!`,
        actor.id
      );
    }

    if (ord.covertType === 'SAT_RECON') {
      if (succeeded) {
        actor.knownIntel[target.id] = captureSnapshot(room, target);
        const detail = `پرونده محرمانه خزانه ($${target.treasuryB}B)، کلاهک‌ها (${target.warheads}) و ویرانی (${target.devastation}٪) ${target.nameFa} کشف شد (+۱۵٪ دقت حمله).`;
        summaries[actor.id].myOperations.push({
          titleFa: `اشراف ماهواره‌ای روی ${target.nameFa}`,
          targetId: target.id,
          targetNameFa: target.nameFa,
          succeeded: true,
          detailFa: detail,
        });
        addIntel(actor, resolvedRoundNum, 'SUCCESS', `اشراف اطلاعاتی بر ${target.nameFa}`, detail, target.id);
      } else {
        summaries[actor.id].myOperations.push({
          titleFa: `اشراف ماهواره‌ای روی ${target.nameFa}`,
          targetId: target.id,
          targetNameFa: target.nameFa,
          succeeded: false,
          detailFa: 'جنگ الکترونیک هدف مانع تصویربرداری دقیق ماهواره‌ای شد.',
        });
      }
      continue;
    }

    if (succeeded) {
      let actorDetail = '';
      let targetTitle = '';
      let targetDetail = '';
      let newsHeadline = '';

      switch (ord.covertType) {
        case 'BLACKOUT_VIRUS':
          actorDetail = `رادارهای پدافندی ${target.nameFa} کور شد و ۲۶٪ شبکه برق آن از مدار خارج گردید!${traced ? ' (ردپای سایبری شما لو رفت!)' : ' (بدون به جا گذاشتن ردپا ✓)'}`;
          targetTitle = 'حمله سایبری Blackout به شبکه برق و رادار';
          targetDetail = `برق سراسری ۲۶٪ سقوط کرد و رادارهای هشدار سریع مختل شدند! (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `⚡ حمله سایبری منتسب به ${actor.nameFa} شبکه برق شهرهای ${target.nameFa} را دچار خاموشی کرد!`
            : `⚡ خاموشی سایبری گسترده در شبکه برق ${target.nameFa}؛ منشا حمله هنوز شناسایی نشده است!`;
          break;

        case 'TREASURY_HEIST': {
          const stolen = Math.min(target.treasuryB, Math.round(22 + Math.random() * 20));
          target.treasuryB -= stolen;
          actor.treasuryB += stolen;
          actorDetail = `+$${stolen}B ارز از بانک مرکزی ${target.nameFa} به خزانه شما منتقل شد!${traced ? ' (فایروال هدف ردپای شما را ثبت کرد!)' : ' (کاملاً ناشناس ✓)'}`;
          targetTitle = 'نفوذ سایبری به بانک مرکزی کشور';
          targetDetail = `-$${stolen}B از ذخایر ارزی کشور به سرقت رفت! (${attackerLabelForTarget})`;
          break;
        }

        case 'STUXNET_SABOTAGE': {
          target.nuclearProgress = clamp(target.nuclearProgress - 25, 0, 100);
          target.devastation = clamp(target.devastation + 10, 0, 100);
          const ruined = damageCountryInfra(target, ['NUCLEAR_FACILITY', 'ARMS_FACTORY'], 1);
          actorDetail = `-۲۵٪ برنامه هسته‌ای هدف و تخریب ${ruined[0] || 'تاسیسات صنعتی'} در ${target.nameFa}!${traced ? ' (ردپای بدافزار شناسایی شد)' : ' (منشا حمله مخفی ماند ✓)'}`;
          targetTitle = 'خرابکاری صنعتی بدافزار استاکس‌نت';
          targetDetail = `-۲۵٪ پیشرفت هسته‌ای و آسیب جدی به ${ruined[0] || 'مراکز حساس'} (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🧬 انفجار سایبری در تاسیسات صنعتی ${target.nameFa}؛ انگشت اتهام به سوی ${actor.nameFa}!`
            : `🧬 اختلال و انفجار مشکوک صنعتی در مراکز حساس ${target.nameFa}؛ عامل حمله در هاله‌ای از ابهام!`;
          break;
        }

        case 'INSURGENCY_PSYOPS':
          target.approval = clamp(target.approval - 14, 0, 100);
          target.devastation = clamp(target.devastation + 12, 0, 100);
          actorDetail = `عملیات جنگ روانی موفق شد؛ رضایت مردم ${target.nameFa} ۱۴٪ سقوط کرد!${traced ? ' (شبکه نفوذی شناسایی شد)' : ' (بدون افشای هویت ✓)'}`;
          targetTitle = 'عملیات جنگ روانی و تحریک ناآرامی داخلی';
          targetDetail = `کاهش ۱۴٪ رضایت عمومی و افزایش التهاب سیاسی (${attackerLabelForTarget})`;
          newsHeadline = `📢 موج اعتصابات و التهاب سیاسی در شهرهای بزرگ ${target.nameFa}!`;
          break;

        case 'ASSASSINATE_COMMANDER':
          target.commanderBuff = clamp(target.commanderBuff - 25, -35, 30);
          target.approval = clamp(target.approval - 7, 0, 100);
          room.market.globalTension = clamp(room.market.globalTension + 8, 0, 100);
          actorDetail = `ترور فرمانده ارشد ارتش ${target.nameFa} موفق بود؛ توان دفاعی و فرماندهی دشمن ۲۵٪ مختل شد!${traced ? ' (ضدجاسوسی هدف ردپای شما را یافت!)' : ' (هویت تیم عملیاتی مخفی ماند ✓)'}`;
          targetTitle = 'ترور فرمانده ارشد نیروهای مسلح!';
          targetDetail = `-۲۵٪ انسجام فرماندهی ارتش در این ماه (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🎯 ترور فرمانده ارشد نظامی در ${target.capitalFa}؛ سرویس امنیتی ${target.nameFa} رسماً ${actor.nameFa} را متهم کرد!`
            : `🎯 ترور شوکه‌کننده فرمانده ارشد نظامی در ${target.capitalFa}؛ تیم ترور بدون به جا گذاشتن ردپا متواری شد!`;
          break;

        case 'ASSASSINATE_SCIENTIST':
          target.nuclearProgress = clamp(target.nuclearProgress - 28, 0, 100);
          target.techLevel = clamp(target.techLevel - 1, 1, 12);
          room.market.globalTension = clamp(room.market.globalTension + 7, 0, 100);
          actorDetail = `ترور دانشمندان کلیدی ${target.nameFa} انجام شد؛ برنامه هسته‌ای دشمن ۲۸٪ عقب افتاد!${traced ? ' (هویت مهاجم لو رفت)' : ' (عملیات سایه بدون ردپا ✓)'}`;
          targetTitle = 'ترور دانشمندان ارشد هسته‌ای و هوافضا!';
          targetDetail = `-۲۸٪ پیشرفت هسته‌ای کشور (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🔬 ترور دانشمند برجسته هسته‌ای در ${target.nameFa}؛ کشف اسناد دخالت ${actor.agencyCode}!`
            : `🔬 ترور هدفمند دانشمند ارشد هسته‌ای در ${target.nameFa}؛ تحقیقات امنیتی برای یافتن آمران آغاز شد!`;
          break;

        case 'ASSASSINATE_MINISTER':
          target.approval = clamp(target.approval - 16, 0, 100);
          target.devastation = clamp(target.devastation + 16, 0, 100);
          room.market.globalTension = clamp(room.market.globalTension + 10, 0, 100);
          actorDetail = `ترور مقام ارشد سیاسی-امنیتی در ${target.capitalFa} کابینه دشمن را در بحران فرو برد!${traced ? ' (عوامل عملیات شناسایی شدند)' : ' (کاملاً ناشناس ✓)'}`;
          targetTitle = 'ترور مقام ارشد سیاسی در پایتخت!';
          targetDetail = `-۱۶٪ ثبات کابینه و +۱۶٪ شاخص بحران دولت (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🏛️ زلزله سیاسی در ${target.capitalFa}: ترور مقام ارشد دولتی با طراحی سرویس اطلاعاتی ${actor.nameFa}!`
            : `🏛️ ترور بی‌سابقه مقام ارشد دولتی در قلب ${target.capitalFa}؛ وضعیت فوق‌العاده امنیتی اعلام شد!`;
          break;
      }

      summaries[actor.id].myOperations.push({
        titleFa: ord.summaryFa,
        targetId: target.id,
        targetNameFa: target.nameFa,
        succeeded: true,
        detailFa: actorDetail,
      });
      summaries[target.id].incomingAttacks.push({
        attackerId: attackerIdForTarget,
        attackerLabelFa: attackerLabelForTarget,
        titleFa: targetTitle,
        repelled: false,
        detailFa: targetDetail,
      });

      if (newsHeadline) {
        worldHighlightsFa.push(newsHeadline);
        addNews(room, {
          agencyFa: ord.covertType.includes('VIRUS') || ord.covertType.includes('STUXNET') ? 'بی‌بی‌سی سایبری' : 'الجزیره فوری',
          category: ord.covertType.includes('VIRUS') || ord.covertType.includes('STUXNET') ? 'CYBER' : 'ESPIONAGE',
          breaking: true,
          headlineFa: newsHeadline,
          bodyFa: traced
            ? `سرویس ضدجاسوسی ${target.nameFa} شواهد ارتباط مستقیم این عملیات با ${actor.nameFa} را منتشر کرد.`
            : 'به علت پیچیدگی عملیات و ضعف سامانه‌های ردیابی، تاکنون هیچ کشوری رسماً شناسایی نشده است.',
          involvedCountries: traced ? [actor.id, target.id] : [target.id],
        });
      }
    } else {
      // Covert Op Failed!
      summaries[actor.id].myOperations.push({
        titleFa: ord.summaryFa,
        targetId: target.id,
        targetNameFa: target.nameFa,
        succeeded: false,
        detailFa: traced
          ? `عملیات شکست خورد و ماموران شما توسط ${target.agencyCode} دستگیر و افشا شدند!`
          : 'حفاظت امنیتی هدف مانع اجرای عملیات شد، اما تیم شما بدون شناسایی بازگشت.',
      });

      summaries[target.id].incomingAttacks.push({
        attackerId: attackerIdForTarget,
        attackerLabelFa: attackerLabelForTarget,
        titleFa: traced ? `خنثی‌سازی عملیات مخفی ${actor.nameFa}` : 'خنثی‌سازی نفوذ مشکوک امنیتی/سایبری',
        repelled: true,
        detailFa: traced
          ? `ضدجاسوسی ${target.agencyCode} عوامل اعزامی ${actor.nameFa} را پیش از ضربه منهدم کرد ✓`
          : 'سپر امنیتی کشور یک تلاش نفوذ ناشناس را خنثی کرد ✓',
      });

      if (traced && ord.covertType.startsWith('ASSASSINATE')) {
        actor.approval = clamp(actor.approval - 5, 0, 100);
        const scandal = `🕵️ رسوایی اطلاعاتی: دستگیری تیم ترور اعزامی ${actor.nameFa} در خاک ${target.nameFa}!`;
        worldHighlightsFa.push(scandal);
        addNews(room, {
          agencyFa: 'سی‌ان‌ان بین‌الملل',
          category: 'ESPIONAGE',
          breaking: true,
          headlineFa: scandal,
          bodyFa: `سرویس امنیتی ${target.agencyCode} با نمایش مستندات، عملیات نافرجام را افشا کرد.`,
          involvedCountries: [actor.id, target.id],
        });
      }
    }
  }

  // =========================================================================
  // 2. RESOLVE WORLD MINOR NATION CONQUESTS & COUPS
  // =========================================================================
  for (const ord of allOrders) {
    if (ord.kind !== 'MINOR_NATION_OPERATION' || !ord.targetMinorId || !ord.minorOpType) continue;
    const actor = room.countries[ord.actor];
    const minor = room.minorNations[ord.targetMinorId];
    if (!actor || actor.isEliminated || !minor) continue;

    const winPct = estimateMinorOpSuccessPct(actor, minor, ord.minorOpType, room.countries);
    const succeeded = Math.random() * 100 < winPct;

    newVisuals.push({
      id: uid('vis-m'),
      round: resolvedRoundNum,
      from: actor.coordinates,
      to: minor.coordinates,
      fromCountry: actor.id,
      toMinorId: minor.id,
      kind: ord.minorOpType === 'CONQUER_ANNEX' ? 'INVASION' : 'CYBER',
      labelFa: ord.summaryFa,
      intercepted: !succeeded,
    });

    if (ord.minorOpType === 'CONQUER_ANNEX') {
      room.market.globalTension = clamp(room.market.globalTension + 9, 0, 100);
      if (succeeded) {
        minor.conqueredBy = actor.id;
        minor.alignedWith = actor.id;
        minor.garrisonPower = Math.round(minor.garrisonPower * 0.85);
        const instantLoot = Math.max(12, Math.round(minor.gdpB * 0.08));
        actor.treasuryB += instantLoot;
        actor.oilReserve += minor.oilBonus;
        actor.militaryXp += 15;

        const detail = `پرچم ${actor.nameFa} بر فراز «${minor.nameFa}» برافراشته شد! غنیمت فوری: +$${instantLoot}B و الحاق دائمی منابع نفت و اقتصاد این کشور به قلمرو شما!`;
        summaries[actor.id].myOperations.push({
          titleFa: `تصرف و ضمیمه‌سازی ${minor.nameFa}`,
          targetNameFa: minor.nameFa,
          succeeded: true,
          detailFa: detail,
        });
        const hl = `🏴 کشورگشایی جدید: ارتش ${actor.nameFa} سراسر خاک «${minor.nameFa}» را تصرف و ضمیمه قلمرو خود کرد!`;
        worldHighlightsFa.push(hl);
        addNews(room, {
          agencyFa: 'رویترز جنگ / آسوشیتدپرس',
          category: 'WAR',
          breaking: true,
          headlineFa: hl,
          bodyFa: `منابع انرژی و ظرفیت اقتصادی ${minor.nameFa} اکنون در اختیار مستقیم دولت ${actor.nameFa} قرار گرفته است.`,
          involvedCountries: [actor.id],
        });
      } else {
        const lostUnit = loseRandomWeaponUnit(actor, ['ARMOR', 'FIGHTER', 'DRONE']);
        const detail = `مقاومت سرسختانه ارتش ملی ${minor.nameFa} مانع سقوط این کشور شد!${
          lostUnit ? ` (تلفات مهاجم: ۱× ${lostUnit})` : ''
        }`;
        summaries[actor.id].myOperations.push({
          titleFa: `لشکرکشی به ${minor.nameFa}`,
          targetNameFa: minor.nameFa,
          succeeded: false,
          detailFa: detail,
        });
      }
    } else {
      // COVERT_COUP
      if (succeeded) {
        minor.conqueredBy = null;
        minor.alignedWith = actor.id;
        summaries[actor.id].myOperations.push({
          titleFa: `کودتا و هم‌سوسازی دولت ${minor.nameFa}`,
          targetNameFa: minor.nameFa,
          succeeded: true,
          detailFa: `دولت هم‌سو با ${actor.nameFa} در ${minor.nameFa} روی کار آمد!`,
        });
        addNews(room, {
          agencyFa: 'الجزیره سیاسی',
          category: 'ESPIONAGE',
          breaking: false,
          headlineFa: `تحول ناگهانی سیاسی در ${minor.nameFa}؛ دولت جدید پیمان راهبردی با ${actor.nameFa} امضا کرد`,
          bodyFa: 'ناظران بین‌المللی از تغییر آرایش ژئوپولیتیک منطقه خبر می‌دهند.',
          involvedCountries: [actor.id],
        });
      } else {
        summaries[actor.id].myOperations.push({
          titleFa: `کودتای اطلاعاتی در ${minor.nameFa}`,
          targetNameFa: minor.nameFa,
          succeeded: false,
          detailFa: `گارد ریاست‌جمهوری ${minor.nameFa} کودتا را خنثی کرد.`,
        });
      }
    }
  }

  // =========================================================================
  // 3. RESOLVE MAJOR MILITARY OPERATIONS (AIR -> NAVAL -> MISSILE -> GROUND -> NUKE)
  // =========================================================================
  const priorityMap: Record<MilitaryOpType, number> = {
    AIR_SORTIE: 1, // Fighters clear enemy air defense first!
    NAVAL_BLOCKADE_STRIKE: 2,
    MISSILE_DRONE_STRIKE: 3,
    GROUND_CONQUEST: 4,
    NUCLEAR_STRIKE: 5,
  };

  const milOrders = allOrders
    .filter((o) => o.kind === 'MILITARY_OPERATION' && o.militaryType && o.targetCountry)
    .sort((a, b) => priorityMap[a.militaryType!] - priorityMap[b.militaryType!]);

  for (const ord of milOrders) {
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry!];
    if (!actor || !target || actor.isEliminated || target.isEliminated || !ord.militaryType) continue;

    executeRealisticMilitaryClash(
      room,
      actor,
      target,
      ord.militaryType,
      ord.targetSector || 'MILITARY_BASES',
      seadPenalty,
      newVisuals,
      roundBattles,
      summaries,
      worldHighlightsFa,
      false
    );
    target.lastAttackedBy = actor.id;
    attackedByMap[target.id] = [...(attackedByMap[target.id] || []), actor.id];
  }

  // 3b. Emergency Counter-Salvos from Radar Alert Phase!
  for (const defender of Object.values(room.countries)) {
    if (!defender.isEliminated && defender.alertPosture === 'COUNTER_SALVO' && attackedByMap[defender.id]?.length) {
      const attackerId = attackedByMap[defender.id]![0];
      const attacker = room.countries[attackerId];
      if (attacker && !attacker.isEliminated) {
        executeRealisticMilitaryClash(
          room,
          defender,
          attacker,
          'MISSILE_DRONE_STRIKE',
          'MILITARY_BASES',
          seadPenalty,
          newVisuals,
          roundBattles,
          summaries,
          worldHighlightsFa,
          true
        );
      }
    }
  }

  // =========================================================================
  // 4. RESOLVE UN & SPECIAL COMMITTEES (OPEC, IAEA, AID, CEASEFIRE, SANCTIONS)
  // =========================================================================
  for (const res of room.resolutions) {
    if (res.status !== 'ACTIVE') continue;
    castAIVotesOnResolution(room, res);

    if ((res.status as string) === 'VETOED') {
      const vetoer = res.vetoedBy ? room.countries[res.vetoedBy] : null;
      const hl = `🛑 وتوی قطعنامه در «${res.committeeFa}» توسط ${vetoer?.nameFa || ''}!`;
      worldHighlightsFa.push(hl);
      addNews(room, {
        agencyFa: res.committeeFa,
        category: 'DIPLOMACY',
        breaking: true,
        headlineFa: hl,
        bodyFa: res.titleFa,
        involvedCountries: res.vetoedBy ? [res.vetoedBy, res.target] : [res.target],
      });
    } else if (res.votesYes.length > res.votesNo.length) {
      res.status = 'PASSED';
      const targetC = room.countries[res.target];

      if (res.kind === 'GLOBAL_SANCTION' && targetC && !targetC.isEliminated) {
        for (const voter of res.votesYes.slice(0, 6)) {
          if (voter !== targetC.id && !targetC.sanctionedBy.includes(voter)) {
            targetC.sanctionedBy.push(voter);
          }
        }
      } else if (res.kind === 'CONDEMN_AGGRESSION' && targetC && !targetC.isEliminated) {
        targetC.approval = clamp(targetC.approval - 10, 0, 100);
      } else if (res.kind === 'CEASEFIRE_DEMAND') {
        room.market.globalTension = clamp(room.market.globalTension - 18, 8, 100);
      } else if (res.kind === 'OPEC_OIL_CUT') {
        room.market.oilPriceUsd = clamp(room.market.oilPriceUsd + 22, 60, 245);
      } else if (res.kind === 'OPEC_OIL_BOOST') {
        room.market.oilPriceUsd = clamp(room.market.oilPriceUsd - 18, 58, 245);
      } else if (res.kind === 'EMERGENCY_AID_PACKAGE' && targetC && !targetC.isEliminated) {
        targetC.treasuryB += 45;
        targetC.approval = clamp(targetC.approval + 10, 0, 100);
        targetC.devastation = clamp(targetC.devastation - 18, 0, 100);
      } else if (res.kind === 'IAEA_INSPECTION' && targetC && !targetC.isEliminated) {
        targetC.nuclearProgress = clamp(targetC.nuclearProgress - 15, 0, 100);
      }

      const hl = `⚖️ تصویب در «${res.committeeFa}»: ${res.titleFa} (${res.votesYes.length} رای موافق)`;
      worldHighlightsFa.push(hl);
      addNews(room, {
        agencyFa: res.committeeFa,
        category: 'DIPLOMACY',
        breaking: true,
        headlineFa: hl,
        bodyFa: res.effectSummaryFa,
        involvedCountries: [res.proposer, res.target],
      });
    } else {
      res.status = 'FAILED';
    }
  }

  // =========================================================================
  // 5. GLOBAL MARKET & RICH MULTI-AGENCY JOURNALISTIC COVERAGE
  // =========================================================================
  let targetOilPrice = 80;
  for (const cp of Object.values(room.chokepoints)) {
    if (cp.status === 'BLOCKADED') targetOilPrice += Math.round(cp.oilImpactFactor * 95);
    else if (cp.status === 'RESTRICTED') targetOilPrice += Math.round(cp.oilImpactFactor * 36);
  }
  targetOilPrice += Math.round(room.market.globalTension * 0.42);

  if (room.settings.gmMode === 'AUTO') {
    const ev =
      REAL_WORLD_EVENTS[(resolvedRoundNum * 3 + Math.floor(Math.random() * REAL_WORLD_EVENTS.length)) % REAL_WORLD_EVENTS.length];
    targetOilPrice += ev.oilDeltaUsd;
    room.market.foodPriceIndex = clamp(room.market.foodPriceIndex + ev.foodDelta, 75, 230);
    room.market.globalTension = clamp(room.market.globalTension + ev.tensionDelta, 8, 100);
    worldHighlightsFa.push(`🌍 ${ev.headlineFa}`);
    addNews(room, {
      agencyFa: ev.agencyFa,
      category: 'WORLD_EVENT',
      breaking: Math.abs(ev.oilDeltaUsd) >= 9,
      headlineFa: ev.headlineFa,
      bodyFa: ev.bodyFa,
      involvedCountries: [],
    });
  }

  room.market.oilPriceUsd = clamp(Math.round(room.market.oilPriceUsd * 0.45 + targetOilPrice * 0.55), 58, 245);
  room.market.gasPriceIndex = clamp(Math.round(85 + (room.market.oilPriceUsd - 70) * 0.92), 75, 255);
  if (milOrders.length === 0) {
    room.market.globalTension = clamp(room.market.globalTension - 4, 10, 100);
  }

  // =========================================================================
  // 6. MONTHLY ECONOMY, RECOVERY & REGIME COLLAPSE CHECKS!
  // =========================================================================
  const spot = getGlobalSpotPrices(room.market);
  for (const c of Object.values(room.countries)) {
    if (c.isEliminated) continue;

    const econ = computeEconomyProjection(c, room.market, room.chokepoints, room.minorNations);
    c.treasuryB = Math.max(0, c.treasuryB + econ.netIncomeB);
    c.oilReserve += econ.netOil;
    c.gasReserve += econ.netGas;
    c.foodReserve += econ.netFood;

    let autoSoldCashB = 0;
    if (c.autoSellSurplus && c.oilReserve > 240) {
      const excessOil = c.oilReserve - 200;
      const cash = Math.round((excessOil / 50) * spot.oilSell50B * (c.sanctionedBy.length > 0 ? 0.88 : 1));
      c.oilReserve = 200;
      c.treasuryB += cash;
      autoSoldCashB += cash;
    }
    if (c.autoSellSurplus && c.gasReserve > 250) {
      const excessGas = c.gasReserve - 200;
      const cash = Math.round((excessGas / 50) * spot.gasSell50B);
      c.gasReserve = 200;
      c.treasuryB += cash;
      autoSoldCashB += cash;
    }

    if (c.oilReserve < 0) {
      const deficitCost = Math.min(c.treasuryB, Math.round(Math.abs(c.oilReserve) * 0.65));
      c.treasuryB -= deficitCost;
      c.oilReserve = 0;
      c.approval = clamp(c.approval - 5, 0, 100);
    }
    if (c.gasReserve < 0) c.gasReserve = 0;
    if (c.foodReserve < 0) {
      const foodCost = Math.min(c.treasuryB, Math.round(Math.abs(c.foodReserve) * 0.5));
      c.treasuryB -= foodCost;
      c.foodReserve = 0;
      c.approval = clamp(c.approval - 7, 0, 100);
      c.devastation = clamp(c.devastation + 6, 0, 100);
    }

    // Natural monthly recovery (only gradual when devastated — requires active reconstruction!)
    c.radarIntegrity = clamp(c.radarIntegrity + 26, 30, 100);
    c.powerGrid = clamp(c.powerGrid + 5, 10, 100);
    c.devastation = clamp(c.devastation - (c.powerGrid >= 75 ? 5 : 2), 0, 100);
    c.commanderBuff = Math.round(c.commanderBuff * 0.35);
    c.securityAlertBonus = Math.max(0, Math.round((c.securityAlertBonus || 0) * 0.45));
    if (c.powerGrid >= 85 && c.foodReserve >= 50 && c.devastation < 25) {
      c.approval = clamp(c.approval + 2, 0, 100);
    }

    // === REALISTIC REGIME COLLAPSE & ELIMINATION MECHANIC ===
    // 1) Immediate collapse if devastation reaches >= 95% OR (approval <= 5% and devastation >= 65%)
    // 2) Sustained uncontained crisis: 1st round at approval <= 12% or devastation >= 80% triggers FINAL RED WARNING;
    //    if not stabilized by next round (regimeCrisisStreak >= 2), Cabinet & Government collapse completely!
    const immediateCatastrophe =
      c.devastation >= 95 || (c.approval <= 5 && c.devastation >= 65);

    if (immediateCatastrophe) {
      const lastAggressor = c.lastAttackedBy ? room.countries[c.lastAttackedBy] : null;
      eliminateCollapsedCountry(
        room,
        c,
        `شدت بی‌سابقه بمباران‌ها و ویرانی زیرساخت‌ها (${c.devastation}٪) مهارناپذیر شد و به فروپاشی کامل کابینه و ساختار دولت انجامید.`,
        lastAggressor && !lastAggressor.isEliminated ? lastAggressor : null,
        worldHighlightsFa
      );
    } else if (c.approval <= 12 || c.devastation >= 80) {
      c.regimeCrisisStreak += 1;
      if (c.regimeCrisisStreak >= 2) {
        eliminateCollapsedCountry(
          room,
          c,
          `ادامه بحران شدید مشروعیت (${c.approval}٪) و ویرانی مهارنشده (${c.devastation}٪) برای دو ماه پیاپی منجر به سقوط کامل دولت شد!`,
          null,
          worldHighlightsFa
        );
      } else {
        const warnMsg = `⚠️ هشدار قرمز سقوط کابینه در ${c.nameFa}! (رضایت: ${c.approval}٪ | ویرانی: ${c.devastation}٪) — در ماه جدید فوراً «امداد و بازسازی اضطراری» اجرا کنید وگرنه دولت سقوط خواهد کرد!`;
        addIntel(c, resolvedRoundNum, 'CRITICAL', '🚨 خطر فوری سقوط دولت و حذف از بازی!', warnMsg);
        addNews(room, {
          agencyFa: 'رویترز فوری',
          category: 'WORLD_EVENT',
          breaking: true,
          headlineFa: `وضعیت فوق‌العاده در ${c.capitalFa}: کابینه ${c.nameFa} در آستانه فروپاشی قرار گرفت!`,
          bodyFa: 'ناظران سیاسی هشدار دادند در صورت عدم مهار فوری بحران برق و معیشت، سقوط دولت حتمی است.',
          involvedCountries: [c.id],
        });
      }
    } else {
      c.regimeCrisisStreak = 0;
    }

    summaries[c.id].netIncomeB = econ.netIncomeB;
    summaries[c.id].autoSoldOilB = autoSoldCashB;
    summaries[c.id].netOilDelta = econ.netOil;
    summaries[c.id].approvalDelta = c.approval - prevApprovals[c.id];
    summaries[c.id].devastationDelta = c.devastation - prevDevs[c.id];
    summaries[c.id].worldHighlightsFa = worldHighlightsFa.slice(0, 6);
    c.lastRoundSummary = summaries[c.id];

    // Reset monthly counters & tactical flags
    c.orders = [];
    c.upgradesUsedThisRound = 0;
    c.buildsUsedThisRound = 0;
    c.isReady = false;
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
    c.alertPostureCostPaidB = 0;
    c.alertPostureConfirmed = false;
  }

  room.visualEvents = newVisuals;
  room.battles = [...roundBattles, ...room.battles].slice(0, 40);
  updateRankingsAndDefcon(room);

  // Check end-of-game conditions:
  // 1) All human-controlled countries eliminated -> end campaign cleanly so game NEVER locks!
  // 2) Single surviving power in the world OR maxRounds reached!
  const humanPlayersWithCountries = room.players.filter((p) => p.countryId !== null);
  const survivingHumanCountries = humanPlayersWithCountries.filter(
    (p) => p.countryId && !room.countries[p.countryId]?.isEliminated
  );
  const allHumansEliminated =
    humanPlayersWithCountries.length > 0 && survivingHumanCountries.length === 0;
  const soleHumanVictorInPvP =
    humanPlayersWithCountries.length >= 2 &&
    survivingHumanCountries.length === 1 &&
    humanPlayersWithCountries.some((p) => p.countryId && room.countries[p.countryId]?.isEliminated);

  if (room.round >= room.settings.maxRounds || allHumansEliminated || soleHumanVictorInPvP) {
    room.phase = 'FINISHED';
    room.phaseEndsAt = null;
    const top = room.rankings[0];
    const winner = room.countries[top.countryId];
    if (allHumansEliminated) {
      room.winnerSummaryFa = `پایان کارزار به علت سقوط دولت! ${winner.nameFa} با امتیاز ابرقدرتی ${top.score} قدرت اول جهان شد.`;
    } else if (soleHumanVictorInPvP) {
      const survivorC = room.countries[survivingHumanCountries[0].countryId!];
      room.winnerSummaryFa = `پیروزی قاطع! پس از سقوط دولت رقبا، ${survivorC.nameFa} (به فرماندهی ${survivorC.playerName}) فاتح میدان شد!`;
    } else {
      room.winnerSummaryFa = `پایان کارزار ${room.settings.maxRounds} ماهه! ${winner.nameFa}${
        winner.playerName ? ` (به فرماندهی ${winner.playerName})` : ''
      } با امتیاز ${top.score} ابرقدرت اول جهان شد!`;
    }
    addNews(room, {
      agencyFa: 'گزارش نهایی تاریخ معاصر',
      category: 'WORLD_EVENT',
      breaking: true,
      headlineFa: room.winnerSummaryFa,
      bodyFa: 'جدول نهایی قدرت‌های اقتصادی، نظامی و ارضی جهان ثبت گردید.',
      involvedCountries: [winner.id],
    });
    return;
  }

  room.round += 1;
  room.calendarLabelFa = getCalendarLabelFa(room.round);
  room.phase = 'PLANNING';
  room.phaseEndsAt =
    room.settings.planningTimerSec > 0 ? Date.now() + room.settings.planningTimerSec * 1000 : null;
}

function sectorToInfraType(sector: StrikeTargetSector): InfrastructureType[] {
  if (sector === 'REFINERY') return ['REFINERY'];
  if (sector === 'POWER_PLANT') return ['POWER_PLANT'];
  if (sector === 'ARMS_FACTORY') return ['ARMS_FACTORY'];
  if (sector === 'AIR_DEFENSE_NET') return ['RADAR_NETWORK', 'AIR_MISSILE_BASE'];
  return ['AIR_MISSILE_BASE', 'ARMS_FACTORY'];
}

function executeRealisticMilitaryClash(
  room: GameRoomState,
  actor: CountryState,
  target: CountryState,
  opType: MilitaryOpType,
  sector: StrikeTargetSector,
  seadPenalty: Partial<Record<CountryId, number>>,
  newVisuals: MapVisualEvent[],
  roundBattles: BattleOutcomeLog[],
  summaries: Record<CountryId, RoundSummaryForCountry>,
  worldHighlightsFa: string[],
  isCounterSalvo: boolean
): void {
  if (target.isEliminated || actor.isEliminated) return;
  const atkMil = computeCountryMilitary(actor);
  const defMil = computeCountryMilitary(target);

  actor.allies = actor.allies.filter((id) => id !== target.id);
  target.allies = target.allies.filter((id) => id !== actor.id);
  actor.militaryXp += 15;
  target.militaryXp += 10;

  // === 1. STRATEGIC NUCLEAR STRIKE ===
  if (opType === 'NUCLEAR_STRIKE' && actor.warheads > 0) {
    actor.warheads -= 1;
    room.market.globalTension = 100;
    const interceptChance = Math.max(6, (defMil.interceptRate - (seadPenalty[target.id] || 0)) * 0.36);
    const intercepted = Math.random() * 100 < interceptChance;

    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'NUCLEAR',
      labelFa: intercepted ? 'رهگیری کلاهک هسته‌ای!' : '☢️ اصابت کلاهک هسته‌ای!',
      intercepted,
    });

    if (intercepted) {
      const msg = `سپر ضدبالستیک ${target.nameFa} کلاهک اتمی شلیک‌شده از ${actor.nameFa} را در لبه جو زمین منهدم کرد!`;
      summaries[actor.id].myOperations.push({ titleFa: `ضربه اتمی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: false, detailFa: msg });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: 'رهگیری کلاهک هسته‌ای دشمن!', repelled: true, detailFa: msg });
      worldHighlightsFa.push(`🛡️ ${msg}`);
      addNews(room, { agencyFa: 'رادار جهانی (DEFCON 1)', category: 'WAR', breaking: true, headlineFa: msg, bodyFa: 'جهان وارد وضعیت قرمز اتمی شد.', involvedCountries: [actor.id, target.id] });
    } else {
      target.gdpB = Math.max(90, Math.round(target.gdpB * 0.65));
      target.powerGrid = clamp(target.powerGrid - 48, 5, 100);
      target.approval = clamp(target.approval - 26, 2, 100);
      target.devastation = clamp(target.devastation + 42, 0, 100);
      target.treasuryB = Math.round(target.treasuryB * 0.65);

      // Damages real infrastructures into rebuildable ruins (so target NEVER gets locked at MAX!)
      const ruined = damageCountryInfra(
        target,
        ['POWER_PLANT', 'REFINERY', 'ARMS_FACTORY', 'WELFARE_HUB'],
        3
      );
      loseRandomWeaponUnit(target);
      loseRandomWeaponUnit(target);

      for (const other of Object.values(room.countries)) {
        if (other.id !== actor.id && !other.allies.includes(actor.id) && !actor.sanctionedBy.includes(other.id)) {
          actor.sanctionedBy.push(other.id);
        }
      }
      const msg = `☢️ فاجعه اتمی: اصابت کلاهک هسته‌ای ${actor.nameFa} به خاک ${target.nameFa}؛ تخریب ${ruined.length} مجتمع زیرساختی (+۴۲٪ بحران ویرانی) و تحریم جهانی مهاجم!`;
      summaries[actor.id].myOperations.push({ titleFa: `ضربه اتمی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: true, detailFa: msg });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: '☢️ اصابت کلاهک هسته‌ای!', repelled: false, detailFa: msg });
      worldHighlightsFa.push(msg);
      addNews(room, { agencyFa: '🔴 وضعیت اضطراری جهانی (DEFCON 1)', category: 'WAR', breaking: true, headlineFa: msg, bodyFa: 'ستاد بحران کشور هدف عملیات بازسازی اضطراری را آغاز کرد و شورای امنیت مهاجم را تحریم نمود.', involvedCountries: [actor.id, target.id] });
    }
    return;
  }

  room.market.globalTension = clamp(room.market.globalTension + 9, 0, 100);
  const winPct = evaluateMilitaryOpDetails(actor, target, opType, room.round).winPct;
  const succeeded = Math.random() * 100 < winPct;

  // === 2. AIR SORTIE (Dedicated Fighter & Bomber Mission!) ===
  if (opType === 'AIR_SORTIE') {
    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'FLIGHT',
      labelFa: succeeded ? '✈️ برتری هوایی و بمباران!' : '✈️ رهگیری اسکادران مهاجم',
      intercepted: !succeeded,
    });

    if (succeeded) {
      seadPenalty[target.id] = (seadPenalty[target.id] || 0) + 32;
      target.radarIntegrity = clamp(target.radarIntegrity - 30, 15, 100);
      target.devastation = clamp(target.devastation + 12, 0, 100);
      const shotDownEnemy = loseRandomWeaponUnit(target, ['FIGHTER', 'AIR_DEFENSE']);
      const ruined = damageCountryInfra(target, sectorToInfraType(sector), 1);
      if (sector === 'POWER_PLANT') target.powerGrid = clamp(target.powerGrid - 18, 10, 100);

      const detail = `جنگنده‌های ${actor.nameFa} آسمان ${target.nameFa} را شکافتند! سرکوب ۳۲٪ پدافند${
        shotDownEnemy ? `، انهدام ۱× «${shotDownEnemy}»` : ''
      }${ruined[0] ? ` و تخریب ۱ سطح «${ruined[0]}»` : ''}!`;

      summaries[actor.id].myOperations.push({ titleFa: `عملیات هوایی جنگنده‌ها علیه ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: true, detailFa: detail });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `حمله هوایی جنگنده‌های ${actor.nameFa}`, repelled: false, detailFa: detail });
      addNews(room, { agencyFa: 'جینز دیفنس (نبرد هوایی)', category: 'WAR', breaking: true, headlineFa: `✈️ نبرد سنگین هوایی بر فراز ${target.nameFa}؛ نفوذ اسکادران‌های ${actor.nameFa}`, bodyFa: detail, involvedCountries: [actor.id, target.id] });
    } else {
      const lostJet = atkMil.fighterCount > 0 && Math.random() < 0.55 ? loseRandomWeaponUnit(actor, ['FIGHTER', 'BOMBER']) : null;
      const detail = `پدافند و جنگنده‌های رهگیر ${target.nameFa} حمله هوایی را دفع کردند!${
        lostJet ? ` سقوط ۱ واحد «${lostJet}» مهاجم.` : ''
      }`;
      summaries[actor.id].myOperations.push({ titleFa: `عملیات هوایی علیه ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: false, detailFa: detail });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `دفع حمله هوایی ${actor.nameFa}`, repelled: true, detailFa: detail });
    }
    return;
  }

  // === 3. NAVAL FLEET ATTACK & MARITIME BLOCKADE ===
  if (opType === 'NAVAL_BLOCKADE_STRIKE') {
    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'NAVAL',
      labelFa: succeeded ? '⚓ محاصره دریایی بنادر!' : '⚓ دفع ناوگان مهاجم',
      intercepted: !succeeded,
    });

    if (succeeded) {
      target.maritimeBlockaded = true;
      target.devastation = clamp(target.devastation + 10, 0, 100);
      const sunkNaval = loseRandomWeaponUnit(target, ['NAVAL']);
      const oilSeized = Math.min(target.oilReserve, 35);
      target.oilReserve -= oilSeized;
      actor.oilReserve += oilSeized;

      const detail = `محاصره دریایی بنادر ${target.nameFa} برقرار شد (-۳۸٪ درآمد دریابرد هدف، توقیف ${oilSeized} نفتکش${
        sunkNaval ? ` و غرق شدن ۱× «${sunkNaval}»` : ''
      })!`;
      summaries[actor.id].myOperations.push({ titleFa: `عملیات دریایی علیه ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: true, detailFa: detail });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `محاصره دریایی بنادر توسط ${actor.nameFa}`, repelled: false, detailFa: detail });
      addNews(room, { agencyFa: 'رویترز دریایی', category: 'WAR', breaking: true, headlineFa: `⚓ نبرد دریایی: ناوگان ${actor.nameFa} بنادر استراتژیک ${target.nameFa} را محاصره کرد!`, bodyFa: detail, involvedCountries: [actor.id, target.id] });
    } else {
      const lostShip = atkMil.navalCount > 0 && Math.random() < 0.5 ? loseRandomWeaponUnit(actor, ['NAVAL']) : null;
      const detail = `پدافند ساحلی و موشک‌های ضدناو ${target.nameFa} ناوگان مهاجم را عقب راندند!${
        lostShip ? ` خسارت سنگین به ۱× «${lostShip}».` : ''
      }`;
      summaries[actor.id].myOperations.push({ titleFa: `عملیات دریایی علیه ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: false, detailFa: detail });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `دفع ناوگان دریایی ${actor.nameFa}`, repelled: true, detailFa: detail });
    }
    return;
  }

  // === 4. GROUND INVASION & TERRITORIAL CONQUEST ===
  if (opType === 'GROUND_CONQUEST') {
    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'INVASION',
      labelFa: succeeded ? '🚜 پیشروی زمینی و تصرف خاک!' : '🛡️ شکست تهاجم زمینی',
      intercepted: !succeeded,
    });

    if (succeeded) {
      const territoryTaken = Math.round(28 + Math.min(12, actor.upgrades.ARMOR_LAND * 1.5));
      target.integrityPct = clamp(target.integrityPct - territoryTaken, 0, 100);
      target.devastation = clamp(target.devastation + 22, 0, 100);
      target.approval = clamp(target.approval - 14, 0, 100);
      actor.approval = clamp(actor.approval + 5, 0, 100);

      const lootB = Math.min(target.treasuryB, Math.round(26 + Math.random() * 26));
      const lootOil = Math.min(target.oilReserve, 45);
      target.treasuryB -= lootB;
      actor.treasuryB += lootB;
      target.oilReserve -= lootOil;
      actor.oilReserve += lootOil;

      const destroyedDef = loseRandomWeaponUnit(target, ['ARMOR', 'AIR_DEFENSE']);
      const attackerLoss = Math.random() < 0.35 ? loseRandomWeaponUnit(actor, ['ARMOR', 'DRONE']) : null;
      damageCountryInfra(target, ['REFINERY', 'ARMS_FACTORY'], 1);

      const detail = `لشکرهای زرهی شما ${territoryTaken}٪ از خاک ${target.nameFa} را تصرف کردند (تمامیت ارضی باقی‌مانده هدف: ${target.integrityPct}٪)! غنیمت: +$${lootB}B و +${lootOil} نفت${
        destroyedDef ? ` | انهدام ۱× «${destroyedDef}»` : ''
      }.`;

      summaries[actor.id].myOperations.push({ titleFa: `تهاجم زمینی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: true, detailFa: detail });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `پیشروی زمینی ارتش ${actor.nameFa} در خاک شما!`, repelled: false, detailFa: detail });

      roundBattles.push({
        id: uid('btl'),
        round: room.round,
        attacker: actor.id,
        defender: target.id,
        opTitleFa: 'تهاجم زمینی و کشورگشایی',
        succeeded: true,
        interceptRatePct: defMil.interceptRate,
        summaryFa: detail,
        attackerLossesFa: attackerLoss || 'ناچیز',
        defenderLossesFa: `${territoryTaken}٪ خاک + $${lootB}B`,
        lootB,
      });

      if (target.integrityPct <= 0) {
        eliminateCollapsedCountry(
          room,
          target,
          `ارتش ${actor.nameFa} با تسخیر پایتخت (${target.capitalFa})، ۱۰۰٪ خاک ${target.nameFa} را تصرف کرد و دولت آن سقوط نمود!`,
          actor,
          worldHighlightsFa
        );
      } else {
        const hl = `⚔️ پیشروی زمینی: ارتش ${actor.nameFa} ${territoryTaken}٪ از خاک استراتژیک ${target.nameFa} را تصرف کرد!`;
        worldHighlightsFa.push(hl);
        addNews(room, { agencyFa: 'رویترز جنگ', category: 'WAR', breaking: true, headlineFa: hl, bodyFa: detail, involvedCountries: [actor.id, target.id] });
      }
    } else {
      const lostArmor = loseRandomWeaponUnit(actor, ['ARMOR', 'FIGHTER']);
      actor.approval = clamp(actor.approval - 8, 0, 100);
      target.approval = clamp(target.approval + 6, 0, 100);
      const detail = `مدافعان ${target.nameFa} ستون‌های زرهی مهاجم را در مرز متوقف کردند!${
        lostArmor ? ` انهدام ۱× «${lostArmor}» مهاجم.` : ''
      }`;
      summaries[actor.id].myOperations.push({ titleFa: `تهاجم زمینی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: false, detailFa: detail });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `دفع قهرمانانه تهاجم زمینی ${actor.nameFa}!`, repelled: true, detailFa: detail });
      addNews(room, { agencyFa: 'الجزیره نظامی', category: 'WAR', breaking: true, headlineFa: `🛡️ شکست تهاجم زمینی ${actor.nameFa} در برابر خطوط دفاعی ${target.nameFa}`, bodyFa: detail, involvedCountries: [actor.id, target.id] });
    }
    return;
  }

  // === 5. COMBINED MISSILE & DRONE STRIKE ===
  const effectiveIntercept = clamp(
    defMil.interceptRate - (seadPenalty[target.id] || 0) - actor.upgrades.AEROSPACE * 3.5 - Math.min(18, atkMil.stealthPower * 1.5),
    8,
    88
  );
  const penetrated = isCounterSalvo ? Math.random() < 0.72 : succeeded;

  newVisuals.push({
    id: uid('vis'),
    round: room.round,
    from: actor.coordinates,
    to: target.coordinates,
    fromCountry: actor.id,
    toCountry: target.id,
    kind: 'MISSILE',
    labelFa: isCounterSalvo ? '🚀 ضربه موشکی متقابل!' : '🚀 حمله موشکی و پهپادی',
    intercepted: !penetrated,
  });

  if (!penetrated) {
    const detail = `سپر پدافندی ${target.nameFa} (${effectiveIntercept}٪ رهگیری) موج پهپادها و موشک‌های شلیک‌شده را در آسمان منهدم کرد!`;
    summaries[actor.id].myOperations.push({ titleFa: `حمله موشکی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: false, detailFa: detail });
    summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `رهگیری موفق موشک‌های ${actor.nameFa}`, repelled: true, detailFa: detail });
    return;
  }

  const powerScale = 1 + actor.upgrades.AEROSPACE * 0.08;
  target.devastation = clamp(target.devastation + 13, 0, 100);
  let hitDetail = '';

  if (sector === 'REFINERY') {
    const oilBurned = Math.min(target.oilReserve, Math.round(45 * powerScale));
    target.oilReserve -= oilBurned;
    const ruined = damageCountryInfra(target, ['REFINERY'], 1);
    hitDetail = `اصابت به تاسیسات انرژی؛ سوختن ${oilBurned} واحد نفت${ruined[0] ? ` و تخریب ۱ سطح «${ruined[0]}» (قابل بازسازی)` : ''}!`;
  } else if (sector === 'POWER_PLANT') {
    const drop = clamp(Math.round(22 * powerScale), 12, 38);
    target.powerGrid = clamp(target.powerGrid - drop, 8, 100);
    target.approval = clamp(target.approval - 8, 0, 100);
    const ruined = damageCountryInfra(target, ['POWER_PLANT'], 1);
    hitDetail = `سقوط ${drop}٪ شبکه برق سراسری${ruined[0] ? ` و تخریب ۱ سطح «${ruined[0]}»` : ''} در ${target.nameFa}!`;
  } else if (sector === 'ARMS_FACTORY') {
    const ruined = damageCountryInfra(target, ['ARMS_FACTORY'], 1);
    const cashDmg = Math.min(target.treasuryB, 18);
    target.treasuryB -= cashDmg;
    hitDetail = `اصابت دقیق به صنایع دفاعی ${target.nameFa}؛ تخریب ${ruined[0] || 'کارخانه'} و -$${cashDmg}B خسارت!`;
  } else if (sector === 'AIR_DEFENSE_NET') {
    target.radarIntegrity = clamp(target.radarIntegrity - 38, 12, 100);
    seadPenalty[target.id] = (seadPenalty[target.id] || 0) + 25;
    damageCountryInfra(target, ['RADAR_NETWORK'], 1);
    hitDetail = `انهدام رادارهای هشدار سریع ${target.nameFa} (-۳۸٪ یکپارچگی رادار و تضعیف پدافند)!`;
  } else {
    const destroyedW = loseRandomWeaponUnit(target);
    const cashDmg = Math.min(target.treasuryB, Math.round(18 * powerScale));
    target.treasuryB -= cashDmg;
    hitDetail = destroyedW
      ? `انهدام ۱ واحد «${destroyedW}» در پایگاه‌های ${target.nameFa} + $${cashDmg}B خسارت!`
      : `$${cashDmg}B خسارت سنگین به پایگاه‌ها و زاغه‌های مهمات ${target.nameFa}!`;
  }

  summaries[actor.id].myOperations.push({
    titleFa: isCounterSalvo ? `ضربه موشکی متقابل به ${target.nameFa}` : `حمله موشکی و پهپادی به ${target.nameFa}`,
    targetId: target.id,
    targetNameFa: target.nameFa,
    succeeded: true,
    detailFa: hitDetail,
  });
  summaries[target.id].incomingAttacks.push({
    attackerId: actor.id,
    attackerLabelFa: actor.nameFa,
    titleFa: `اصابت موشک‌های ${actor.nameFa}!`,
    repelled: false,
    detailFa: hitDetail,
  });

  const hl = `🚀 اصابت موشک‌های ${actor.nameFa} به خاک ${target.nameFa}: ${hitDetail}`;
  worldHighlightsFa.push(hl);
  addNews(room, {
    agencyFa: 'رویترز فوری',
    category: 'WAR',
    breaking: true,
    headlineFa: hl,
    bodyFa: 'تصاویر ماهواره‌ای اصابت دقیق و آغاز عملیات مهار آتش و بازسازی در کشور هدف را نشان می‌دهند.',
    involvedCountries: [actor.id, target.id],
  });
}

// ============================================================================
// PER-PLAYER FOG-OF-WAR & COVERT ATTRIBUTION SANITIZATION
// ============================================================================

export function sanitizeRoomForPlayer(room: GameRoomState, viewerPlayerId: string | null): GameRoomState {
  const player = viewerPlayerId ? room.players.find((p) => p.id === viewerPlayerId) : null;
  const isGodView = Boolean(player?.isGM) || room.phase === 'FINISHED';

  if (isGodView) {
    return room;
  }

  const myCountryId = player?.countryId || null;
  const myCountry = myCountryId ? room.countries[myCountryId] : null;
  const myCoalitionId = myCountry?.coalitionId || null;

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
      treasuryB: isAlly || hasRecentIntel ? c.treasuryB : Math.round(c.treasuryB / 50) * 50,
      warheads: isAlly || hasRecentIntel ? c.warheads : c.nuclearProgress >= 100 ? 1 : 0,
      orders: [],
      intelReports: [],
      knownIntel: {},
      lastRoundSummary: null,
      incomingThreatsSummaryFa: [],
    };
  }

  // Strictly hide untraced covert trajectories from everyone except the actor!
  const visibleVisualEvents = room.visualEvents.filter((ev) => {
    if (!ev.secretActorOnly) return true;
    return myCountryId !== null && ev.fromCountry === myCountryId;
  });

  const visibleMessages = room.messages.filter((m) => {
    if (m.channel === 'GLOBAL') return true;
    if (!myCountryId) return false;
    if (m.channel === 'COALITION') {
      return Boolean(myCoalitionId && m.coalitionId === myCoalitionId);
    }
    return m.fromCountry === myCountryId || m.toCountry === myCountryId;
  });

  const visibleTrades = room.trades.filter((t) => {
    if (!myCountryId) return false;
    return t.from === myCountryId || t.to === myCountryId;
  });

  return {
    ...room,
    countries: maskedCountries,
    visualEvents: visibleVisualEvents,
    messages: visibleMessages,
    trades: visibleTrades,
  };
}
