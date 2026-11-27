import {
  computeCountryMilitary,
  estimateCovertSuccessPct,
  estimateMilitarySuccessPct,
  evaluateMilitaryOpDetails,
  evaluateMinorOpDetails,
  getEmergencyActionCost,
  getInfraNextCost,
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
    room.settings.difficulty === 'EXTREME' ? 1.22 : room.settings.difficulty === 'HARD' ? 1.1 : 1;

  // 1. PEACE TREATY (BUG-FREE! Works even between bitter enemies & rivals!)
  if (offer.offerType === 'PEACE_TREATY') {
    const aiWantsPeace = ai.devastation >= 35 || ai.approval < 45 || rel >= 0;
    const minReparations = aiWantsPeace ? 0 : Math.round(15 * hardModeFactor);
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
    const minScore = rel >= 20 ? 10 : Math.round(25 * hardModeFactor);
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

  // 2.5 SECRET BACKROOM DEFENSE PACT (Idea #2 — Hidden ambush alliance!)
  if (offer.offerType === 'SECRET_DEFENSE_PACT') {
    if (ai.secretAllies.includes(sender.id) || ai.allies.includes(sender.id)) {
      return { accepted: true, reasonFa: 'پیمان دفاعی هم‌اکنون برقرار است.' };
    }
    if (ai.lastAttackedBy === sender.id || rel < 8) {
      return {
        accepted: false,
        reasonFa: `سطح اعتماد سیاسی (${rel}) برای امضای پیمان دفاعی محرمانه کافی نیست (حداقل رابطه +۱۰ لازم است).`,
      };
    }
    const minSecretCost = rel >= 45 ? 12 : Math.round(22 * hardModeFactor);
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

  // 3. FORMAL MILITARY ALLIANCE (Checks bilateral relation instead of permanent hardcoded block!)
  if (offer.offerType === 'ALLIANCE') {
    if (ai.allies.includes(sender.id)) {
      return { accepted: true, reasonFa: 'پیمان دفاعی مشترک هم‌اکنون برقرار است.' };
    }
    if (ai.lastAttackedBy === sender.id || rel < 18) {
      return {
        accepted: false,
        reasonFa: `سطح روابط سیاسی (${rel}) برای اتحاد نظامی پایین است! ابتدا «پیمان صلح» ببندید یا هیئت دوستی بفرستید تا رابطه بالای +۲۰ برسد.`,
      };
    }
    const minPact = rel >= 55 ? 10 : Math.round(24 * hardModeFactor);
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
      const minPrice = Math.round(spec.unitCostB * qty * (ai.allies.includes(sender.id) ? 1.0 : 1.1));
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
      // Player SELLING surplus weapon from their own arsenal to AI!
      const qty = Math.max(1, offer.amount || 1);
      const maxAiWillPay = Math.round(spec.unitCostB * qty * 0.85);
      if (ai.treasuryB < offer.priceB + 25) {
        return { accepted: false, reasonFa: `${ai.nameFa} بودجه کافی برای خرید این سامانه ندارد.` };
      }
      if (offer.priceB <= maxAiWillPay && rel > -25) {
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

  // 5. BILATERAL RESOURCE DEALS (OIL, GAS, FOOD, WATER, URANIUM)
  const unitFair: Record<string, number> = {
    OIL: (room.market.oilPriceUsd / 82) * 0.46,
    GAS: (room.market.gasPriceIndex / 100) * 0.35,
    FOOD: (room.market.foodPriceIndex / 100) * 0.33,
    WATER: 0.28,
    URANIUM: 1.35,
  };
  const fairTotalB = Math.max(5, Math.round((unitFair[offer.offerType] || 0.35) * offer.amount));

  if (offer.direction === 'SELL') {
    if (ai.treasuryB < offer.priceB + 18) {
      return { accepted: false, reasonFa: `${ai.nameFa} بودجه مازاد برای این خرید ندارد.` };
    }
    if (offer.priceB <= Math.round(fairTotalB * 1.22)) {
      adjustRelation(ai, sender, 4);
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} محموله ارسالی ${sender.nameFa} را به مبلغ $${offer.priceB}B خریداری کرد (+۴ بهبود رابطه).`,
      };
    }
    return { accepted: false, reasonFa: `${ai.nameFa} قیمت پیشنهادی را بالاتر از نرخ جهانی دانست.` };
  }

  if (offer.direction === 'BUY') {
    if (offer.priceB >= Math.round(fairTotalB * 0.86)) {
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

/**
 * Interactive AI Chat Engine (Items #11 & #17):
 * Chatting with AI countries genuinely shifts relations, allows sowing discord against third countries,
 * and processes threats/coercion dynamically!
 */
export function processInteractiveAIChat(
  room: GameRoomState,
  aiCountry: CountryState,
  humanCountry: CountryState,
  text: string
): string {
  const aiMil = computeCountryMilitary(aiCountry);
  const humMil = computeCountryMilitary(humanCountry);
  const msg = text.trim();
  const chatTrackKey = `_chatRelRound_${humanCountry.id}` as keyof CountryState;
  const alreadyBoostedThisRound = (aiCountry as unknown as Record<string, number>)[chatTrackKey as string] === room.round;

  // Check if human is sowing discord against a specific 3rd country!
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
    const persuadeChance = 40 + humanCountry.upgrades.INTELLIGENCE * 6 + (aiCountry.relations[humanCountry.id] > 20 ? 15 : 0);
    if (Math.random() * 100 < persuadeChance && !alreadyBoostedThisRound) {
      (aiCountry as unknown as Record<string, number>)[chatTrackKey as string] = room.round;
      adjustRelation(aiCountry, mentionedThird, -18);
      if (aiCountry.relations[mentionedThird.id] < 10) {
        aiCountry.allies = aiCountry.allies.filter((id) => id !== mentionedThird.id);
        mentionedThird.allies = mentionedThird.allies.filter((id) => id !== aiCountry.id);
      }
      return `وزارت خارجه ${aiCountry.nameFa}: گزارش محرمانه شما درباره تهدیدات «${mentionedThird.nameFa}» در شورای امنیت ملی ما بررسی و تایید شد! سطح اعتماد ما به ${mentionedThird.nameFa} کاهش یافت (رابطه فعلی با آن‌ها: ${aiCountry.relations[mentionedThird.id]}).`;
    }
    return `سفارت ${aiCountry.nameFa}: ادعاهای مطرح‌شده علیه «${mentionedThird.nameFa}» نیازمند اسناد اطلاعاتی دقیق‌تری است؛ از بخش «عملیات اختلاف‌افکنی» هم می‌توانید پرونده مستند ارسال کنید.`;
  }

  // Coercion / Threat in chat
  if (msg.includes('تهدید') || msg.includes('اولتیماتوم') || msg.includes('عقب‌نشینی') || msg.includes('تسلیم')) {
    const myDeterrence = humMil.attackScore + humMil.defenseScore * 0.5 + humanCountry.warheads * 24;
    const aiDeterrence = aiMil.attackScore + aiMil.defenseScore * 0.7 + aiCountry.warheads * 24;
    if (myDeterrence > aiDeterrence * 1.25) {
      aiCountry.orders = aiCountry.orders.filter((o) => o.targetCountry !== humanCountry.id);
      humanCountry.sanctionedBy = humanCountry.sanctionedBy.filter((id) => id !== aiCountry.id);
      adjustRelation(aiCountry, humanCountry, -8);
      return `شورای امنیت ملی ${aiCountry.nameFa}: با توجه به آرایش نظامی فعلی، دستور توقف تنش و لغو محدودیت‌ها علیه ${humanCountry.nameFa} صادر شد؛ اما نیروهای ما در حالت آماده‌باش دفاعی می‌مانند.`;
    }
    adjustRelation(aiCountry, humanCountry, -14);
    return `ستاد کل ارتش ${aiCountry.nameFa}: لحن تهدیدآمیز شما مردود است! زرادخانه دفاعی ما آماده پاسخ کوبنده به هرگونه تجاوز است (رابطه به ${aiCountry.relations[humanCountry.id]} کاهش یافت).`;
  }

  // Friendly / Peace / Alliance outreach
  if (
    msg.includes('صلح') ||
    msg.includes('دوست') ||
    msg.includes('اتحاد') ||
    msg.includes('همکاری') ||
    msg.includes('سلام') ||
    msg.includes('توافق')
  ) {
    if (!alreadyBoostedThisRound) {
      (aiCountry as unknown as Record<string, number>)[chatTrackKey as string] = room.round;
      adjustRelation(aiCountry, humanCountry, 10);
      if (aiCountry.relations[humanCountry.id] > -20 && aiCountry.lastAttackedBy === humanCountry.id) {
        aiCountry.lastAttackedBy = null;
      }
    }
    const newRel = aiCountry.relations[humanCountry.id];
    if (newRel >= 30) {
      return `وزارت خارجه ${aiCountry.nameFa}: از پیام دوستانه ${humanCountry.nameFa} خرسندیم! روابط دو کشور به سطح مثبت (+${newRel}) رسیده و آماده امضای پیمان اتحاد نظامی یا تجارت تسلیحاتی هستیم.`;
    }
    return `وزارت خارجه ${aiCountry.nameFa}: گام دیپلماتیک شما فضای مذاکره را بهبود بخشید (سطح رابطه فعلی: ${newRel}). با امضای «پیمان صلح» از منوی دیپلماسی می‌توانید روابط را کاملاً عادی‌سازی کنید.`;
  }

  return `وزارت خارجه ${aiCountry.nameFa} (${aiCountry.capitalFa}): پیام رسمی شما ثبت شد (شاخص رابطه دوجانبه: ${aiCountry.relations[humanCountry.id]}). برای پیشنهاد صلح، تهدید رسمی یا قرارداد تجاری می‌توانید از دکمه‌های مستقیم دیپلماسی نیز اقدام کنید.`;
}

function runAIChokepointStrategy(
  room: GameRoomState,
  onChokepointChanged: (country: CountryState, cpNameFa: string, nextStatus: ChokepointStatus, oilPrice: number) => void
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
      onChokepointChanged(ctrl, cp.nameFa, desired, room.market.oilPriceUsd);
    }
  }
}

/**
 * Living World AI v4.0 (Items #20 & #29):
 * - Anti-Snowball Balance-of-Power Containment against runaway #1 Hegemon!
 * - AI-vs-AI Political Statements, UN Resolutions, IAEA Dossiers & Coalition Invitations!
 * - Realistic Fuel/Water/Food management & progressive territorial operations!
 */
export function runLivingWorldAITurn(
  room: GameRoomState,
  callbacks?: {
    onChokepointNews?: (country: CountryState, cpNameFa: string, status: ChokepointStatus, oilPrice: number) => void;
    onAIPoliticalNews?: (agencyFa: string, headlineFa: string, bodyFa: string, involved: CountryId[]) => void;
  }
): void {
  if (!room.settings.enableAINations) return;

  const diff = room.settings.difficulty || 'NORMAL';
  const isSingle = room.settings.gameMode === 'SINGLE';
  const aiGrowthChance = diff === 'EXTREME' ? 0.88 : diff === 'HARD' ? 0.72 : 0.56;
  const maxWorldFlashpointAttacks =
    (diff === 'EXTREME' ? 5 : diff === 'HARD' ? 4 : 3) + (isSingle ? 1 : 0);

  if (callbacks?.onChokepointNews) {
    runAIChokepointStrategy(room, callbacks.onChokepointNews);
  }

  // Detect Runaway Hegemon (#1 score > 1.32x #2 score after Round 3) for Anti-Snowball Balance!
  const top1 = room.rankings[0];
  const top2 = room.rankings[1];
  const runawayHegemonId: CountryId | null =
    room.round >= 3 && top1 && top2 && top1.score > top2.score * 1.32 ? top1.countryId : null;

  const aiCountries = Object.values(room.countries).filter(
    (c) => c.playerId === null && !c.isEliminated
  );
  const humanCountries = Object.values(room.countries).filter(
    (c) => c.playerId !== null && !c.isEliminated
  );

  let aiMilitaryActionsThisRound = 0;

  for (const ai of aiCountries) {
    ai.orders = [];

    if (diff === 'EXTREME') ai.treasuryB += 15;
    else if (diff === 'HARD') ai.treasuryB += 8;

    // 1. Emergency Survival, Fuel/Food/Water Refill & Ruin Reconstruction
    if (ai.oilReserve < 45 && ai.treasuryB >= 30) {
      ai.treasuryB -= 22;
      ai.oilReserve += 55;
    }
    if (ai.foodReserve < 40 && ai.treasuryB >= 22) {
      ai.treasuryB -= 16;
      ai.foodReserve += 55;
    }
    if ((ai.waterReserve || 0) < 40 && ai.treasuryB >= 18) {
      ai.treasuryB -= 14;
      ai.waterReserve = (ai.waterReserve || 0) + 55;
    }

    if (ai.devastation >= 40 || ai.approval < 36) {
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
        if (ai.treasuryB >= reb.costB + 20) {
          ai.treasuryB -= reb.costB;
          ai.damagedInfra[infraKey] -= 1;
          ai.infrastructure[infraKey] += 1;
          break;
        }
      }
    }

    // 2. Research Doctrines & Science Academies
    if (ai.treasuryB >= 95 && Math.random() < aiGrowthChance) {
      const priorityTracks: UpgradeTrack[] =
        ai.aiPersonality === 'ECONOMIC_POWER'
          ? ['INDUSTRY', 'AIR_DEFENSE', 'CYBER_AI', 'AEROSPACE', 'NAVAL_POWER']
          : ai.aiPersonality === 'SUPERPOWER'
          ? ['INDUSTRY', 'AEROSPACE', 'NAVAL_POWER', 'ARMOR_LAND', 'CYBER_AI', 'INTELLIGENCE', 'AIR_DEFENSE']
          : ['AEROSPACE', 'AIR_DEFENSE', 'ARMOR_LAND', 'INTELLIGENCE', 'INDUSTRY', 'NUCLEAR'];

      const candidate = priorityTracks.find((t) => ai.upgrades[t] < UPGRADE_TRACKS[t].maxLevel);
      if (candidate) {
        const upCost = getUpgradeNextCost(ai, candidate, diff);
        if (ai.treasuryB >= upCost + 30) {
          ai.treasuryB -= upCost;
          ai.upgrades[candidate] += 1;
          if (candidate === 'INDUSTRY') ai.gdpB += 30;
          if (candidate === 'NUCLEAR' && ai.upgrades.NUCLEAR >= 5 && ai.warheads === 0) {
            ai.nuclearProgress = 100;
            ai.warheads = 2;
          }
        }
      }
    }

    if (ai.treasuryB >= 115 && Math.random() < aiGrowthChance * 0.75) {
      const infraPick: InfrastructureType =
        ai.infrastructure.SCIENCE_ACADEMY < 5 && Math.random() < 0.35
          ? 'SCIENCE_ACADEMY'
          : ai.oilProduction >= 70
          ? 'REFINERY'
          : ai.approval < 62
          ? 'WELFARE_HUB'
          : 'ARMS_FACTORY';
      const infCost = getInfraNextCost(ai, infraPick, diff);
      if (ai.infrastructure[infraPick] < INFRASTRUCTURE_CATALOG[infraPick].maxLevel && ai.treasuryB >= infCost.costB + 30) {
        ai.treasuryB -= infCost.costB;
        ai.infrastructure[infraPick] += 1;
      }
    }

    const mil = computeCountryMilitary(ai);
    // AI Space Command: launch orbital satellites when Aerospace >= 3
    if (
      (ai.orbitalSatellites || 0) < 3 &&
      ai.upgrades.AEROSPACE >= 3 &&
      ai.treasuryB >= 130 &&
      Math.random() < 0.32
    ) {
      ai.treasuryB -= 36;
      ai.orbitalSatellites = (ai.orbitalSatellites || 0) + 1;
    }

    // AI participates in Global Flashpoint if active
    if (room.activeFlashpoint && !room.activeFlashpoint.chosenBy[ai.id]) {
      room.activeFlashpoint.chosenBy[ai.id] = ai.treasuryB >= 60 ? 'A' : 'C';
    }

    if (ai.treasuryB >= 105 && mil.totalUnits < 36 && Math.random() < aiGrowthChance * 0.82) {
      const buildable = Object.values(WEAPONS_CATALOG).filter(
        (w) =>
          (w.originCountry === ai.id || ai.allies.includes(w.originCountry)) &&
          (!w.minTrack || ai.upgrades[w.minTrack.track] >= w.minTrack.level)
      );
      if (buildable.length > 0) {
        const w = buildable[Math.floor(Math.random() * buildable.length)];
        if (ai.treasuryB >= w.unitCostB + 25) {
          ai.treasuryB -= w.unitCostB;
          ai.weapons[w.id] = (ai.weapons[w.id] || 0) + 1;
        }
      }
    }

    // 3. Anti-Snowball Counter-Hegemon Operations (Prevents wealthy superpower invincibility!)
    if (
      runawayHegemonId &&
      runawayHegemonId !== ai.id &&
      !ai.allies.includes(runawayHegemonId) &&
      (ai.aiPersonality === 'SUPERPOWER' || ai.aiPersonality === 'REGIONAL_HAWK') &&
      aiMilitaryActionsThisRound < maxWorldFlashpointAttacks &&
      Math.random() < 0.38
    ) {
      const hegemon = room.countries[runawayHegemonId];
      if (hegemon && !hegemon.isEliminated && !(ai.nonAggressionPacts[hegemon.id] && ai.nonAggressionPacts[hegemon.id]! >= room.round)) {
        if (!hegemon.sanctionedBy.includes(ai.id) && ai.relations[hegemon.id] < 10) {
          hegemon.sanctionedBy.push(ai.id);
        }
        if (ai.treasuryB >= 22) {
          const covPick: CovertOpType = hegemon.treasuryB >= 450 ? 'TREASURY_HEIST' : 'STUXNET_SABOTAGE';
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

    // 4. DECISIVE RETALIATION (Respects active Peace Truces!)
    if (ai.lastAttackedBy && room.countries[ai.lastAttackedBy] && !room.countries[ai.lastAttackedBy].isEliminated) {
      const aggressor = room.countries[ai.lastAttackedBy];
      const hasTruce = (ai.nonAggressionPacts[aggressor.id] || 0) >= room.round;
      if (!hasTruce && ai.treasuryB >= 22) {
        const candidates: MilitaryOpType[] = ['MISSILE_DRONE_STRIKE', 'AIR_SORTIE', 'NAVAL_BLOCKADE_STRIKE', 'GROUND_CONQUEST'];
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
              expectedImpactFa: 'پاسخ مستقیم به تجاوز نظامی دور گذشته',
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
      ai.treasuryB >= 70 &&
      Math.random() < (diff === 'EXTREME' ? 0.3 : 0.2)
    ) {
      // Try strategic minor nation expansion occasionally
      if (Math.random() < 0.35) {
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

      // Rival operations (AI vs AI or AI vs Rival Player)
      const rivalPool = ALL_COUNTRY_IDS.filter(
        (cid) =>
          cid !== ai.id &&
          !room.countries[cid].isEliminated &&
          !ai.allies.includes(cid) &&
          (ai.rivals.includes(cid) || ai.relations[cid] <= -45) &&
          ((ai.nonAggressionPacts[cid] || 0) < room.round)
      );
      if (rivalPool.length > 0) {
        const rival = room.countries[rivalPool[Math.floor(Math.random() * rivalPool.length)]];
        if (Math.random() < 0.6) {
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
  // 6. AUTONOMOUS AI-VS-AI POLITICS: DOSSIERS, RESOLUTIONS, COALITIONS & INVITES (Item #29!)
  // =========================================================================

  // 6a. AI Powers file UN Sanctions, IAEA Dossiers, or OPEC Votes against rivals!
  if (room.resolutions.filter((r) => r.status === 'ACTIVE').length < 2 && Math.random() < 0.65) {
    const activeAIs = aiCountries.filter((a) => a.aiPersonality === 'SUPERPOWER' || a.aiPersonality === 'REGIONAL_HAWK');
    if (activeAIs.length > 0) {
      const proposer = activeAIs[Math.floor(Math.random() * activeAIs.length)];
      const enemyId = ALL_COUNTRY_IDS.find(
        (id) =>
          id !== proposer.id &&
          !room.countries[id].isEliminated &&
          (proposer.relations[id] <= -50 || id === runawayHegemonId)
      );

      if (enemyId) {
        const enemy = room.countries[enemyId];
        const kind: ResolutionKind =
          enemy.nuclearProgress >= 65 && enemy.warheads === 0
            ? 'IAEA_INSPECTION'
            : Math.random() < 0.5
            ? 'CONDEMN_AGGRESSION'
            : 'GLOBAL_SANCTION';

        const titleFa =
          kind === 'IAEA_INSPECTION'
            ? `تشکیل پرونده هسته‌ای در آژانس (IAEA) توسط ${proposer.nameFa} علیه ${enemy.nameFa}`
            : kind === 'GLOBAL_SANCTION'
            ? `پیش‌نویس قطعنامه تحریم شورای امنیت به پیشنهاد ${proposer.nameFa} علیه ${enemy.nameFa}`
            : `بیانیه محکومیت تحرکات نظامی ${enemy.nameFa} در مجمع عمومی به پیشنهاد ${proposer.nameFa}`;

        room.resolutions.unshift({
          id: uid('un-ai'),
          round: room.round,
          proposer: proposer.id,
          target: enemy.id,
          kind,
          committeeFa: kind === 'IAEA_INSPECTION' ? 'شورای حکام آژانس اتمی' : 'شورای امنیت سازمان ملل',
          titleFa,
          effectSummaryFa:
            kind === 'IAEA_INSPECTION'
              ? 'کاهش ۱۵٪ پیشرفت غنی‌سازی هدف در صورت تصویب.'
              : kind === 'GLOBAL_SANCTION'
              ? 'اعمال تحریم‌های چندجانبه علیه کشور هدف.'
              : 'کاهش ۱۰٪ مشروعیت بین‌المللی کشور هدف.',
          votesYes: [proposer.id],
          votesNo: [],
          vetoedBy: null,
          status: 'ACTIVE',
        });

        callbacks?.onAIPoliticalNews?.(
          'رویترز دیپلماتیک (نیویورک)',
          `⚖️ اقدام سیاسی در سازمان ملل: ${titleFa}`,
          `سفیر ${proposer.nameFa} با تشکیل پرونده رسمی خواستار رای‌گیری فوری کشورهای عضو علیه ${enemy.nameFa} شد.`,
          [proposer.id, enemy.id]
        );
      }
    }
  }

  // 6b. AI Forms New Regional Coalition (e.g. Global South / BRICS+) & Invites Players/AI!
  if (room.round === 3 && !room.coalitions['coalition-brics']) {
    const founder = ['IN', 'BR', 'SA'].map((id) => room.countries[id as CountryId]).find((c) => c && !c.playerId && !c.isEliminated && !c.coalitionId);
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
        `🛡️ تاسیس ائتلاف جدید توسط هوش مصنوعی: «پیمان جنوب جهانی (بریکس+)» به رهبری ${founder.nameFa} اعلام موجودیت کرد!`,
        'قدرت‌های نوظهور برای حفظ موازنه جهانی پیمان مشترک تشکیل دادند و از سایر کشورها دعوت به همکاری کردند.',
        [founder.id]
      );
    }
  }

  // 6c. AI Coalition Leaders Invite Friendly Unaligned Human Players & Post Public Stances!
  for (const coal of Object.values(room.coalitions)) {
    const leader = room.countries[coal.leader];
    if (!leader || leader.playerId !== null || leader.isEliminated) continue;
    for (const hum of humanCountries) {
      if (!hum.coalitionId && leader.relations[hum.id] >= 20 && !coal.invited.includes(hum.id) && Math.random() < 0.35) {
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

  // 6d. AI-vs-AI Public Political Stances in UN Hall
  if (aiCountries.length >= 2 && Math.random() < 0.65) {
    const speaker = aiCountries[Math.floor(Math.random() * aiCountries.length)];
    const rivalId = speaker.rivals.find((rid) => !room.countries[rid]?.isEliminated);
    if (speaker && rivalId) {
      const rival = room.countries[rivalId];
      room.messages.push({
        id: uid('ai-stance'),
        timestamp: Date.now(),
        channel: 'GLOBAL',
        fromCountry: speaker.id,
        fromName: `${speaker.nameFa} (نمایندگی سازمان ملل)`,
        text: `ما نسبت به گسترش تسلیحات و اقدامات بی‌ثبات‌کننده «${rival.nameFa}» در منطقه هشدار می‌دهیم و از جامعه جهانی می‌خواهیم در برابر آن موضع بگیرد.`,
      });
      if (room.messages.length > 150) room.messages.shift();
    }
  }

  // 7. Proactive Bilateral Trade Offers to Human Players
  for (const human of humanCountries) {
    const alreadyHasPending = room.trades.some(
      (t) => t.status === 'PENDING' && t.to === human.id
    );
    if (!alreadyHasPending && Math.random() < 0.55) {
      if (human.oilReserve >= 220) {
        const buyerAI = aiCountries.find(
          (a) =>
            (a.id === 'CN' || a.id === 'DE' || a.id === 'JP' || a.id === 'IN' || a.id === 'FR') &&
            !human.sanctionedBy.includes(a.id) &&
            a.treasuryB >= 55
        );
        if (buyerAI) {
          const offerPrice = Math.round(30 * (room.market.oilPriceUsd / 82));
          room.trades.unshift({
            id: uid('ai-offer'),
            round: room.round,
            from: buyerAI.id,
            to: human.id,
            offerType: 'OIL',
            amount: 60,
            priceB: offerPrice,
            direction: 'BUY',
            noteFa: `پیشنهاد خرید فوری ۶۰ واحد نفت خام`,
            status: 'PENDING',
          });
        }
      } else if (human.foodReserve < 70) {
        const foodSeller = aiCountries.find((a) => (a.id === 'BR' || a.id === 'RU' || a.id === 'CA') && a.foodReserve >= 140);
        if (foodSeller) {
          room.trades.unshift({
            id: uid('ai-food'),
            round: room.round,
            from: foodSeller.id,
            to: human.id,
            offerType: 'FOOD',
            amount: 60,
            priceB: 18,
            direction: 'SELL',
            noteFa: `پیشنهاد تامین فوری ۶۰ واحد گندم و مواد غذایی`,
            status: 'PENDING',
          });
        }
      }
    }
  }
}

export function castAIVotesOnResolution(room: GameRoomState, res: UNResolution): void {
  for (const c of Object.values(room.countries)) {
    if (c.playerId !== null || c.isEliminated) continue;
    if (res.votesYes.includes(c.id) || res.votesNo.includes(c.id)) continue;

    if (res.kind === 'OPEC_OIL_CUT') {
      if (c.oilProduction > c.oilConsumption + 15) res.votesYes.push(c.id);
      else res.votesNo.push(c.id);
      continue;
    }
    if (res.kind === 'OPEC_OIL_BOOST') {
      if (c.oilConsumption > c.oilProduction) res.votesYes.push(c.id);
      else res.votesNo.push(c.id);
      continue;
    }
    if (res.kind === 'EMERGENCY_AID_PACKAGE') {
      if (c.relations[res.target] <= -40) res.votesNo.push(c.id);
      else res.votesYes.push(c.id);
      continue;
    }

    if (c.id === res.target || c.allies.includes(res.target) || c.relations[res.target] >= 50) {
      res.votesNo.push(c.id);
      const vetoEligible =
        res.kind === 'GLOBAL_SANCTION' ||
        res.kind === 'CONDEMN_AGGRESSION' ||
        res.kind === 'IAEA_INSPECTION';
      if (c.isUNVetoMember && vetoEligible && !res.vetoedBy) {
        res.vetoedBy = c.id;
        res.status = 'VETOED';
      }
      continue;
    }

    if (c.relations[res.proposer] >= 40 || c.relations[res.target] <= -35) {
      res.votesYes.push(c.id);
    } else if (res.kind === 'CEASEFIRE_DEMAND') {
      res.votesYes.push(c.id);
    } else if (Math.random() < 0.52) {
      res.votesYes.push(c.id);
    } else {
      res.votesNo.push(c.id);
    }
  }
}
