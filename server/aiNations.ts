import {
  computeCountryMilitary,
  estimateCovertSuccessPct,
  evaluateMilitaryOpDetails,
  evaluateMinorOpDetails,
  getConstellationUpgradeInfo,
  getEmergencyActionCost,
  getInfraNextCost,
  getMaxBuildsPerRound,
  getMaxUpgradesPerRound,
  getTotalConstellationSatellites,
  getUpgradeNextCost,
} from '../shared/advisor.js';
import {
  ALL_COUNTRY_IDS,
  INFRASTRUCTURE_CATALOG,
  UPGRADE_TRACKS,
  WEAPONS_CATALOG,
} from '../shared/realWorldData.js';
import {
  ChokepointStatus,
  CountryId,
  CountryState,
  CovertOpType,
  GameRoomState,
  InfrastructureType,
  MilitaryOpType,
  ResolutionKind,
  SpaceConstellationId,
  TradeOffer,
  UNResolution,
  UpgradeTrack,
} from '../shared/types.js';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function adjustRelation(a: CountryState, b: CountryState, delta: number): void {
  a.relations[b.id] = clamp((a.relations[b.id] ?? 15) + delta, -100, 100);
  b.relations[a.id] = clamp((b.relations[a.id] ?? 15) + delta, -100, 100);
}

export function evaluateAITradeOffer(
  room: GameRoomState,
  offer: TradeOffer
): { accepted: boolean; reasonFa: string } {
  const ai = room.countries[offer.to];
  const sender = room.countries[offer.from];
  if (!ai || !sender || ai.isEliminated) {
    return { accepted: false, reasonFa: 'کشور مقصد غیرفعال است.' };
  }

  const rel = ai.relations[sender.id] ?? 15;
  const hardModeFactor =
    room.settings.difficulty === 'EXTREME' ? 1.24 : room.settings.difficulty === 'HARD' ? 1.12 : 1;

  // 1. PEACE TREATY
  if (offer.offerType === 'PEACE_TREATY') {
    const aiWantsPeace = ai.devastation >= 35 || ai.approval < 45 || rel >= 0;
    const minReparations = aiWantsPeace ? 0 : Math.round(18 * hardModeFactor);
    if (offer.priceB >= minReparations) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} پیمان صلح و عدم تعرض ۳ ماهه با ${sender.nameFa} را امضا کرد و وضعیت جنگی متوقف شد!`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} برای پذیرش آتش‌بس و پیمان صلح حداقل $${minReparations}B تضمین دیپلماتیک درخواست کرد.`,
    };
  }

  // 2. LIFT SANCTION
  if (offer.offerType === 'LIFT_SANCTION') {
    const minScore = rel >= 20 ? 12 : Math.round(28 * hardModeFactor);
    if (offer.priceB >= minScore && ai.lastAttackedBy !== sender.id) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} تحریم‌های اقتصادی علیه ${sender.nameFa} را لغو کرد.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} برای لغو تحریم حداقل $${minScore}B امتیاز تجاری می‌خواهد (یا ابتدا پیمان صلح امضا کنید).`,
    };
  }

  // 2.5 SECRET BACKROOM DEFENSE PACT
  if (offer.offerType === 'SECRET_DEFENSE_PACT') {
    if (ai.secretAllies.includes(sender.id) || ai.allies.includes(sender.id)) {
      return { accepted: true, reasonFa: 'پیمان دفاعی هم‌اکنون برقرار است.' };
    }
    if (ai.lastAttackedBy === sender.id || rel < 12) {
      return {
        accepted: false,
        reasonFa: `سطح اعتماد سیاسی (${rel}) برای امضای پیمان دفاعی محرمانه کافی نیست (حداقل رابطه +۱۲ لازم است).`,
      };
    }
    const minSecretCost = rel >= 45 ? 15 : Math.round(25 * hardModeFactor);
    if (offer.priceB >= minSecretCost) {
      return {
        accepted: true,
        reasonFa: `🕵️ ${ai.nameFa} به صورت کاملاً محرمانه پیمان دفاعی پشت‌پرده را امضا کرد! در صورت حمله دشمن به شما، جنگنده‌های آن‌ها مهاجم را غافلگیر می‌کنند.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `سرویس امنیتی ${ai.nameFa} برای تضمین پیمان دفاعی محرمانه حداقل $${minSecretCost}B درخواست کرد.`,
    };
  }

  // 3. FORMAL MILITARY ALLIANCE
  if (offer.offerType === 'ALLIANCE') {
    if (ai.allies.includes(sender.id)) {
      return { accepted: true, reasonFa: 'پیمان دفاعی مشترک هم‌اکنون برقرار است.' };
    }
    if (ai.lastAttackedBy === sender.id || rel < 22) {
      return {
        accepted: false,
        reasonFa: `سطح روابط سیاسی (${rel}) برای اتحاد نظامی پایین است! ابتدا «پیمان صلح» ببندید یا هیئت دوستی بفرستید تا رابطه بالای +۲۲ برسد.`,
      };
    }
    const minPact = rel >= 55 ? 14 : Math.round(28 * hardModeFactor);
    if (offer.priceB >= minPact) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} پیمان اتحاد نظامی و امنیتی مشترک با ${sender.nameFa} را امضا کرد!`,
      };
    }
    return {
      accepted: false,
      reasonFa: `وزارت خارجه ${ai.nameFa} برای امضای پیمان دفاعی حداقل $${minPact}B بودجه همکاری مشترک می‌خواهد.`,
    };
  }

  // 4. WEAPON IMPORT / EXPORT
  if (offer.offerType === 'WEAPON' && offer.weaponId) {
    const spec = WEAPONS_CATALOG[offer.weaponId];
    if (!spec) return { accepted: false, reasonFa: 'سامانه تسلیحاتی یافت نشد.' };

    if (offer.direction === 'BUY') {
      if (sender.sanctionedBy.includes(ai.id) || ai.lastAttackedBy === sender.id || rel < -30) {
        return {
          accepted: false,
          reasonFa: `${ai.nameFa} به دلیل تحریم یا تیرگی روابط سیاسی (${rel}) از فروش «${spec.nameFa}» خودداری کرد.`,
        };
      }
      if ((spec.id === 'f22' || spec.id === 'b2_spirit') && !ai.allies.includes(sender.id)) {
        return {
          accepted: false,
          reasonFa: `صادرات ${spec.nameEn} فقط به متحدان رسمی ${ai.nameFa} مجاز است؛ ابتدا پیمان اتحاد نظامی ببندید.`,
        };
      }
      const qty = Math.max(1, offer.amount || 1);
      const minPrice = Math.round(spec.unitCostB * qty * (ai.allies.includes(sender.id) ? 1.05 : 1.18));
      if (offer.priceB >= minPrice) {
        return {
          accepted: true,
          reasonFa: `قرارداد دفاعی تایید شد؛ ${ai.nameFa} سامانه «${spec.nameFa}» را تحویل ارتش ${sender.nameFa} داد!`,
        };
      }
      return {
        accepted: false,
        reasonFa: `وزارت دفاع ${ai.nameFa} حداقل قیمت این محموله را $${minPrice}B اعلام کرد.`,
      };
    } else {
      // Tightened AI purchase price for player's used weapons so players cannot print cash!
      const qty = Math.max(1, offer.amount || 1);
      const maxAiWillPay = Math.round(spec.unitCostB * qty * 0.58);
      if (ai.treasuryB < offer.priceB + 35) {
        return { accepted: false, reasonFa: `${ai.nameFa} بودجه کافی برای خرید این سامانه ندارد.` };
      }
      if (offer.priceB <= maxAiWillPay && rel > -20) {
        return {
          accepted: true,
          reasonFa: `ارتش ${ai.nameFa} سامانه «${spec.nameFa}» ارسالی شما را به مبلغ $${offer.priceB}B خریداری کرد!`,
        };
      }
      return {
        accepted: false,
        reasonFa: `${ai.nameFa} حداکثر $${maxAiWillPay}B برای خرید این تسلیحات کارکرده می‌پردازد.`,
      };
    }
  }

  // 5. BILATERAL RESOURCE DEALS (Realistic tightened pricing!)
  const unitFair: Record<string, number> = {
    OIL: (room.market.oilPriceUsd / 82) * 0.34,
    GAS: (room.market.gasPriceIndex / 100) * 0.26,
    FOOD: (room.market.foodPriceIndex / 100) * 0.25,
    WATER: 0.22,
    URANIUM: 1.2,
  };
  const fairTotalB = Math.max(4, Math.round((unitFair[offer.offerType] || 0.28) * offer.amount));

  if (offer.direction === 'SELL') {
    if (ai.treasuryB < offer.priceB + 25) {
      return { accepted: false, reasonFa: `${ai.nameFa} بودجه مازاد برای این خرید ندارد.` };
    }
    if (offer.priceB <= Math.round(fairTotalB * 1.12)) {
      adjustRelation(ai, sender, 4);
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} محموله ارسالی ${sender.nameFa} را به مبلغ $${offer.priceB}B خریداری کرد (+۴ بهبود رابطه).`,
      };
    }
    return { accepted: false, reasonFa: `${ai.nameFa} قیمت پیشنهادی را بالاتر از نرخ منصفانه قرارداد (${fairTotalB}B) دانست.` };
  }

  if (offer.direction === 'BUY') {
    if (offer.priceB >= Math.round(fairTotalB * 0.92)) {
      adjustRelation(ai, sender, 4);
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} محموله درخواستی را به ${sender.nameFa} صادر کرد (+۴ بهبود رابطه).`,
      };
    }
    return { accepted: false, reasonFa: `${ai.nameFa} قیمت پیشنهادی را کمتر از ارزش واقعی محموله دانست.` };
  }

  return { accepted: false, reasonFa: 'پیشنهاد رد شد.' };
}

export function processInteractiveAIChat(
  room: GameRoomState,
  aiCountry: CountryState,
  humanCountry: CountryState,
  text: string
): string {
  const aiMil = computeCountryMilitary(aiCountry);
  const humMil = computeCountryMilitary(humanCountry);
  const msg = text.trim();
  const chatTrackKey = `_chatRelRound_${humanCountry.id}`;
  const alreadyBoostedThisRound =
    (aiCountry as unknown as Record<string, number>)[chatTrackKey] === room.round;

  const mentionedThird = Object.values(room.countries).find(
    (c) => c.id !== aiCountry.id && c.id !== humanCountry.id && msg.includes(c.nameFa)
  );
  if (
    mentionedThird &&
    (msg.includes('خطر') ||
      msg.includes('حمله') ||
      msg.includes('توطئه') ||
      msg.includes('دشمن') ||
      msg.includes('خیانت') ||
      msg.includes('تحریم') ||
      msg.includes('اتم'))
  ) {
    const pairRel = aiCountry.relations[mentionedThird.id] ?? 15;
    const persuadeChance =
      32 +
      humanCountry.upgrades.INTELLIGENCE * 5 +
      (aiCountry.relations[humanCountry.id] > 25 ? 14 : 0) -
      (pairRel >= 60 ? 22 : 0);
    if (Math.random() * 100 < persuadeChance && !alreadyBoostedThisRound) {
      (aiCountry as unknown as Record<string, number>)[chatTrackKey] = room.round;
      adjustRelation(aiCountry, mentionedThird, -12);
      return `وزارت خارجه ${aiCountry.nameFa}: هشدار امنیتی شما درباره «${mentionedThird.nameFa}» ثبت شد و حساسیت اطلاعاتی ما افزایش یافت (رابطه با آن‌ها: ${aiCountry.relations[mentionedThird.id]}). برای اقدام عملی می‌توانید از منوی «درخواست‌های راهبردی» یا «عملیات فریب» استفاده کنید.`;
    }
    return `سفارت ${aiCountry.nameFa}: ادعاهای شفاهی علیه «${mentionedThird.nameFa}» بدون شواهد اطلاعاتی کافی پذیرفته نیست؛ برای تغییر جدی معادلات از بخش درخواست‌های راهبردی یا عملیات پرچم دروغین اقدام کنید.`;
  }

  if (msg.includes('تهدید') || msg.includes('اولتیماتوم') || msg.includes('عقب‌نشینی') || msg.includes('تسلیم')) {
    const myDeterrence = humMil.attackScore + humMil.defenseScore * 0.5 + humanCountry.warheads * 24;
    const aiDeterrence = aiMil.attackScore + aiMil.defenseScore * 0.7 + aiCountry.warheads * 24;
    if (myDeterrence > aiDeterrence * 1.35 && !aiCountry.isUNVetoMember) {
      aiCountry.orders = aiCountry.orders.filter((o) => o.targetCountry !== humanCountry.id);
      adjustRelation(aiCountry, humanCountry, -8);
      return `شورای امنیت ملی ${aiCountry.nameFa}: با توجه به آرایش نظامی فعلی، دستور خویشتن‌داری موقت صادر شد؛ برای توافقات مشخص از بخش «درخواست‌های راهبردی» اقدام کنید.`;
    }
    adjustRelation(aiCountry, humanCountry, -14);
    return `ستاد کل ارتش ${aiCountry.nameFa}: لحن تهدیدآمیز شما مردود است! زرادخانه دفاعی ما آماده پاسخ کوبنده به هرگونه تجاوز است (رابطه به ${aiCountry.relations[humanCountry.id]} کاهش یافت).`;
  }

  if (
    msg.includes('صلح') ||
    msg.includes('دوست') ||
    msg.includes('اتحاد') ||
    msg.includes('همکاری') ||
    msg.includes('سلام') ||
    msg.includes('توافق')
  ) {
    if (!alreadyBoostedThisRound) {
      (aiCountry as unknown as Record<string, number>)[chatTrackKey] = room.round;
      adjustRelation(aiCountry, humanCountry, 8);
      if (aiCountry.relations[humanCountry.id] > -20 && aiCountry.lastAttackedBy === humanCountry.id) {
        aiCountry.lastAttackedBy = null;
      }
    }
    const newRel = aiCountry.relations[humanCountry.id];
    if (newRel >= 30) {
      return `وزارت خارجه ${aiCountry.nameFa}: از پیام دوستانه ${humanCountry.nameFa} خرسندیم! روابط دو کشور به سطح مثبت (+${newRel}) رسیده و آماده بررسی درخواست‌های راهبردی و پیمان دفاعی هستیم.`;
    }
    return `وزارت خارجه ${aiCountry.nameFa}: گام دیپلماتیک شما فضای مذاکره را بهبود بخشید (رابطه فعلی: ${newRel}).`;
  }

  return `وزارت خارجه ${aiCountry.nameFa} (${aiCountry.capitalFa}): پیام رسمی شما ثبت شد (شاخص رابطه دوجانبه: ${aiCountry.relations[humanCountry.id]}). از پنل «درخواست‌های راهبردی» می‌توانید پیشنهادهای عملیاتی ارسال کنید.`;
}

function runAIChokepointStrategy(
  room: GameRoomState,
  onChokepointChanged: (country: CountryState, cpNameFa: string, cpCoords: [number, number], nextStatus: ChokepointStatus, oilPrice: number) => void
): void {
  for (const cp of Object.values(room.chokepoints)) {
    const ctrl = room.countries[cp.controller];
    if (!ctrl || ctrl.playerId !== null || ctrl.isEliminated) continue;

    const underDirectWar = ctrl.lastAttackedBy !== null || ctrl.devastation >= 28;
    const underHeavySanctions = ctrl.sanctionedBy.length >= 3 && room.market.globalTension >= 48;

    let desired: ChokepointStatus = cp.status;
    if (underDirectWar && Math.random() < 0.78) {
      desired = 'BLOCKADED';
    } else if (underHeavySanctions && cp.status === 'OPEN' && Math.random() < 0.48) {
      desired = ctrl.id === 'IR' ? 'BLOCKADED' : 'RESTRICTED';
    } else if (!underDirectWar && !underHeavySanctions && cp.status !== 'OPEN' && Math.random() < 0.55) {
      desired = cp.status === 'BLOCKADED' ? 'RESTRICTED' : 'OPEN';
    }

    if (desired !== cp.status) {
      cp.status = desired;
      if (desired === 'BLOCKADED') {
        room.market.oilPriceUsd = Math.min(245, room.market.oilPriceUsd + Math.round(cp.oilImpactFactor * 52));
        room.market.foodPriceIndex = Math.min(230, room.market.foodPriceIndex + 8);
        room.market.globalTension = Math.min(100, room.market.globalTension + 14);
      } else if (desired === 'RESTRICTED') {
        room.market.oilPriceUsd = Math.min(240, room.market.oilPriceUsd + 10);
      } else {
        room.market.oilPriceUsd = Math.max(68, room.market.oilPriceUsd - 14);
      }
      onChokepointChanged(ctrl, cp.nameFa, cp.coordinates, desired, room.market.oilPriceUsd);
    }
  }
}

/**
 * Living World Competitive AI v6.0 (Items #6, #8 & #10):
 * - Aggressively develops Economy, Science Academies, 10 Doctrines & 4 Space Constellations so AI Superpowers fiercely compete on the Leaderboard!
 * - Maintains optimal deterrence without bankrupting itself on upkeep!
 * - Proposes smart, deduplicated UN Security Council resolutions against aggressive expansionists!
 */
export function runLivingWorldAITurn(
  room: GameRoomState,
  callbacks?: {
    onChokepointNews?: (
      country: CountryState,
      cpNameFa: string,
      cpCoords: [number, number],
      status: ChokepointStatus,
      oilPrice: number
    ) => void;
    onAIPoliticalNews?: (agencyFa: string, headlineFa: string, bodyFa: string, involved: CountryId[]) => void;
    onAISpaceLaunch?: (country: CountryState, constellationNameFa: string, nextLv: number) => void;
  }
): void {
  if (!room.settings.enableAINations) return;

  const diff = room.settings.difficulty || 'NORMAL';
  const isSingle = room.settings.gameMode === 'SINGLE';
  const aiGrowthChance = diff === 'EXTREME' ? 0.94 : diff === 'HARD' ? 0.84 : 0.72;
  const maxWorldFlashpointAttacks =
    (diff === 'EXTREME' ? 5 : diff === 'HARD' ? 4 : 3) + (isSingle ? 1 : 0);

  if (callbacks?.onChokepointNews) {
    runAIChokepointStrategy(room, callbacks.onChokepointNews);
  }

  const top1 = room.rankings[0];
  const top2 = room.rankings[1];
  const runawayHegemonId: CountryId | null =
    room.round >= 3 && top1 && top2 && top1.score > top2.score * 1.24 ? top1.countryId : null;

  const aiCountries = Object.values(room.countries).filter(
    (c) => c.playerId === null && !c.isEliminated
  );
  const humanCountries = Object.values(room.countries).filter(
    (c) => c.playerId !== null && !c.isEliminated
  );

  let aiMilitaryActionsThisRound = 0;

  for (const ai of aiCountries) {
    ai.orders = [];

    if (diff === 'EXTREME') ai.treasuryB += 22;
    else if (diff === 'HARD') ai.treasuryB += 12;
    else if (ai.aiPersonality === 'SUPERPOWER') ai.treasuryB += 6;

    // 1. Emergency Survival & Ruins Reconstruction
    if (ai.oilReserve < 45 && ai.treasuryB >= 28) {
      ai.treasuryB -= 20;
      ai.oilReserve += 55;
    }
    if (ai.foodReserve < 45 && ai.treasuryB >= 20) {
      ai.treasuryB -= 15;
      ai.foodReserve += 55;
    }
    if ((ai.waterReserve || 0) < 45 && ai.treasuryB >= 18) {
      ai.treasuryB -= 14;
      ai.waterReserve = (ai.waterReserve || 0) + 55;
    }

    if (ai.devastation >= 38 || ai.approval < 42) {
      const rCost = getEmergencyActionCost(ai, 'NATIONAL_RELIEF');
      if (ai.treasuryB >= rCost) {
        ai.treasuryB -= rCost;
        ai.approval = Math.min(100, ai.approval + 14);
        ai.devastation = Math.max(0, ai.devastation - 20);
      }
    }

    for (const infraKey of Object.keys(INFRASTRUCTURE_CATALOG) as InfrastructureType[]) {
      if ((ai.damagedInfra[infraKey] || 0) > 0) {
        const reb = getInfraNextCost(ai, infraKey, diff);
        if (ai.treasuryB >= reb.costB + 15) {
          ai.treasuryB -= reb.costB;
          ai.damagedInfra[infraKey] -= 1;
          ai.infrastructure[infraKey] += 1;
          break;
        }
      }
    }

    // 2. Competitive Multi-Slot Doctrine Upgrades (All 10 Doctrines!)
    const maxUps = getMaxUpgradesPerRound(ai);
    for (let uSlot = 0; uSlot < maxUps; uSlot++) {
      if (ai.treasuryB < 65 || Math.random() > aiGrowthChance) break;
      const priorityTracks: UpgradeTrack[] =
        ai.sanctionedBy.length >= 2
          ? ['ECONOMIC_SOVEREIGNTY', 'INDUSTRY', 'SPACE_ORBITAL', 'AIR_DEFENSE', 'AEROSPACE', 'INTELLIGENCE']
          : ai.aiPersonality === 'ECONOMIC_POWER'
          ? ['INDUSTRY', 'ECONOMIC_SOVEREIGNTY', 'SPACE_ORBITAL', 'CYBER_AI', 'AIR_DEFENSE', 'AEROSPACE']
          : ai.aiPersonality === 'SUPERPOWER'
          ? ['INDUSTRY', 'SPACE_ORBITAL', 'ECONOMIC_SOVEREIGNTY', 'AEROSPACE', 'CYBER_AI', 'INTELLIGENCE', 'AIR_DEFENSE', 'NAVAL_POWER', 'ARMOR_LAND']
          : ['INDUSTRY', 'AEROSPACE', 'AIR_DEFENSE', 'ECONOMIC_SOVEREIGNTY', 'ARMOR_LAND', 'INTELLIGENCE', 'SPACE_ORBITAL', 'NUCLEAR'];

      // Pick lowest-level priority track so AI develops harmoniously and competitively!
      const available = priorityTracks
        .filter((t) => (ai.upgrades[t] || 0) < UPGRADE_TRACKS[t].maxLevel)
        .sort((a, b) => (ai.upgrades[a] || 0) - (ai.upgrades[b] || 0));

      const candidate = available[0];
      if (!candidate) break;
      const upCost = getUpgradeNextCost(ai, candidate, diff);
      if (ai.treasuryB >= upCost + 22) {
        ai.treasuryB -= upCost;
        ai.upgrades[candidate] = (ai.upgrades[candidate] || 0) + 1;
        if (candidate === 'INDUSTRY') ai.gdpB += 32;
        if (candidate === 'ECONOMIC_SOVEREIGNTY') ai.gdpB += 18;
        if (candidate === 'AEROSPACE' || candidate === 'SPACE_ORBITAL') ai.techLevel = clamp(ai.techLevel + 1, 1, 12);
        if (candidate === 'INTELLIGENCE') ai.intelLevel = clamp(ai.intelLevel + 1, 1, 12);
        if (candidate === 'NUCLEAR' && ai.upgrades.NUCLEAR >= 5 && ai.warheads === 0) {
          ai.nuclearProgress = 100;
          ai.warheads = 2;
        }
      }
    }

    // 2b. High-ROI Infrastructure (Science Academies, Welfare, Power, Refineries)
    const maxBuilds = getMaxBuildsPerRound(ai);
    if (ai.treasuryB >= 80 && Math.random() < aiGrowthChance * 0.85 && maxBuilds > 0) {
      const infraPick: InfrastructureType =
        (ai.infrastructure.SCIENCE_ACADEMY || 0) < 6
          ? 'SCIENCE_ACADEMY'
          : ai.powerGrid < 82
          ? 'POWER_PLANT'
          : ai.approval < 74
          ? 'WELFARE_HUB'
          : ai.oilProduction >= 65
          ? 'REFINERY'
          : 'ARMS_FACTORY';
      const infCost = getInfraNextCost(ai, infraPick, diff);
      if (ai.infrastructure[infraPick] < INFRASTRUCTURE_CATALOG[infraPick].maxLevel && ai.treasuryB >= infCost.costB + 25) {
        ai.treasuryB -= infCost.costB;
        ai.infrastructure[infraPick] += 1;
        if (infraPick === 'SCIENCE_ACADEMY') {
          ai.techLevel = clamp(ai.techLevel + 1, 1, 12);
          ai.gdpB += 12;
        } else if (infraPick === 'WELFARE_HUB') {
          ai.approval = clamp(ai.approval + 8, 0, 100);
        } else if (infraPick === 'POWER_PLANT') {
          ai.powerGrid = clamp(ai.powerGrid + 14, 0, 100);
        }
      }
    }

    // 2c. AI Space Constellations Deployment (4 Orbital Constellations!)
    if (ai.treasuryB >= 85 && Math.random() < (ai.aiPersonality === 'SUPERPOWER' ? 0.55 : 0.34)) {
      const satOrder: SpaceConstellationId[] = ['SATCOM_EW', 'RECON_OPTICAL', 'SBIRS_SHIELD', 'GNSS_NAVI'];
      for (const cid of satOrder) {
        const info = getConstellationUpgradeInfo(ai, cid, diff);
        if (info.canUpgrade && ai.treasuryB >= info.costB + 25) {
          ai.treasuryB -= info.costB;
          ai.oilReserve = Math.max(0, ai.oilReserve - info.fuelCost);
          ai.constellations[cid] = (ai.constellations[cid] || 0) + 1;
          ai.orbitalSatellites = getTotalConstellationSatellites(ai);
          callbacks?.onAISpaceLaunch?.(ai, cid, ai.constellations[cid]);
          break;
        }
      }
    }

    // 2d. AI Diplomatic Alliance Building (Boosts AI Influence Score!)
    if (Math.random() < 0.28 && ai.allies.length < 6) {
      const potentialAlly = aiCountries.find(
        (other) =>
          other.id !== ai.id &&
          !ai.allies.includes(other.id) &&
          (ai.relations[other.id] ?? 0) >= 42 &&
          !ai.rivals.includes(other.id)
      );
      if (potentialAlly) {
        ai.allies.push(potentialAlly.id);
        potentialAlly.allies.push(ai.id);
        adjustRelation(ai, potentialAlly, 12);
      }
    }

    if (room.activeFlashpoint && !room.activeFlashpoint.chosenBy[ai.id]) {
      room.activeFlashpoint.chosenBy[ai.id] = ai.treasuryB >= 55 ? 'A' : 'C';
      if (room.activeFlashpoint.chosenBy[ai.id] === 'A' && ai.treasuryB >= 26) {
        ai.treasuryB -= 20;
        ai.gdpB += 24;
      }
    }

    // 2e. Smart Optimal Deterrence Army Cap (AI avoids bankrupting itself on excess units!)
    const mil = computeCountryMilitary(ai);
    const optimalMaxUnits = ai.aiPersonality === 'SUPERPOWER' ? 25 : 18;
    if (ai.treasuryB >= 90 && mil.totalUnits < optimalMaxUnits && Math.random() < aiGrowthChance * 0.65) {
      const buildable = Object.values(WEAPONS_CATALOG).filter(
        (w) =>
          (w.originCountry === ai.id || ai.allies.includes(w.originCountry)) &&
          (!w.minTrack || (ai.upgrades[w.minTrack.track] || 0) >= w.minTrack.level)
      );
      if (buildable.length > 0) {
        const w = buildable[Math.floor(Math.random() * buildable.length)];
        if (ai.treasuryB >= w.unitCostB + 30) {
          ai.treasuryB -= w.unitCostB;
          ai.weapons[w.id] = (ai.weapons[w.id] || 0) + 1;
        }
      }
    }

    // 3. Anti-Snowball Counter-Hegemon Operations
    if (
      runawayHegemonId &&
      runawayHegemonId !== ai.id &&
      !ai.allies.includes(runawayHegemonId) &&
      (ai.aiPersonality === 'SUPERPOWER' || ai.aiPersonality === 'REGIONAL_HAWK') &&
      aiMilitaryActionsThisRound < maxWorldFlashpointAttacks &&
      Math.random() < 0.44
    ) {
      const hegemon = room.countries[runawayHegemonId];
      if (
        hegemon &&
        !hegemon.isEliminated &&
        !(ai.nonAggressionPacts[hegemon.id] && ai.nonAggressionPacts[hegemon.id]! >= room.round)
      ) {
        if (!hegemon.sanctionedBy.includes(ai.id) && ai.relations[hegemon.id] < 15) {
          hegemon.sanctionedBy.push(ai.id);
        }
        if (ai.treasuryB >= 24) {
          const covPick: CovertOpType = hegemon.treasuryB >= 320 ? 'TREASURY_HEIST' : 'STUXNET_SABOTAGE';
          ai.treasuryB -= 18;
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-contain'),
            actor: ai.id,
            kind: 'COVERT_OPERATION',
            targetCountry: hegemon.id,
            covertType: covPick,
            estimatedSuccessPct: estimateCovertSuccessPct(ai, hegemon, covPick),
            costB: 18,
            fuelCost: 0,
            summaryFa: `عملیات مهار سایبری علیه تمرکز قدرت ${hegemon.nameFa}`,
            expectedImpactFa: 'ایجاد موازنه قوا در برابر قدرت اول جدول',
          });
          continue;
        }
      }
    }

    // 4. DECISIVE RETALIATION (Includes AI-vs-AI fallout triggered by False-Flag Sabotage!)
    if (ai.lastAttackedBy && room.countries[ai.lastAttackedBy] && !room.countries[ai.lastAttackedBy].isEliminated) {
      const aggressor = room.countries[ai.lastAttackedBy];
      const hasTruce = (ai.nonAggressionPacts[aggressor.id] || 0) >= room.round;
      if (!hasTruce && ai.treasuryB >= 22) {
        const candidates: MilitaryOpType[] = [
          'MISSILE_DRONE_STRIKE',
          'AIR_SORTIE',
          'NAVAL_BLOCKADE_STRIKE',
          'GROUND_CONQUEST',
        ];
        const validOp = candidates.find(
          (op) => evaluateMilitaryOpDetails(ai, aggressor, op, room.round, room.minorNations).canExecute
        );
        if (validOp) {
          const det = evaluateMilitaryOpDetails(ai, aggressor, validOp, room.round, room.minorNations);
          const opCost = validOp === 'GROUND_CONQUEST' ? 34 : 20;
          if (ai.treasuryB >= opCost) {
            ai.treasuryB -= opCost;
            ai.oilReserve = Math.max(0, ai.oilReserve - det.fuelCost);
            ai.orders.push({
              id: uid('ai-ret'),
              actor: ai.id,
              kind: 'MILITARY_OPERATION',
              targetCountry: aggressor.id,
              militaryType: validOp,
              targetSector: Math.random() < 0.5 ? 'MILITARY_BASES' : 'POWER_PLANT',
              estimatedSuccessPct: det.winPct,
              costB: opCost,
              fuelCost: det.fuelCost,
              summaryFa: `عملیات تلافی‌جویانه ${ai.nameFa} علیه ${aggressor.nameFa}`,
              expectedImpactFa: 'پاسخ مستقیم به تجاوز یا بحران امنیتی',
            });
            ai.lastAttackedBy = null;
            continue;
          }
        }
      }
    }

    // 5. AI-vs-AI & Regional Rival Flashpoints + Minor Nation Expansion
    if (
      (ai.aiPersonality === 'REGIONAL_HAWK' || ai.aiPersonality === 'SUPERPOWER') &&
      aiMilitaryActionsThisRound < maxWorldFlashpointAttacks &&
      ai.treasuryB >= 65 &&
      Math.random() < (diff === 'EXTREME' ? 0.34 : 0.24)
    ) {
      if (Math.random() < 0.38) {
        const reachableMinors = Object.values(room.minorNations).filter((m) => {
          if (m.conqueredBy === ai.id) return false;
          if (m.conqueredBy && ai.allies.includes(m.conqueredBy)) return false;
          const ev = evaluateMinorOpDetails(ai, m, 'CONQUER_ANNEX', room.countries, room.minorNations);
          return ev.canExecute && ev.winPct >= 52;
        });
        if (reachableMinors.length > 0) {
          const targetM = reachableMinors[Math.floor(Math.random() * reachableMinors.length)];
          ai.treasuryB -= 28;
          ai.oilReserve = Math.max(0, ai.oilReserve - 12);
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-minor'),
            actor: ai.id,
            kind: 'MINOR_NATION_OPERATION',
            targetMinorId: targetM.id,
            minorOpType: 'CONQUER_ANNEX',
            estimatedSuccessPct: evaluateMinorOpDetails(ai, targetM, 'CONQUER_ANNEX', room.countries, room.minorNations).winPct,
            costB: 28,
            fuelCost: 12,
            summaryFa: `عملیات پیشروی ارتش ${ai.nameFa} در «${targetM.nameFa}»`,
            expectedImpactFa: 'گسترش مرحله‌ای نفوذ سرزمینی',
          });
          continue;
        }
      }

      const rivalPool = ALL_COUNTRY_IDS.filter(
        (cid) =>
          cid !== ai.id &&
          !room.countries[cid].isEliminated &&
          !ai.allies.includes(cid) &&
          (ai.rivals.includes(cid) || ai.relations[cid] <= -42) &&
          (ai.nonAggressionPacts[cid] || 0) < room.round
      );
      if (rivalPool.length > 0) {
        const rival = room.countries[rivalPool[Math.floor(Math.random() * rivalPool.length)]];
        if (Math.random() < 0.55) {
          const covChoices: CovertOpType[] = [
            'SAT_RECON',
            'PROXY_INSURGENCY',
            'BLACKOUT_VIRUS',
            'TREASURY_HEIST',
            'STUXNET_SABOTAGE',
            'INSURGENCY_PSYOPS',
          ];
          const covType = covChoices[Math.floor(Math.random() * covChoices.length)];
          ai.treasuryB -= 16;
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-cov'),
            actor: ai.id,
            kind: 'COVERT_OPERATION',
            targetCountry: rival.id,
            covertType: covType,
            estimatedSuccessPct: estimateCovertSuccessPct(ai, rival, covType),
            costB: 16,
            fuelCost: 0,
            summaryFa: `عملیات اطلاعاتی-سایبری ${ai.nameFa} علیه ${rival.nameFa}`,
            expectedImpactFa: 'رقابت پنهان سرویس‌های اطلاعاتی',
          });
        } else {
          const validMil = (['MISSILE_DRONE_STRIKE', 'AIR_SORTIE', 'NAVAL_BLOCKADE_STRIKE'] as MilitaryOpType[]).find(
            (op) => evaluateMilitaryOpDetails(ai, rival, op, room.round, room.minorNations).canExecute
          );
          if (validMil) {
            const det = evaluateMilitaryOpDetails(ai, rival, validMil, room.round, room.minorNations);
            ai.treasuryB -= 20;
            ai.oilReserve = Math.max(0, ai.oilReserve - det.fuelCost);
            aiMilitaryActionsThisRound += 1;
            ai.orders.push({
              id: uid('ai-atk'),
              actor: ai.id,
              kind: 'MILITARY_OPERATION',
              targetCountry: rival.id,
              militaryType: validMil,
              targetSector: 'MILITARY_BASES',
              estimatedSuccessPct: det.winPct,
              costB: 20,
              fuelCost: det.fuelCost,
              summaryFa: `درگیری نظامی ${ai.nameFa} با ${rival.nameFa}`,
              expectedImpactFa: 'برخورد مستقیم در کانون بحران',
            });
          }
        }
      }
    }

    ai.isReady = true;
  }

  // =========================================================================
  // 6. SMART, DEDUPLICATED UN SECURITY COUNCIL AI DIPLOMACY (v6.0 Item #6!)
  // =========================================================================
  if (room.resolutions.filter((r) => r.status === 'ACTIVE').length < 2 && Math.random() < 0.72) {
    const activeAIs = aiCountries.filter(
      (a) => a.isUNVetoMember || a.aiPersonality === 'SUPERPOWER' || a.aiPersonality === 'REGIONAL_HAWK'
    );
    if (activeAIs.length > 0) {
      const proposer = activeAIs[Math.floor(Math.random() * activeAIs.length)];
      // Prioritize aggressive expansionists or nuclear proliferators or runaway hegemons!
      const candidates = ALL_COUNTRY_IDS.filter((id) => {
        const c = room.countries[id];
        if (id === proposer.id || c.isEliminated || proposer.allies.includes(id)) return false;
        const alreadyTargeted = room.resolutions.some(
          (r) => r.status === 'ACTIVE' && r.target === id
        );
        if (alreadyTargeted) return false;
        const conqueredCount = Object.values(room.minorNations).filter((m) => m.conqueredBy === id).length;
        return (
          id === runawayHegemonId ||
          conqueredCount >= 2 ||
          proposer.relations[id] <= -48
        );
      });

      if (candidates.length > 0) {
        const enemy = room.countries[candidates[0]];
        const conqueredCount = Object.values(room.minorNations).filter((m) => m.conqueredBy === enemy.id).length;
        const kind: ResolutionKind =
          enemy.nuclearProgress >= 65 && enemy.warheads === 0
            ? 'IAEA_INSPECTION'
            : conqueredCount >= 2
            ? 'CONDEMN_AGGRESSION'
            : 'GLOBAL_SANCTION';

        const titleFa =
          kind === 'IAEA_INSPECTION'
            ? `پرونده بازرسی فوری آژانس (IAEA) به پیشنهاد ${proposer.nameFa} علیه برنامه هسته‌ای ${enemy.nameFa}`
            : kind === 'GLOBAL_SANCTION'
            ? `قطعنامه تحریم فراگیر شورای امنیت به پیشنهاد ${proposer.nameFa} علیه ${enemy.nameFa}`
            : `قطعنامه محکومیت توسعه‌طلبی نظامی ${enemy.nameFa} به پیشنهاد ${proposer.nameFa}`;

        const newRes: UNResolution = {
          id: uid('un-ai'),
          round: room.round,
          proposer: proposer.id,
          target: enemy.id,
          kind,
          committeeFa: kind === 'IAEA_INSPECTION' ? 'شورای حکام آژانس اتمی' : 'شورای امنیت سازمان ملل',
          titleFa,
          effectSummaryFa:
            kind === 'IAEA_INSPECTION'
              ? 'کاهش ۱۸٪ پیشرفت هسته‌ای و جریمه بانکی در صورت تصویب.'
              : kind === 'GLOBAL_SANCTION'
              ? 'اعمال تحریم هماهنگ بانکی و تجاری توسط کشورهای موافق.'
              : 'کاهش ۱۲٪ مشروعیت بین‌المللی و تضعیف روابط خارجی کشور هدف.',
          votesYes: [proposer.id],
          votesNo: [],
          vetoedBy: null,
          vetoReasonFa: null,
          status: 'ACTIVE',
        };
        seedInitialAIStancesOnResolution(room, newRes);
        room.resolutions.unshift(newRes);

        callbacks?.onAIPoliticalNews?.(
          'رویترز دیپلماتیک (نیویورک)',
          `⚖️ نشست اضطراری سازمان ملل: ${titleFa}`,
          `سفیر ${proposer.nameFa} پیش‌نویس قطعنامه را روی میز شورای امنیت گذاشت و رایزنی برای کسب آرا یا وتو آغاز شد.`,
          [proposer.id, enemy.id]
        );
      }
    }
  }

  // 6b. BRICS+ Formation on Round 3
  if (room.round === 3 && !room.coalitions['coalition-brics']) {
    const founder = ['IN', 'BR', 'SA']
      .map((id) => room.countries[id as CountryId])
      .find((c) => c && !c.playerId && !c.isEliminated && !c.coalitionId);
    if (founder) {
      room.coalitions['coalition-brics'] = {
        id: 'coalition-brics',
        nameFa: 'پیمان قدرت‌های مستقل جنوب جهانی (بریکس+)',
        leader: founder.id,
        members: [founder.id],
        invited: [],
        createdRound: room.round,
      };
      founder.coalitionId = 'coalition-brics';
      for (const other of ['BR', 'SA', 'EG'] as CountryId[]) {
        const oc = room.countries[other];
        if (oc && oc.id !== founder.id && !oc.playerId && !oc.isEliminated && !oc.coalitionId) {
          room.coalitions['coalition-brics'].members.push(oc.id);
          oc.coalitionId = 'coalition-brics';
        }
      }
      callbacks?.onAIPoliticalNews?.(
        'الجزیره / شین‌هوا',
        `🛡️ تاسیس ائتلاف جدید جهانی: «پیمان جنوب جهانی (بریکس+)» به رهبری ${founder.nameFa} اعلام موجودیت کرد!`,
        'قدرت‌های نوظهور برای حفظ موازنه جهانی پیمان مشترک تشکیل دادند.',
        [founder.id]
      );
    }
  }

  // 6c. Coalition Invites to Friendly Humans
  for (const coal of Object.values(room.coalitions)) {
    const leader = room.countries[coal.leader];
    if (!leader || leader.playerId !== null || leader.isEliminated) continue;
    for (const hum of humanCountries) {
      if (!hum.coalitionId && leader.relations[hum.id] >= 22 && !coal.invited.includes(hum.id) && Math.random() < 0.35) {
        coal.invited.push(hum.id);
        room.messages.push({
          id: uid('ai-inv'),
          timestamp: Date.now(),
          channel: 'DIRECT',
          fromCountry: leader.id,
          fromName: `${leader.nameFa} (رهبر ائتلاف)`,
          toCountry: hum.id,
          text: `🛡️ دعوت‌نامه رسمی: از دولت ${hum.nameFa} دعوت می‌کنیم به «${coal.nameFa}» بپیوندد تا از چتر دفاعی و تسلیحاتی مشترک بهره‌مند شود!`,
        });
      }
    }
  }

  // 7. Proactive Bilateral Trade Offers (Realistic Pricing!)
  for (const human of humanCountries) {
    const alreadyHasPending = room.trades.some(
      (t) => t.status === 'PENDING' && t.to === human.id
    );
    if (!alreadyHasPending && Math.random() < 0.45) {
      if (human.oilReserve >= 240) {
        const buyerAI = aiCountries.find(
          (a) =>
            (a.id === 'CN' || a.id === 'DE' || a.id === 'JP' || a.id === 'IN' || a.id === 'FR') &&
            !human.sanctionedBy.includes(a.id) &&
            a.treasuryB >= 55
        );
        if (buyerAI) {
          const offerPrice = Math.max(12, Math.round(18 * (room.market.oilPriceUsd / 82)));
          room.trades.unshift({
            id: uid('ai-offer'),
            round: room.round,
            from: buyerAI.id,
            to: human.id,
            offerType: 'OIL',
            amount: 55,
            priceB: offerPrice,
            direction: 'BUY',
            noteFa: `قرارداد خرید ۵۵ واحد نفت خام با نرخ دوجانبه`,
            status: 'PENDING',
          });
        }
      } else if (human.foodReserve < 65) {
        const foodSeller = aiCountries.find(
          (a) => (a.id === 'BR' || a.id === 'RU' || a.id === 'CA') && a.foodReserve >= 140
        );
        if (foodSeller) {
          room.trades.unshift({
            id: uid('ai-food'),
            round: room.round,
            from: foodSeller.id,
            to: human.id,
            offerType: 'FOOD',
            amount: 55,
            priceB: 16,
            direction: 'SELL',
            noteFa: `پیشنهاد تامین فوری ۵۵ واحد گندم و غلات`,
            status: 'PENDING',
          });
        }
      }
    }
  }
}

/**
 * Casts immediate initial stances of key blocs when a resolution is tabled,
 * so the UN chamber immediately looks alive while leaving undecided swing states & final veto evaluation for round end!
 */
export function seedInitialAIStancesOnResolution(room: GameRoomState, res: UNResolution): void {
  const target = room.countries[res.target];
  if (!target) return;
  for (const c of Object.values(room.countries)) {
    if (c.playerId !== null || c.isEliminated) continue;
    if (res.votesYes.includes(c.id) || res.votesNo.includes(c.id)) continue;

    if (res.kind === 'OPEC_OIL_CUT' && c.oilProduction >= 85) {
      res.votesYes.push(c.id);
    } else if (res.kind === 'OPEC_OIL_BOOST' && c.oilConsumption > c.oilProduction + 25) {
      res.votesYes.push(c.id);
    } else if (c.id === res.target || c.allies.includes(res.target)) {
      res.votesNo.push(c.id);
    } else if (c.allies.includes(res.proposer) && (c.relations[res.target] ?? 0) < 0) {
      res.votesYes.push(c.id);
    }
  }
}

/**
 * Smart, Bug-Free UN Voting & P5 Veto Engine (v6.0 Item #6):
 * Evaluates alliances, secret pacts, coalition solidarity, oil import dependency, and recent aggression!
 */
export function castAIVotesOnResolution(room: GameRoomState, res: UNResolution): void {
  const target = room.countries[res.target];
  const proposer = room.countries[res.proposer];
  if (!target || !proposer) return;

  const vetoEligible =
    res.kind === 'GLOBAL_SANCTION' ||
    res.kind === 'CONDEMN_AGGRESSION' ||
    res.kind === 'IAEA_INSPECTION';

  for (const c of Object.values(room.countries)) {
    if (c.playerId !== null || c.isEliminated) continue;

    const relToTarget = c.relations[res.target] ?? 0;
    const relToProposer = c.relations[res.proposer] ?? 0;
    const wasAttackedByTarget = c.lastAttackedBy === res.target;

    // Smart P5 Veto Check (runs even if initial No vote was already seeded!)
    if (c.isUNVetoMember && vetoEligible && !res.vetoedBy && !wasAttackedByTarget && c.id !== res.proposer) {
      let vetoReason: string | null = null;
      if (c.id === res.target) {
        vetoReason = `دفاع از حاکمیت ملی و منافع حیاتی ${c.nameFa}`;
      } else if (c.allies.includes(res.target) || c.secretAllies?.includes(res.target)) {
        vetoReason = `پیمان هم‌پیمانی راهبردی با ${target.nameFa}`;
      } else if (c.coalitionId && c.coalitionId === target.coalitionId && relToTarget >= 20) {
        vetoReason = `همبستگی بلوک ائتلافی در حمایت از ${target.nameFa}`;
      } else if (relToTarget >= 45 && relToProposer <= 10) {
        vetoReason = `مخالفت با فشار سیاسی بلوک رقیب علیه شریک راهبردی (${target.nameFa})`;
      } else if (
        res.kind === 'GLOBAL_SANCTION' &&
        c.oilConsumption > c.oilProduction + 25 &&
        target.oilProduction >= 90 &&
        relToTarget >= 15
      ) {
        vetoReason = `حفاظت از امنیت واردات انرژی از ${target.nameFa}`;
      }

      if (vetoReason) {
        res.votesYes = res.votesYes.filter((id) => id !== c.id);
        if (!res.votesNo.includes(c.id)) res.votesNo.push(c.id);
        res.vetoedBy = c.id;
        res.vetoReasonFa = vetoReason;
        res.status = 'VETOED';
        continue;
      }
    }

    if (res.votesYes.includes(c.id) || res.votesNo.includes(c.id)) continue;

    if (res.kind === 'OPEC_OIL_CUT') {
      if (c.oilProduction > c.oilConsumption + 10) res.votesYes.push(c.id);
      else res.votesNo.push(c.id);
      continue;
    }
    if (res.kind === 'OPEC_OIL_BOOST') {
      if (c.oilConsumption > c.oilProduction) res.votesYes.push(c.id);
      else res.votesNo.push(c.id);
      continue;
    }
    if (res.kind === 'EMERGENCY_AID_PACKAGE') {
      if (relToTarget <= -35) res.votesNo.push(c.id);
      else res.votesYes.push(c.id);
      continue;
    }

    if (c.id === res.target || c.allies.includes(res.target) || relToTarget >= 38) {
      res.votesNo.push(c.id);
      continue;
    }

    if (wasAttackedByTarget || relToTarget <= -25 || (relToProposer >= 35 && relToTarget < 15)) {
      res.votesYes.push(c.id);
    } else if (res.kind === 'CEASEFIRE_DEMAND') {
      res.votesYes.push(c.id);
    } else if (relToProposer > relToTarget + 10) {
      res.votesYes.push(c.id);
    } else {
      res.votesNo.push(c.id);
    }
  }
}
