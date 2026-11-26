import {
  computeCountryMilitary,
  computeEconomyProjection,
  estimateCovertSuccessPct,
  estimateMilitarySuccessPct,
  getGlobalSpotPrices,
  getIndigenousOrAllyWeaponCost,
  getInfraNextCost,
  getUpgradeNextCost,
} from '../shared/advisor.js';
import {
  CALENDAR_MONTHS_FA,
  createInitialCountries,
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
  GameOrder,
  GameRoomState,
  GameSettings,
  InfrastructureType,
  IntelReport,
  MapVisualEvent,
  MilitaryOpType,
  NewsItem,
  RevealedSnapshot,
  RoundSummaryForCountry,
  StrikeTargetSector,
  TradeOffer,
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
      globalTension: 20,
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
        headlineFa: 'آغاز رقابت بزرگ ۲۰ قدرت جهانی؛ بورس جهانی نفت با نرخ ۸۲ دلار بازگشایی شد',
        bodyFa:
          'تمامی ۲۰ کشور فعال در آماده‌باش کامل قرار گرفتند. فروش خودکار مازاد نفت فعال است و اتاق فرمان منتظر دستورات شماست.',
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
  if (t >= 82) defcon = 1;
  else if (t >= 64) defcon = 2;
  else if (t >= 45) defcon = 3;
  else if (t >= 26) defcon = 4;
  room.defcon = defcon;

  const list = Object.values(room.countries).map((c) => {
    const mil = computeCountryMilitary(c);
    const upgradeSum = Object.values(c.upgrades).reduce((a, b) => a + b, 0);
    const economicScore = Math.round(
      c.treasuryB * 0.45 +
        c.gdpB * 0.22 +
        (c.oilReserve + c.gasReserve + c.foodReserve) * 0.15 +
        Object.values(c.infrastructure).reduce((a, b) => a + b, 0) * 10
    );
    const militaryScore = Math.round(
      mil.attackScore * 0.55 + mil.defenseScore * 0.45 + c.warheads * 18 + upgradeSum * 12
    );
    const stabilityScore = Math.round(c.approval * 2.2 + c.powerGrid * 1.1);
    const influenceScore = Math.round(
      c.allies.length * 26 + c.upgrades.INTELLIGENCE * 18 + c.upgrades.CYBER_AI * 16 - c.sanctionedBy.length * 12
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

// ============================================================================
// INSTANT ECONOMIC, UPGRADE, PRODUCTION & GLOBAL SPOT MARKET ACTIONS
// ============================================================================

export function instantUpgradeTrack(
  room: GameRoomState,
  countryId: CountryId,
  track: UpgradeTrack
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const spec = UPGRADE_TRACKS[track];
  if (!c || !spec) return { ok: false, errorFa: 'شاخه ارتقا نامعتبر است.' };
  const cur = c.upgrades[track] || 0;
  if (cur >= spec.maxLevel) {
    return { ok: false, errorFa: `${spec.nameFa} به حداکثر سطح (${spec.maxLevel}) رسیده است!` };
  }
  const cost = getUpgradeNextCost(c, track);
  if (c.treasuryB < cost) {
    return { ok: false, errorFa: `بودجه کافی نیست! نیاز به $${cost}B دارید (موجودی: $${c.treasuryB}B).` };
  }

  c.treasuryB -= cost;
  const nextLv = cur + 1;
  c.upgrades[track] = nextLv;

  if (track === 'CYBER_AI') c.cyberShield = clamp(c.cyberShield + 6, 0, 98);
  if (track === 'INTELLIGENCE') c.intelLevel = clamp(c.intelLevel + 1, 1, 10);
  if (track === 'AEROSPACE') c.techLevel = clamp(c.techLevel + 1, 1, 10);
  if (track === 'INDUSTRY') c.gdpB += 35;
  if (track === 'NUCLEAR') {
    c.nuclearProgress = clamp(nextLv * 20, c.nuclearProgress, 100);
    if (nextLv === 3) {
      c.powerGrid = clamp(c.powerGrid + 18, 0, 100);
    }
    if (nextLv >= 5) {
      c.nuclearProgress = 100;
      c.warheads += 2;
      room.market.globalTension = clamp(room.market.globalTension + 14, 0, 100);
      addNews(room, {
        agencyFa: 'آژانس بین‌المللی انرژی اتمی (فوری)',
        category: 'WAR',
        breaking: true,
        headlineFa: `جهش استراتژیک: ${c.nameFa} به فناوری کامل کلاهک هسته‌ای (سطح ۵) دست یافت!`,
        bodyFa: 'دو کلاهک استراتژیک جدید وارد زرادخانه بازدارندگی این کشور شد.',
        involvedCountries: [c.id],
      });
    }
  }

  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `⭐ ${spec.nameFa} به سطح ${nextLv} ارتقا یافت!`,
  };
}

export function instantBuildInfra(
  room: GameRoomState,
  countryId: CountryId,
  infraType: InfrastructureType
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const spec = INFRASTRUCTURE_CATALOG[infraType];
  if (!c || !spec) return { ok: false, errorFa: 'زیرساخت نامعتبر است.' };
  if (c.infrastructure[infraType] >= spec.maxLevel) {
    return { ok: false, errorFa: 'این زیرساخت به حداکثر سطح رسیده است.' };
  }
  const cost = getInfraNextCost(c, infraType);
  if (c.treasuryB < cost) {
    return { ok: false, errorFa: `بودجه کافی نیست ($${cost}B مورد نیاز است).` };
  }

  c.treasuryB -= cost;
  c.infrastructure[infraType] += 1;

  if (infraType === 'POWER_PLANT') c.powerGrid = clamp(c.powerGrid + 16, 0, 100);
  if (infraType === 'WELFARE_HUB') {
    c.approval = clamp(c.approval + 10, 0, 100);
    c.foodReserve += 20;
  }
  if (infraType === 'RADAR_NETWORK') c.radarIntegrity = 100;
  if (infraType === 'CYBER_HQ') c.cyberShield = clamp(c.cyberShield + 8, 0, 98);
  if (infraType === 'REFINERY') {
    c.oilReserve += 20;
    c.gasReserve += 15;
  }
  if (infraType === 'NUCLEAR_FACILITY') {
    c.nuclearProgress = clamp(c.nuclearProgress + 20, 0, 100);
    c.uraniumReserve += 15;
    if (c.nuclearProgress >= 100 && c.warheads === 0) {
      c.warheads = 2;
      c.upgrades.NUCLEAR = 5;
    }
  }

  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `🏗️ ${spec.nameFa} به سطح ${c.infrastructure[infraType]} رسید!`,
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
  if (!c || !spec) return { ok: false, errorFa: 'تسلیحات نامعتبر است.' };

  const count = clamp(qty, 1, 5);
  const access = getIndigenousOrAllyWeaponCost(c, weaponId);
  if (!access.canBuildDirectly) {
    return {
      ok: false,
      errorFa: 'این سامانه بومی کشور شما نیست؛ با دکمه سفارش خرید از کشور سازنده تهیه کنید.',
    };
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
    messageFa: `🎖️ ${count}× «${spec.nameFa}» فوراً تحویل ارتش شما شد!`,
  };
}

export function instantSpotTrade(
  room: GameRoomState,
  countryId: CountryId,
  resource: 'OIL' | 'GAS' | 'FOOD' | 'URANIUM',
  mode: 'BUY' | 'SELL'
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  if (!c) return { ok: false, errorFa: 'کشور یافت نشد.' };
  const spot = getGlobalSpotPrices(room.market);
  // Sanctioned sellers receive a 12% grey-market discount when selling on spot market
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
      return { ok: false, errorFa: `بودجه خزانه برای خرید فوری کافی نیست ($${cost}B لازم است).` };
    }
    c.treasuryB -= cost;
    if (resource === 'OIL') c.oilReserve += qty;
    else if (resource === 'GAS') c.gasReserve += qty;
    else if (resource === 'FOOD') c.foodReserve += qty;
    else c.uraniumReserve += qty;

    updateRankingsAndDefcon(room);
    return { ok: true, messageFa: `🛒 +${qty} واحد از بورس جهانی خریداری و وارد انبار شد (-$${cost}B)` };
  } else {
    if (resource === 'URANIUM') {
      return { ok: false, errorFa: 'فروش آزاد اورانیوم در بورس عمومی مجاز نیست؛ از دیپلماسی مستقیم استفاده کنید.' };
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
    room.market.oilPriceUsd = clamp(room.market.oilPriceUsd + Math.round(cp.oilImpactFactor * 55), 60, 240);
    room.market.globalTension = clamp(room.market.globalTension + 15, 0, 100);
    addNews(room, {
      agencyFa: 'بلومبرگ فوری',
      category: 'ECONOMY',
      breaking: true,
      headlineFa: `زلزله در بازار نفت! ${actor.nameFa} تردد در «${cp.nameFa}» را مسدود کرد (نفت: $${room.market.oilPriceUsd})`,
      bodyFa: cp.descriptionFa,
      involvedCountries: [countryId],
    });
  } else if (status === 'RESTRICTED') {
    room.market.oilPriceUsd = clamp(room.market.oilPriceUsd + 10, 60, 240);
    addNews(room, {
      agencyFa: 'رویترز دریایی',
      category: 'ECONOMY',
      breaking: false,
      headlineFa: `برقراری ایست بازرسی نظامی توسط ${actor.nameFa} در «${cp.nameFa}»`,
      bodyFa: 'نرخ بیمه نفتکش‌ها افزایش یافت.',
      involvedCountries: [countryId],
    });
  } else {
    room.market.oilPriceUsd = clamp(room.market.oilPriceUsd - 14, 65, 240);
    addNews(room, {
      agencyFa: 'رویترز انرژی',
      category: 'ECONOMY',
      breaking: false,
      headlineFa: `بازگشایی کامل مسیر کشتیرانی در «${cp.nameFa}» توسط ${actor.nameFa}`,
      bodyFa: 'فشار روانی از بازار جهانی انرژی کاسته شد.',
      involvedCountries: [countryId],
    });
  }

  updateRankingsAndDefcon(room);
  return { ok: true, messageFa: `وضعیت «${cp.nameFa}» بروزرسانی شد.` };
}

// ============================================================================
// QUEUED STRATEGIC MILITARY & COVERT OPERATIONS (4 CLEAR CHOICES EACH!)
// ============================================================================

export function queuePlayerOrder(
  room: GameRoomState,
  countryId: CountryId,
  draft: {
    kind: 'MILITARY_OPERATION' | 'COVERT_OPERATION';
    targetCountry: CountryId;
    militaryType?: MilitaryOpType;
    targetSector?: StrikeTargetSector;
    covertType?: CovertOpType;
  }
): { ok: boolean; errorFa?: string; order?: GameOrder } {
  if (room.phase !== 'PLANNING') {
    return { ok: false, errorFa: 'ثبت عملیات جدید فقط در فاز برنامه‌ریزی ماه جاری مجاز است.' };
  }
  const actor = room.countries[countryId];
  const target = room.countries[draft.targetCountry];
  if (!actor || !target || actor.id === target.id) {
    return { ok: false, errorFa: 'کشور هدف نامعتبر است.' };
  }
  if (actor.orders.length >= 4) {
    return { ok: false, errorFa: 'حداکثر ۴ عملیات تهاجمی/اطلاعاتی در هر ماه قابل ثبت است.' };
  }

  let costB = 15;
  let summaryFa = '';
  let expectedImpactFa = '';
  let estimatedSuccessPct = 50;

  if (draft.kind === 'MILITARY_OPERATION' && draft.militaryType) {
    estimatedSuccessPct = estimateMilitarySuccessPct(actor, target, draft.militaryType);
    const sector = draft.targetSector || 'MILITARY_BASES';
    const sectorFa =
      sector === 'REFINERY'
        ? 'پالایشگاه و نفت'
        : sector === 'POWER_PLANT'
        ? 'شبکه برق و صنعت'
        : 'پایگاه‌ها و تسلیحات ارتش';

    if (draft.militaryType === 'SEAD_DRONE_SWARM') {
      costB = 12;
      summaryFa = `موج پهپادی و سرکوب پدافند ${target.nameFa}`;
      expectedImpactFa = 'تضعیف ۳۵٪ سپر پدافندی دشمن در این ماه + خسارت به رادار';
    } else if (draft.militaryType === 'PRECISION_STRIKE') {
      costB = 20;
      summaryFa = `حمله موشکی و هوایی به «${sectorFa}» در ${target.nameFa}`;
      expectedImpactFa = `انهدام مستقیم ${sectorFa} با شانس شکافتن پدافند ${estimatedSuccessPct}٪`;
    } else if (draft.militaryType === 'FULL_INVASION') {
      costB = 30;
      summaryFa = `تهاجم همه‌جانبه زمینی و دریایی علیه ${target.nameFa}`;
      expectedImpactFa = 'تصرف غنیمت جنگی ($30B-$55B و نفت) و انهدام ارتش هدف (همراه با ریسک تلفات دوطرفه)';
    } else if (draft.militaryType === 'NUCLEAR_STRIKE') {
      if (actor.warheads <= 0) {
        return { ok: false, errorFa: 'کشور شما کلاهک هسته‌ای عملیاتی ندارد! ابتدا شاخه هسته‌ای را به سطح ۵ برسانید.' };
      }
      costB = 40;
      summaryFa = `☢️ فرمان شلیک کلاهک هسته‌ای به ${target.nameFa}`;
      expectedImpactFa = 'فروپاشی شدید اقتصاد و برق هدف، اما اعلام وضعیت DEFCON 1 و تحریم جهانی!';
    }
  } else if (draft.kind === 'COVERT_OPERATION' && draft.covertType) {
    estimatedSuccessPct = estimateCovertSuccessPct(actor, target, draft.covertType);
    if (draft.covertType === 'SAT_RECON') {
      costB = 8;
      summaryFa = `اشراف اطلاعاتی و ماهواره‌ای روی ${target.nameFa}`;
      expectedImpactFa = 'کشف کامل تسلیحات، خزانه و کلاهک‌ها + ۱۴٪ افزایش دقت حملات بعدی';
    } else if (draft.covertType === 'BLACKOUT_VIRUS') {
      costB = 15;
      summaryFa = `ویروس سایبری Blackout و کور کردن رادار ${target.nameFa}`;
      expectedImpactFa = 'حذف هشدار آژیر رادار هدف + قطع ۲۵٪ برق شهرها';
    } else if (draft.covertType === 'TREASURY_HEIST') {
      costB = 16;
      summaryFa = `سرقت سایبری از بانک مرکزی ${target.nameFa}`;
      expectedImpactFa = 'انتقال مستقیم $22B تا $38B از خزانه دشمن به خزانه شما!';
    } else if (draft.covertType === 'SABOTAGE_ASSASSINATION') {
      costB = 22;
      summaryFa = `ترور هدفمند و خرابکاری استاکس‌نت در ${target.nameFa}`;
      expectedImpactFa = '-۲۲٪ برنامه هسته‌ای هدف و فلج کردن فرماندهی ارتش دشمن در این ماه';
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
  if (!fromC || !toC) return { ok: false, errorFa: 'کشورهای معامله نامعتبرند.' };

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
      headlineFa: `پیمان دفاعی مشترک میان ${fromC.nameFa} و ${toC.nameFa} امضا شد!`,
      bodyFa: 'دو کشور همکاری نظامی، اطلاعاتی و تولید تحت لیسانس تسلیحات را آغاز کردند.',
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
      agencyFa: 'جینز دیفنس',
      category: 'DIPLOMACY',
      breaking: false,
      headlineFa: `تحویل محموله نظامی: ${seller.nameFa} سامانه «${spec.nameFa}» را به ${buyer.nameFa} صادر کرد`,
      bodyFa: `ارزش قرارداد: $${offer.priceB}B.`,
      involvedCountries: [seller.id, buyer.id],
    });
    return { ok: true };
  }

  // Resource transfer
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
// BUG-FREE TARGETED RADAR ALERT & FULL ROUND RESOLUTION
// ============================================================================

export function prepareEndOfPlanning(room: GameRoomState): {
  next: 'RADAR_ALERT' | 'GM_REVIEW' | 'READY_TO_RESOLVE';
  alertedCountryIds: CountryId[];
} {
  for (const c of Object.values(room.countries)) {
    (c as CountryState & { _approvalBeforeClash?: number })._approvalBeforeClash = c.approval;
  }
  runLivingWorldAITurn(room);

  for (const c of Object.values(room.countries)) {
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
    c.alertPostureCostPaidB = 0;
    c.alertPostureConfirmed = false;
  }

  // Pre-run BLACKOUT_VIRUS radar blinding so cyber + missile combo genuinely suppresses the radar warning!
  for (const actor of Object.values(room.countries)) {
    for (const ord of actor.orders) {
      if (ord.kind === 'COVERT_OPERATION' && ord.covertType === 'BLACKOUT_VIRUS') {
        const target = room.countries[ord.targetCountry];
        if (!target) continue;
        const winPct = estimateCovertSuccessPct(actor, target, 'BLACKOUT_VIRUS');
        if (Math.random() * 100 < winPct) {
          target.radarIntegrity = clamp(target.radarIntegrity - 65, 10, 100);
          target.powerGrid = clamp(target.powerGrid - 25, 15, 100);
          target.approval = clamp(target.approval - 8, 0, 100);
          // Mark order pre-resolved via costB = -1 sentinel so we record it cleanly in round summary!
          (ord as GameOrder & { _preResult?: 'HIT' | 'BLOCKED' })._preResult = 'HIT';
        } else {
          (ord as GameOrder & { _preResult?: 'HIT' | 'BLOCKED' })._preResult = 'BLOCKED';
        }
      }
    }
  }

  const alertedCountryIds: CountryId[] = [];
  for (const actor of Object.values(room.countries)) {
    for (const ord of actor.orders) {
      if (ord.kind !== 'MILITARY_OPERATION') continue;
      const target = room.countries[ord.targetCountry];
      if (!target || target.playerId === null || !target.isOnline) continue;
      if (target.radarIntegrity < 45) continue; // Radar blinded by cyber virus!

      const label =
        ord.militaryType === 'NUCLEAR_STRIKE'
          ? `☢️ شناسایی پرتاب کلاهک هسته‌ای از سمت ${actor.nameFa}!`
          : ord.militaryType === 'FULL_INVASION'
          ? `🛡️ لشکرکشی سنگین زمینی و دریایی ${actor.nameFa} به سمت مرزهای شما!`
          : ord.militaryType === 'SEAD_DRONE_SWARM'
          ? `🛸 نزدیک شدن موج بزرگ پهپادهای انتحاری از مبدا ${actor.nameFa}`
          : `🚀 قفل راداری موشک‌ها و جنگنده‌های ${actor.nameFa} به سوی زیرساخت‌های شما!`;

      target.incomingAlertActive = true;
      target.incomingThreatsSummaryFa.push(label);
      if (!alertedCountryIds.includes(target.id)) {
        alertedCountryIds.push(target.id);
      }
    }
  }

  if (alertedCountryIds.length > 0) {
    room.phase = 'RADAR_ALERT';
    room.phaseEndsAt = Date.now() + 18_000; // Snappy 18s emergency window, auto-completes immediately on click!
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

  // Refund any previously chosen posture cost cleanly before applying new choice!
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
    (x) => x.incomingAlertActive && x.playerId !== null && x.isOnline
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
  const pool = candidates.length > 0 ? candidates : Object.keys(country.weapons).filter((k) => country.weapons[k] > 0);
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

  // Initialize per-country round summaries
  const summaries = {} as Record<CountryId, RoundSummaryForCountry>;
  const prevApprovals = {} as Record<CountryId, number>;
  for (const c of Object.values(room.countries)) {
    prevApprovals[c.id] =
      (c as CountryState & { _approvalBeforeClash?: number })._approvalBeforeClash ?? c.approval;
    delete (c as CountryState & { _approvalBeforeClash?: number })._approvalBeforeClash;
    summaries[c.id] = {
      roundResolved: resolvedRoundNum,
      monthLabelFa: resolvedMonthLabel,
      netIncomeB: 0,
      autoSoldOilB: 0,
      netOilDelta: 0,
      approvalDelta: 0,
      myOperations: [],
      incomingAttacks: [],
      worldHighlightsFa: [],
    };
  }

  const allOrders: (GameOrder & { _preResult?: 'HIT' | 'BLOCKED' })[] = [];
  for (const c of Object.values(room.countries)) {
    if (!c.isEliminated) allOrders.push(...c.orders);
  }

  // 1. Resolve Covert & Cyber Operations
  for (const ord of allOrders) {
    if (ord.kind !== 'COVERT_OPERATION' || !ord.covertType) continue;
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry];
    if (!actor || !target) continue;

    const winPct = estimateCovertSuccessPct(actor, target, ord.covertType);
    const succeeded =
      ord._preResult !== undefined
        ? ord._preResult === 'HIT'
        : Math.random() * 100 < winPct;

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
    });

    if (ord.covertType === 'SAT_RECON') {
      if (succeeded) {
        actor.knownIntel[target.id] = captureSnapshot(room, target);
        const detail = `پرونده کامل خزانه ($${target.treasuryB}B)، کلاهک‌ها (${target.warheads}) و آرایش تسلیحاتی ${target.nameFa} کشف شد (+۱۴٪ دقت حمله).`;
        summaries[actor.id].myOperations.push({
          titleFa: `اشراف ماهواره‌ای روی ${target.nameFa}`,
          targetId: target.id,
          succeeded: true,
          detailFa: detail,
        });
        addIntel(actor, resolvedRoundNum, 'SUCCESS', `کشف اطلاعات سرّی ${target.nameFa}`, detail, target.id);
      } else {
        summaries[actor.id].myOperations.push({
          titleFa: `اشراف ماهواره‌ای روی ${target.nameFa}`,
          targetId: target.id,
          succeeded: false,
          detailFa: 'پدافند جنگ الکترونیک هدف مانع عکس‌برداری دقیق شد.',
        });
      }
    } else if (ord.covertType === 'BLACKOUT_VIRUS') {
      if (succeeded) {
        const detail = `رادارهای پدافندی ${target.nameFa} کور شد و ۲۵٪ شبکه برق شهرهای آن قطع گردید!`;
        summaries[actor.id].myOperations.push({
          titleFa: `ویروس Blackout علیه ${target.nameFa}`,
          targetId: target.id,
          succeeded: true,
          detailFa: detail,
        });
        summaries[target.id].incomingAttacks.push({
          attackerId: actor.id,
          titleFa: 'حمله سایبری Blackout به شبکه برق و رادار',
          repelled: false,
          detailFa: 'برق کشور ۲۵٪ افت کرد و رادارها مختل شدند!',
        });
        const hl = `⚡ خاموشی سایبری گسترده در شهرهای ${target.nameFa} بر اثر حمله بدافزاری!`;
        worldHighlightsFa.push(hl);
        addNews(room, {
          agencyFa: 'بی‌بی‌سی سایبری',
          category: 'CYBER',
          breaking: true,
          headlineFa: hl,
          bodyFa: 'پدافند سایبری در حال بازیابی نیروگاه‌ها و شبکه رادار است.',
          involvedCountries: [target.id],
        });
      } else {
        summaries[actor.id].myOperations.push({
          titleFa: `ویروس Blackout علیه ${target.nameFa}`,
          targetId: target.id,
          succeeded: false,
          detailFa: 'فایروال ملی کشور هدف بدافزار را پیش از نفوذ مسدود کرد.',
        });
        summaries[target.id].incomingAttacks.push({
          attackerId: actor.id,
          titleFa: `تلاش هکری از سوی ${actor.nameFa}`,
          repelled: true,
          detailFa: 'سپر سایبری کشور حمله به شبکه برق را خنثی کرد ✓',
        });
      }
    } else if (ord.covertType === 'TREASURY_HEIST') {
      if (succeeded) {
        const stolen = Math.min(target.treasuryB, Math.round(22 + Math.random() * 16));
        target.treasuryB -= stolen;
        actor.treasuryB += stolen;
        summaries[actor.id].myOperations.push({
          titleFa: `هک بانک مرکزی ${target.nameFa}`,
          targetId: target.id,
          succeeded: true,
          detailFa: `+$${stolen}B ارز دیجیتال مستقیماً از خزانه دشمن به خزانه شما منتقل شد!`,
        });
        summaries[target.id].incomingAttacks.push({
          attackerId: actor.id,
          titleFa: 'نفوذ سایبری به بانک مرکزی',
          repelled: false,
          detailFa: `-$${stolen}B از ذخایر ارزی کشور به سرقت رفت!`,
        });
        addIntel(actor, resolvedRoundNum, 'SUCCESS', `سرقت سایبری +$${stolen}B از ${target.nameFa}`, 'وجوه به خزانه واریز شد.');
      } else {
        summaries[actor.id].myOperations.push({
          titleFa: `هک بانک مرکزی ${target.nameFa}`,
          targetId: target.id,
          succeeded: false,
          detailFa: 'سیستم امنیتی بانک مرکزی هدف نفوذ را مسدود کرد.',
        });
      }
    } else if (ord.covertType === 'SABOTAGE_ASSASSINATION') {
      if (succeeded) {
        target.nuclearProgress = clamp(target.nuclearProgress - 22, 0, 100);
        target.commanderBuff = clamp(target.commanderBuff - 20, -35, 25);
        target.approval = clamp(target.approval - 8, 0, 100);
        room.market.globalTension = clamp(room.market.globalTension + 9, 0, 100);
        summaries[actor.id].myOperations.push({
          titleFa: `ترور و خرابکاری در ${target.nameFa}`,
          targetId: target.id,
          succeeded: true,
          detailFa: 'برنامه هسته‌ای هدف ۲۲٪ عقب افتاد و فرماندهی ارتش دشمن ۲۰٪ تضعیف شد!',
        });
        summaries[target.id].incomingAttacks.push({
          attackerId: actor.id,
          titleFa: 'عملیات ترور و خرابکاری صنعتی در پایتخت!',
          repelled: false,
          detailFa: '-۲۲٪ پیشرفت هسته‌ای و شوک به فرماندهی ارتش!',
        });
        const hl = `🎯 ترور و انفجار خرابکارانه در مراکز استراتژیک ${target.nameFa}!`;
        worldHighlightsFa.push(hl);
        addNews(room, {
          agencyFa: 'الجزیره فوری',
          category: 'ESPIONAGE',
          breaking: true,
          headlineFa: hl,
          bodyFa: 'سرویس‌های اطلاعاتی وضعیت فوق‌العاده امنیتی اعلام کردند.',
          involvedCountries: [target.id],
        });
      } else {
        const exposed = Math.random() < 0.5;
        summaries[actor.id].myOperations.push({
          titleFa: `ترور و خرابکاری در ${target.nameFa}`,
          targetId: target.id,
          succeeded: false,
          detailFa: exposed
            ? `تیم عملیاتی توسط ${target.agencyCode} دستگیر شد و رسوایی خبری به بار آمد!`
            : 'حفاظت امنیتی هدف سنگین بود و تیم بدون نتیجه بازگشت.',
        });
        if (exposed) {
          target.lastAttackedBy = actor.id;
          const hl = `🕵️ دستگیری تیم ترور اعزامی ${actor.nameFa} توسط اطلاعات ${target.nameFa}!`;
          worldHighlightsFa.push(hl);
          addNews(room, {
            agencyFa: 'سی‌ان‌ان جهانی',
            category: 'ESPIONAGE',
            breaking: true,
            headlineFa: hl,
            bodyFa: 'اعترافات ماموران دستگیرشده تنش دیپلماتیک شدیدی ایجاد کرد.',
            involvedCountries: [actor.id, target.id],
          });
        }
      }
    }
  }

  // 2. Resolve Military Operations — SEAD_DRONE_SWARM executes FIRST to suppress enemy air defense!
  const milOrders = allOrders
    .filter((o) => o.kind === 'MILITARY_OPERATION' && o.militaryType)
    .sort((a, b) => (a.militaryType === 'SEAD_DRONE_SWARM' ? -1 : b.militaryType === 'SEAD_DRONE_SWARM' ? 1 : 0));

  for (const ord of milOrders) {
    const actor = room.countries[ord.actor];
    const target = room.countries[ord.targetCountry];
    if (!actor || !target || !ord.militaryType) continue;

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

  // 2b. Execute Emergency Counter-Salvos from Radar Alert Phase!
  for (const defender of Object.values(room.countries)) {
    if (defender.alertPosture === 'COUNTER_SALVO' && attackedByMap[defender.id]?.length) {
      const attackerId = attackedByMap[defender.id]![0];
      const attacker = room.countries[attackerId];
      if (attacker && !attacker.isEliminated) {
        executeRealisticMilitaryClash(
          room,
          defender,
          attacker,
          'PRECISION_STRIKE',
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

  // 3. Finalize UN Security Council Resolutions
  for (const res of room.resolutions) {
    if (res.status !== 'ACTIVE') continue;
    castAIVotesOnResolution(room, res);
    if ((res.status as string) === 'VETOED') {
      const vetoer = res.vetoedBy ? room.countries[res.vetoedBy] : null;
      const hl = `🛑 وتوی قطعنامه در شورای امنیت توسط ${vetoer?.nameFa || ''}!`;
      worldHighlightsFa.push(hl);
      addNews(room, {
        agencyFa: 'شورای امنیت سازمان ملل',
        category: 'DIPLOMACY',
        breaking: true,
        headlineFa: hl,
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
      }
      const hl = `⚖️ تصویب قطعنامه سازمان ملل علیه ${room.countries[res.target].nameFa} (${res.votesYes.length} رای موافق)`;
      worldHighlightsFa.push(hl);
      addNews(room, {
        agencyFa: 'سازمان ملل متحد',
        category: 'DIPLOMACY',
        breaking: true,
        headlineFa: hl,
        bodyFa: res.titleFa,
        involvedCountries: [res.proposer, res.target],
      });
    } else {
      res.status = 'FAILED';
    }
  }

  // 4. Global Market & Dynamic World Event
  let targetOilPrice = 80;
  for (const cp of Object.values(room.chokepoints)) {
    if (cp.status === 'BLOCKADED') targetOilPrice += Math.round(cp.oilImpactFactor * 95);
    else if (cp.status === 'RESTRICTED') targetOilPrice += Math.round(cp.oilImpactFactor * 35);
  }
  targetOilPrice += Math.round(room.market.globalTension * 0.42);

  if (room.settings.gmMode === 'AUTO') {
    const ev =
      REAL_WORLD_EVENTS[(resolvedRoundNum + Math.floor(Math.random() * REAL_WORLD_EVENTS.length)) % REAL_WORLD_EVENTS.length];
    targetOilPrice += ev.oilDeltaUsd;
    room.market.foodPriceIndex = clamp(room.market.foodPriceIndex + ev.foodDelta, 75, 220);
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

  room.market.oilPriceUsd = clamp(Math.round(room.market.oilPriceUsd * 0.4 + targetOilPrice * 0.6), 60, 240);
  room.market.gasPriceIndex = clamp(Math.round(85 + (room.market.oilPriceUsd - 70) * 0.9), 75, 250);
  if (milOrders.length === 0) {
    room.market.globalTension = clamp(room.market.globalTension - 4, 10, 100);
  }

  // 5. Monthly Economy, Auto-Sell Surplus Oil, Reserves & Stability Update
  const spot = getGlobalSpotPrices(room.market);
  for (const c of Object.values(room.countries)) {
    if (c.isEliminated) continue;
    const econ = computeEconomyProjection(c, room.market, room.chokepoints);

    c.treasuryB = Math.max(0, c.treasuryB + econ.netIncomeB);
    c.oilReserve += econ.netOil;
    c.gasReserve += econ.netGas;
    c.foodReserve += econ.netFood;

    // AUTO-SELL SURPLUS OIL & GAS (Effortless Wealth Engine!)
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

    // Automatic emergency import if oil/food runs dry so country doesn't brick silently
    if (c.oilReserve < 0) {
      const deficitCost = Math.min(c.treasuryB, Math.round(Math.abs(c.oilReserve) * 0.6));
      c.treasuryB -= deficitCost;
      c.oilReserve = 0;
      c.approval = clamp(c.approval - 5, 0, 100);
    }
    if (c.gasReserve < 0) c.gasReserve = 0;
    if (c.foodReserve < 0) {
      const foodCost = Math.min(c.treasuryB, Math.round(Math.abs(c.foodReserve) * 0.45));
      c.treasuryB -= foodCost;
      c.foodReserve = 0;
      c.approval = clamp(c.approval - 6, 0, 100);
    }

    // Recovery
    c.radarIntegrity = clamp(c.radarIntegrity + 30, 35, 100);
    c.powerGrid = clamp(c.powerGrid + 6, 20, 100);
    c.commanderBuff = Math.round(c.commanderBuff * 0.35);
    if (c.powerGrid >= 88 && c.foodReserve >= 50) {
      c.approval = clamp(c.approval + 2, 0, 100);
    }

    if (c.approval <= 8) {
      c.approval = 45;
      c.treasuryB = Math.round(c.treasuryB * 0.65);
      const hl = `🔥 بحران داخلی و سقوط کابینه در ${c.nameFa}!`;
      worldHighlightsFa.push(hl);
      addNews(room, {
        agencyFa: 'خبرگزاری فوری جهان',
        category: 'WORLD_EVENT',
        breaking: true,
        headlineFa: hl,
        bodyFa: 'دولت جدید با چالش سنگین اقتصادی کار خود را آغاز کرد.',
        involvedCountries: [c.id],
      });
    }

    summaries[c.id].netIncomeB = econ.netIncomeB;
    summaries[c.id].autoSoldOilB = autoSoldCashB;
    summaries[c.id].netOilDelta = econ.netOil;
    summaries[c.id].approvalDelta = c.approval - prevApprovals[c.id];
    summaries[c.id].worldHighlightsFa = worldHighlightsFa.slice(0, 5);
    c.lastRoundSummary = summaries[c.id];

    // Reset turn flags
    c.orders = [];
    c.isReady = false;
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
    c.alertPostureCostPaidB = 0;
    c.alertPostureConfirmed = false;
  }

  room.visualEvents = newVisuals;
  room.battles = [...roundBattles, ...room.battles].slice(0, 30);

  if (room.round >= room.settings.maxRounds) {
    updateRankingsAndDefcon(room);
    room.phase = 'FINISHED';
    room.phaseEndsAt = null;
    const top = room.rankings[0];
    const winner = room.countries[top.countryId];
    room.winnerSummaryFa = `پایان رقابت جهانی! ${winner.nameFa}${
      winner.playerName ? ` (به فرماندهی ${winner.playerName})` : ''
    } با امتیاز ابرقدرتی ${top.score} قهرمان مطلق جهان شد!`;
    addNews(room, {
      agencyFa: 'گزارش نهایی تاریخ معاصر',
      category: 'WORLD_EVENT',
      breaking: true,
      headlineFa: room.winnerSummaryFa,
      bodyFa: 'جدول نهایی قدرت‌های جهان ثبت گردید.',
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
  const atkMil = computeCountryMilitary(actor);
  const defMil = computeCountryMilitary(target);

  actor.allies = actor.allies.filter((id) => id !== target.id);
  target.allies = target.allies.filter((id) => id !== actor.id);
  actor.militaryXp += 15;
  target.militaryXp += 10;

  // Nuclear Strike
  if (opType === 'NUCLEAR_STRIKE' && actor.warheads > 0) {
    actor.warheads -= 1;
    room.market.globalTension = 100;
    const interceptChance = Math.max(6, (defMil.interceptRate - (seadPenalty[target.id] || 0)) * 0.4);
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
      const msg = `سپر ضدبالستیک ${target.nameFa} کلاهک اتمی شلیک‌شده از ${actor.nameFa} را در آسمان منهدم کرد!`;
      summaries[actor.id].myOperations.push({ titleFa: `ضربه اتمی به ${target.nameFa}`, targetId: target.id, succeeded: false, detailFa: msg });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, titleFa: 'حمله هسته‌ای دشمن!', repelled: true, detailFa: msg });
      worldHighlightsFa.push(`🛡️ ${msg}`);
      addNews(room, { agencyFa: 'رادار جهانی (DEFCON 1)', category: 'WAR', breaking: true, headlineFa: msg, bodyFa: 'جهان وارد وضعیت قرمز اتمی شد.', involvedCountries: [actor.id, target.id] });
    } else {
      target.gdpB = Math.max(80, Math.round(target.gdpB * 0.55));
      target.powerGrid = clamp(target.powerGrid - 55, 5, 100);
      target.approval = clamp(target.approval - 32, 5, 100);
      target.treasuryB = Math.round(target.treasuryB * 0.55);
      loseRandomWeaponUnit(target);
      loseRandomWeaponUnit(target);
      for (const other of Object.values(room.countries)) {
        if (other.id !== actor.id && !other.allies.includes(actor.id) && !actor.sanctionedBy.includes(other.id)) {
          actor.sanctionedBy.push(other.id);
        }
      }
      const msg = `☢️ فاجعه اتمی: اصابت کلاهک هسته‌ای ${actor.nameFa} به خاک ${target.nameFa}؛ فروپاشی ۴۵٪ اقتصاد هدف و تحریم جهانی مهاجم!`;
      summaries[actor.id].myOperations.push({ titleFa: `ضربه اتمی به ${target.nameFa}`, targetId: target.id, succeeded: true, detailFa: msg });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, titleFa: 'اصابت کلاهک هسته‌ای!', repelled: false, detailFa: msg });
      worldHighlightsFa.push(msg);
      addNews(room, { agencyFa: '🔴 وضعیت اضطراری جهانی (DEFCON 1)', category: 'WAR', breaking: true, headlineFa: msg, bodyFa: 'تمامی کشورهای غیرمتحد مهاجم را تحریم کردند.', involvedCountries: [actor.id, target.id] });
    }
    return;
  }

  room.market.globalTension = clamp(room.market.globalTension + 10, 0, 100);

  // 1. SEAD Drone Swarm (Shield-Breaker!)
  if (opType === 'SEAD_DRONE_SWARM') {
    const winPct = estimateMilitarySuccessPct(actor, target, 'SEAD_DRONE_SWARM');
    const succeeded = Math.random() * 100 < winPct;
    seadPenalty[target.id] = (seadPenalty[target.id] || 0) + (succeeded ? 35 : 15);
    if (succeeded) {
      target.radarIntegrity = clamp(target.radarIntegrity - 35, 15, 100);
    }
    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'DRONE',
      labelFa: 'موج پهپاد سپرشکن',
      intercepted: !succeeded,
    });
    const detail = succeeded
      ? `موج پهپادها پدافند ${target.nameFa} را ۳۵٪ اشباع و رادارها را تضعیف کرد!`
      : `بخش عمده پهپادها شکار شد اما ۱۵٪ از توان پدافند هدف کاسته شد.`;
    summaries[actor.id].myOperations.push({ titleFa: `موج پهپادی به ${target.nameFa}`, targetId: target.id, succeeded, detailFa: detail });
    summaries[target.id].incomingAttacks.push({ attackerId: actor.id, titleFa: `موج پهپاد انتحاری از ${actor.nameFa}`, repelled: !succeeded, detailFa: detail });
    return;
  }

  // 2. Full Combined-Arms Invasion (Two-sided casualties + War Loot!)
  if (opType === 'FULL_INVASION') {
    const winPct = estimateMilitarySuccessPct(actor, target, 'FULL_INVASION');
    const succeeded = Math.random() * 100 < winPct;

    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'INVASION',
      labelFa: succeeded ? 'پیشروی تهاجم همه‌جانبه!' : 'دفع تهاجم مرزی!',
      intercepted: !succeeded,
    });

    if (succeeded) {
      const lootB = Math.min(target.treasuryB, Math.round(28 + Math.random() * 25));
      const lootOil = Math.min(target.oilReserve, 50);
      target.treasuryB -= lootB;
      actor.treasuryB += lootB;
      target.oilReserve -= lootOil;
      actor.oilReserve += lootOil;
      target.approval = clamp(target.approval - 14, 0, 100);
      actor.approval = clamp(actor.approval + 5, 0, 100);

      const destroyedDefUnit = loseRandomWeaponUnit(target, ['ARMOR', 'AIR_DEFENSE', 'FIGHTER']);
      const attackerLossUnit = Math.random() < 0.35 ? loseRandomWeaponUnit(actor, ['ARMOR', 'DRONE']) : null;

      const detail = `پیروزی در نبرد سنگین! غنیمت جنگی: +$${lootB}B و +${lootOil} نفت${
        destroyedDefUnit ? ` | انهدام ۱× «${destroyedDefUnit}» دشمن` : ''
      }${attackerLossUnit ? ` (تلفات خودی: ۱× ${attackerLossUnit})` : ''}.`;

      summaries[actor.id].myOperations.push({ titleFa: `تهاجم همه‌جانبه به ${target.nameFa}`, targetId: target.id, succeeded: true, detailFa: detail });
      summaries[target.id].incomingAttacks.push({
        attackerId: actor.id,
        titleFa: `تهاجم سنگین ارتش ${actor.nameFa}!`,
        repelled: false,
        detailFa: `شکست خطوط دفاعی؛ از دست رفتن $${lootB}B خزانه و ${lootOil} واحد نفت!`,
      });

      const hl = `⚔️ نبرد تمام‌عیار: ارتش ${actor.nameFa} خطوط دفاعی ${target.nameFa} را شکافت ($${lootB}B غنیمت جنگی)!`;
      worldHighlightsFa.push(hl);
      roundBattles.push({
        id: uid('btl'),
        round: room.round,
        attacker: actor.id,
        defender: target.id,
        opTitleFa: 'تهاجم همه‌جانبه زمینی و دریایی',
        succeeded: true,
        interceptRatePct: defMil.interceptRate,
        summaryFa: detail,
        attackerLossesFa: attackerLossUnit || 'ناچیز',
        defenderLossesFa: destroyedDefUnit || `$${lootB}B خسارت`,
        lootB,
      });
      addNews(room, { agencyFa: 'رویترز جنگ', category: 'WAR', breaking: true, headlineFa: hl, bodyFa: detail, involvedCountries: [actor.id, target.id] });
    } else {
      // Repelled! Attacker suffers real unit loss!
      const lostAtk1 = loseRandomWeaponUnit(actor, ['ARMOR', 'FIGHTER', 'NAVAL']);
      actor.approval = clamp(actor.approval - 8, 0, 100);
      target.approval = clamp(target.approval + 6, 0, 100);

      const detail = `خطوط دفاعی ${target.nameFa} مقاومت کرد و تهاجم دفع شد!${
        lostAtk1 ? ` تلفات مهاجم: انهدام ۱× «${lostAtk1}».` : ''
      }`;
      summaries[actor.id].myOperations.push({ titleFa: `تهاجم همه‌جانبه به ${target.nameFa}`, targetId: target.id, succeeded: false, detailFa: detail });
      summaries[target.id].incomingAttacks.push({
        attackerId: actor.id,
        titleFa: `دفع قهرمانانه تهاجم ${actor.nameFa}!`,
        repelled: true,
        detailFa: `ارتش شما تهاجم دشمن را درهم شکست (+۶٪ رضایت مردم)!`,
      });
      const hl = `🛡️ شکست تهاجم نظامی ${actor.nameFa} در برابر مقاومت سنگین ارتش ${target.nameFa}!`;
      worldHighlightsFa.push(hl);
      addNews(room, { agencyFa: 'الجزیره نظامی', category: 'WAR', breaking: true, headlineFa: hl, bodyFa: detail, involvedCountries: [actor.id, target.id] });
    }
    return;
  }

  // 3. Precision Missile & Air Strike (Sector-targeted!)
  const effectiveIntercept = clamp(
    defMil.interceptRate - (seadPenalty[target.id] || 0) - actor.upgrades.AEROSPACE * 5 - Math.min(20, atkMil.stealthPower * 2),
    8,
    86
  );
  const penetrated = Math.random() * 100 >= effectiveIntercept * 0.78;
  const powerScale = 1 + actor.upgrades.AEROSPACE * 0.15;

  newVisuals.push({
    id: uid('vis'),
    round: room.round,
    from: actor.coordinates,
    to: target.coordinates,
    fromCountry: actor.id,
    toCountry: target.id,
    kind: 'MISSILE',
    labelFa: isCounterSalvo ? 'ضربه موشکی متقابل!' : 'حمله موشکی و هوایی',
    intercepted: !penetrated,
  });

  if (!penetrated) {
    const detail = `سپر پدافندی ${target.nameFa} (${effectiveIntercept}٪ رهگیری) موشک‌ها و جنگنده‌های مهاجم را در آسمان شکار کرد!`;
    summaries[actor.id].myOperations.push({ titleFa: `حمله موشکی به ${target.nameFa}`, targetId: target.id, succeeded: false, detailFa: detail });
    summaries[target.id].incomingAttacks.push({ attackerId: actor.id, titleFa: `حمله موشکی از ${actor.nameFa}`, repelled: true, detailFa: detail });
    addNews(room, {
      agencyFa: 'رویترز امنیتی',
      category: 'WAR',
      breaking: false,
      headlineFa: `رهگیری موفق پدافند ${target.nameFa} در برابر حمله موشکی ${actor.nameFa}`,
      bodyFa: detail,
      involvedCountries: [actor.id, target.id],
    });
    return;
  }

  let hitDetail = '';
  if (sector === 'REFINERY') {
    const oilBurned = Math.min(target.oilReserve, Math.round(45 * powerScale));
    target.oilReserve -= oilBurned;
    if (target.infrastructure.REFINERY > 1) target.infrastructure.REFINERY -= 1;
    hitDetail = `انهدام ۱ سطح پالایشگاه و سوختن ${oilBurned} واحد ذخیره نفت ${target.nameFa}!`;
  } else if (sector === 'POWER_PLANT') {
    const drop = clamp(Math.round(24 * powerScale), 12, 42);
    target.powerGrid = clamp(target.powerGrid - drop, 12, 100);
    target.approval = clamp(target.approval - 9, 0, 100);
    hitDetail = `اصابت مستقیم به نیروگاه‌ها؛ سقوط ${drop}٪ برق سراسری و کاهش رضایت مردم ${target.nameFa}!`;
  } else {
    const destroyedW = loseRandomWeaponUnit(target);
    const cashDmg = Math.min(target.treasuryB, Math.round(20 * powerScale));
    target.treasuryB -= cashDmg;
    hitDetail = destroyedW
      ? `انهدام ۱ واحد «${destroyedW}» در پایگاه‌های ${target.nameFa} + $${cashDmg}B خسارت نظامی!`
      : `$${cashDmg}B خسارت سنگین به پایگاه‌ها و انبارهای مهمات ${target.nameFa}!`;
  }

  summaries[actor.id].myOperations.push({
    titleFa: isCounterSalvo ? `ضربه متقابل فوری به ${target.nameFa}` : `حمله موشکی به ${target.nameFa}`,
    targetId: target.id,
    succeeded: true,
    detailFa: hitDetail,
  });
  summaries[target.id].incomingAttacks.push({
    attackerId: actor.id,
    titleFa: `اصابت موشک‌های ${actor.nameFa}!`,
    repelled: false,
    detailFa: hitDetail,
  });

  const hl = `🚀 اصابت سنگین موشک‌های ${actor.nameFa} به خاک ${target.nameFa}: ${hitDetail}`;
  worldHighlightsFa.push(hl);
  addNews(room, {
    agencyFa: 'رویترز فوری',
    category: 'WAR',
    breaking: true,
    headlineFa: hl,
    bodyFa: 'تصاویر ماهواره‌ای خسارت مستقیم به اهداف راهبردی را تایید کردند.',
    involvedCountries: [actor.id, target.id],
  });
}

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
      treasuryB: isAlly || hasRecentIntel ? c.treasuryB : Math.round(c.treasuryB / 50) * 50,
      warheads: isAlly || hasRecentIntel ? c.warheads : c.nuclearProgress >= 100 ? 1 : 0,
      // Keep weapons visible for tactical combat clarity on hover/battle preview, while hiding secret queued orders & reports!
      orders: [],
      intelReports: [],
      knownIntel: {},
      lastRoundSummary: null,
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
