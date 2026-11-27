import {
  computeCountryMilitary,
  computeEconomyProjection,
  evaluateCovertOpDetails,
  evaluateFalseFlagSabotageChance,
  evaluateMilitaryOpDetails,
  evaluateMinorOpDetails,
  evaluateStrategicRequestChance,
  getConstellationUpgradeInfo,
  getEmergencyActionCost,
  getGlobalSpotPrices,
  getIndigenousOrAllyWeaponCost,
  getInfraNextCost,
  getMaxBuildsPerRound,
  getMaxCovertOrdersPerRound,
  getMaxMilitaryOrdersPerRound,
  getMaxSpotSalesPerRound,
  getMaxUpgradesPerRound,
  getTotalConstellationSatellites,
  getUpgradeNextCost,
} from '../shared/advisor.js';
import {
  ALL_COUNTRY_IDS,
  createInitialCoalitions,
  createInitialCountries,
  createInitialMinorNations,
  getCalendarLabelFa,
  GLOBAL_FLASHPOINTS_CATALOG,
  INFRASTRUCTURE_CATALOG,
  INITIAL_CHOKEPOINTS,
  REAL_WORLD_EVENTS,
  SPACE_CONSTELLATIONS_CATALOG,
  UPGRADE_TRACKS,
  WEAPONS_CATALOG,
} from '../shared/realWorldData.js';
import {
  AlertPosture,
  BattleOutcomeLog,
  ChokepointId,
  ChokepointStatus,
  CinematicReplayEvent,
  CountryId,
  CountryState,
  CovertOpType,
  CreatorCheatPayload,
  DefconLevel,
  DiplomaticActionKind,
  DynamicMission,
  DynamicMissionKind,
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
  RankingEntry,
  RequestLeverageMode,
  ResolutionKind,
  RevealedSnapshot,
  RoundSummaryForCountry,
  SpaceConstellationId,
  StrategicRequest,
  StrategicRequestKind,
  StrikeTargetSector,
  TradeOffer,
  UltimatumDemand,
  UNResolution,
  UpgradeTrack,
} from '../shared/types.js';
import {
  adjustRelation,
  castAIVotesOnResolution,
  runLivingWorldAITurn,
  seedInitialAIStancesOnResolution,
} from './aiNations.js';

function pushPendingReplay(room: GameRoomState, ev: CinematicReplayEvent): void {
  const holder = room as GameRoomState & { _queuedReplays?: CinematicReplayEvent[] };
  if (!holder._queuedReplays) holder._queuedReplays = [];
  holder._queuedReplays.push(ev);
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-4)}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getElapsedMatchMs(room: GameRoomState): number {
  const base = room.savedElapsedMs || 0;
  if (!room.matchStartedAt) return base;
  const endRef = room.isPaused && room.pausedAt ? room.pausedAt : Date.now();
  return Math.max(base, base + (endRef - room.matchStartedAt - (room.accumulatedPausedMs || 0)));
}

function computeMissionCurrentValue(
  room: GameRoomState,
  c: CountryState,
  kind: DynamicMissionKind
): number {
  const upgradeSum = Object.values(c.upgrades).reduce((a, b) => a + (b || 0), 0);
  const minorControlled = Object.values(room.minorNations).filter(
    (m) => m.conqueredBy === c.id || m.alignedWith === c.id
  ).length;
  const mil = computeCountryMilitary(c);
  const totalSats = getTotalConstellationSatellites(c);

  switch (kind) {
    case 'ENERGY_EXPORT_DRIVE':
      return Math.round(c.treasuryB + c.oilReserve);
    case 'DIPLOMATIC_NETWORK':
      return c.approval >= 74 ? c.allies.length + (c.secretAllies?.length || 0) : Math.max(0, c.allies.length - 1);
    case 'REGIONAL_INFLUENCE':
      return minorControlled;
    case 'SPACE_CONSTELLATION':
      return totalSats;
    case 'DOCTRINE_BREAKTHROUGH':
      return upgradeSum;
    case 'STRATEGIC_DETERRENCE':
      return mil.attackScore + mil.defenseScore;
    case 'SANCTION_RESISTANCE':
      return (c.upgrades.ECONOMIC_SOVEREIGNTY || 0) + (c.upgrades.INDUSTRY || 0);
    case 'NATIONAL_RECONSTRUCTION':
      return Math.max(0, 100 - c.devastation) + c.powerGrid;
    case 'WELFARE_PROSPERITY':
      return c.approval + c.powerGrid;
    case 'COVERT_INTEL_SWEEP':
      return Object.keys(c.knownIntel || {}).length + c.upgrades.INTELLIGENCE;
  }
}

export function generateNextContextMission(
  room: GameRoomState,
  c: CountryState,
  excludeKinds: DynamicMissionKind[]
): DynamicMission {
  const upgradeSum = Object.values(c.upgrades).reduce((a, b) => a + (b || 0), 0);
  const minorControlled = Object.values(room.minorNations).filter(
    (m) => m.conqueredBy === c.id || m.alignedWith === c.id
  ).length;
  const mil = computeCountryMilitary(c);
  const totalSats = getTotalConstellationSatellites(c);
  const tierScale = 1 + Math.floor((c.completedMissionsCount || 0) / 3);

  const candidates: Array<{
    weight: number;
    kind: DynamicMissionKind;
    categoryFa: string;
    icon: string;
    titleFa: string;
    descFa: string;
    targetValue: number;
    rewardCashB: number;
    rewardScore: number;
    rewardBuffFa: string;
  }> = [
    {
      weight: c.devastation >= 22 || c.powerGrid < 80 ? 10 : 2,
      kind: 'NATIONAL_RECONSTRUCTION',
      categoryFa: 'بازسازی و تاب‌آوری',
      icon: '🏗️',
      titleFa: 'عملیات بزرگ بازسازی ملی و پایداری برق',
      descFa: 'مجموع شاخص (۱۰۰ منهای ویرانی) + پایداری شبکه برق را به حداقل ۱۸۲ برسانید.',
      targetValue: 182,
      rewardCashB: 58,
      rewardScore: 95,
      rewardBuffFa: '+$58B اعتبار بازسازی + ۹۵ امتیاز ثبات',
    },
    {
      weight: c.sanctionedBy.length >= 2 ? 10 : 3,
      kind: 'SANCTION_RESISTANCE',
      categoryFa: 'اقتصاد مقاومتی',
      icon: '🏦',
      titleFa: 'سپر بانکی ضدتحریم و جهش صنعتی',
      descFa: `مجموع سطح دکترین‌های «اقتصاد مقاومتی» و «ابرصنعت» را به ${Math.min(20, (c.upgrades.ECONOMIC_SOVEREIGNTY || 0) + (c.upgrades.INDUSTRY || 0) + 2)} برسانید.`,
      targetValue: Math.min(20, (c.upgrades.ECONOMIC_SOVEREIGNTY || 0) + (c.upgrades.INDUSTRY || 0) + 2),
      rewardCashB: 66,
      rewardScore: 115,
      rewardBuffFa: '+$66B ارز تجاری + ۱۱۵ امتیاز اقتصادی',
    },
    {
      weight: totalSats < 9 ? 8 : 1,
      kind: 'SPACE_CONSTELLATION',
      categoryFa: 'فرماندهی فضایی',
      icon: '🛰️',
      titleFa: 'گسترش منظومه‌های ماهواره‌ای در مدار زمین',
      descFa: `مجموع سطح ماهواره‌های فعال در منظومه‌های مداری خود را به ${Math.min(12, totalSats + 2)} برسانید.`,
      targetValue: Math.min(12, totalSats + 2),
      rewardCashB: 70,
      rewardScore: 125,
      rewardBuffFa: '+$70B بودجه فضایی + ۱۲۵ امتیاز فناوری',
    },
    {
      weight: 6,
      kind: 'DOCTRINE_BREAKTHROUGH',
      categoryFa: 'مرجعیت علمی و دکترین',
      icon: '🧬',
      titleFa: 'جهش دکترین‌های راهبردی کشور',
      descFa: `مجموع سطوح ۱۰ دکترین ملی خود را به ${Math.min(98, upgradeSum + 3)} برسانید.`,
      targetValue: Math.min(98, upgradeSum + 3),
      rewardCashB: 64,
      rewardScore: 120,
      rewardBuffFa: '+$64B پاداش علمی + ۱۲۰ امتیاز پیشرفت',
    },
    {
      weight: c.allies.length < 5 ? 6 : 2,
      kind: 'DIPLOMATIC_NETWORK',
      categoryFa: 'دیپلماسی فعال',
      icon: '🤝',
      titleFa: 'گسترش پیمان‌های دفاعی و محبوبیت ملی',
      descFa: `با حفظ رضایت بالای ۷۴٪، تعداد متحدان رسمی و محرمانه خود را به ${Math.max(3, c.allies.length + (c.secretAllies?.length || 0) + 1)} برسانید.`,
      targetValue: Math.max(3, c.allies.length + (c.secretAllies?.length || 0) + 1),
      rewardCashB: 56,
      rewardScore: 110,
      rewardBuffFa: '+$56B امتیاز تجاری + ۱۱۰ امتیاز نفوذ',
    },
    {
      weight: 6,
      kind: 'REGIONAL_INFLUENCE',
      categoryFa: 'ژئوپولیتیک جهانی',
      icon: '🏴',
      titleFa: 'توسعه پایگاه‌های برون‌مرزی و کشورهای هم‌سو',
      descFa: `تعداد کشورهای مستقل هم‌پیمان یا الحاق‌شده را به ${minorControlled + 2} برسانید.`,
      targetValue: minorControlled + 2,
      rewardCashB: 68,
      rewardScore: 125,
      rewardBuffFa: '+$68B درآمد راهبردی + ۱۲۵ امتیاز نفوذ',
    },
    {
      weight: c.oilProduction >= 55 ? 6 : 3,
      kind: 'ENERGY_EXPORT_DRIVE',
      categoryFa: 'انرژی و خزانه',
      icon: '🛢️',
      titleFa: 'انباشت ذخایر راهبردی ارز و انرژی',
      descFa: `مجموع خزانه ارزی + ذخیره نفت کشور را به ${Math.round(c.treasuryB + c.oilReserve + 140 * tierScale)} برسانید.`,
      targetValue: Math.round(c.treasuryB + c.oilReserve + 140 * tierScale),
      rewardCashB: 60,
      rewardScore: 105,
      rewardBuffFa: '+$60B سود صادراتی + ۱۰۵ امتیاز اقتصادی',
    },
    {
      weight: 5,
      kind: 'COVERT_INTEL_SWEEP',
      categoryFa: 'اشراف اطلاعاتی',
      icon: '🕵️',
      titleFa: 'شبکه اشراف اطلاعاتی بر قدرت‌های جهان',
      descFa: `مجموع پرونده‌های اشراف فعال روی رقبا + سطح سازمان اطلاعات را به ${Object.keys(c.knownIntel || {}).length + c.upgrades.INTELLIGENCE + 2} برسانید.`,
      targetValue: Object.keys(c.knownIntel || {}).length + c.upgrades.INTELLIGENCE + 2,
      rewardCashB: 54,
      rewardScore: 105,
      rewardBuffFa: '+$54B بودجه ویژه + ۱۰۵ امتیاز اطلاعاتی',
    },
    {
      weight: mil.totalUnits < 20 ? 5 : 2,
      kind: 'STRATEGIC_DETERRENCE',
      categoryFa: 'بازدارندگی دفاعی',
      icon: '🛡️',
      titleFa: 'ارتقای سپر بازدارندگی نیروهای مسلح',
      descFa: `مجموع شاخص قدرت تهاجمی و پدافندی ارتش خود را به ${mil.attackScore + mil.defenseScore + 110} برسانید.`,
      targetValue: mil.attackScore + mil.defenseScore + 110,
      rewardCashB: 58,
      rewardScore: 100,
      rewardBuffFa: '+$58B بودجه دفاعی + ۱۰۰ امتیاز بازدارندگی',
    },
  ];

  const filtered = candidates.filter((cand) => !excludeKinds.includes(cand.kind));
  const pool = filtered.length > 0 ? filtered : candidates;
  const totalW = pool.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * totalW;
  let picked = pool[0];
  for (const item of pool) {
    r -= item.weight;
    if (r <= 0) {
      picked = item;
      break;
    }
  }

  return {
    id: uid('msn-dyn'),
    kind: picked.kind,
    categoryFa: picked.categoryFa,
    icon: picked.icon,
    titleFa: picked.titleFa,
    descFa: picked.descFa,
    targetValue: picked.targetValue,
    currentValue: computeMissionCurrentValue(room, c, picked.kind),
    rewardCashB: picked.rewardCashB,
    rewardScore: picked.rewardScore,
    rewardBuffFa: picked.rewardBuffFa,
    completed: false,
    completedRound: null,
    createdRound: room.round,
  };
}

export function refreshSecretMissions(room: GameRoomState): void {
  for (const c of Object.values(room.countries)) {
    if (c.isEliminated) continue;
    if (!c.secretMissions) c.secretMissions = [];

    // Ensure every country always has 3 active dynamic missions!
    while (c.secretMissions.length < 3) {
      const existingKinds = c.secretMissions.map((x) => x.kind);
      c.secretMissions.push(generateNextContextMission(room, c, existingKinds));
    }

    for (let i = 0; i < c.secretMissions.length; i++) {
      const m = c.secretMissions[i];
      m.currentValue = computeMissionCurrentValue(room, c, m.kind);

      if (!m.completed && m.currentValue >= m.targetValue) {
        m.completed = true;
        m.completedRound = room.round;
        c.treasuryB += m.rewardCashB;
        c.missionBonusScore = (c.missionBonusScore || 0) + m.rewardScore;
        c.completedMissionsCount = (c.completedMissionsCount || 0) + 1;

        addIntel(
          c,
          room.round,
          'SUCCESS',
          `🎯 ماموریت تکمیل شد: ${m.titleFa}`,
          `پاداش ماموریت (+$${m.rewardCashB}B بودجه و +${m.rewardScore} امتیاز پیروزی) به حساب کشور شما واریز شد و ماموریت جدید جایگزین گردید!`
        );

        // Immediately rotate in a fresh context-aware mission!
        const otherKinds = c.secretMissions.filter((_, idx) => idx !== i).map((x) => x.kind);
        c.secretMissions[i] = generateNextContextMission(room, c, [...otherKinds, m.kind]);
      }
    }
  }
}

export function rerollCountryMission(
  room: GameRoomState,
  countryId: CountryId,
  missionId: string
): { ok: boolean; messageFa?: string; errorFa?: string } {
  const c = room.countries[countryId];
  if (!c || c.isEliminated) return { ok: false, errorFa: 'کشور غیرفعال است.' };
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
  if ((c.missionRerollsUsedThisRound || 0) >= 1) {
    return { ok: false, errorFa: 'در هر ماه حداکثر ۱ بار می‌توانید ماموریت را رایگان تعویض کنید.' };
  }
  const idx = c.secretMissions.findIndex((m) => m.id === missionId);
  if (idx === -1) return { ok: false, errorFa: 'ماموریت مورد نظر یافت نشد.' };

  const old = c.secretMissions[idx];
  const exclude = c.secretMissions.map((m) => m.kind);
  const nextMission = generateNextContextMission(room, c, exclude);
  c.secretMissions[idx] = nextMission;
  c.missionRerollsUsedThisRound = (c.missionRerollsUsedThisRound || 0) + 1;

  return {
    ok: true,
    messageFa: `🔄 ماموریت «${old.titleFa}» تعویض شد و ماموریت جدید «${nextMission.titleFa}» فعال گردید!`,
  };
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
    schemaVersion: 6,
    roomCode,
    roomName: roomName || `اتاق جنگ ${roomCode}`,
    createdAt: Date.now(),
    matchStartedAt: null,
    pausedAt: null,
    accumulatedPausedMs: 0,
    savedElapsedMs: 0,
    phase: 'LOBBY',
    isPaused: false,
    pausedRemainingMs: null,
    isResumedSave: false,
    lastSavedCode: null,
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
        isReadyInLobby: true,
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
    activeFlashpoint: null,
    lastRoundReplay: [],
    news: [
      {
        id: uid('news'),
        round: 1,
        monthLabelFa: cal,
        timestamp: Date.now(),
        agencyFa: 'رویترز جهانی / شورای امنیت سازمان ملل',
        category: 'WORLD_EVENT',
        breaking: true,
        headlineFa: `آغاز کارزار جهانی فرماندهی کل ۶.۰ (${
          settings.difficulty === 'EXTREME'
            ? 'درجه سختی فوق‌سنگین'
            : settings.difficulty === 'HARD'
            ? 'درجه سختی چالشی'
            : 'استاندارد راهبردی'
        })؛ ۴ منظومه فضایی، ماموریت‌های پویا و درخواست‌های هوشمند فعال شدند`,
        bodyFa:
          'اقتصاد کلان با هزینه‌های نگهداری واقعی، ۱۰ دکترین ملی، ۴ منظومه مداری، عملیات پرچم دروغین و سینمای خبری جهان آماده نبرد راهبردی است.',
        involvedCountries: [],
      },
    ],
    battles: [],
    visualEvents: [],
    trades: [],
    strategicRequests: [],
    messages: [],
    resolutions: [],
    winnerSummaryFa: null,
    rankings: [],
  };

  refreshSecretMissions(room);
  updateRankingsAndDefcon(room);
  return room;
}

export function prepareResumedRoom(
  savedRoom: GameRoomState,
  hostId: string,
  hostName: string,
  newCode: string
): GameRoomState {
  const cloned = JSON.parse(JSON.stringify(savedRoom)) as GameRoomState;
  cloned.schemaVersion = 6;
  cloned.savedElapsedMs = getElapsedMatchMs(savedRoom);
  cloned.matchStartedAt = null;
  cloned.pausedAt = null;
  cloned.accumulatedPausedMs = 0;
  cloned.roomCode = newCode;
  cloned.createdAt = Date.now();
  cloned.phase = 'LOBBY';
  cloned.isPaused = false;
  cloned.pausedRemainingMs = null;
  cloned.phaseEndsAt = null;
  cloned.isResumedSave = true;
  cloned.winnerSummaryFa = null;
  if (!cloned.strategicRequests) cloned.strategicRequests = [];

  for (const c of Object.values(cloned.countries)) {
    c.playerId = null;
    c.playerName = null;
    c.isOnline = false;
    c.isReady = false;
    c.incomingAlertActive = false;
    c.alertPostureConfirmed = false;
    if (!c.secretAllies) c.secretAllies = [];
    if (!c.constellations) {
      c.constellations = {
        RECON_OPTICAL: Math.min(3, c.orbitalSatellites || 0),
        GNSS_NAVI: 0,
        SBIRS_SHIELD: 0,
        SATCOM_EW: 0,
      };
    }
    c.orbitalSatellites = getTotalConstellationSatellites(c);
    if (c.upgrades.SPACE_ORBITAL === undefined) c.upgrades.SPACE_ORBITAL = 2;
    if (c.upgrades.ECONOMIC_SOVEREIGNTY === undefined) c.upgrades.ECONOMIC_SOVEREIGNTY = 2;
    if (c.missionBonusScore === undefined) c.missionBonusScore = 0;
    if (c.completedMissionsCount === undefined) c.completedMissionsCount = 0;
    if (c.missionRerollsUsedThisRound === undefined) c.missionRerollsUsedThisRound = 0;
    if (c.spotSalesUsedThisRound === undefined) c.spotSalesUsedThisRound = 0;
    if (!c.requestsSentToThisRound) c.requestsSentToThisRound = [];
    if (!c.sabotageCooldowns) c.sabotageCooldowns = {};
    c.secretMissions = [];
  }

  cloned.players = [
    {
      id: hostId,
      name: hostName,
      isHost: true,
      isGM: cloned.settings.gmMode === 'HUMAN',
      isReadyInLobby: true,
      countryId: null,
      connected: true,
    },
  ];

  refreshSecretMissions(cloned);
  updateRankingsAndDefcon(cloned);
  return cloned;
}

export function resetRoomForRematch(room: GameRoomState): void {
  const freshCountries = createInitialCountries();
  const freshMinors = createInitialMinorNations();
  const freshCoalitions = createInitialCoalitions();
  const freshChokepoints = JSON.parse(JSON.stringify(INITIAL_CHOKEPOINTS));
  const cal = getCalendarLabelFa(1);

  room.phase = 'LOBBY';
  room.matchStartedAt = null;
  room.pausedAt = null;
  room.accumulatedPausedMs = 0;
  room.savedElapsedMs = 0;
  room.isPaused = false;
  room.pausedRemainingMs = null;
  room.isResumedSave = false;
  room.round = 1;
  room.calendarLabelFa = cal;
  room.phaseEndsAt = null;
  room.defcon = 5;
  room.countries = freshCountries;
  room.minorNations = freshMinors;
  room.coalitions = freshCoalitions;
  room.chokepoints = freshChokepoints;
  room.market = {
    oilPriceUsd: 82,
    gasPriceIndex: 100,
    foodPriceIndex: 100,
    globalTension: 20,
  };
  room.activeFlashpoint = null;
  room.lastRoundReplay = [];
  room.news = [
    {
      id: uid('news'),
      round: 1,
      monthLabelFa: cal,
      timestamp: Date.now(),
      agencyFa: 'رویترز جهانی',
      category: 'WORLD_EVENT',
      breaking: true,
      headlineFa: 'آغاز دور جدید کارزار جهانی در همین لابی؛ کشورهای خود را انتخاب کنید!',
      bodyFa: 'تمامی آمار، مرزها و ذخایر استراتژیک برای رقابت جدید بازنشانی شدند.',
      involvedCountries: [],
    },
  ];
  room.battles = [];
  room.visualEvents = [];
  room.trades = [];
  room.strategicRequests = [];
  room.messages = [];
  room.resolutions = [];
  room.winnerSummaryFa = null;
  delete (room as GameRoomState & { _queuedReplays?: CinematicReplayEvent[] })._queuedReplays;

  room.players = room.players.filter((p) => p.connected);
  for (const p of room.players) {
    p.countryId = null;
    p.isReadyInLobby = p.isHost;
    if (room.settings.gmMode !== 'HUMAN') p.isGM = false;
  }
  if (room.players.length > 0 && !room.players.some((p) => p.isHost)) {
    room.players[0].isHost = true;
  }

  updateRankingsAndDefcon(room);
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
  const protectorateByCountry: Partial<Record<CountryId, number>> = {};
  for (const m of Object.values(room.minorNations)) {
    if (m.conqueredBy) {
      annexedCountByCountry[m.conqueredBy] = (annexedCountByCountry[m.conqueredBy] || 0) + 1;
    } else if (m.alignedWith) {
      protectorateByCountry[m.alignedWith] = (protectorateByCountry[m.alignedWith] || 0) + 1;
    }
  }
  for (const c of Object.values(room.countries)) {
    if (c.conqueredBy) {
      annexedCountByCountry[c.conqueredBy] = (annexedCountByCountry[c.conqueredBy] || 0) + 2;
    }
  }

  const rawList: RankingEntry[] = Object.values(room.countries).map((c) => {
    const mil = computeCountryMilitary(c);
    const upgradeSum = Object.values(c.upgrades).reduce((a, b) => a + (b || 0), 0);
    const territoriesCount = annexedCountByCountry[c.id] || 0;
    const protectorates = protectorateByCountry[c.id] || 0;
    const totalSats = getTotalConstellationSatellites(c);
    const infraSum = Object.values(c.infrastructure).reduce((a, b) => a + (b || 0), 0);

    // Anti-Weapon-Spam Balanced Leaderboard Formula (v6.0 Item #8!):
    // Military units use diminishing returns (Math.sqrt) + hard cap (350 pts) so hoarding weapons
    // cannot win the game! Players & AI must build GDP, Science, Space, Welfare, Alliances & Missions!
    const economicScore = Math.round(
      c.gdpB * 0.34 +
        Math.min(480, c.treasuryB) * 0.22 +
        Math.min(900, c.oilReserve + c.gasReserve + c.foodReserve + (c.waterReserve || 0)) * 0.08 +
        infraSum * 11 +
        (c.upgrades.ECONOMIC_SOVEREIGNTY || 0) * 14 +
        territoriesCount * 36
    );
    const rawCombatPower = mil.attackScore + mil.defenseScore;
    const cappedDeterrence = Math.round(Math.sqrt(Math.max(0, rawCombatPower)) * 8.4);
    const warheadDeterrence = Math.round(Math.sqrt(Math.max(0, c.warheads)) * 22);
    const militaryScore = Math.min(350, cappedDeterrence + warheadDeterrence + mil.veteranStars * 14);

    const techScore = Math.round(
      upgradeSum * 13 +
        (c.infrastructure.SCIENCE_ACADEMY || 0) * 16 +
        totalSats * 26 +
        c.techLevel * 10 +
        (c.upgrades.SPACE_ORBITAL || 0) * 10
    );
    const stabilityScore = Math.max(
      0,
      Math.round(c.approval * 2.2 + c.powerGrid * 1.1 + c.integrityPct * 1.1 - c.devastation * 1.85)
    );
    const influenceScore = Math.max(
      0,
      Math.round(
        c.allies.length * 28 +
          territoriesCount * 34 +
          protectorates * 18 +
          (c.coalitionId ? 26 : 0) +
          (c.missionBonusScore || 0) +
          c.upgrades.INTELLIGENCE * 11 -
          c.sanctionedBy.length * 12
      )
    );

    const score = c.isEliminated
      ? 0
      : Math.max(10, economicScore + militaryScore + techScore + stabilityScore + influenceScore);

    let tierFa: RankingEntry['tierFa'] = 'قدرت منطقه‌ای';
    if (c.isEliminated) tierFa = 'سقوط‌کرده';
    else if (c.devastation >= 58 || c.approval <= 28) tierFa = 'در بحران';

    return {
      countryId: c.id,
      score,
      tierFa,
      economicScore,
      militaryScore,
      techScore,
      stabilityScore,
      influenceScore,
      territoriesCount,
      totalUnits: mil.totalUnits,
      gdpB: c.gdpB,
    };
  });

  rawList.sort((a, b) => b.score - a.score);
  rawList.forEach((entry, idx) => {
    const c = room.countries[entry.countryId];
    if (c.isEliminated) {
      entry.tierFa = 'سقوط‌کرده';
    } else if (c.devastation >= 58 || c.approval <= 28) {
      entry.tierFa = 'در بحران';
    } else if (idx < 3 || entry.score >= 1350) {
      entry.tierFa = 'ابرقدرت جهانی';
    } else if (idx < 9 || entry.score >= 900) {
      entry.tierFa = 'قدرت بزرگ';
    } else {
      entry.tierFa = 'قدرت منطقه‌ای';
    }
  });

  room.rankings = rawList;
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
  if (room.news.length > 100) {
    room.news.length = 100;
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
    foodReserve: target.foodReserve,
    waterReserve: target.waterReserve || 0,
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
  target.occupierId = conqueror ? conqueror.id : null;
  target.orders = [];
  target.isReady = false;
  target.incomingAlertActive = false;
  target.incomingThreatsSummaryFa = [];

  if (conqueror && !conqueror.isEliminated) {
    const seizedCash = Math.round(target.treasuryB * 0.5);
    const seizedOil = Math.round(target.oilReserve * 0.45);
    target.treasuryB -= seizedCash;
    target.oilReserve -= seizedOil;
    conqueror.treasuryB += seizedCash;
    conqueror.oilReserve += seizedOil;
    conqueror.gdpB += Math.round(target.gdpB * 0.22);

    for (const m of Object.values(room.minorNations)) {
      if (m.conqueredBy === target.id) {
        m.conqueredBy = conqueror.id;
        m.occupierId = conqueror.id;
        m.occupationPct = 100;
      }
    }
  }

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
    ? `🏴 سقوط تاریخی پایتخت ${target.nameFa}! ارتش ${conqueror.nameFa} خاک این کشور را ضمیمه کرد و دولت آن حذف شد!`
    : `🔥 فروپاشی کامل کابینه و سقوط دولت در ${target.nameFa}! این کشور از صحنه رقابت حذف شد!`;

  worldHighlightsFa.push(headline);
  addNews(room, {
    agencyFa: 'خبرگزاری فوری رویترز / الجزیره',
    category: 'WAR',
    breaking: true,
    headlineFa: headline,
    bodyFa: reasonFa,
    involvedCountries: conqueror ? [conqueror.id, target.id] : [target.id],
  });
}

// ============================================================================
// INSTANT ECONOMIC, DOCTRINE, ARMS BUY/SELL, DIPLOMACY & COALITION ACTIONS
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
  if (room.isPaused) return { ok: false, errorFa: 'بازی توسط میزبان متوقف (Pause) شده است.' };

  const maxUps = getMaxUpgradesPerRound(c);
  if (c.upgradesUsedThisRound >= maxUps) {
    return {
      ok: false,
      errorFa:
        maxUps < 3
          ? `ظرفیت پژوهش این ماه (${maxUps}/${maxUps}) تکمیل شد! با ساخت «🔬 قطب علم و دانشگاه ملی» به سطح ۵ و ۱۱ می‌توانید ظرفیت پژوهش را به ۲ و ۳ ارتقا در ماه برسانید.`
          : `سقف پژوهش ماهانه (${maxUps}/${maxUps}) تکمیل شده است؛ در ماه آینده ادامه دهید!`,
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
  if (track === 'AEROSPACE' || track === 'SPACE_ORBITAL') c.techLevel = clamp(c.techLevel + 1, 1, 12);
  if (track === 'INDUSTRY') c.gdpB += 32;
  if (track === 'ECONOMIC_SOVEREIGNTY') {
    c.gdpB += 20;
    c.approval = clamp(c.approval + 3, 0, 100);
  }
  if (track === 'SPACE_ORBITAL' && nextLv === 10) {
    c.radarIntegrity = 100;
  }
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

  refreshSecretMissions(room);
  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `⭐ «${spec.nameFa}» به سطح ${nextLv}/${spec.maxLevel} ارتقا یافت! (${c.upgradesUsedThisRound}/${maxUps} پژوهش این ماه)`,
  };
}

export function instantUpgradeConstellation(
  room: GameRoomState,
  countryId: CountryId,
  constellationId: SpaceConstellationId
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const spec = SPACE_CONSTELLATIONS_CATALOG[constellationId];
  if (!c || c.isEliminated || !spec) return { ok: false, errorFa: 'منظومه فضایی نامعتبر است.' };
  if (room.phase !== 'PLANNING') return { ok: false, errorFa: 'پرتاب فضایی فقط در فاز برنامه‌ریزی مجاز است.' };
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };

  const info = getConstellationUpgradeInfo(c, constellationId, room.settings.difficulty);
  if (!info.canUpgrade) {
    return { ok: false, errorFa: info.lockedReasonFa || 'پیش‌نیاز پرتاب فضایی فراهم نیست.' };
  }

  c.treasuryB -= info.costB;
  c.oilReserve = Math.max(0, c.oilReserve - info.fuelCost);
  const nextLv = info.currentLevel + 1;
  c.constellations[constellationId] = nextLv;
  c.orbitalSatellites = getTotalConstellationSatellites(c);
  if (constellationId === 'SBIRS_SHIELD') c.radarIntegrity = 100;
  if (constellationId === 'SATCOM_EW') c.cyberShield = clamp(c.cyberShield + 6, 0, 99);

  const hl = `🛰️ پرتاب مداری موفق: ${c.nameFa} «${spec.nameFa}» را به سطح ${nextLv}/3 ارتقا داد!`;
  addNews(room, {
    agencyFa: 'فرماندهی فضایی / رویترز فناوری',
    category: 'WORLD_EVENT',
    breaking: nextLv >= 2,
    headlineFa: hl,
    bodyFa: spec.perLevelBonusFa,
    involvedCountries: [c.id],
  });

  pushPendingReplay(room, {
    id: uid('rep-sat'),
    round: room.round,
    from: c.coordinates,
    to: [c.coordinates[0] + 6, Math.min(72, c.coordinates[1] + 10)],
    attackerId: c.id,
    attackerNameFa: c.nameFa,
    defenderId: c.id,
    targetNameFa: spec.nameFa,
    kind: 'SPACE_LAUNCH',
    succeeded: true,
    intercepted: false,
    headlineFa: hl,
    impactBadgeFa: `${spec.icon} استقرار منظومه سطح ${nextLv} در مدار!`,
    categoryLabelFa: 'فرماندهی فضایی و مدار زمین',
  });

  refreshSecretMissions(room);
  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `${spec.icon} «${spec.nameFa}» با موفقیت به سطح ${nextLv}/3 در مدار زمین رسید!`,
  };
}

export function instantLaunchSatellite(
  room: GameRoomState,
  countryId: CountryId
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  if (!c) return { ok: false, errorFa: 'کشور نامعتبر است.' };
  const order: SpaceConstellationId[] = ['RECON_OPTICAL', 'GNSS_NAVI', 'SBIRS_SHIELD', 'SATCOM_EW'];
  const pick = order.sort((a, b) => (c.constellations[a] || 0) - (c.constellations[b] || 0))[0];
  return instantUpgradeConstellation(room, countryId, pick);
}

export function instantRespondFlashpoint(
  room: GameRoomState,
  countryId: CountryId,
  choice: 'A' | 'B' | 'C'
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const fp = room.activeFlashpoint;
  if (!c || c.isEliminated || !fp) return { ok: false, errorFa: 'بحران جهانی فعالی وجود ندارد.' };
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
  if (fp.chosenBy[countryId]) return { ok: false, errorFa: 'واکنش کشور شما به این رویداد قبلاً ثبت شده است.' };

  const opt = fp.options.find((o) => o.id === choice);
  if (!opt) return { ok: false, errorFa: 'گزینه نامعتبر است.' };
  if (c.treasuryB < opt.costB) {
    return { ok: false, errorFa: `برای این تصمیم به $${opt.costB}B بودجه نیاز دارید.` };
  }

  c.treasuryB -= opt.costB;
  fp.chosenBy[countryId] = choice;

  if (fp.id === 'fp_arctic_lithium') {
    if (choice === 'A') {
      c.gdpB += 48;
      c.techLevel = clamp(c.techLevel + 1, 1, 12);
    } else if (choice === 'B') {
      c.oilReserve += 70;
      c.gasReserve += 60;
      room.market.globalTension = clamp(room.market.globalTension + 5, 0, 100);
    } else {
      c.approval = clamp(c.approval + 12, 0, 100);
      for (const other of Object.values(room.countries)) {
        if (other.id !== c.id) adjustRelation(c, other, 5);
      }
    }
  } else if (fp.id === 'fp_rogue_satellite') {
    if (choice === 'A') {
      c.intelLevel = clamp(c.intelLevel + 1, 1, 12);
      c.cyberShield = clamp(c.cyberShield + 15, 0, 99);
    } else if (choice === 'B') {
      c.treasuryB += 38;
    } else {
      c.radarIntegrity = 100;
      c.militaryXp += 15;
    }
  } else if (fp.id === 'fp_semiconductor_shock') {
    if (choice === 'A') {
      c.infrastructure.SCIENCE_ACADEMY = clamp((c.infrastructure.SCIENCE_ACADEMY || 0) + 1, 0, 16);
      c.gdpB += 25;
    } else if (choice === 'B') {
      c.powerGrid = clamp(c.powerGrid + 20, 0, 100);
      c.securityAlertBonus = clamp(c.securityAlertBonus + 12, 0, 28);
    } else {
      c.treasuryB += 34;
    }
  } else {
    if (choice === 'A') {
      c.waterReserve = (c.waterReserve || 0) + 90;
      c.foodReserve += 90;
      c.approval = clamp(c.approval + 10, 0, 100);
    } else if (choice === 'B') {
      c.approval = clamp(c.approval + 8, 0, 100);
      for (const other of Object.values(room.countries)) {
        if (other.id !== c.id) adjustRelation(c, other, 8);
      }
    } else {
      c.treasuryB += 32;
      c.approval = clamp(c.approval - 4, 0, 100);
    }
  }

  refreshSecretMissions(room);
  updateRankingsAndDefcon(room);
  return { ok: true, messageFa: `⚡ تصمیم کابینه در بحران جهانی ثبت شد: ${opt.effectFa}` };
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
  if (room.isPaused) return { ok: false, errorFa: 'بازی توسط میزبان متوقف شده است.' };

  const maxBuilds = getMaxBuildsPerRound(c);
  if (c.buildsUsedThisRound >= maxBuilds) {
    return {
      ok: false,
      errorFa: `ظرفیت عمرانی این ماه پر شده (${maxBuilds}/${maxBuilds}). با ارتقای «ابرصنعت» ظرفیت ماهانه را بیشتر کنید!`,
    };
  }

  const costInfo = getInfraNextCost(c, infraType, room.settings.difficulty);
  if (!costInfo.isRebuild && c.infrastructure[infraType] >= spec.maxLevel) {
    return {
      ok: false,
      errorFa: 'این زیرساخت در سقف سطح قرار دارد؛ برای ترمیم خسارات جنگ از «بازسازی اضطراری» استفاده کنید.',
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
  c.infrastructure[infraType] = (c.infrastructure[infraType] || 0) + 1;

  if (infraType === 'POWER_PLANT') c.powerGrid = clamp(c.powerGrid + 16, 0, 100);
  if (infraType === 'WELFARE_HUB') {
    c.approval = clamp(c.approval + 9, 0, 100);
    c.devastation = clamp(c.devastation - 8, 0, 100);
    c.foodReserve += 25;
    c.waterReserve = (c.waterReserve || 0) + 30;
  }
  if (infraType === 'SCIENCE_ACADEMY') {
    c.techLevel = clamp(c.techLevel + 1, 1, 12);
    c.gdpB += 12;
  }
  if (infraType === 'RADAR_NETWORK') c.radarIntegrity = 100;
  if (infraType === 'CYBER_HQ') c.cyberShield = clamp(c.cyberShield + 8, 0, 99);
  if (infraType === 'REFINERY') {
    c.oilReserve += 22;
    c.gasReserve += 16;
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
  const sciBonusMsg =
    infraType === 'SCIENCE_ACADEMY' && (c.infrastructure.SCIENCE_ACADEMY === 5 || c.infrastructure.SCIENCE_ACADEMY === 11)
      ? ` — 🎓 ظرفیت پژوهش دکترین به ${getMaxUpgradesPerRound(c)} جهش در ماه افزایش یافت!`
      : '';
  return {
    ok: true,
    messageFa: costInfo.isRebuild
      ? `🔧 ویرانه‌های «${spec.nameFa}» بازسازی شد (سطح ${c.infrastructure[infraType]})!`
      : `🏗️ «${spec.nameFa}» به سطح ${c.infrastructure[infraType]} رسید!${sciBonusMsg}`,
  };
}

export function instantEmergencyAction(
  room: GameRoomState,
  countryId: CountryId,
  kind: EmergencyActionKind
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  if (!c || c.isEliminated) return { ok: false, errorFa: 'کشور غیرفعال است.' };
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
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

  c.approval = clamp(c.approval + 14, 0, 100);
  c.devastation = clamp(c.devastation - 20, 0, 100);
  c.foodReserve += 15;
  c.waterReserve = (c.waterReserve || 0) + 15;
  c.regimeCrisisStreak = 0;
  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `🏥 بسته امداد ملی اجرا شد (+۱۴٪ رضایت مردم، -۲۰٪ بحران ویرانی و توزیع آب و غذا)!`,
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
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };

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

export function instantSellWeapon(
  room: GameRoomState,
  countryId: CountryId,
  weaponId: string,
  qty = 1
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  const spec = WEAPONS_CATALOG[weaponId];
  if (!c || c.isEliminated || !spec) return { ok: false, errorFa: 'سامانه تسلیحاتی نامعتبر است.' };
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };

  const count = clamp(qty, 1, 5);
  if ((c.weapons[weaponId] || 0) < count) {
    return { ok: false, errorFa: 'موجودی این سامانه در زرادخانه شما کافی نیست.' };
  }

  const access = getIndigenousOrAllyWeaponCost(c, weaponId, room.settings.difficulty);
  const refund = access.sellRefundB * count;
  c.weapons[weaponId] -= count;
  if (c.weapons[weaponId] <= 0) delete c.weapons[weaponId];
  c.treasuryB += refund;

  updateRankingsAndDefcon(room);
  return {
    ok: true,
    messageFa: `💰 ${count}× «${spec.nameFa}» به بازار دفاعی فروخته شد و +$${refund}B نقد به خزانه واریز گردید!`,
  };
}

export function instantSpotTrade(
  room: GameRoomState,
  countryId: CountryId,
  resource: 'OIL' | 'GAS' | 'FOOD' | 'WATER' | 'URANIUM',
  mode: 'BUY' | 'SELL'
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  if (!c || c.isEliminated) return { ok: false, errorFa: 'کشور غیرفعال است.' };
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
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
        : resource === 'WATER'
        ? spot.waterBuy50B
        : spot.uraniumBuy20B;
    const qty = resource === 'URANIUM' ? 20 : 50;

    if (c.treasuryB < cost) {
      return { ok: false, errorFa: `بودجه خزانه کافی نیست ($${cost}B لازم است).` };
    }
    c.treasuryB -= cost;
    if (resource === 'OIL') c.oilReserve += qty;
    else if (resource === 'GAS') c.gasReserve += qty;
    else if (resource === 'FOOD') c.foodReserve += qty;
    else if (resource === 'WATER') c.waterReserve = (c.waterReserve || 0) + qty;
    else c.uraniumReserve += qty;

    updateRankingsAndDefcon(room);
    return { ok: true, messageFa: `🛒 +${qty} واحد از بورس جهانی خریداری شد (-$${cost}B)` };
  } else {
    if (resource === 'URANIUM') {
      return { ok: false, errorFa: 'فروش اورانیوم در بورس آزاد مجاز نیست؛ از قرارداد دوجانبه استفاده کنید.' };
    }
    const maxSales = getMaxSpotSalesPerRound(c);
    if ((c.spotSalesUsedThisRound || 0) >= maxSales) {
      return {
        ok: false,
        errorFa: `سقف فروش در بورس آزاد این ماه (${maxSales}/${maxSales}) پر شده است! برای فروش بیشتر با سایر کشورها قرارداد دوجانبه ببندید یا دکترین «اقتصاد مقاومتی» را ارتقا دهید.`,
      };
    }
    const qty = 50;
    const rawGain =
      resource === 'OIL'
        ? spot.oilSell50B
        : resource === 'GAS'
        ? spot.gasSell50B
        : resource === 'FOOD'
        ? spot.foodSell50B
        : spot.waterSell50B;
    const gain = Math.max(6, Math.round(rawGain * sanctionDiscount));

    if (resource === 'OIL') {
      if (c.oilReserve < qty) return { ok: false, errorFa: 'حداقل ۵۰ واحد نفت در انبار نیاز دارید.' };
      c.oilReserve -= qty;
    } else if (resource === 'GAS') {
      if (c.gasReserve < qty) return { ok: false, errorFa: 'حداقل ۵۰ واحد گاز در انبار نیاز دارید.' };
      c.gasReserve -= qty;
    } else if (resource === 'FOOD') {
      if (c.foodReserve < qty) return { ok: false, errorFa: 'حداقل ۵۰ واحد غلات و غذا در انبار نیاز دارید.' };
      c.foodReserve -= qty;
    } else {
      if ((c.waterReserve || 0) < qty) return { ok: false, errorFa: 'حداقل ۵۰ واحد ذخیره آب نیاز دارید.' };
      c.waterReserve -= qty;
    }

    c.spotSalesUsedThisRound = (c.spotSalesUsedThisRound || 0) + 1;
    c.treasuryB += gain;
    refreshSecretMissions(room);
    updateRankingsAndDefcon(room);
    return {
      ok: true,
      messageFa: `💰 ۵۰ واحد در بورس جهانی فروخته شد (+$${gain}B | فروش ${c.spotSalesUsedThisRound}/${maxSales} این ماه)`,
    };
  }
}

export function instantSetChokepoint(
  room: GameRoomState,
  countryId: CountryId,
  status: ChokepointStatus
): { ok: boolean; errorFa?: string; messageFa?: string } {
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
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

  pushPendingReplay(room, {
    id: uid('rep-cp'),
    round: room.round,
    from: actor.coordinates,
    to: cp.coordinates,
    attackerId: countryId,
    attackerNameFa: actor.nameFa,
    targetNameFa: cp.nameFa,
    kind: 'CHOKEPOINT',
    succeeded: true,
    intercepted: status === 'OPEN',
    headlineFa:
      status === 'BLOCKADED'
        ? `⚓ انسداد استراتژیک! ناوگان ${actor.nameFa} آبراه «${cp.nameFa}» را بست (نفت: $${room.market.oilPriceUsd})`
        : status === 'RESTRICTED'
        ? `⚓ برقراری ایست بازرسی نظامی در «${cp.nameFa}» توسط ${actor.nameFa}`
        : `⚓ بازگشایی کامل کشتیرانی بین‌المللی در «${cp.nameFa}» توسط ${actor.nameFa}`,
    impactBadgeFa:
      status === 'BLOCKADED' ? '🚨 انسداد کامل آبراه!' : status === 'RESTRICTED' ? '⚠️ بازرسی نظامی!' : '✅ آبراه آزاد شد!',
    categoryLabelFa: 'ژئوپولیتیک آبراه‌ها و انرژی',
  });

  updateRankingsAndDefcon(room);
  return { ok: true, messageFa: `وضعیت «${cp.nameFa}» بروزرسانی شد.` };
}

export function instantMinorDiplomacyPact(
  room: GameRoomState,
  countryId: CountryId,
  minorId: string
): { ok: boolean; errorFa?: string; messageFa?: string } {
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
  const actor = room.countries[countryId];
  const minor = room.minorNations[minorId];
  if (!actor || actor.isEliminated || !minor) {
    return { ok: false, errorFa: 'کشور هدف یافت نشد.' };
  }
  if (minor.conqueredBy) {
    return {
      ok: false,
      errorFa: `خاک ${minor.nameFa} در اشغال کامل است؛ برای آزادسازی یا تصرف از عملیات نظامی/کودتا استفاده کنید.`,
    };
  }
  if (minor.alignedWith === actor.id) {
    return { ok: false, errorFa: `${minor.nameFa} هم‌اکنون متحد و پایگاه برون‌مرزی شماست.` };
  }

  const costB = Math.max(18, Math.round(minor.gdpB * 0.095));
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

export function executeFalseFlagSabotage(
  room: GameRoomState,
  actorId: CountryId,
  targetId: CountryId,
  thirdId: CountryId
): { ok: boolean; errorFa?: string; messageFa?: string } {
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
  if (room.phase !== 'PLANNING') return { ok: false, errorFa: 'این عملیات فقط در فاز برنامه‌ریزی ماه مجاز است.' };
  const actor = room.countries[actorId];
  const target = room.countries[targetId];
  const third = room.countries[thirdId];
  if (!actor || !target || !third || actor.isEliminated || target.isEliminated || third.isEliminated) {
    return { ok: false, errorFa: 'کشورهای هدف نامعتبر هستند.' };
  }

  const check = evaluateFalseFlagSabotageChance(actor, target, third, room.round);
  if (!check.canExecute) {
    return { ok: false, errorFa: check.errorFa || 'شرایط عملیات فراهم نیست.' };
  }

  actor.treasuryB -= check.costB;
  actor.covertOrdersUsedThisRound += 1;
  const pairKey = [target.id, third.id].sort().join('-');
  if (!actor.sabotageCooldowns) actor.sabotageCooldowns = {};
  actor.sabotageCooldowns[pairKey] = room.round + 3;

  const succeeded = Math.random() * 100 < check.winPct;
  const exposed = !succeeded && Math.random() * 100 < check.exposureRiskPct;

  if (succeeded) {
    const wereAllies = target.allies.includes(third.id);
    adjustRelation(target, third, -check.expectedRelDrop);
    const newRel = target.relations[third.id];

    let allianceBroken = false;
    if ((wereAllies && newRel < 38) || (!wereAllies && newRel < 15)) {
      if (wereAllies || target.secretAllies?.includes(third.id)) allianceBroken = true;
      target.allies = target.allies.filter((id) => id !== third.id);
      third.allies = third.allies.filter((id) => id !== target.id);
      target.secretAllies = (target.secretAllies || []).filter((id) => id !== third.id);
      third.secretAllies = (third.secretAllies || []).filter((id) => id !== target.id);
      target.airspaceOpenTo = target.airspaceOpenTo.filter((id) => id !== third.id);
      third.airspaceOpenTo = third.airspaceOpenTo.filter((id) => id !== target.id);
    }

    // Trigger genuine geopolitical & military fallout when relations turn hostile!
    if (newRel <= -25) {
      if (!target.sanctionedBy.includes(third.id)) target.sanctionedBy.push(third.id);
      if (!third.sanctionedBy.includes(target.id)) third.sanctionedBy.push(target.id);
      if (target.playerId === null && newRel <= -40) target.lastAttackedBy = third.id;
      if (third.playerId === null && newRel <= -45) third.lastAttackedBy = target.id;
    }

    const hl = allianceBroken
      ? `🕵️ زلزله دیپلماتیک! انفجار مشکوک و افشای اسناد امنیتی، پیمان اتحاد میان ${target.nameFa} و ${third.nameFa} را متلاشی کرد!`
      : `🕵️ بحران شدید امنیتی میان ${target.nameFa} و ${third.nameFa} پس از حادثه مشکوک پرچم دروغین!`;

    addNews(room, {
      agencyFa: 'الجزیره فوری / رویترز امنیتی',
      category: 'ESPIONAGE',
      breaking: true,
      headlineFa: hl,
      bodyFa: `سفیران دو کشور فراخوانده شدند و شاخص روابط دوجانبه به ${newRel} سقوط کرد.`,
      involvedCountries: [target.id, third.id],
    });

    pushPendingReplay(room, {
      id: uid('rep-ff'),
      round: room.round,
      from: target.coordinates,
      to: third.coordinates,
      attackerId: target.id,
      attackerNameFa: target.nameFa,
      defenderId: third.id,
      targetNameFa: third.nameFa,
      kind: 'DIPLOMACY_SHOCK',
      succeeded: true,
      intercepted: false,
      headlineFa: hl,
      impactBadgeFa: allianceBroken ? '💥 فروپاشی اتحاد راهبردی!' : `🔥 سقوط رابطه به ${newRel}!`,
      categoryLabelFa: 'عملیات اطلاعاتی و بحران دیپلماتیک',
    });

    refreshSecretMissions(room);
    updateRankingsAndDefcon(room);
    return {
      ok: true,
      messageFa: `🕵️ عملیات پرچم دروغین موفق شد! رابطه ${target.nameFa} و ${third.nameFa} به ${newRel} سقوط کرد${
        allianceBroken ? ' و اتحاد نظامی آن‌ها فروپاشید!' : '!'
      }`,
    };
  }

  if (exposed) {
    adjustRelation(actor, target, -22);
    adjustRelation(actor, third, -18);
    if (!actor.sanctionedBy.includes(target.id)) actor.sanctionedBy.push(target.id);
    addNews(room, {
      agencyFa: 'رویترز امنیتی (افشاگری اطلاعاتی)',
      category: 'ESPIONAGE',
      breaking: true,
      headlineFa: `🚨 شکست و افشای عملیات پرچم دروغین ${actor.nameFa} (${actor.agencyCode}) برای بحران‌سازی میان ${target.nameFa} و ${third.nameFa}!`,
      bodyFa: 'ضدجاسوسی مشترک دو کشور عوامل نفوذی را دستگیر کرد و تحریم دیپلماتیک علیه آمران وضع شد.',
      involvedCountries: [actor.id, target.id, third.id],
    });
    updateRankingsAndDefcon(room);
    return {
      ok: false,
      errorFa: `🚨 عملیات شکست خورد و هویت سرویس اطلاعاتی شما (${actor.agencyCode}) لو رفت! روابط با هر دو کشور تیره شد.`,
    };
  }

  updateRankingsAndDefcon(room);
  return {
    ok: false,
    errorFa: `ضدجاسوسی ${target.agencyCode} اسناد جعلی را خنثی کرد، اما تیم عملیاتی شما بدون افشای هویت کشور بازگشت.`,
  };
}

function buildStrategicRequestSummaryFa(
  room: GameRoomState,
  from: CountryState,
  to: CountryState,
  kind: StrategicRequestKind,
  thirdCountry?: CountryId,
  chokepointId?: ChokepointId
): string {
  const thirdName = thirdCountry ? room.countries[thirdCountry]?.nameFa || thirdCountry : '';
  const cpName = chokepointId ? room.chokepoints[chokepointId]?.nameFa || chokepointId : '';
  switch (kind) {
    case 'OPEN_CHOKEPOINT':
      return `بازگشایی کامل آبراه «${cpName}» توسط ${to.nameFa}`;
    case 'BLOCKADE_CHOKEPOINT':
      return `مسدودسازی نظامی «${cpName}» توسط ${to.nameFa}`;
    case 'FORM_FRIENDSHIP':
      return `پیمان دوستی، لغو تحریم و گشایش حریم هوایی میان ${from.nameFa} و ${to.nameFa}`;
    case 'JOINT_MILITARY_STRIKE':
      return `حمله نظامی مشترک ${to.nameFa} علیه مواضع ${thirdName}`;
    case 'JOINT_CYBER_SABOTAGE':
      return `عملیات سایبری و هک زیرساخت‌های ${thirdName} توسط ${to.nameFa}`;
    case 'IMPOSE_SANCTION':
      return `اعمال تحریم اقتصادی علیه ${thirdName} توسط ${to.nameFa}`;
    case 'LIFT_SANCTION_ON_ME':
      return `لغو تحریم‌های اقتصادی ${to.nameFa} علیه ${from.nameFa}`;
    case 'CEASEFIRE_WITH_ME':
      return `آتش‌بس فوری و پیمان عدم تعرض ۳ ماهه با ${from.nameFa}`;
    case 'ECONOMIC_AID':
      return `ارسال بسته کمک اضطراری مالی و انرژی از سوی ${to.nameFa} به ${from.nameFa}`;
  }
}

export function executeAcceptedStrategicRequest(
  room: GameRoomState,
  req: StrategicRequest
): { ok: boolean; effectFa: string; errorFa?: string } {
  const fromC = room.countries[req.from];
  const toC = room.countries[req.to];
  if (!fromC || !toC || fromC.isEliminated || toC.isEliminated) {
    return { ok: false, effectFa: '', errorFa: 'کشورهای طرف توافق غیرفعال هستند.' };
  }

  if (req.leverage === 'DIPLOMATIC_INCENTIVE' && req.offeredCashB > 0) {
    if (fromC.treasuryB < req.offeredCashB) {
      return { ok: false, effectFa: '', errorFa: `خزانه ${fromC.nameFa} برای پرداخت مشوق $${req.offeredCashB}B کافی نیست.` };
    }
    fromC.treasuryB -= req.offeredCashB;
    toC.treasuryB += req.offeredCashB;
  }

  let effectFa = '';
  const thirdC = req.thirdCountry ? room.countries[req.thirdCountry] : null;

  switch (req.kind) {
    case 'OPEN_CHOKEPOINT': {
      const cp = req.chokepointId ? room.chokepoints[req.chokepointId] : Object.values(room.chokepoints).find((x) => x.controller === toC.id);
      if (cp) {
        cp.status = 'OPEN';
        room.market.oilPriceUsd = clamp(room.market.oilPriceUsd - 14, 65, 240);
        effectFa = `⚓ ${toC.nameFa} آبراه «${cp.nameFa}» را به روی کشتیرانی بین‌المللی بازگشایی کرد!`;
        pushPendingReplay(room, {
          id: uid('rep-req-cp'),
          round: room.round,
          from: fromC.coordinates,
          to: cp.coordinates,
          attackerId: toC.id,
          attackerNameFa: toC.nameFa,
          targetNameFa: cp.nameFa,
          kind: 'CHOKEPOINT',
          succeeded: true,
          intercepted: true,
          headlineFa: effectFa,
          impactBadgeFa: '⚓ بازگشایی دیپلماتیک تنگه!',
          categoryLabelFa: 'توافق راهبردی دریایی',
        });
      }
      break;
    }

    case 'BLOCKADE_CHOKEPOINT': {
      const cp = req.chokepointId ? room.chokepoints[req.chokepointId] : Object.values(room.chokepoints).find((x) => x.controller === toC.id);
      if (cp) {
        cp.status = 'BLOCKADED';
        room.market.oilPriceUsd = clamp(room.market.oilPriceUsd + Math.round(cp.oilImpactFactor * 52), 65, 245);
        room.market.globalTension = clamp(room.market.globalTension + 14, 0, 100);
        effectFa = `🚨 به درخواست راهبردی ${fromC.nameFa}، ناوگان ${toC.nameFa} آبراه «${cp.nameFa}» را مسدود کرد!`;
        pushPendingReplay(room, {
          id: uid('rep-req-cpb'),
          round: room.round,
          from: toC.coordinates,
          to: cp.coordinates,
          attackerId: toC.id,
          attackerNameFa: toC.nameFa,
          targetNameFa: cp.nameFa,
          kind: 'CHOKEPOINT',
          succeeded: true,
          intercepted: false,
          headlineFa: effectFa,
          impactBadgeFa: '🚨 انسداد هماهنگ تنگه!',
          categoryLabelFa: 'عملیات مشترک انرژی',
        });
      }
      break;
    }

    case 'FORM_FRIENDSHIP':
      adjustRelation(fromC, toC, 24);
      fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
      toC.sanctionedBy = toC.sanctionedBy.filter((id) => id !== fromC.id);
      if (!fromC.airspaceOpenTo.includes(toC.id)) fromC.airspaceOpenTo.push(toC.id);
      if (!toC.airspaceOpenTo.includes(fromC.id)) toC.airspaceOpenTo.push(fromC.id);
      if (toC.lastAttackedBy === fromC.id) toC.lastAttackedBy = null;
      effectFa = `🤝 پیمان دوستی، عادی‌سازی روابط (+۲۴) و گشایش حریم هوایی میان ${fromC.nameFa} و ${toC.nameFa} برقرار شد!`;
      break;

    case 'JOINT_MILITARY_STRIKE':
      if (thirdC && !thirdC.isEliminated) {
        adjustRelation(toC, thirdC, -25);
        const opPick: MilitaryOpType =
          evaluateMilitaryOpDetails(toC, thirdC, 'MISSILE_DRONE_STRIKE', room.round, room.minorNations).canExecute
            ? 'MISSILE_DRONE_STRIKE'
            : 'AIR_SORTIE';
        const det = evaluateMilitaryOpDetails(toC, thirdC, opPick, room.round, room.minorNations);
        toC.orders.push({
          id: uid('joint-mil'),
          actor: toC.id,
          kind: 'MILITARY_OPERATION',
          targetCountry: thirdC.id,
          militaryType: opPick,
          targetSector: 'MILITARY_BASES',
          estimatedSuccessPct: Math.max(35, det.winPct),
          costB: 0,
          fuelCost: 0,
          summaryFa: `⚔️ عملیات نظامی مشترک ${toC.nameFa} علیه ${thirdC.nameFa} (با هماهنگی ${fromC.nameFa})`,
          expectedImpactFa: 'ضربه هماهنگ ائتلافی در پایان این ماه',
        });
        effectFa = `⚔️ ارتش ${toC.nameFa} رسماً وارد عمل شد و دستور حمله نظامی به «${thirdC.nameFa}» را برای پایان این ماه صادر کرد!`;
      }
      break;

    case 'JOINT_CYBER_SABOTAGE':
      if (thirdC && !thirdC.isEliminated) {
        const covPick: CovertOpType = thirdC.nuclearProgress >= 50 ? 'STUXNET_SABOTAGE' : 'BLACKOUT_VIRUS';
        const det = evaluateCovertOpDetails(toC, thirdC, covPick);
        toC.orders.push({
          id: uid('joint-cyb'),
          actor: toC.id,
          kind: 'COVERT_OPERATION',
          targetCountry: thirdC.id,
          covertType: covPick,
          estimatedSuccessPct: det.winPct,
          traceRiskPct: det.tracePct,
          costB: 0,
          fuelCost: 0,
          summaryFa: `💻 حمله سایبری مشترک علیه شبکه ${thirdC.nameFa}`,
          expectedImpactFa: 'اختلال برق، رادار یا تاسیسات هسته‌ای هدف در پایان ماه',
        });
        effectFa = `💻 قرارگاه سایبری ${toC.nameFa} عملیات هک مشترک علیه «${thirdC.nameFa}» را در دستور این ماه قرار داد!`;
      }
      break;

    case 'IMPOSE_SANCTION':
      if (thirdC && !thirdC.isEliminated) {
        if (!thirdC.sanctionedBy.includes(toC.id)) thirdC.sanctionedBy.push(toC.id);
        toC.allies = toC.allies.filter((id) => id !== thirdC.id);
        thirdC.allies = thirdC.allies.filter((id) => id !== toC.id);
        adjustRelation(toC, thirdC, -20);
        effectFa = `🚫 دولت ${toC.nameFa} رسماً تحریم‌های اقتصادی و بانکی علیه «${thirdC.nameFa}» اعمال کرد!`;
      }
      break;

    case 'LIFT_SANCTION_ON_ME':
      fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
      adjustRelation(fromC, toC, 10);
      effectFa = `✅ دولت ${toC.nameFa} تمامی تحریم‌های اقتصادی علیه ${fromC.nameFa} را لغو کرد!`;
      break;

    case 'CEASEFIRE_WITH_ME':
      fromC.nonAggressionPacts[toC.id] = room.round + 3;
      toC.nonAggressionPacts[fromC.id] = room.round + 3;
      if (toC.lastAttackedBy === fromC.id) toC.lastAttackedBy = null;
      if (fromC.lastAttackedBy === toC.id) fromC.lastAttackedBy = null;
      toC.orders = toC.orders.filter((o) => o.targetCountry !== fromC.id);
      fromC.orders = fromC.orders.filter((o) => o.targetCountry !== toC.id);
      adjustRelation(fromC, toC, 16);
      effectFa = `🕊️ آتش‌بس فوری و پیمان عدم تعرض ۳ ماهه میان ${fromC.nameFa} و ${toC.nameFa} برقرار شد!`;
      break;

    case 'ECONOMIC_AID': {
      const aidCash = Math.min(36, Math.max(12, Math.round(toC.treasuryB * 0.16)));
      toC.treasuryB -= aidCash;
      fromC.treasuryB += aidCash;
      if (toC.oilReserve >= 80) {
        toC.oilReserve -= 25;
        fromC.oilReserve += 25;
      }
      if (toC.foodReserve >= 80) {
        toC.foodReserve -= 25;
        fromC.foodReserve += 25;
      }
      effectFa = `📦 بسته حمایتی ${toC.nameFa} (+$${aidCash}B ارز + ذخایر سوخت و غلات) تحویل ${fromC.nameFa} شد!`;
      break;
    }
  }

  if (effectFa) {
    addNews(room, {
      agencyFa: 'رویترز دیپلماتیک',
      category: 'DIPLOMACY',
      breaking: req.kind !== 'LIFT_SANCTION_ON_ME',
      headlineFa: effectFa,
      bodyFa: req.summaryFa,
      involvedCountries: thirdC ? [fromC.id, toC.id, thirdC.id] : [fromC.id, toC.id],
    });
  }

  refreshSecretMissions(room);
  updateRankingsAndDefcon(room);
  return { ok: true, effectFa: effectFa || 'توافق راهبردی با موفقیت اجرا شد!' };
}

export function proposeStrategicRequest(
  room: GameRoomState,
  actorId: CountryId,
  payload: {
    targetCountry: CountryId;
    kind: StrategicRequestKind;
    leverage: RequestLeverageMode;
    offeredCashB?: number;
    thirdCountry?: CountryId;
    chokepointId?: ChokepointId;
  }
): { ok: boolean; status?: 'ACCEPTED' | 'REJECTED' | 'PENDING'; messageFa?: string; errorFa?: string } {
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
  if (room.phase !== 'PLANNING') return { ok: false, errorFa: 'ارسال درخواست فقط در فاز برنامه‌ریزی ماه مجاز است.' };

  const actor = room.countries[actorId];
  const target = room.countries[payload.targetCountry];
  if (!actor || !target || actor.isEliminated || target.isEliminated || actorId === target.id) {
    return { ok: false, errorFa: 'کشور مقصد نامعتبر است.' };
  }

  const offeredCashB =
    payload.leverage === 'DIPLOMATIC_INCENTIVE' ? clamp(Math.round(payload.offeredCashB || 0), 0, 250) : 0;
  const thirdC = payload.thirdCountry ? room.countries[payload.thirdCountry] : null;

  const evalRes = evaluateStrategicRequestChance(
    actor,
    target,
    payload.kind,
    payload.leverage,
    offeredCashB,
    room.chokepoints,
    thirdC,
    payload.chokepointId
  );
  if (!evalRes.canSend) {
    return { ok: false, errorFa: evalRes.errorFa || 'امکان ارسال این درخواست وجود ندارد.' };
  }

  if (!actor.requestsSentToThisRound) actor.requestsSentToThisRound = [];
  actor.requestsSentToThisRound.push(target.id);

  if (payload.leverage === 'COERCIVE_PRESSURE') {
    if (actor.treasuryB < 6) {
      return { ok: false, errorFa: 'اعزام آرایش فشار نظامی مرزی $6B هزینه لجستیکی دارد.' };
    }
    actor.treasuryB -= 6;
    room.market.globalTension = clamp(room.market.globalTension + 5, 0, 100);
  }

  const summaryFa = buildStrategicRequestSummaryFa(
    room,
    actor,
    target,
    payload.kind,
    payload.thirdCountry,
    payload.chokepointId
  );

  const req: StrategicRequest = {
    id: uid('sreq'),
    round: room.round,
    from: actor.id,
    to: target.id,
    kind: payload.kind,
    leverage: payload.leverage,
    thirdCountry: payload.thirdCountry,
    chokepointId: payload.chokepointId,
    offeredCashB,
    aiAcceptancePct: evalRes.acceptPct,
    summaryFa,
    status: 'PENDING',
  };

  // Human Target -> Deliver Interactive Request Card!
  if (target.playerId !== null) {
    room.strategicRequests.unshift(req);
    if (room.strategicRequests.length > 40) room.strategicRequests.length = 40;
    room.messages.push({
      id: uid('req-msg'),
      timestamp: Date.now(),
      channel: 'DIRECT',
      fromCountry: actor.id,
      fromName: `${actor.nameFa} (${payload.leverage === 'COERCIVE_PRESSURE' ? '⚠️ فشار راهبردی' : '📜 درخواست رسمی'})`,
      toCountry: target.id,
      text: `${summaryFa}${offeredCashB > 0 ? ` — مشوق پیشنهادی: +$${offeredCashB}B` : ''}`,
    });
    return {
      ok: true,
      status: 'PENDING',
      messageFa: `📜 درخواست رسمی «${summaryFa}» به میز فرماندهی ${target.nameFa} ارسال شد!`,
    };
  }

  // Smart AI Evaluation
  const accepted = evalRes.acceptPct >= 82 || Math.random() * 100 < evalRes.acceptPct;
  if (accepted) {
    const exec = executeAcceptedStrategicRequest(room, req);
    if (!exec.ok) {
      req.status = 'REJECTED';
      req.responseReasonFa = exec.errorFa;
      room.strategicRequests.unshift(req);
      return { ok: false, status: 'REJECTED', errorFa: exec.errorFa };
    }
    req.status = 'ACCEPTED';
    req.responseReasonFa = exec.effectFa;
    room.strategicRequests.unshift(req);
    return { ok: true, status: 'ACCEPTED', messageFa: exec.effectFa };
  }

  req.status = 'REJECTED';
  if (payload.leverage === 'COERCIVE_PRESSURE') {
    adjustRelation(actor, target, -14);
    req.responseReasonFa = `${target.nameFa} در برابر فشار نظامی تسلیم نشد و روابط دوجانبه تیره‌تر گردید (-۱۴ رابطه).`;
  } else {
    req.responseReasonFa = `شورای امنیت ملی ${target.nameFa} با این درخواست مخالفت کرد (شانس پذیرش ${evalRes.acceptPct}٪ بود؛ رابطه یا مشوق مالی را تقویت کنید).`;
  }
  room.strategicRequests.unshift(req);
  updateRankingsAndDefcon(room);
  return { ok: false, status: 'REJECTED', errorFa: req.responseReasonFa };
}

export function respondStrategicRequest(
  room: GameRoomState,
  responderId: CountryId,
  requestId: string,
  accept: boolean
): { ok: boolean; messageFa?: string; errorFa?: string } {
  const req = room.strategicRequests.find((r) => r.id === requestId && r.status === 'PENDING');
  if (!req || req.to !== responderId) {
    return { ok: false, errorFa: 'درخواست معتبر یافت نشد.' };
  }
  const responder = room.countries[responderId];
  const sender = room.countries[req.from];
  if (!responder || !sender) return { ok: false, errorFa: 'کشور نامعتبر است.' };

  if (!accept) {
    req.status = 'REJECTED';
    req.responseReasonFa = `توسط کابینه ${responder.nameFa} رد شد.`;
    if (req.leverage === 'COERCIVE_PRESSURE') {
      adjustRelation(sender, responder, -12);
    }
    updateRankingsAndDefcon(room);
    return { ok: true, messageFa: 'درخواست رد شد.' };
  }

  const exec = executeAcceptedStrategicRequest(room, req);
  if (!exec.ok) return { ok: false, errorFa: exec.errorFa };
  req.status = 'ACCEPTED';
  req.responseReasonFa = exec.effectFa;
  return { ok: true, messageFa: exec.effectFa };
}

export function executeDiplomaticAction(
  room: GameRoomState,
  actorId: CountryId,
  targetId: CountryId,
  kind: DiplomaticActionKind,
  opts?: { ultimatum?: UltimatumDemand; thirdCountry?: CountryId }
): { ok: boolean; errorFa?: string; messageFa?: string } {
  if (room.isPaused) return { ok: false, errorFa: 'بازی متوقف شده است.' };
  const actor = room.countries[actorId];
  const target = room.countries[targetId];
  if (!actor || !target || actor.isEliminated || target.isEliminated || actorId === targetId) {
    return { ok: false, errorFa: 'کشور هدف نامعتبر است.' };
  }

  if (kind === 'IMPROVE_RELATIONS') {
    const cost = 16;
    if (actor.treasuryB < cost) {
      return { ok: false, errorFa: `اعزام هیئت عالی‌رتبه دیپلماتیک $${cost}B بودجه نیاز دارد.` };
    }
    actor.treasuryB -= cost;
    adjustRelation(actor, target, 18);
    if (target.relations[actor.id] >= -15 && target.lastAttackedBy === actor.id) {
      target.lastAttackedBy = null;
    }
    refreshSecretMissions(room);
    updateRankingsAndDefcon(room);
    return {
      ok: true,
      messageFa: `🤝 هیئت دیپلماتیک به ${target.capitalFa} اعزام شد؛ رابطه دوجانبه با ${target.nameFa} به ${target.relations[actor.id]} ارتقا یافت!`,
    };
  }

  if (kind === 'THREATEN_ULTIMATUM') {
    const mappedKind: StrategicRequestKind =
      opts?.ultimatum === 'LIFT_SANCTION'
        ? 'LIFT_SANCTION_ON_ME'
        : opts?.ultimatum === 'OPEN_CHOKEPOINT'
        ? 'OPEN_CHOKEPOINT'
        : 'CEASEFIRE_WITH_ME';
    return proposeStrategicRequest(room, actorId, {
      targetCountry: targetId,
      kind: mappedKind,
      leverage: 'COERCIVE_PRESSURE',
    });
  }

  if (!opts?.thirdCountry) {
    return { ok: false, errorFa: 'لطفاً کشور سوم مورد نظر را انتخاب کنید.' };
  }
  return executeFalseFlagSabotage(room, actorId, targetId, opts.thirdCountry);
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

  if (leader.coalitionId && room.coalitions[leader.coalitionId]) {
    leaveCoalition(room, leaderId);
  }

  leader.treasuryB -= 25;
  const cid = uid('coal');
  room.coalitions[cid] = {
    id: cid,
    nameFa: cleanName,
    leader: leaderId,
    members: [leaderId],
    invited: [],
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

  const wasInvited = coal.invited?.includes(countryId);
  const leader = room.countries[coal.leader];
  if (
    !wasInvited &&
    leader &&
    (leader.sanctionedBy.includes(countryId) || c.sanctionedBy.includes(leader.id) || leader.relations[countryId] < -20)
  ) {
    return {
      ok: false,
      errorFa: `به علت تیرگی روابط یا تحریم متقابل با رهبر ائتلاف (${leader.nameFa}) ابتدا پیمان صلح ببندید یا تحریم را لغو کنید.`,
    };
  }

  if (c.coalitionId && room.coalitions[c.coalitionId]) {
    leaveCoalition(room, countryId);
  }

  coal.members.push(countryId);
  coal.invited = (coal.invited || []).filter((id) => id !== countryId);
  c.coalitionId = coalitionId;

  for (const memberId of coal.members) {
    if (memberId === countryId) continue;
    const mem = room.countries[memberId];
    if (mem && !mem.isEliminated) {
      if (!c.allies.includes(memberId)) c.allies.push(memberId);
      if (!mem.allies.includes(countryId)) mem.allies.push(countryId);
      adjustRelation(c, mem, 15);
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

export function leaveCoalition(
  room: GameRoomState,
  countryId: CountryId
): { ok: boolean; errorFa?: string; messageFa?: string } {
  const c = room.countries[countryId];
  if (!c || !c.coalitionId) return { ok: false, errorFa: 'کشور شما عضو هیچ ائتلافی نیست.' };
  const coal = room.coalitions[c.coalitionId];
  const oldName = coal?.nameFa || 'ائتلاف';

  if (coal) {
    coal.members = coal.members.filter((m) => m !== countryId);
    if (coal.members.length === 0) {
      delete room.coalitions[coal.id];
    } else if (coal.leader === countryId) {
      coal.leader = coal.members[0];
    }
  }
  c.coalitionId = null;
  updateRankingsAndDefcon(room);
  return { ok: true, messageFa: `کشور شما از «${oldName}» خارج شد.` };
}

export function createResolutionSpec(
  _proposer: CountryState,
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
// QUEUED STRATEGIC MILITARY, COVERT & PROGRESSIVE WORLD CONQUEST OPERATIONS
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
  if (room.isPaused) {
    return { ok: false, errorFa: 'بازی توسط میزبان متوقف (Pause) شده است.' };
  }
  const actor = room.countries[countryId];
  if (!actor || actor.isEliminated) return { ok: false, errorFa: 'کشور شما غیرفعال است.' };

  const maxMil = getMaxMilitaryOrdersPerRound(actor);
  const maxCov = getMaxCovertOrdersPerRound(actor);

  // === WORLD MINOR NATION CONQUEST / COUP ===
  if (draft.kind === 'MINOR_NATION_OPERATION' && draft.targetMinorId && draft.minorOpType) {
    const minor = room.minorNations[draft.targetMinorId];
    if (!minor) return { ok: false, errorFa: 'کشور هدف روی نقشه یافت نشد.' };
    if (minor.conqueredBy === actor.id) {
      return { ok: false, errorFa: `خاک ${minor.nameFa} هم‌اکنون ضمیمه قلمرو شماست!` };
    }

    const isConquest = draft.minorOpType === 'CONQUER_ANNEX';
    if (isConquest && actor.militaryOrdersUsedThisRound >= maxMil) {
      return {
        ok: false,
        errorFa: `سقف عملیات نظامی این ماه پر شده (${maxMil}/${maxMil})! با ارتقای هوافضا یا زرهی به سطح ۷ سقف ماهانه به ۳ عملیات می‌رسد.`,
      };
    }
    if (!isConquest && actor.covertOrdersUsedThisRound >= maxCov) {
      return {
        ok: false,
        errorFa: `سقف عملیات اطلاعاتی/مخفی این ماه پر شده (${maxCov}/${maxCov})!`,
      };
    }

    const evalRes = evaluateMinorOpDetails(actor, minor, draft.minorOpType, room.countries, room.minorNations);
    if (!evalRes.canExecute) {
      return { ok: false, errorFa: evalRes.errorFa || 'پیش‌نیاز نظامی این عملیات فراهم نیست.' };
    }

    const costB = isConquest ? 28 : 18;
    const fuelCost = isConquest ? 12 : 0;
    if (actor.treasuryB < costB) {
      return { ok: false, errorFa: `بودجه کافی نیست ($${costB}B نیاز است).` };
    }
    if (actor.oilReserve < fuelCost) {
      return { ok: false, errorFa: `ذخیره سوخت نفت کافی نیست (${fuelCost} واحد نفت لازم است).` };
    }

    actor.treasuryB -= costB;
    actor.oilReserve -= fuelCost;
    if (isConquest) actor.militaryOrdersUsedThisRound += 1;
    else actor.covertOrdersUsedThisRound += 1;

    const order: GameOrder = {
      id: uid('ord'),
      actor: countryId,
      kind: 'MINOR_NATION_OPERATION',
      targetMinorId: minor.id,
      minorOpType: draft.minorOpType,
      estimatedSuccessPct: evalRes.winPct,
      summaryFa: isConquest
        ? `⚔️ لشکرکشی مرحله‌ای به «${minor.nameFa}» (+${evalRes.expectedProgressPct}٪ پیشروی اشغال)`
        : `🕵️ کودتای اطلاعاتی و هم‌پیمان کردن «${minor.nameFa}»`,
      expectedImpactFa: isConquest
        ? `پیشروی حدود ${evalRes.expectedProgressPct}٪ در خاک ${minor.nameFa} (در ۱۰۰٪ الحاق کامل به امپراتوری)`
        : `تغییر رژیم سیاسی ${minor.nameFa} به دولت هم‌سو با کشور شما`,
      costB,
      fuelCost,
    };
    actor.orders.push(order);
    return { ok: true, order };
  }

  // === MAJOR POWER MILITARY & COVERT OPERATIONS ===
  const resolvedTargetId =
    draft.militaryType === 'LIBERATION_COUNTEROFFENSIVE'
      ? draft.targetCountry || actor.occupierId || undefined
      : draft.targetCountry;

  if (!resolvedTargetId) return { ok: false, errorFa: 'کشور هدف مشخص نشده است.' };
  const target = room.countries[resolvedTargetId];
  if (!target || target.isEliminated || actor.id === target.id) {
    return { ok: false, errorFa: 'کشور هدف نامعتبر یا حذف‌شده است.' };
  }

  let costB = 18;
  let fuelCost = 0;
  let summaryFa = '';
  let expectedImpactFa = '';
  let estimatedSuccessPct = 50;
  let traceRiskPct: number | undefined;

  if (draft.kind === 'MILITARY_OPERATION' && draft.militaryType) {
    if (actor.militaryOrdersUsedThisRound >= maxMil) {
      return {
        ok: false,
        errorFa: `ظرفیت عملیات نظامی این ماه تکمیل شده است (${maxMil}/${maxMil} عملیات نظامی در ماه).`,
      };
    }

    // Check active Peace Treaty truce!
    const truceUntil = actor.nonAggressionPacts[target.id] || 0;
    if (truceUntil >= room.round && draft.militaryType !== 'LIBERATION_COUNTEROFFENSIVE') {
      return {
        ok: false,
        errorFa: `پیمان صلح و آتش‌بس رسمی با ${target.nameFa} تا پایان ماه ${truceUntil} برقرار است!`,
      };
    }

    // Prevent spamming the exact same military attack type on the same country in 1 month!
    const duplicateSameOp = actor.orders.some(
      (o) => o.targetCountry === target.id && o.militaryType === draft.militaryType
    );
    if (duplicateSameOp) {
      return {
        ok: false,
        errorFa: 'این نوع حمله علیه این کشور قبلاً در دستور این ماه ثبت شده؛ برای عملیات ترکیبی از شاخه نظامی دیگری (مثلاً هوایی + موشکی) استفاده کنید!',
      };
    }

    if (draft.militaryType === 'LIBERATION_COUNTEROFFENSIVE' && actor.integrityPct >= 100) {
      return { ok: false, errorFa: 'خاک کشور شما در اشغال نیست (تمامیت ارضی ۱۰۰٪ است).' };
    }

    const details = evaluateMilitaryOpDetails(actor, target, draft.militaryType, room.round, room.minorNations);
    if (!details.canExecute) {
      return { ok: false, errorFa: details.requirementErrorFa || 'پیش‌نیاز تسلیحاتی یا سوخت فراهم نیست.' };
    }

    estimatedSuccessPct = details.winPct;
    fuelCost = details.fuelCost;
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
      summaryFa = `✈️ عملیات اسکادران هوایی علیه «${sectorFa}» در ${target.nameFa}`;
      expectedImpactFa = 'سرکوب ۳۲٪ پدافند دشمن + بمباران دقیق زیرساخت انتخابی';
    } else if (draft.militaryType === 'MISSILE_DRONE_STRIKE') {
      costB = 20;
      summaryFa = `🚀 حمله موشکی و پهپادی ترکیبی به «${sectorFa}» در ${target.nameFa}`;
      expectedImpactFa = `اشباع پدافند و انهدام مستقیم ۱ سطح زیرساخت ${sectorFa}`;
    } else if (draft.militaryType === 'NAVAL_BLOCKADE_STRIKE') {
      costB = 22;
      summaryFa = `⚓ عملیات ناوگان دریایی و محاصره بنادر ${target.nameFa}`;
      expectedImpactFa = 'انهدام ناوگان دریایی دشمن + کاهش ۴۰٪ صادرات دریابرد هدف';
    } else if (draft.militaryType === 'GROUND_CONQUEST') {
      costB = 34;
      summaryFa = `🚜 تهاجم زرهی و پیشروی مرزی در خاک ${target.nameFa}`;
      expectedImpactFa = 'تصرف تا ۲۴٪ خاک در هر ماه، غنیمت خزانه و نفت (نیازمند چند ماه نبرد برای سقوط کامل)';
    } else if (draft.militaryType === 'LIBERATION_COUNTEROFFENSIVE') {
      costB = 24;
      summaryFa = `🛡️ پاتک بزرگ آزادسازی مناطق اشغالی میهن از دست ${target.nameFa}`;
      expectedImpactFa = 'آزادسازی تا ۲۶٪ خاک اشغالی کشور و افزایش ۱۰٪ روحیه ملی!';
    } else if (draft.militaryType === 'ASAT_STRIKE') {
      costB = 24;
      summaryFa = `☄️ شلیک موشک ضدماهواره (ASAT) به مدار فضایی ${target.nameFa}`;
      expectedImpactFa = 'انهدام ۱ ماهواره فعال دشمن در مدار زمین + کور کردن ۳۸٪ شبکه رادار هدف!';
    } else if (draft.militaryType === 'NUCLEAR_STRIKE') {
      costB = 45;
      summaryFa = `☢️ شلیک کلاهک استراتژیک هسته‌ای به ${target.nameFa}`;
      expectedImpactFa = 'انهدام گسترده زیرساخت‌ها و ویرانی شدید، اما وضعیت DEFCON 1 و تحریم جهانی!';
    }
  } else if (draft.kind === 'COVERT_OPERATION' && draft.covertType) {
    if (actor.covertOrdersUsedThisRound >= maxCov) {
      return {
        ok: false,
        errorFa: `ظرفیت عملیات سایبری و اطلاعاتی این ماه پر شده (${maxCov}/${maxCov} عملیات مخفی در ماه).`,
      };
    }
    const isAssassination = draft.covertType.startsWith('ASSASSINATE');
    if (isAssassination && actor.assassinationsUsedThisRound >= 1) {
      return {
        ok: false,
        errorFa: 'در هر ماه حداکثر ۱ عملیات ترور هدفمند قابل برنامه‌ریزی است!',
      };
    }

    const details = evaluateCovertOpDetails(actor, target, draft.covertType);
    estimatedSuccessPct = details.winPct;
    traceRiskPct = details.tracePct;

    switch (draft.covertType) {
      case 'SAT_RECON':
        costB = 9;
        summaryFa = `📡 اشراف اطلاعاتی و ماهواره‌ای روی ${target.nameFa}`;
        expectedImpactFa = 'کشف خزانه، کلاهک‌ها، آب/غذا و ویرانی + ۱۴٪ دقت حملات نظامی';
        break;
      case 'PROXY_INSURGENCY':
        costB = 20;
        summaryFa = `🎭 جنگ نیابتی و تسلیح مخفی گروه‌های مسلح در مرزهای ${target.nameFa}`;
        expectedImpactFa = 'فرسایش -$18B بودجه نظامی هدف، -۱۰٪ رضایت و -۶٪ امنیت مرزی با ریسک شناسایی بسیار پایین!';
        break;
      case 'INSURGENCY_PSYOPS':
        costB = 16;
        summaryFa = `🔥 جنگ روانی و تحریک ناآرامی در ${target.nameFa}`;
        expectedImpactFa = 'کاهش ۱۴٪ رضایت مردم و افزایش ۱۲٪ شاخص بحران رژیم هدف';
        break;
      case 'BLACKOUT_VIRUS':
        costB = 16;
        summaryFa = `⚡ ویروس سایبری Blackout علیه برق و رادار ${target.nameFa}`;
        expectedImpactFa = 'حذف هشدار آژیر رادار هدف + قطع ۲۶٪ شبکه برق شهرها';
        break;
      case 'TREASURY_HEIST':
        costB = 18;
        summaryFa = `🏦 سرقت سایبری از بانک مرکزی ${target.nameFa}`;
        expectedImpactFa = 'انتقال مستقیم $22B تا $40B از خزانه دشمن به خزانه شما';
        break;
      case 'STUXNET_SABOTAGE':
        costB = 22;
        summaryFa = `🧬 خرابکاری صنعتی استاکس‌نت در تاسیسات ${target.nameFa}`;
        expectedImpactFa = '-۲۵٪ پیشرفت هسته‌ای هدف و تخریب ۱ سطح کارخانه دفاعی یا راکتور';
        break;
      case 'ASSASSINATE_COMMANDER':
        costB = 24;
        summaryFa = `🎖️ ترور هدفمند فرمانده ارشد ارتش ${target.nameFa}`;
        expectedImpactFa = 'فلج کردن زنجیره فرماندهی دشمن (-۲۵٪ توان دفاعی در این ماه)';
        break;
      case 'ASSASSINATE_SCIENTIST':
        costB = 22;
        summaryFa = `🔬 ترور دانشمندان هسته‌ای و هوافضای ${target.nameFa}`;
        expectedImpactFa = '-۲۸٪ پیشرفت هسته‌ای و عقب‌گرد فناوری هدف';
        break;
      case 'ASSASSINATE_MINISTER':
        costB = 26;
        summaryFa = `🏛️ ترور مقامات ارشد سیاسی-امنیتی در ${target.capitalFa}`;
        expectedImpactFa = 'شوک به کابینه هدف (-۱۶٪ رضایت مردم و +۱۵٪ بحران دولت)';
        break;
    }
  } else {
    return { ok: false, errorFa: 'نوع عملیات مشخص نشده است.' };
  }

  if (actor.treasuryB < costB) {
    return { ok: false, errorFa: `بودجه کافی نیست ($${costB}B نیاز است).` };
  }
  if (actor.oilReserve < fuelCost) {
    return { ok: false, errorFa: `ذخیره سوخت نفت کافی نیست (${fuelCost} واحد نفت نیاز است).` };
  }

  actor.treasuryB -= costB;
  actor.oilReserve -= fuelCost;
  if (draft.kind === 'MILITARY_OPERATION') {
    actor.militaryOrdersUsedThisRound += 1;
  } else if (draft.kind === 'COVERT_OPERATION') {
    actor.covertOrdersUsedThisRound += 1;
    if (draft.covertType?.startsWith('ASSASSINATE')) {
      actor.assassinationsUsedThisRound += 1;
    }
  }

  const order: GameOrder = {
    id: uid('ord'),
    actor: countryId,
    kind: draft.kind,
    targetCountry: resolvedTargetId,
    militaryType: draft.militaryType,
    targetSector: draft.targetSector || 'MILITARY_BASES',
    covertType: draft.covertType,
    estimatedSuccessPct,
    traceRiskPct,
    summaryFa,
    expectedImpactFa,
    costB,
    fuelCost,
  };
  actor.orders.push(order);
  return { ok: true, order };
}

export function cancelPlayerOrder(
  room: GameRoomState,
  countryId: CountryId,
  orderId: string
): boolean {
  if (room.phase !== 'PLANNING' || room.isPaused) return false;
  const country = room.countries[countryId];
  if (!country) return false;
  const idx = country.orders.findIndex((o) => o.id === orderId);
  if (idx === -1) return false;
  const [removed] = country.orders.splice(idx, 1);
  country.treasuryB += removed.costB;
  country.oilReserve += removed.fuelCost || 0;

  if (removed.kind === 'MILITARY_OPERATION' || (removed.kind === 'MINOR_NATION_OPERATION' && removed.minorOpType === 'CONQUER_ANNEX')) {
    country.militaryOrdersUsedThisRound = Math.max(0, country.militaryOrdersUsedThisRound - 1);
  } else {
    country.covertOrdersUsedThisRound = Math.max(0, country.covertOrdersUsedThisRound - 1);
    if (removed.covertType?.startsWith('ASSASSINATE')) {
      country.assassinationsUsedThisRound = Math.max(0, country.assassinationsUsedThisRound - 1);
    }
  }
  return true;
}

export function executeAcceptedTrade(room: GameRoomState, offer: TradeOffer): { ok: boolean; errorFa?: string } {
  const fromC = room.countries[offer.from];
  const toC = room.countries[offer.to];
  if (!fromC || !toC || fromC.isEliminated || toC.isEliminated) {
    return { ok: false, errorFa: 'کشورهای معامله غیرفعال هستند.' };
  }

  // 1. PEACE TREATY & 3-MONTH NON-AGGRESSION PACT (Item #7 Fixed 100%!)
  if (offer.offerType === 'PEACE_TREATY') {
    if (offer.priceB > 0) {
      if (fromC.treasuryB < offer.priceB) return { ok: false, errorFa: 'بودجه خزانه کافی نیست.' };
      fromC.treasuryB -= offer.priceB;
      toC.treasuryB += offer.priceB;
    }
    if (fromC.lastAttackedBy === toC.id) fromC.lastAttackedBy = null;
    if (toC.lastAttackedBy === fromC.id) toC.lastAttackedBy = null;

    fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
    toC.sanctionedBy = toC.sanctionedBy.filter((id) => id !== fromC.id);

    fromC.nonAggressionPacts[toC.id] = room.round + 3;
    toC.nonAggressionPacts[fromC.id] = room.round + 3;
    adjustRelation(fromC, toC, 30);

    // Cancel any pending military strikes between the two signatories this month!
    fromC.orders = fromC.orders.filter((o) => {
      if (o.targetCountry === toC.id && o.kind === 'MILITARY_OPERATION') {
        fromC.treasuryB += o.costB;
        fromC.oilReserve += o.fuelCost || 0;
        return false;
      }
      return true;
    });
    toC.orders = toC.orders.filter((o) => {
      if (o.targetCountry === fromC.id && o.kind === 'MILITARY_OPERATION') {
        toC.treasuryB += o.costB;
        toC.oilReserve += o.fuelCost || 0;
        return false;
      }
      return true;
    });

    room.market.globalTension = clamp(room.market.globalTension - 8, 8, 100);
    addNews(room, {
      agencyFa: 'رویترز فوری (ژنو)',
      category: 'DIPLOMACY',
      breaking: true,
      headlineFa: `🕊️ معاهده صلح تاریخی: ${fromC.nameFa} و ${toC.nameFa} پیمان آتش‌بس و عدم تعرض امضا کردند!`,
      bodyFa: 'وضعیت جنگی و تحریم‌های دوجانبه میان دو کشور رسماً پایان یافت و پیمان عدم تعرض ۳ ماهه برقرار شد.',
      involvedCountries: [fromC.id, toC.id],
    });
    return { ok: true };
  }

  // 1.5 SECRET BACKROOM DEFENSE PACT (Idea #2 — Zero Public News, Springs Surprise Ambush!)
  if (offer.offerType === 'SECRET_DEFENSE_PACT') {
    if (offer.priceB > 0) {
      if (fromC.treasuryB < offer.priceB) return { ok: false, errorFa: 'بودجه کافی نیست.' };
      fromC.treasuryB -= offer.priceB;
      toC.treasuryB += offer.priceB;
    }
    if (!fromC.secretAllies) fromC.secretAllies = [];
    if (!toC.secretAllies) toC.secretAllies = [];
    if (!fromC.secretAllies.includes(toC.id)) fromC.secretAllies.push(toC.id);
    if (!toC.secretAllies.includes(fromC.id)) toC.secretAllies.push(fromC.id);
    fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
    toC.sanctionedBy = toC.sanctionedBy.filter((id) => id !== fromC.id);
    adjustRelation(fromC, toC, 22);

    addIntel(
      fromC,
      room.round,
      'SUCCESS',
      `🕵️ پیمان دفاعی محرمانه با ${toC.nameFa} منعقد شد`,
      'این پیمان از دید سایر بازیکنان کاملاً پنهان است؛ به محض حمله نظامی دشمن به یکی از دو کشور، پدافند و جنگنده‌های متحد مخفی به صورت غافلگیرکننده وارد نبرد می‌شوند!'
    );
    addIntel(
      toC,
      room.round,
      'SUCCESS',
      `🕵️ پیمان دفاعی محرمانه با ${fromC.nameFa} منعقد شد`,
      'این معاهده در اخبار اعلام نشد؛ در نخستین حمله دشمن، چتر دفاعی مشترک به شکل غافلگیرکننده فعال خواهد شد!'
    );
    refreshSecretMissions(room);
    return { ok: true };
  }

  // 2. MILITARY ALLIANCE
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
    adjustRelation(fromC, toC, 25);

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

  // 3. LIFT SANCTION
  if (offer.offerType === 'LIFT_SANCTION') {
    if (offer.priceB > 0) {
      if (fromC.treasuryB < offer.priceB) return { ok: false, errorFa: 'بودجه کافی نیست.' };
      fromC.treasuryB -= offer.priceB;
      toC.treasuryB += offer.priceB;
    }
    fromC.sanctionedBy = fromC.sanctionedBy.filter((id) => id !== toC.id);
    toC.sanctionedBy = toC.sanctionedBy.filter((id) => id !== fromC.id);
    adjustRelation(fromC, toC, 12);
    return { ok: true };
  }

  // 4. WEAPON BUY / SELL
  if (offer.offerType === 'WEAPON' && offer.weaponId) {
    const spec = WEAPONS_CATALOG[offer.weaponId];
    if (!spec) return { ok: false, errorFa: 'سلاح یافت نشد.' };
    const qty = Math.max(1, offer.amount || 1);
    const buyer = offer.direction === 'BUY' ? fromC : toC;
    const seller = offer.direction === 'BUY' ? toC : fromC;

    if (buyer.treasuryB < offer.priceB) {
      return { ok: false, errorFa: `خزانه ${buyer.nameFa} بودجه کافی ($${offer.priceB}B) ندارد.` };
    }

    if (spec.originCountry === seller.id && seller.playerId === null) {
      const mfgCost = Math.round(spec.unitCostB * 0.6 * qty);
      buyer.treasuryB -= offer.priceB;
      seller.treasuryB += offer.priceB - mfgCost;
      buyer.weapons[spec.id] = (buyer.weapons[spec.id] || 0) + qty;
    } else {
      if ((seller.weapons[spec.id] || 0) < qty) {
        return { ok: false, errorFa: `${seller.nameFa} موجودی کافی از این سلاح در زرادخانه ندارد.` };
      }
      buyer.treasuryB -= offer.priceB;
      seller.treasuryB += offer.priceB;
      seller.weapons[spec.id] -= qty;
      if (seller.weapons[spec.id] <= 0) delete seller.weapons[spec.id];
      buyer.weapons[spec.id] = (buyer.weapons[spec.id] || 0) + qty;
    }

    adjustRelation(buyer, seller, 6);
    addNews(room, {
      agencyFa: 'جینز دیفنس ویکلی',
      category: 'DIPLOMACY',
      breaking: false,
      headlineFa: `تحویل محموله نظامی: ${seller.nameFa} سامانه «${spec.nameFa}» را به ${buyer.nameFa} منتقل کرد`,
      bodyFa: `ارزش قرارداد دفاعی: $${offer.priceB}B.`,
      involvedCountries: [seller.id, buyer.id],
    });
    return { ok: true };
  }

  // 5. RESOURCES (OIL, GAS, FOOD, WATER, URANIUM)
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
      : offer.offerType === 'WATER'
      ? c.waterReserve || 0
      : c.uraniumReserve;

  const addRes = (c: CountryState, delta: number) => {
    if (offer.offerType === 'OIL') c.oilReserve += delta;
    else if (offer.offerType === 'GAS') c.gasReserve += delta;
    else if (offer.offerType === 'FOOD') c.foodReserve += delta;
    else if (offer.offerType === 'WATER') c.waterReserve = (c.waterReserve || 0) + delta;
    else if (offer.offerType === 'URANIUM') c.uraniumReserve += delta;
  };

  if (getRes(seller) < qty) {
    return { ok: false, errorFa: `ذخیره ${seller.nameFa} برای تحویل کافی نیست.` };
  }

  addRes(seller, -qty);
  addRes(buyer, qty);
  buyer.treasuryB -= offer.priceB;
  seller.treasuryB += offer.priceB;
  adjustRelation(buyer, seller, 4);
  return { ok: true };
}

// ============================================================================
// TARGETED RADAR ALERT & FULL ROUND RESOLUTION (ANTI-1-MONTH WIPEOUT!)
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
    onChokepointNews: (ctrl, cpNameFa, cpCoords, nextStatus, oilPrice) => {
      const hl =
        nextStatus === 'BLOCKADED'
          ? `🚨 اقدام متقابل دریایی: ${ctrl.nameFa} «${cpNameFa}» را به روی نفتکش‌ها بست! (نفت: $${oilPrice})`
          : nextStatus === 'RESTRICTED'
          ? `نیروی دریایی ${ctrl.nameFa} بازرسی نظامی کشتی‌ها در «${cpNameFa}» را آغاز کرد`
          : `بازگشایی مسیر ترانزیت دریایی در «${cpNameFa}» توسط ${ctrl.nameFa}`;
      pushPendingReplay(room, {
        id: uid('rep-aicp'),
        round: room.round,
        from: ctrl.coordinates,
        to: cpCoords,
        attackerId: ctrl.id,
        attackerNameFa: ctrl.nameFa,
        targetNameFa: cpNameFa,
        kind: 'CHOKEPOINT',
        succeeded: true,
        intercepted: nextStatus === 'OPEN',
        headlineFa: hl,
        impactBadgeFa:
          nextStatus === 'BLOCKADED' ? '🚨 انسداد کامل آبراه!' : nextStatus === 'RESTRICTED' ? '⚠️ ایست بازرسی دریایی' : '✅ بازگشایی تنگه',
        categoryLabelFa: 'ژئوپولیتیک تنگه‌ها و بازار نفت',
      });
      if (nextStatus === 'BLOCKADED') {
        addNews(room, {
          agencyFa: 'بلومبرگ فوری / رویترز انرژی',
          category: 'ECONOMY',
          breaking: true,
          headlineFa: hl,
          bodyFa: 'انسداد این آبراه استراتژیک بهای جهانی نفت و مواد غذایی را به‌شدت افزایش داد.',
          involvedCountries: [ctrl.id],
        });
      } else if (nextStatus === 'RESTRICTED') {
        addNews(room, {
          agencyFa: 'رویترز دریایی',
          category: 'ECONOMY',
          breaking: false,
          headlineFa: hl,
          bodyFa: 'نرخ حمل‌ونقل دریایی و بهای انرژی در بازارهای جهانی افزایش یافت.',
          involvedCountries: [ctrl.id],
        });
      } else {
        addNews(room, {
          agencyFa: 'رویترز انرژی',
          category: 'ECONOMY',
          breaking: false,
          headlineFa: hl,
          bodyFa: 'کشتیرانی بین‌المللی به حالت عادی بازگشت.',
          involvedCountries: [ctrl.id],
        });
      }
    },
    onAIPoliticalNews: (agencyFa, headlineFa, bodyFa, involved) => {
      addNews(room, {
        agencyFa,
        category: 'DIPLOMACY',
        breaking: true,
        headlineFa,
        bodyFa,
        involvedCountries: involved,
      });
    },
    onAISpaceLaunch: (ctrl, cid, nextLv) => {
      const spec = SPACE_CONSTELLATIONS_CATALOG[cid as SpaceConstellationId];
      if (!spec) return;
      const hl = `🛰️ مسابقه فضایی: ${ctrl.nameFa} «${spec.nameFa}» را به سطح ${nextLv} در مدار زمین رساند!`;
      addNews(room, {
        agencyFa: 'رویترز فناوری فضایی',
        category: 'WORLD_EVENT',
        breaking: false,
        headlineFa: hl,
        bodyFa: spec.perLevelBonusFa,
        involvedCountries: [ctrl.id],
      });
      pushPendingReplay(room, {
        id: uid('rep-aisat'),
        round: room.round,
        from: ctrl.coordinates,
        to: [ctrl.coordinates[0] + 6, Math.min(72, ctrl.coordinates[1] + 10)],
        attackerId: ctrl.id,
        attackerNameFa: ctrl.nameFa,
        defenderId: ctrl.id,
        targetNameFa: spec.nameFa,
        kind: 'SPACE_LAUNCH',
        succeeded: true,
        intercepted: false,
        headlineFa: hl,
        impactBadgeFa: `${spec.icon} پرتاب منظومه سطح ${nextLv}!`,
        categoryLabelFa: 'رقابت فضایی قدرت‌های بزرگ',
      });
    },
  });

  for (const c of Object.values(room.countries)) {
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
    c.alertPostureCostPaidB = 0;
    c.alertPostureConfirmed = false;
  }

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
      if (ord.kind !== 'MILITARY_OPERATION' || !ord.targetCountry || ord.militaryType === 'LIBERATION_COUNTEROFFENSIVE') continue;
      const target = room.countries[ord.targetCountry];
      if (!target || target.isEliminated || target.playerId === null || !target.isOnline) continue;
      if (target.radarIntegrity < 45) continue;

      const label =
        ord.militaryType === 'NUCLEAR_STRIKE'
          ? `☢️ هشدار قرمز فضایی: پرتاب کلاهک هسته‌ای از مبدا ${actor.nameFa}!`
          : ord.militaryType === 'GROUND_CONQUEST'
          ? `🚜 لشکرکشی سنگین زرهی ارتش ${actor.nameFa} به سوی مرزهای شما!`
          : ord.militaryType === 'NAVAL_BLOCKADE_STRIKE'
          ? `⚓ نزدیک شدن ناوگان رزمی ${actor.nameFa} برای حمله و محاصره بنادر شما!`
          : ord.militaryType === 'AIR_SORTIE'
          ? `✈️ نفوذ اسکادران‌های جنگنده ${actor.nameFa} به حریم هوایی شما!`
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
  if (country.weapons[picked] <= 0) delete country.weapons[picked];
  return WEAPONS_CATALOG[picked]?.nameFa || picked;
}

export function resolveCurrentRound(room: GameRoomState): void {
  const resolvedRoundNum = room.round;
  const resolvedMonthLabel = room.calendarLabelFa;
  const newVisuals: MapVisualEvent[] = [];
  const holder = room as GameRoomState & { _queuedReplays?: CinematicReplayEvent[] };
  const newReplays: CinematicReplayEvent[] = [...(holder._queuedReplays || [])];
  holder._queuedReplays = [];
  const roundBattles: BattleOutcomeLog[] = [];
  const worldHighlightsFa: string[] = [];
  const seadPenalty: Partial<Record<CountryId, number>> = {};
  const attackedByMap: Partial<Record<CountryId, CountryId[]>> = {};

  const summaries = {} as Record<CountryId, RoundSummaryForCountry>;
  const prevApprovals = {} as Record<CountryId, number>;
  const prevDevs = {} as Record<CountryId, number>;
  const startIntegrity = {} as Record<CountryId, number>;

  for (const c of Object.values(room.countries)) {
    const ext = c as CountryState & { _approvalBeforeClash?: number; _devBeforeClash?: number };
    prevApprovals[c.id] = ext._approvalBeforeClash ?? c.approval;
    prevDevs[c.id] = ext._devBeforeClash ?? c.devastation;
    startIntegrity[c.id] = c.integrityPct;
    delete ext._approvalBeforeClash;
    delete ext._devBeforeClash;
    c.maritimeBlockaded = false;
    summaries[c.id] = {
      roundResolved: resolvedRoundNum,
      monthLabelFa: resolvedMonthLabel,
      netIncomeB: 0,
      autoSoldOilB: 0,
      netOilDelta: 0,
      netFoodDelta: 0,
      netWaterDelta: 0,
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
  // 1. RESOLVE COVERT, CYBER & ASSASSINATION OPS
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

    if (ord.covertType !== 'SAT_RECON') {
      target.securityAlertBonus = clamp((target.securityAlertBonus || 0) + 12, 0, 28);
    }

    const attackerIdForTarget: CountryId | null = traced ? actor.id : null;
    const attackerLabelForTarget = traced
      ? `${actor.nameFa} (کشف ردپا توسط ${target.agencyCode}!)`
      : '🕵️ مهاجم ناشناس (بدون ردپای قابل ردیابی)';

    if (traced && ord.covertType !== 'SAT_RECON') {
      target.lastAttackedBy = actor.id;
      adjustRelation(actor, target, -18);
      addIntel(
        target,
        resolvedRoundNum,
        'CRITICAL',
        `🔍 ردیابی موفق عامل حمله مخفی: ${actor.nameFa}`,
        `واحد ضدجاسوسی (${target.agencyCode}) مستندات دست داشتن سرویس اطلاعاتی ${actor.nameFa} (${actor.agencyCode}) را کشف کرد!`,
        actor.id
      );
    }

    if (ord.covertType === 'SAT_RECON') {
      if (succeeded) {
        actor.knownIntel[target.id] = captureSnapshot(room, target);
        const detail = `پرونده محرمانه خزانه ($${target.treasuryB}B)، کلاهک‌ها (${target.warheads})، غذا (${target.foodReserve}) و ویرانی (${target.devastation}٪) ${target.nameFa} کشف شد (+۱۴٪ دقت حمله).`;
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
        case 'PROXY_INSURGENCY': {
          const drainB = Math.min(target.treasuryB, 18);
          target.treasuryB -= drainB;
          target.approval = clamp(target.approval - 10, 0, 100);
          target.devastation = clamp(target.devastation + 11, 0, prevDevs[target.id] + 45);
          const minAllowedInt = Math.max(0, startIntegrity[target.id] - 24);
          target.integrityPct = clamp(target.integrityPct - 6, minAllowedInt, 100);
          actorDetail = `گروه‌های مسلح نیابتی در مرزهای ${target.nameFa} عملیات گسترده‌ای اجرا کردند (-$${drainB}B فرسایش مالی و -۶٪ کنترل مرزی هدف)!${
            traced ? ' (مسیر ارسال سلاح لو رفت!)' : ' (حمایت شما کاملاً مخفی ماند ✓)'
          }`;
          targetTitle = 'درگیری با گروه‌های مسلح نیابتی در مرزها!';
          targetDetail = `-$${drainB}B هزینه سرکوب، -۱۰٪ رضایت و ناامنی مرزی (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🎭 درگیری شدید گروه‌های مسلح در مرزهای ${target.nameFa}؛ کشف محموله تسلیحاتی ارسالی از ${actor.nameFa}!`
            : `🎭 حملات غافلگیرکننده گروه‌های مسلح نیابتی در مرزهای ${target.nameFa}؛ حامی خارجی عملیات ناشناس ماند!`;
          newReplays.push({
            id: uid('rep-prx'),
            round: resolvedRoundNum,
            from: actor.coordinates,
            to: target.coordinates,
            attackerId: traced ? actor.id : null,
            attackerNameFa: traced ? actor.nameFa : 'حامی ناشناس',
            defenderId: target.id,
            targetNameFa: target.nameFa,
            kind: 'PROXY',
            succeeded: true,
            intercepted: false,
            headlineFa: newsHeadline,
            impactBadgeFa: '🎭 شورش مسلحانه نیابتی در مرز!',
            secretActorOnly: !traced,
          });
          break;
        }

        case 'BLACKOUT_VIRUS':
          actorDetail = `رادارهای پدافندی ${target.nameFa} کور شد و ۲۶٪ شبکه برق آن قطع گردید!${traced ? ' (ردپای سایبری لو رفت!)' : ' (بدون ردپا ✓)'}`;
          targetTitle = 'حمله سایبری Blackout به شبکه برق و رادار';
          targetDetail = `برق سراسری ۲۶٪ سقوط کرد و رادارهای هشدار سریع مختل شدند! (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `⚡ حمله سایبری منتسب به ${actor.nameFa} شبکه برق شهرهای ${target.nameFa} را دچار خاموشی کرد!`
            : `⚡ خاموشی سایبری گسترده در شبکه برق ${target.nameFa}؛ منشا حمله ناشناس است!`;
          break;

        case 'TREASURY_HEIST': {
          const stolen = Math.min(target.treasuryB, Math.round(22 + Math.random() * 18));
          target.treasuryB -= stolen;
          actor.treasuryB += stolen;
          actorDetail = `+$${stolen}B ارز از بانک مرکزی ${target.nameFa} به خزانه شما منتقل شد!${traced ? ' (فایروال هدف ردپا را ثبت کرد!)' : ' (کاملاً ناشناس ✓)'}`;
          targetTitle = 'نفوذ سایبری به بانک مرکزی کشور';
          targetDetail = `-$${stolen}B از ذخایر ارزی کشور به سرقت رفت! (${attackerLabelForTarget})`;
          break;
        }

        case 'STUXNET_SABOTAGE': {
          target.nuclearProgress = clamp(target.nuclearProgress - 25, 0, 100);
          target.devastation = clamp(target.devastation + 10, 0, prevDevs[target.id] + 45);
          const ruined = damageCountryInfra(target, ['NUCLEAR_FACILITY', 'ARMS_FACTORY'], 1);
          actorDetail = `-۲۵٪ برنامه هسته‌ای هدف و تخریب ${ruined[0] || 'تاسیسات صنعتی'} در ${target.nameFa}!${traced ? ' (ردپا شناسایی شد)' : ' (مخفی ماند ✓)'}`;
          targetTitle = 'خرابکاری صنعتی بدافزار استاکس‌نت';
          targetDetail = `-۲۵٪ پیشرفت هسته‌ای و آسیب به ${ruined[0] || 'مراکز حساس'} (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🧬 انفجار سایبری در تاسیسات صنعتی ${target.nameFa}؛ انگشت اتهام به سوی ${actor.nameFa}!`
            : `🧬 اختلال صنعتی مشکوک در مراکز حساس ${target.nameFa}؛ عامل حمله در هاله‌ای از ابهام!`;
          break;
        }

        case 'INSURGENCY_PSYOPS':
          target.approval = clamp(target.approval - 14, 0, 100);
          target.devastation = clamp(target.devastation + 11, 0, prevDevs[target.id] + 45);
          actorDetail = `عملیات جنگ روانی موفق شد؛ رضایت مردم ${target.nameFa} ۱۴٪ کاهش یافت!${traced ? ' (شبکه نفوذی لو رفت)' : ' (بدون افشای هویت ✓)'}`;
          targetTitle = 'عملیات جنگ روانی و التهاب داخلی';
          targetDetail = `کاهش ۱۴٪ رضایت عمومی (${attackerLabelForTarget})`;
          newsHeadline = `📢 موج اعتصابات و التهاب سیاسی در شهرهای بزرگ ${target.nameFa}!`;
          break;

        case 'ASSASSINATE_COMMANDER':
          target.commanderBuff = clamp(target.commanderBuff - 25, -35, 30);
          target.approval = clamp(target.approval - 7, 0, 100);
          room.market.globalTension = clamp(room.market.globalTension + 8, 0, 100);
          actorDetail = `ترور فرمانده ارشد ارتش ${target.nameFa} موفق بود؛ توان دفاعی دشمن ۲۵٪ مختل شد!`;
          targetTitle = 'ترور فرمانده ارشد نیروهای مسلح!';
          targetDetail = `-۲۵٪ انسجام فرماندهی ارتش در این ماه (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🎯 ترور فرمانده ارشد نظامی در ${target.capitalFa}؛ سرویس امنیتی ${target.nameFa} رسماً ${actor.nameFa} را متهم کرد!`
            : `🎯 ترور شوکه‌کننده فرمانده ارشد نظامی در ${target.capitalFa}!`;
          break;

        case 'ASSASSINATE_SCIENTIST':
          target.nuclearProgress = clamp(target.nuclearProgress - 28, 0, 100);
          target.techLevel = clamp(target.techLevel - 1, 1, 12);
          room.market.globalTension = clamp(room.market.globalTension + 7, 0, 100);
          actorDetail = `ترور دانشمندان کلیدی ${target.nameFa} انجام شد؛ برنامه هسته‌ای دشمن ۲۸٪ عقب افتاد!`;
          targetTitle = 'ترور دانشمندان ارشد هسته‌ای و هوافضا!';
          targetDetail = `-۲۸٪ پیشرفت هسته‌ای کشور (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🔬 ترور دانشمند برجسته هسته‌ای در ${target.nameFa}؛ کشف اسناد دخالت ${actor.agencyCode}!`
            : `🔬 ترور هدفمند دانشمند ارشد هسته‌ای در ${target.nameFa}!`;
          break;

        case 'ASSASSINATE_MINISTER':
          target.approval = clamp(target.approval - 16, 0, 100);
          target.devastation = clamp(target.devastation + 14, 0, prevDevs[target.id] + 45);
          room.market.globalTension = clamp(room.market.globalTension + 10, 0, 100);
          actorDetail = `ترور مقام ارشد سیاسی-امنیتی در ${target.capitalFa} کابینه دشمن را در بحران فرو برد!`;
          targetTitle = 'ترور مقام ارشد سیاسی در پایتخت!';
          targetDetail = `-۱۶٪ ثبات کابینه و +۱۴٪ بحران دولت (${attackerLabelForTarget})`;
          newsHeadline = traced
            ? `🏛️ زلزله سیاسی در ${target.capitalFa}: ترور مقام ارشد دولتی با طراحی سرویس اطلاعاتی ${actor.nameFa}!`
            : `🏛️ ترور بی‌سابقه مقام ارشد دولتی در قلب ${target.capitalFa}!`;
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
        if (ord.covertType !== 'PROXY_INSURGENCY') {
          newReplays.push({
            id: uid('rep-cyb'),
            round: resolvedRoundNum,
            from: actor.coordinates,
            to: target.coordinates,
            attackerId: traced ? actor.id : null,
            attackerNameFa: traced ? actor.nameFa : 'هکرهای ناشناس',
            defenderId: target.id,
            targetNameFa: target.nameFa,
            kind: 'CYBER',
            succeeded: true,
            intercepted: false,
            headlineFa: newsHeadline,
            impactBadgeFa: ord.covertType.includes('ASSASSINATE')
              ? '🎯 ترور هدفمند در پایتخت!'
              : ord.covertType === 'BLACKOUT_VIRUS'
              ? '⚡ خاموشی سایبری شبکه برق!'
              : '💻 نفوذ و خرابکاری سایبری!',
            categoryLabelFa: 'جنگ سایبری و عملیات ویژه',
            secretActorOnly: !traced,
          });
        }
        addNews(room, {
          agencyFa: ord.covertType.includes('VIRUS') || ord.covertType.includes('STUXNET') ? 'بی‌بی‌سی سایبری' : 'الجزیره فوری',
          category: ord.covertType.includes('VIRUS') || ord.covertType.includes('STUXNET') ? 'CYBER' : 'ESPIONAGE',
          breaking: true,
          headlineFa: newsHeadline,
          bodyFa: traced
            ? `سرویس ضدجاسوسی ${target.nameFa} شواهد ارتباط مستقیم این عملیات با ${actor.nameFa} را منتشر کرد.`
            : 'تاکنون هیچ کشوری رسماً مسئولیت این عملیات را نپذیرفته است.',
          involvedCountries: traced ? [actor.id, target.id] : [target.id],
        });
      }
    } else {
      summaries[actor.id].myOperations.push({
        titleFa: ord.summaryFa,
        targetId: target.id,
        targetNameFa: target.nameFa,
        succeeded: false,
        detailFa: traced
          ? `عملیات شکست خورد و ماموران شما توسط ${target.agencyCode} دستگیر شدند!`
          : 'حفاظت امنیتی هدف مانع اجرای عملیات شد، اما تیم شما بدون شناسایی بازگشت.',
      });
      summaries[target.id].incomingAttacks.push({
        attackerId: attackerIdForTarget,
        attackerLabelFa: attackerLabelForTarget,
        titleFa: traced ? `خنثی‌سازی عملیات مخفی ${actor.nameFa}` : 'خنثی‌سازی نفوذ مشکوک امنیتی/سایبری',
        repelled: true,
        detailFa: traced
          ? `ضدجاسوسی ${target.agencyCode} عوامل اعزامی ${actor.nameFa} را منهدم کرد ✓`
          : 'سپر امنیتی کشور یک تلاش نفوذ ناشناس را خنثی کرد ✓',
      });
    }
  }

  // =========================================================================
  // 2. RESOLVE PROGRESSIVE MINOR NATION CONQUESTS & COUPS (Items #19 & #25!)
  // =========================================================================
  for (const ord of allOrders) {
    if (ord.kind !== 'MINOR_NATION_OPERATION' || !ord.targetMinorId || !ord.minorOpType) continue;
    const actor = room.countries[ord.actor];
    const minor = room.minorNations[ord.targetMinorId];
    if (!actor || actor.isEliminated || !minor) continue;

    const ev = evaluateMinorOpDetails(actor, minor, ord.minorOpType, room.countries, room.minorNations);
    const succeeded = Math.random() * 100 < ev.winPct;

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
      room.market.globalTension = clamp(room.market.globalTension + 8, 0, 100);
      // Protector reaction!
      if (minor.alignedWith && minor.alignedWith !== actor.id && room.countries[minor.alignedWith]) {
        const prot = room.countries[minor.alignedWith];
        adjustRelation(actor, prot, -20);
        prot.lastAttackedBy = actor.id;
      }

      if (succeeded) {
        const baseOcc = minor.occupierId === actor.id ? minor.occupationPct || 0 : 0;
        const nextOcc = clamp(baseOcc + ev.expectedProgressPct, 0, 100);
        minor.occupierId = actor.id;
        minor.occupationPct = nextOcc;
        actor.militaryXp += 12;

        if (nextOcc >= 100) {
          minor.conqueredBy = actor.id;
          minor.alignedWith = actor.id;
          minor.occupationPct = 100;
          minor.garrisonPower = Math.round(minor.garrisonPower * 0.88);
          const instantLoot = Math.max(12, Math.round(minor.gdpB * 0.07));
          actor.treasuryB += instantLoot;
          actor.oilReserve += minor.oilBonus;

          const detail = `تصرف ۱۰۰٪ تکمیل شد! پرچم ${actor.nameFa} بر فراز پایتخت «${minor.nameFa}» برافراشته شد (+$${instantLoot}B غنیمت و الحاق دائمی منابع)!`;
          summaries[actor.id].myOperations.push({
            titleFa: `الحاق کامل خاک ${minor.nameFa}`,
            targetNameFa: minor.nameFa,
            succeeded: true,
            detailFa: detail,
          });
          const hl = `🏴 الحاق کامل سرزمینی: ارتش ${actor.nameFa} پس از درهم شکستن خطوط دفاعی، سراسر خاک «${minor.nameFa}» را ضمیمه قلمرو خود کرد!`;
          worldHighlightsFa.push(hl);
          addNews(room, {
            agencyFa: 'رویترز جنگ / آسوشیتدپرس',
            category: 'WAR',
            breaking: true,
            headlineFa: hl,
            bodyFa: detail,
            involvedCountries: [actor.id],
          });
        } else {
          const partialLoot = Math.max(5, Math.round(minor.gdpB * 0.03));
          actor.treasuryB += partialLoot;
          const detail = `پیشروی موفق! ستون‌های زرهی ${actor.nameFa} اکنون ${nextOcc}٪ از خاک «${minor.nameFa}» را در اشغال دارند (+$${partialLoot}B غنیمت جنگی). در ماه آینده عملیات نهایی الحاق را اجرا کنید!`;
          summaries[actor.id].myOperations.push({
            titleFa: `پیشروی نظامی در خاک ${minor.nameFa} (${nextOcc}٪ اشغال)`,
            targetNameFa: minor.nameFa,
            succeeded: true,
            detailFa: detail,
          });
          addNews(room, {
            agencyFa: 'الجزیره نظامی',
            category: 'WAR',
            breaking: false,
            headlineFa: `⚔️ نبرد سنگین در مرزهای «${minor.nameFa}»؛ ارتش ${actor.nameFa} ${nextOcc}٪ خاک این کشور را به اشغال درآورد`,
            bodyFa: 'خطوط مقدم جدید روی نقشه جهانی ترسیم شد و مقاومت در پایتخت ادامه دارد.',
            involvedCountries: [actor.id],
          });
        }
      } else {
        const lostUnit = loseRandomWeaponUnit(actor, ['ARMOR', 'FIGHTER', 'DRONE']);
        const detail = `مقاومت سرسختانه ارتش ملی ${minor.nameFa} پیشروی زرهی را متوقف کرد!${
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
        minor.occupierId = null;
        minor.occupationPct = 0;
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
          headlineFa: `تحول سیاسی در ${minor.nameFa}؛ دولت جدید پیمان راهبردی با ${actor.nameFa} امضا کرد`,
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
  // 3. RESOLVE MAJOR MILITARY OPERATIONS (WITH ANTI-1-MONTH WIPEOUT CAP!)
  // =========================================================================
  const priorityMap: Record<MilitaryOpType, number> = {
    ASAT_STRIKE: 1,
    AIR_SORTIE: 2,
    NAVAL_BLOCKADE_STRIKE: 3,
    MISSILE_DRONE_STRIKE: 4,
    LIBERATION_COUNTEROFFENSIVE: 5,
    GROUND_CONQUEST: 6,
    NUCLEAR_STRIKE: 7,
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
      startIntegrity,
      prevDevs,
      newVisuals,
      newReplays,
      roundBattles,
      summaries,
      worldHighlightsFa,
      false
    );
    if (ord.militaryType !== 'LIBERATION_COUNTEROFFENSIVE') {
      target.lastAttackedBy = actor.id;
      adjustRelation(actor, target, -25);
      attackedByMap[target.id] = [...(attackedByMap[target.id] || []), actor.id];
    }
  }

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
          startIntegrity,
          prevDevs,
          newVisuals,
          newReplays,
          roundBattles,
          summaries,
          worldHighlightsFa,
          true
        );
      }
    }
  }

  // =========================================================================
  // 4. RESOLVE UN & SPECIAL COMMITTEES
  // =========================================================================
  for (const res of room.resolutions) {
    if (res.status !== 'ACTIVE') continue;
    castAIVotesOnResolution(room, res);

    if ((res.status as string) === 'VETOED') {
      const vetoer = res.vetoedBy ? room.countries[res.vetoedBy] : null;
      const reasonSuffix = res.vetoReasonFa ? ` (${res.vetoReasonFa})` : '';
      const hl = `🛑 وتوی قطعنامه در «${res.committeeFa}» توسط ${vetoer?.nameFa || ''}${reasonSuffix}!`;
      worldHighlightsFa.push(hl);
      if (vetoer && room.countries[res.target]) {
        newReplays.push({
          id: uid('rep-veto'),
          round: resolvedRoundNum,
          from: vetoer.coordinates,
          to: [-74.0, 40.71], // UN HQ New York
          attackerId: vetoer.id,
          attackerNameFa: vetoer.nameFa,
          defenderId: res.target,
          targetNameFa: room.countries[res.target].nameFa,
          kind: 'UN_DECISION',
          succeeded: false,
          intercepted: true,
          headlineFa: hl,
          impactBadgeFa: `🛑 وتوی رسمی ${vetoer.nameFa} در شورای امنیت!`,
          categoryLabelFa: 'شورای امنیت سازمان ملل (نیویورک)',
        });
      }
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
      const proposerC = room.countries[res.proposer];

      if (res.kind === 'GLOBAL_SANCTION' && targetC && !targetC.isEliminated) {
        for (const voter of res.votesYes.slice(0, 8)) {
          if (voter !== targetC.id && !targetC.sanctionedBy.includes(voter)) {
            targetC.sanctionedBy.push(voter);
          }
        }
        targetC.gdpB = Math.max(95, Math.round(targetC.gdpB * 0.96));
      } else if (res.kind === 'CONDEMN_AGGRESSION' && targetC && !targetC.isEliminated) {
        targetC.approval = clamp(targetC.approval - 12, 0, 100);
        for (const voter of res.votesYes.slice(0, 6)) {
          if (room.countries[voter]) adjustRelation(targetC, room.countries[voter], -8);
        }
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
        targetC.nuclearProgress = clamp(targetC.nuclearProgress - 18, 0, 100);
      }

      const hl = `⚖️ تصویب قطعنامه در «${res.committeeFa}»: ${res.titleFa} (${res.votesYes.length} رای موافق در برابر ${res.votesNo.length})`;
      worldHighlightsFa.push(hl);
      if (proposerC && targetC) {
        newReplays.push({
          id: uid('rep-unpass'),
          round: resolvedRoundNum,
          from: [-74.0, 40.71],
          to: targetC.coordinates,
          attackerId: proposerC.id,
          attackerNameFa: proposerC.nameFa,
          defenderId: targetC.id,
          targetNameFa: targetC.nameFa,
          kind: 'UN_DECISION',
          succeeded: true,
          intercepted: false,
          headlineFa: hl,
          impactBadgeFa: `⚖️ تصویب رسمی (${res.votesYes.length} رای موافق)!`,
          categoryLabelFa: res.committeeFa,
        });
      }
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
  // 5. GLOBAL MARKET & WORLD EVENTS
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
    newReplays.push({
      id: uid('rep-wev'),
      round: resolvedRoundNum,
      from: [8.54, 47.37], // Davos / Zurich / Global Financial Hub
      to: [48.0, 29.0],
      attackerId: null,
      attackerNameFa: ev.agencyFa,
      targetNameFa: 'بازارهای جهانی',
      kind: 'WORLD_HEADLINE',
      succeeded: true,
      intercepted: ev.oilDeltaUsd < 0,
      headlineFa: `🌍 ${ev.headlineFa}`,
      impactBadgeFa:
        ev.oilDeltaUsd !== 0
          ? `🛢️ شوک بازار انرژی (${ev.oilDeltaUsd > 0 ? `+$${ev.oilDeltaUsd}` : `-$${Math.abs(ev.oilDeltaUsd)}`})`
          : '🌐 تحول کلان بین‌المللی',
      categoryLabelFa: ev.agencyFa,
    });
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
  // 6. MONTHLY ECONOMY, PASSIVE ORBITAL RECON, RESOURCES & REGIME COLLAPSE
  // =========================================================================
  for (const c of Object.values(room.countries)) {
    if (c.isEliminated) continue;

    // Passive RECON_OPTICAL Satellite Constellation Benefit (v6.0 Item #10!):
    // Automatically gathers live intelligence on top rivals/powers each month without spending covert quota!
    const reconLv = c.constellations?.RECON_OPTICAL || 0;
    if (reconLv > 0) {
      const candidateTargets = ALL_COUNTRY_IDS.filter(
        (tid) => tid !== c.id && !room.countries[tid].isEliminated
      ).sort((a, b) => {
        const aRival = c.rivals.includes(a) || (c.relations[a] ?? 0) < -20 ? 1 : 0;
        const bRival = c.rivals.includes(b) || (c.relations[b] ?? 0) < -20 ? 1 : 0;
        if (aRival !== bRival) return bRival - aRival;
        return room.countries[b].gdpB - room.countries[a].gdpB;
      });
      for (const tid of candidateTargets.slice(0, reconLv)) {
        c.knownIntel[tid] = captureSnapshot(room, room.countries[tid]);
      }
    }

    const econ = computeEconomyProjection(c, room.market, room.chokepoints, room.minorNations);
    c.treasuryB = Math.max(0, c.treasuryB + econ.netIncomeB);
    c.oilReserve = Math.min(550, c.oilReserve + econ.netOil);
    c.gasReserve = Math.min(550, c.gasReserve + econ.netGas);
    c.foodReserve = Math.min(520, c.foodReserve + econ.netFood);
    c.waterReserve = Math.min(520, (c.waterReserve || 0) + econ.netWater);

    // Export revenue is already counted cleanly inside econ.energyExportRevenueB (No double-dip!)
    const autoSoldCashB = Math.max(0, econ.energyExportRevenueB);

    if (c.oilReserve < 0) {
      const deficitCost = Math.min(c.treasuryB, Math.round(Math.abs(c.oilReserve) * 0.65));
      c.treasuryB -= deficitCost;
      c.oilReserve = 0;
      c.approval = clamp(c.approval - 4, 0, 100);
    }
    if (c.gasReserve < 0) {
      c.gasReserve = 0;
      // Gas shortage drops power plant generation if country lacks nuclear energy!
      if (c.upgrades.NUCLEAR < 3) {
        c.powerGrid = clamp(c.powerGrid - 9, 10, 100);
      }
    }
    if (c.foodReserve < 0) {
      const foodCost = Math.min(c.treasuryB, Math.round(Math.abs(c.foodReserve) * 0.5));
      c.treasuryB -= foodCost;
      c.foodReserve = 0;
      c.approval = clamp(c.approval - 8, 0, 100);
      c.devastation = clamp(c.devastation + 6, 0, 100);
    }
    if (c.waterReserve < 0) {
      const waterCost = Math.min(c.treasuryB, Math.round(Math.abs(c.waterReserve) * 0.45));
      c.treasuryB -= waterCost;
      c.waterReserve = 0;
      c.approval = clamp(c.approval - 8, 0, 100);
      c.devastation = clamp(c.devastation + 5, 0, 100);
    }

    c.radarIntegrity = clamp(c.radarIntegrity + 26, 30, 100);
    c.powerGrid = clamp(c.powerGrid + 5, 10, 100);
    c.devastation = clamp(c.devastation - (c.powerGrid >= 75 ? 5 : 2), 0, 100);
    c.commanderBuff = Math.round(c.commanderBuff * 0.35);
    c.securityAlertBonus = Math.max(0, Math.round((c.securityAlertBonus || 0) * 0.45));
    if (c.powerGrid >= 82 && c.foodReserve >= 45 && c.waterReserve >= 45 && c.devastation < 25) {
      c.approval = clamp(c.approval + 2, 0, 100);
    }

    // Regime collapse requires sustained multi-month catastrophe (never instant round-1 wipeout!)
    const immediateCatastrophe =
      room.round >= 2 && (c.devastation >= 96 || (c.approval <= 4 && c.devastation >= 72));

    if (immediateCatastrophe) {
      const lastAggressor = c.lastAttackedBy ? room.countries[c.lastAttackedBy] : null;
      eliminateCollapsedCountry(
        room,
        c,
        `شدت بحران و ویرانی زیرساخت‌ها (${c.devastation}٪) مهارناپذیر شد و به فروپاشی کامل کابینه انجامید.`,
        lastAggressor && !lastAggressor.isEliminated ? lastAggressor : null,
        worldHighlightsFa
      );
    } else if (c.approval <= 12 || c.devastation >= 82) {
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
        const warnMsg = `⚠️ هشدار قرمز سقوط کابینه در ${c.nameFa}! (رضایت: ${c.approval}٪ | ویرانی: ${c.devastation}٪) — در ماه جدید فوراً «امداد و بازسازی اضطراری» اجرا کنید!`;
        addIntel(c, resolvedRoundNum, 'CRITICAL', '🚨 خطر فوری سقوط دولت!', warnMsg);
      }
    } else {
      c.regimeCrisisStreak = 0;
    }

    summaries[c.id].netIncomeB = econ.netIncomeB;
    summaries[c.id].autoSoldOilB = autoSoldCashB;
    summaries[c.id].netOilDelta = econ.netOil;
    summaries[c.id].netFoodDelta = econ.netFood;
    summaries[c.id].netWaterDelta = econ.netWater;
    summaries[c.id].approvalDelta = c.approval - prevApprovals[c.id];
    summaries[c.id].devastationDelta = c.devastation - prevDevs[c.id];
    summaries[c.id].worldHighlightsFa = worldHighlightsFa.slice(0, 6);
    c.lastRoundSummary = summaries[c.id];

    c.orders = [];
    c.upgradesUsedThisRound = 0;
    c.buildsUsedThisRound = 0;
    c.militaryOrdersUsedThisRound = 0;
    c.covertOrdersUsedThisRound = 0;
    c.assassinationsUsedThisRound = 0;
    c.spotSalesUsedThisRound = 0;
    c.missionRerollsUsedThisRound = 0;
    c.requestsSentToThisRound = [];
    c.isReady = false;
    c.incomingAlertActive = false;
    c.incomingThreatsSummaryFa = [];
    c.alertPosture = 'NORMAL';
    c.alertPostureCostPaidB = 0;
    c.alertPostureConfirmed = false;
  }

  room.visualEvents = newVisuals;
  room.lastRoundReplay = newReplays.slice(0, 18);
  room.battles = [...roundBattles, ...room.battles].slice(0, 40);
  refreshSecretMissions(room);
  updateRankingsAndDefcon(room);

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
    room.savedElapsedMs = getElapsedMatchMs(room);
    room.matchStartedAt = null;
    room.pausedAt = null;
    room.phase = 'FINISHED';
    room.isPaused = false;
    room.pausedRemainingMs = null;
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
      bodyFa: 'پرونده این کارزار بسته شد و جدول نهایی قدرت‌های جهان ثبت گردید.',
      involvedCountries: [winner.id],
    });
    return;
  }

  room.round += 1;
  room.calendarLabelFa = getCalendarLabelFa(room.round);
  // Rotate Interactive Global Flashpoints (Idea #4 — spawns on Round 2, 5, 8, 11...)
  if (room.round % 3 === 2) {
    const tpl =
      GLOBAL_FLASHPOINTS_CATALOG[Math.floor((room.round - 2) / 3) % GLOBAL_FLASHPOINTS_CATALOG.length];
    room.activeFlashpoint = {
      ...tpl,
      round: room.round,
      chosenBy: {},
    };
  } else {
    room.activeFlashpoint = null;
  }
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
  startIntegrity: Record<CountryId, number>,
  startDevastation: Record<CountryId, number>,
  newVisuals: MapVisualEvent[],
  newReplays: CinematicReplayEvent[],
  roundBattles: BattleOutcomeLog[],
  summaries: Record<CountryId, RoundSummaryForCountry>,
  worldHighlightsFa: string[],
  isCounterSalvo: boolean
): void {
  if (target.isEliminated || actor.isEliminated) return;
  const atkMil = computeCountryMilitary(actor);
  const defMil = computeCountryMilitary(target);
  const maxRoundDev = Math.min(92, (startDevastation[target.id] ?? target.devastation) + 45);
  const minRoundIntegrity = Math.max(0, (startIntegrity[target.id] ?? target.integrityPct) - 24);

  if (opType !== 'LIBERATION_COUNTEROFFENSIVE') {
    actor.allies = actor.allies.filter((id) => id !== target.id);
    target.allies = target.allies.filter((id) => id !== actor.id);
    actor.secretAllies = (actor.secretAllies || []).filter((id) => id !== target.id);
    target.secretAllies = (target.secretAllies || []).filter((id) => id !== actor.id);
  }
  actor.militaryXp += 15;
  target.militaryXp += 10;

  // === SECRET BACKROOM DEFENSE PACT AMBUSH! (Idea #2!) ===
  let secretAmbushBonus = 0;
  let sprungAlly: CountryState | null = null;
  if (
    !isCounterSalvo &&
    opType !== 'LIBERATION_COUNTEROFFENSIVE' &&
    target.secretAllies &&
    target.secretAllies.length > 0
  ) {
    const validAllyId = target.secretAllies.find(
      (aid) => aid !== actor.id && room.countries[aid] && !room.countries[aid].isEliminated
    );
    if (validAllyId) {
      sprungAlly = room.countries[validAllyId];
      secretAmbushBonus = 24;
      // Convert secret pact to active unveiled alliance and remove secret trap once sprung
      target.secretAllies = target.secretAllies.filter((id) => id !== sprungAlly!.id);
      sprungAlly.secretAllies = (sprungAlly.secretAllies || []).filter((id) => id !== target.id);
      if (!target.allies.includes(sprungAlly.id)) target.allies.push(sprungAlly.id);
      if (!sprungAlly.allies.includes(target.id)) sprungAlly.allies.push(target.id);

      const ambushLost = loseRandomWeaponUnit(actor, ['FIGHTER', 'BOMBER', 'ARMOR', 'NAVAL']);
      const ambushHl = `💥 کمین استراتژیک! پیمان دفاعی مخفی افشا شد و جنگنده‌های ${sprungAlly.nameFa} به دفاع از ${target.nameFa} به نیروهای مهاجم ${actor.nameFa} یورش بردند!${
        ambushLost ? ` (انهدام ۱× ${ambushLost})` : ''
      }`;
      worldHighlightsFa.push(ambushHl);
      addNews(room, {
        agencyFa: 'رویترز فوری (افشای پیمان محرمانه!)',
        category: 'WAR',
        breaking: true,
        headlineFa: ambushHl,
        bodyFa: 'پدافند مشترک دو کشور با غافلگیری کامل مهاجم وارد عمل شد.',
        involvedCountries: [sprungAlly.id, target.id, actor.id],
      });
      newReplays.push({
        id: uid('rep-amb'),
        round: room.round,
        from: sprungAlly.coordinates,
        to: target.coordinates,
        attackerId: sprungAlly.id,
        attackerNameFa: sprungAlly.nameFa,
        defenderId: actor.id,
        targetNameFa: target.nameFa,
        kind: 'SECRET_AMBUSH',
        succeeded: true,
        intercepted: false,
        secretAllyId: sprungAlly.id,
        secretAllyNameFa: sprungAlly.nameFa,
        headlineFa: ambushHl,
        impactBadgeFa: `🕵️ ورود غافلگیرکننده جنگنده‌های ${sprungAlly.nameFa}!`,
      });
    }
  }

  // === 0a. SPACE COMMAND: ANTI-SATELLITE (ASAT) STRIKE (Idea #5!) ===
  if (opType === 'ASAT_STRIKE') {
    const winPct = Math.max(12, evaluateMilitaryOpDetails(actor, target, opType, room.round, room.minorNations).winPct - secretAmbushBonus * 0.5);
    const succeeded = (target.orbitalSatellites || 0) > 0 && Math.random() * 100 < winPct;

    newVisuals.push({
      id: uid('vis-asat'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'MISSILE',
      labelFa: succeeded ? '☄️ انهدام ماهواره در مدار!' : '🛡️ انحراف موشک ضدماهواره',
      intercepted: !succeeded,
    });

    const hl = succeeded
      ? `🛰️ جنگ فضایی: موشک ضدماهواره (ASAT) ${actor.nameFa} ماهواره نظامی ${target.nameFa} را در مدار زمین منهدم کرد!`
      : `🛡️ جنگ الکترونیک فضایی ${target.nameFa} موشک ضدماهواره شلیک‌شده از ${actor.nameFa} را منحرف کرد!`;

    newReplays.push({
      id: uid('rep-asat'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      attackerId: actor.id,
      attackerNameFa: actor.nameFa,
      defenderId: target.id,
      targetNameFa: target.nameFa,
      kind: 'ASAT',
      succeeded,
      intercepted: !succeeded,
      headlineFa: hl,
      impactBadgeFa: succeeded ? '🛰️ انفجار ماهواره در مدار زمین!' : '🛡️ دفع موشک ضدماهواره!',
    });

    if (succeeded) {
      const activeConstellations = (Object.keys(SPACE_CONSTELLATIONS_CATALOG) as SpaceConstellationId[]).filter(
        (cid) => (target.constellations?.[cid] || 0) > 0
      );
      let hitConstellationFa = 'ماهواره نظامی';
      if (activeConstellations.length > 0) {
        const pickedCid = activeConstellations.sort(
          (a, b) => (target.constellations[b] || 0) - (target.constellations[a] || 0)
        )[0];
        target.constellations[pickedCid] = Math.max(0, (target.constellations[pickedCid] || 0) - 1);
        hitConstellationFa = SPACE_CONSTELLATIONS_CATALOG[pickedCid].nameFa;
      }
      target.orbitalSatellites = getTotalConstellationSatellites(target);
      target.radarIntegrity = clamp(target.radarIntegrity - 38, 12, 100);
      seadPenalty[target.id] = (seadPenalty[target.id] || 0) + 25;
      summaries[actor.id].myOperations.push({
        titleFa: `شلیک ضدماهواره (ASAT) به مدار ${target.nameFa}`,
        targetId: target.id,
        targetNameFa: target.nameFa,
        succeeded: true,
        detailFa: `انهدام ۱ واحد از «${hitConstellationFa}» در مدار ${target.nameFa} و کور شدن ۳۸٪ رادار هدف!`,
      });
      summaries[target.id].incomingAttacks.push({
        attackerId: actor.id,
        attackerLabelFa: actor.nameFa,
        titleFa: '☄️ انهدام ماهواره کشور در مدار زمین!',
        repelled: false,
        detailFa: hl,
      });
      worldHighlightsFa.push(hl);
      addNews(room, {
        agencyFa: 'فرماندهی فضایی / رویترز',
        category: 'WAR',
        breaking: true,
        headlineFa: hl,
        bodyFa: 'ارتباطات GPS و شبکه رادار هشدار سریع هدف دچار اختلال شدید شد.',
        involvedCountries: [actor.id, target.id],
      });
    } else {
      summaries[actor.id].myOperations.push({
        titleFa: `شلیک ضدماهواره به ${target.nameFa}`,
        targetId: target.id,
        targetNameFa: target.nameFa,
        succeeded: false,
        detailFa: hl,
      });
      summaries[target.id].incomingAttacks.push({
        attackerId: actor.id,
        attackerLabelFa: actor.nameFa,
        titleFa: 'دفع حمله ضدماهواره‌ای دشمن',
        repelled: true,
        detailFa: hl,
      });
    }
    return;
  }

  // === 0. LIBERATION COUNTEROFFENSIVE ===
  if (opType === 'LIBERATION_COUNTEROFFENSIVE') {
    const winPct = evaluateMilitaryOpDetails(actor, target, opType, room.round, room.minorNations).winPct;
    const succeeded = Math.random() * 100 < winPct;
    newVisuals.push({
      id: uid('vis-lib'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'INVASION',
      labelFa: succeeded ? '🛡️ آزادسازی مناطق اشغالی!' : '🛡️ نبرد سنگین آزادسازی',
      intercepted: !succeeded,
    });

    if (succeeded) {
      actor.integrityPct = clamp(actor.integrityPct + 26, 0, 100);
      if (actor.integrityPct >= 100) actor.occupierId = null;
      actor.approval = clamp(actor.approval + 10, 0, 100);
      loseRandomWeaponUnit(target, ['ARMOR']);
      const detail = `پاتک ملی به ثمر نشست! ارتش ${actor.nameFa} مناطق اشغالی را آزاد کرد (تمامیت ارضی فعلی: ${actor.integrityPct}٪)!`;
      summaries[actor.id].myOperations.push({
        titleFa: `پاتک آزادسازی میهن علیه ${target.nameFa}`,
        targetId: target.id,
        targetNameFa: target.nameFa,
        succeeded: true,
        detailFa: detail,
      });
      addNews(room, {
        agencyFa: 'رویترز جنگ',
        category: 'WAR',
        breaking: true,
        headlineFa: `🛡️ پیروزی در نبرد آزادسازی: ارتش ${actor.nameFa} نیروهای اشغالگر ${target.nameFa} را عقب راند!`,
        bodyFa: detail,
        involvedCountries: [actor.id, target.id],
      });
    } else {
      summaries[actor.id].myOperations.push({
        titleFa: `پاتک آزادسازی علیه ${target.nameFa}`,
        targetId: target.id,
        targetNameFa: target.nameFa,
        succeeded: false,
        detailFa: 'خطوط پدافندی اشغالگران مانع پیشروی کامل در این ماه شد.',
      });
    }
    return;
  }

  // === 1. STRATEGIC NUCLEAR STRIKE ===
  if (opType === 'NUCLEAR_STRIKE' && actor.warheads > 0) {
    actor.warheads -= 1;
    room.market.globalTension = 100;
    const interceptChance = Math.max(
      6,
      (defMil.interceptRate + secretAmbushBonus - (seadPenalty[target.id] || 0)) * 0.36 +
        defMil.antiBallisticUnits * 3
    );
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
    newReplays.push({
      id: uid('rep-nuk'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      attackerId: actor.id,
      attackerNameFa: actor.nameFa,
      defenderId: target.id,
      targetNameFa: target.nameFa,
      kind: 'NUCLEAR',
      succeeded: !intercepted,
      intercepted,
      headlineFa: intercepted
        ? `🛡️ سپر ضدبالستیک ${target.nameFa} کلاهک اتمی ${actor.nameFa} را در لبه فضا شکار کرد!`
        : `☢️ اصابت کلاهک استراتژیک هسته‌ای ${actor.nameFa} به خاک ${target.nameFa}!`,
      impactBadgeFa: intercepted ? '🛡️ انهدام کلاهک اتمی در جو!' : '☢️ انفجار هسته‌ای استراتژیک!',
    });

    if (intercepted) {
      const msg = `سپر ضدبالستیک ${target.nameFa} کلاهک اتمی شلیک‌شده از ${actor.nameFa} را در لبه جو زمین منهدم کرد!`;
      summaries[actor.id].myOperations.push({ titleFa: `ضربه اتمی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: false, detailFa: msg });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: 'رهگیری کلاهک هسته‌ای دشمن!', repelled: true, detailFa: msg });
      worldHighlightsFa.push(`🛡️ ${msg}`);
      addNews(room, { agencyFa: 'رادار جهانی (DEFCON 1)', category: 'WAR', breaking: true, headlineFa: msg, bodyFa: 'جهان وارد وضعیت قرمز اتمی شد.', involvedCountries: [actor.id, target.id] });
    } else {
      target.gdpB = Math.max(90, Math.round(target.gdpB * 0.72));
      target.powerGrid = clamp(target.powerGrid - 42, 8, 100);
      target.approval = clamp(target.approval - 22, 8, 100);
      target.devastation = clamp(target.devastation + 38, 0, maxRoundDev);
      target.treasuryB = Math.round(target.treasuryB * 0.72);

      const ruined = damageCountryInfra(target, ['POWER_PLANT', 'REFINERY', 'ARMS_FACTORY', 'WELFARE_HUB'], 2);
      loseRandomWeaponUnit(target);

      for (const other of Object.values(room.countries)) {
        if (other.id !== actor.id && !other.allies.includes(actor.id) && !actor.sanctionedBy.includes(other.id)) {
          actor.sanctionedBy.push(other.id);
          adjustRelation(actor, other, -30);
        }
      }
      const msg = `☢️ فاجعه اتمی: اصابت کلاهک هسته‌ای ${actor.nameFa} به خاک ${target.nameFa}؛ تخریب ${ruined.length} مجتمع زیرساختی و تحریم جهانی مهاجم!`;
      summaries[actor.id].myOperations.push({ titleFa: `ضربه اتمی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: true, detailFa: msg });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: '☢️ اصابت کلاهک هسته‌ای!', repelled: false, detailFa: msg });
      worldHighlightsFa.push(msg);
      addNews(room, { agencyFa: '🔴 وضعیت اضطراری جهانی (DEFCON 1)', category: 'WAR', breaking: true, headlineFa: msg, bodyFa: 'ستاد بحران کشور هدف عملیات بازسازی اضطراری را آغاز کرد و شورای امنیت مهاجم را تحریم نمود.', involvedCountries: [actor.id, target.id] });
    }
    return;
  }

  room.market.globalTension = clamp(room.market.globalTension + 8, 0, 100);
  const baseWinPct = evaluateMilitaryOpDetails(actor, target, opType, room.round, room.minorNations).winPct;
  const winPct = Math.max(10, baseWinPct - secretAmbushBonus);
  const succeeded = Math.random() * 100 < winPct;

  const replayKindMap: Record<string, CinematicReplayEvent['kind']> = {
    AIR_SORTIE: 'AIR',
    NAVAL_BLOCKADE_STRIKE: 'NAVAL',
    GROUND_CONQUEST: 'GROUND',
    MISSILE_DRONE_STRIKE: 'MISSILE',
  };
  newReplays.push({
    id: uid('rep-mil'),
    round: room.round,
    from: actor.coordinates,
    to: target.coordinates,
    attackerId: actor.id,
    attackerNameFa: actor.nameFa,
    defenderId: target.id,
    targetNameFa: target.nameFa,
    kind: replayKindMap[opType] || 'MISSILE',
    succeeded: isCounterSalvo ? true : succeeded,
    intercepted: isCounterSalvo ? false : !succeeded,
    headlineFa:
      opType === 'AIR_SORTIE'
        ? succeeded
          ? `✈️ شکسته شدن خط پدافند؛ بمباران هوایی ${target.nameFa} توسط اسکادران ${actor.nameFa}!`
          : `🛡️ جنگنده‌های رهگیر ${target.nameFa} اسکادران مهاجم ${actor.nameFa} را دفع کردند!`
        : opType === 'NAVAL_BLOCKADE_STRIKE'
        ? succeeded
          ? `⚓ ناوگان دریایی ${actor.nameFa} بنادر استراتژیک ${target.nameFa} را به محاصره درآورد!`
          : `🛡️ موشک‌های ساحلی ${target.nameFa} ناوگان مهاجم ${actor.nameFa} را عقب راندند!`
        : opType === 'GROUND_CONQUEST'
        ? succeeded
          ? `🚜 پیشروی ستون‌های زرهی ${actor.nameFa} در خطوط مرزی ${target.nameFa}!`
          : `🛡️ مقاومت سرسختانه زرهی ${target.nameFa} تهاجم زمینی ${actor.nameFa} را درهم شکست!`
        : succeeded || isCounterSalvo
        ? `🚀 عبور موشک‌های ${actor.nameFa} از سپر پدافندی و اصابت به تاسیسات ${target.nameFa}!`
        : `🛡️ رهگیری تماشایی امواج موشکی و پهپادی ${actor.nameFa} در آسمان ${target.nameFa}!`,
    impactBadgeFa:
      succeeded || isCounterSalvo
        ? opType === 'GROUND_CONQUEST'
          ? '🏴 تصرف خطوط مرزی!'
          : opType === 'NAVAL_BLOCKADE_STRIKE'
          ? '⚓ قفل کامل بنادر!'
          : '💥 اصابت مستقیم به هدف!'
        : '🛡️ رهگیری موفق پدافند!',
  });

  // === 2. AIR SORTIE ===
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
      target.devastation = clamp(target.devastation + 11, 0, maxRoundDev);
      const shotDownEnemy = loseRandomWeaponUnit(target, ['FIGHTER', 'AIR_DEFENSE']);
      const ruined = damageCountryInfra(target, sectorToInfraType(sector), 1);
      if (sector === 'POWER_PLANT') target.powerGrid = clamp(target.powerGrid - 18, 10, 100);

      const detail = `جنگنده‌های ${actor.nameFa} آسمان ${target.nameFa} را شکافتند! سرکوب ۳۲٪ پدافند${
        shotDownEnemy ? `، انهدام ۱× «${shotDownEnemy}»` : ''
      }${ruined[0] ? ` و تخریب ۱ سطح «${ruined[0]}»` : ''}!`;

      summaries[actor.id].myOperations.push({ titleFa: `عملیات هوایی علیه ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: true, detailFa: detail });
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
      target.devastation = clamp(target.devastation + 9, 0, maxRoundDev);
      const sunkNaval = loseRandomWeaponUnit(target, ['NAVAL']);
      const oilSeized = Math.min(target.oilReserve, 35);
      target.oilReserve -= oilSeized;
      actor.oilReserve += oilSeized;

      const detail = `محاصره دریایی بنادر ${target.nameFa} برقرار شد (-۴۰٪ صادرات دریابرد هدف، توقیف ${oilSeized} نفتکش${
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

  // === 4. GROUND INVASION (CAPPED AT MAX 24% INTEGRITY LOSS PER MONTH — ITEM #13!) ===
  if (opType === 'GROUND_CONQUEST') {
    newVisuals.push({
      id: uid('vis'),
      round: room.round,
      from: actor.coordinates,
      to: target.coordinates,
      fromCountry: actor.id,
      toCountry: target.id,
      kind: 'INVASION',
      labelFa: succeeded ? '🚜 پیشروی زمینی و اشغال مرزی!' : '🛡️ شکست تهاجم زمینی',
      intercepted: !succeeded,
    });

    if (succeeded) {
      const rawTake = Math.round(18 + Math.min(6, actor.upgrades.ARMOR_LAND * 0.8));
      const nextIntegrity = clamp(target.integrityPct - rawTake, minRoundIntegrity, 100);
      const actualTaken = Math.max(0, target.integrityPct - nextIntegrity);
      target.integrityPct = nextIntegrity;
      if (target.integrityPct < 100) target.occupierId = actor.id;

      target.devastation = clamp(target.devastation + 16, 0, maxRoundDev);
      target.approval = clamp(target.approval - 11, 0, 100);
      actor.approval = clamp(actor.approval + 4, 0, 100);

      const lootB = Math.min(target.treasuryB, Math.round(20 + Math.random() * 18));
      const lootOil = Math.min(target.oilReserve, 32);
      target.treasuryB -= lootB;
      actor.treasuryB += lootB;
      target.oilReserve -= lootOil;
      actor.oilReserve += lootOil;

      const destroyedDef = loseRandomWeaponUnit(target, ['ARMOR', 'AIR_DEFENSE']);
      const attackerLoss = Math.random() < 0.35 ? loseRandomWeaponUnit(actor, ['ARMOR', 'DRONE']) : null;
      damageCountryInfra(target, ['REFINERY', 'ARMS_FACTORY'], 1);

      const detail =
        actualTaken > 0
          ? `لشکرهای زرهی شما ${actualTaken}٪ از خاک ${target.nameFa} را تصرف کردند (خاک باقی‌مانده هدف: ${target.integrityPct}٪)! غنیمت: +$${lootB}B و +${lootOil} نفت${
              destroyedDef ? ` | انهدام ۱× «${destroyedDef}»` : ''
            }.`
          : `خطوط دفاع عمق استراتژیک ${target.nameFa} مانع سقوط استان‌های بیشتر در این ماه شد، اما +$${lootB}B غنیمت جنگی به دست آمد.`;

      summaries[actor.id].myOperations.push({ titleFa: `تهاجم زمینی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: true, detailFa: detail });
      summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `پیشروی زمینی ارتش ${actor.nameFa} در مرزها!`, repelled: false, detailFa: detail });

      roundBattles.push({
        id: uid('btl'),
        round: room.round,
        attacker: actor.id,
        defender: target.id,
        opTitleFa: 'تهاجم زمینی و پیشروی مرزی',
        succeeded: true,
        interceptRatePct: defMil.interceptRate,
        summaryFa: detail,
        attackerLossesFa: attackerLoss || 'ناچیز',
        defenderLossesFa: `${actualTaken}٪ خاک + $${lootB}B`,
        lootB,
      });

      if (target.integrityPct <= 0) {
        eliminateCollapsedCountry(
          room,
          target,
          `ارتش ${actor.nameFa} پس از یک کارزار طولانی چندماهه پایتخت (${target.capitalFa}) و ۱۰۰٪ خاک ${target.nameFa} را تسخیر کرد!`,
          actor,
          worldHighlightsFa
        );
      } else {
        const hl = `⚔️ پیشروی زمینی: ارتش ${actor.nameFa} ${actualTaken}٪ از خاک مرزی ${target.nameFa} را به اشغال درآورد (باقی‌مانده: ${target.integrityPct}٪)!`;
        worldHighlightsFa.push(hl);
        addNews(room, { agencyFa: 'رویترز جنگ', category: 'WAR', breaking: true, headlineFa: hl, bodyFa: detail, involvedCountries: [actor.id, target.id] });
      }
    } else {
      const lostArmor = loseRandomWeaponUnit(actor, ['ARMOR', 'FIGHTER']);
      actor.approval = clamp(actor.approval - 7, 0, 100);
      target.approval = clamp(target.approval + 6, 0, 100);
      const detail = `مدافعان ${target.nameFa} ستون‌های زرهی مهاجم را در مرز درهم شکستند!${
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
    defMil.interceptRate - (seadPenalty[target.id] || 0) - actor.upgrades.AEROSPACE * 3.5 - Math.min(18, atkMil.hypersonicUnits * 6),
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
    const detail = `سپر پدافندی ${target.nameFa} (${effectiveIntercept}٪ رهگیری) موج پهپادها و موشک‌های شلیک‌شده را منهدم کرد!`;
    summaries[actor.id].myOperations.push({ titleFa: `حمله موشکی به ${target.nameFa}`, targetId: target.id, targetNameFa: target.nameFa, succeeded: false, detailFa: detail });
    summaries[target.id].incomingAttacks.push({ attackerId: actor.id, attackerLabelFa: actor.nameFa, titleFa: `رهگیری موفق موشک‌های ${actor.nameFa}`, repelled: true, detailFa: detail });
    return;
  }

  const powerScale = 1 + actor.upgrades.AEROSPACE * 0.07;
  target.devastation = clamp(target.devastation + 12, 0, maxRoundDev);
  let hitDetail = '';

  if (sector === 'REFINERY') {
    const oilBurned = Math.min(target.oilReserve, Math.round(42 * powerScale));
    target.oilReserve -= oilBurned;
    const ruined = damageCountryInfra(target, ['REFINERY'], 1);
    hitDetail = `اصابت به تاسیسات انرژی؛ سوختن ${oilBurned} واحد نفت${ruined[0] ? ` و تخریب ۱ سطح «${ruined[0]}»` : ''}!`;
  } else if (sector === 'POWER_PLANT') {
    const drop = clamp(Math.round(20 * powerScale), 12, 34);
    target.powerGrid = clamp(target.powerGrid - drop, 10, 100);
    target.approval = clamp(target.approval - 7, 0, 100);
    const ruined = damageCountryInfra(target, ['POWER_PLANT'], 1);
    hitDetail = `سقوط ${drop}٪ شبکه برق سراسری${ruined[0] ? ` و تخریب ۱ سطح «${ruined[0]}»` : ''} در ${target.nameFa}!`;
  } else if (sector === 'ARMS_FACTORY') {
    const ruined = damageCountryInfra(target, ['ARMS_FACTORY'], 1);
    const cashDmg = Math.min(target.treasuryB, 18);
    target.treasuryB -= cashDmg;
    hitDetail = `اصابت دقیق به صنایع دفاعی ${target.nameFa}؛ تخریب ${ruined[0] || 'کارخانه'} و -$${cashDmg}B خسارت!`;
  } else if (sector === 'AIR_DEFENSE_NET') {
    target.radarIntegrity = clamp(target.radarIntegrity - 36, 12, 100);
    seadPenalty[target.id] = (seadPenalty[target.id] || 0) + 25;
    damageCountryInfra(target, ['RADAR_NETWORK'], 1);
    hitDetail = `انهدام رادارهای هشدار سریع ${target.nameFa} (-۳۶٪ یکپارچگی رادار)!`;
  } else {
    const destroyedW = loseRandomWeaponUnit(target);
    const cashDmg = Math.min(target.treasuryB, Math.round(16 * powerScale));
    target.treasuryB -= cashDmg;
    hitDetail = destroyedW
      ? `انهدام ۱ واحد «${destroyedW}» در پایگاه‌های ${target.nameFa} + $${cashDmg}B خسارت!`
      : `$${cashDmg}B خسارت به پایگاه‌ها و زاغه‌های مهمات ${target.nameFa}!`;
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
    bodyFa: 'عملیات مهار آتش و بازسازی اضطراری در کشور هدف آغاز شد.',
    involvedCountries: [actor.id, target.id],
  });
}

// ============================================================================
// SECRET CREATOR CHEAT CONSOLE ENGINE (ITEM #21 — ZERO PUBLIC TRACE!)
// ============================================================================

export function verifyCreatorKey(secretKey: string): boolean {
  return (secretKey || '').trim().toLowerCase() === 'abtin';
}

export function applyCreatorCheat(
  room: GameRoomState,
  payload: CreatorCheatPayload
): { ok: boolean; messageFa?: string; errorFa?: string } {
  if (!verifyCreatorKey(payload.secretKey)) {
    return { ok: false, errorFa: 'کد امنیتی سازنده نامعتبر است!' };
  }

  if (payload.action === 'FORCE_NEXT_ROUND') {
    if (room.phase === 'PLANNING' || room.phase === 'RADAR_ALERT' || room.phase === 'GM_REVIEW') {
      resolveCurrentRound(room);
      return { ok: true, messageFa: `⏭️ ماه با فرمان سازنده پردازش شد (اکنون در ماه ${room.round}).` };
    }
    return { ok: false, errorFa: 'بازی در فاز فعال نیست.' };
  }

  const c = room.countries[payload.targetCountry];
  if (!c) return { ok: false, errorFa: 'کشور هدف یافت نشد.' };

  switch (payload.action) {
    case 'ADD_RESOURCES':
      if (payload.treasuryDelta) c.treasuryB = Math.max(0, c.treasuryB + payload.treasuryDelta);
      if (payload.oilDelta) c.oilReserve = Math.max(0, c.oilReserve + payload.oilDelta);
      if (payload.foodDelta) c.foodReserve = Math.max(0, c.foodReserve + payload.foodDelta);
      if (payload.waterDelta) c.waterReserve = Math.max(0, (c.waterReserve || 0) + payload.waterDelta);
      if (payload.warheadsDelta) {
        c.warheads = Math.max(0, c.warheads + payload.warheadsDelta);
        if (c.warheads > 0) c.nuclearProgress = 100;
      }
      if (payload.approvalDelta) c.approval = clamp(c.approval + payload.approvalDelta, 0, 100);
      if (payload.devastationDelta) c.devastation = clamp(c.devastation + payload.devastationDelta, 0, 100);
      updateRankingsAndDefcon(room);
      return { ok: true, messageFa: `⚡ منابع و شاخص‌های ${c.nameFa} به صورت مخفی بروزرسانی شد.` };

    case 'SET_DOCTRINES_MAX':
      for (const k of Object.keys(UPGRADE_TRACKS) as UpgradeTrack[]) {
        c.upgrades[k] = UPGRADE_TRACKS[k].maxLevel;
      }
      c.nuclearProgress = 100;
      c.warheads = Math.max(6, c.warheads + 4);
      c.techLevel = 12;
      c.intelLevel = 12;
      c.cyberShield = 99;
      c.infrastructure.SCIENCE_ACADEMY = 12;
      updateRankingsAndDefcon(room);
      return { ok: true, messageFa: `🌟 تمامی ۸ دکترین راهبردی ${c.nameFa} به سطح ۱۰ (MAX) رسید!` };

    case 'HEAL_ALL':
      c.devastation = 0;
      c.approval = 98;
      c.powerGrid = 100;
      c.radarIntegrity = 100;
      c.cyberShield = 99;
      c.integrityPct = 100;
      c.occupierId = null;
      c.regimeCrisisStreak = 0;
      c.foodReserve = Math.max(250, c.foodReserve);
      c.waterReserve = Math.max(250, c.waterReserve || 0);
      c.oilReserve = Math.max(250, c.oilReserve);
      c.gasReserve = Math.max(250, c.gasReserve);
      for (const k of Object.keys(INFRASTRUCTURE_CATALOG) as InfrastructureType[]) {
        if ((c.damagedInfra[k] || 0) > 0) {
          c.infrastructure[k] += c.damagedInfra[k];
          c.damagedInfra[k] = 0;
        }
      }
      updateRankingsAndDefcon(room);
      return { ok: true, messageFa: `💚 بازسازی ۱۰۰٪ فوری و رفع کامل بحران برای ${c.nameFa} اعمال شد!` };

    case 'ADD_ELITE_ARMY': {
      const ownWeapons = Object.values(WEAPONS_CATALOG).filter((w) => w.originCountry === c.id);
      if (ownWeapons.length > 0) {
        for (const w of ownWeapons) {
          c.weapons[w.id] = (c.weapons[w.id] || 0) + 4;
        }
      } else {
        c.weapons.f35 = (c.weapons.f35 || 0) + 4;
        c.weapons.thaad = (c.weapons.thaad || 0) + 3;
        c.weapons.abrams_m1a2 = (c.weapons.abrams_m1a2 || 0) + 4;
      }
      c.oilReserve += 150;
      updateRankingsAndDefcon(room);
      return { ok: true, messageFa: `🎖️ ارتش نخبه به سازمان رزم ${c.nameFa} تزریق شد!` };
    }

    case 'FORCE_COLLAPSE': {
      const dummy: string[] = [];
      eliminateCollapsedCountry(room, c, 'فروپاشی ناگهانی ساختار قدرت و سقوط دولت مرکزی.', null, dummy);
      updateRankingsAndDefcon(room);
      return { ok: true, messageFa: `💥 دولت ${c.nameFa} سقوط کرد.` };
    }

    case 'REVIVE_COUNTRY':
      c.isEliminated = false;
      c.eliminatedRound = null;
      c.eliminatedReasonFa = null;
      c.conqueredBy = null;
      c.occupierId = null;
      c.integrityPct = 100;
      c.devastation = 10;
      c.approval = 80;
      c.powerGrid = 95;
      c.treasuryB = Math.max(300, c.treasuryB);
      c.regimeCrisisStreak = 0;
      updateRankingsAndDefcon(room);
      return { ok: true, messageFa: `🔄 دولت ${c.nameFa} با قدرت کامل احیا شد!` };
  }
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
      secretAllies: myCountryId && c.secretAllies?.includes(myCountryId) ? [myCountryId] : [],
      secretMissions: [],
      orders: [],
      intelReports: [],
      knownIntel: {},
      lastRoundSummary: null,
      incomingThreatsSummaryFa: [],
    };
  }

  const visibleVisualEvents = room.visualEvents.filter((ev) => {
    if (!ev.secretActorOnly) return true;
    return myCountryId !== null && ev.fromCountry === myCountryId;
  });

  const visibleReplayEvents = (room.lastRoundReplay || []).filter((ev) => {
    if (!ev.secretActorOnly) return true;
    return myCountryId !== null && ev.attackerId === myCountryId;
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

  const visibleRequests = (room.strategicRequests || []).filter((r) => {
    if (!myCountryId) return false;
    return r.from === myCountryId || r.to === myCountryId;
  });

  return {
    ...room,
    countries: maskedCountries,
    visualEvents: visibleVisualEvents,
    lastRoundReplay: visibleReplayEvents,
    messages: visibleMessages,
    trades: visibleTrades,
    strategicRequests: visibleRequests,
  };
}
