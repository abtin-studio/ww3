import {
  computeCountryMilitary,
  estimateCovertSuccessPct,
  estimateMilitarySuccessPct,
  estimateMinorOpSuccessPct,
  getEmergencyActionCost,
  getInfraNextCost,
  getUpgradeNextCost,
} from '../shared/advisor.js';
import { INFRASTRUCTURE_CATALOG, UPGRADE_TRACKS, WEAPONS_CATALOG } from '../shared/realWorldData.js';
import {
  ChokepointStatus,
  CountryId,
  CountryState,
  CovertOpType,
  GameRoomState,
  InfrastructureType,
  MilitaryOpType,
  TradeOffer,
  UNResolution,
  UpgradeTrack,
} from '../shared/types.js';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
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

  const isHostile =
    ai.sanctionedBy.includes(sender.id) ||
    sender.sanctionedBy.includes(ai.id) ||
    ai.lastAttackedBy === sender.id;

  const hardModeFactor =
    room.settings.difficulty === 'EXTREME' ? 1.25 : room.settings.difficulty === 'HARD' ? 1.12 : 1;

  if (offer.offerType === 'LIFT_SANCTION') {
    const minScore = Math.round(32 * hardModeFactor);
    if (offer.priceB >= minScore && ai.lastAttackedBy !== sender.id) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} با دریافت امتیاز اقتصادی تحریم‌ها علیه ${sender.nameFa} را لغو کرد.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} با لغو تحریم مخالفت کرد (حداقل $${minScore}B امتیاز دیپلماتیک لازم است و نباید درگیر جنگ باشید).`,
    };
  }

  if (offer.offerType === 'ALLIANCE') {
    if (isHostile || ai.rivals.includes(sender.id)) {
      return {
        accepted: false,
        reasonFa: `${ai.nameFa} به علت تضاد منافع ژئوپولیتیک، پیمان دفاعی با ${sender.nameFa} را نپذیرفت.`,
      };
    }
    if (ai.allies.includes(sender.id)) {
      return { accepted: true, reasonFa: 'پیمان دفاعی مشترک هم‌اکنون برقرار است.' };
    }
    const minPact = Math.round(25 * hardModeFactor);
    if (offer.priceB >= minPact) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} پیمان دفاعی و امنیتی مشترک با ${sender.nameFa} را امضا کرد!`,
      };
    }
    return {
      accepted: false,
      reasonFa: `وزارت خارجه ${ai.nameFa} برای امضای پیمان دفاعی حداقل $${minPact}B بودجه همکاری دفاعی می‌خواهد.`,
    };
  }

  if (offer.offerType === 'WEAPON' && offer.weaponId) {
    const spec = WEAPONS_CATALOG[offer.weaponId];
    if (!spec) return { accepted: false, reasonFa: 'سامانه تسلیحاتی یافت نشد.' };

    if (sender.sanctionedBy.includes(ai.id) || ai.lastAttackedBy === sender.id) {
      return {
        accepted: false,
        reasonFa: `${ai.nameFa} به دلیل تحریم یا خصومت نظامی از فروش «${spec.nameFa}» خودداری کرد.`,
      };
    }
    if ((spec.id === 'f22' || spec.id === 'b2_spirit') && !ai.allies.includes(sender.id)) {
      return {
        accepted: false,
        reasonFa: `صادرات ${spec.nameEn} فقط به متحدان رسمی ${ai.nameFa} مجاز است؛ ابتدا پیمان دفاعی امضا کنید.`,
      };
    }

    const qty = Math.max(1, offer.amount || 1);
    const minPrice = Math.round(spec.unitCostB * qty * (ai.allies.includes(sender.id) ? 1.0 : 1.12));
    if (offer.priceB >= minPrice) {
      return {
        accepted: true,
        reasonFa: `قرارداد دفاعی تایید شد؛ ${ai.nameFa} سامانه «${spec.nameFa}» را تحویل ارتش ${sender.nameFa} داد!`,
      };
    }
    return {
      accepted: false,
      reasonFa: `وزارت دفاع ${ai.nameFa} حداقل قیمت صادراتی این قرارداد را $${minPrice}B اعلام کرد.`,
    };
  }

  const unitFair: Record<string, number> = {
    OIL: (room.market.oilPriceUsd / 82) * 0.46,
    GAS: (room.market.gasPriceIndex / 100) * 0.35,
    FOOD: (room.market.foodPriceIndex / 100) * 0.33,
    URANIUM: 1.35,
  };
  const fairTotalB = Math.max(5, Math.round((unitFair[offer.offerType] || 0.4) * offer.amount));

  if (offer.direction === 'SELL') {
    if (ai.treasuryB < offer.priceB + 20) {
      return { accepted: false, reasonFa: `${ai.nameFa} بودجه مازاد برای این خرید ندارد.` };
    }
    if (offer.priceB <= Math.round(fairTotalB * 1.2)) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} محموله ارسالی ${sender.nameFa} را به مبلغ $${offer.priceB}B خریداری کرد.`,
      };
    }
    return { accepted: false, reasonFa: `${ai.nameFa} قیمت پیشنهادی را بالاتر از نرخ جهانی دانست.` };
  }

  if (offer.direction === 'BUY') {
    if (offer.priceB >= Math.round(fairTotalB * 0.88)) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} محموله درخواستی را به ${sender.nameFa} صادر کرد.`,
      };
    }
    return { accepted: false, reasonFa: `${ai.nameFa} قیمت پیشنهادی را کمتر از ارزش واقعی دانست.` };
  }

  return { accepted: false, reasonFa: 'پیشنهاد رد شد.' };
}

/**
 * Generates an intelligent, context-aware diplomatic reply when a human messages an AI country!
 */
export function generateAIDiplomaticReply(
  room: GameRoomState,
  aiCountry: CountryState,
  humanCountry: CountryState,
  text: string
): string {
  const isAlly = aiCountry.allies.includes(humanCountry.id);
  const isHostile =
    aiCountry.lastAttackedBy === humanCountry.id ||
    aiCountry.sanctionedBy.includes(humanCountry.id) ||
    humanCountry.sanctionedBy.includes(aiCountry.id);
  const aiMil = computeCountryMilitary(aiCountry);
  const humMil = computeCountryMilitary(humanCountry);
  const msg = text.toLowerCase();

  if (msg.includes('صلح') || msg.includes('آتش‌بس') || msg.includes('اتحاد') || msg.includes('دوست')) {
    if (aiCountry.lastAttackedBy === humanCountry.id) {
      return `وزارت خارجه ${aiCountry.nameFa}: شما اخیراً حاکمیت ما را نقض کرده‌اید! بدون توقف کامل حملات و پرداخت امتیاز دیپلماتیک، آتش‌بسی در کار نخواهد بود.`;
    }
    if (isAlly) {
      return `وزارت خارجه ${aiCountry.nameFa}: اتحاد راهبردی ما مستحکم است؛ در صورت تهدید مشترک، روی پشتیبانی اطلاعاتی و تسلیحاتی ${aiCountry.capitalFa} حساب کنید.`;
    }
    if (aiCountry.rivals.includes(humanCountry.id)) {
      return `وزارت خارجه ${aiCountry.nameFa}: اختلافات ژئوپولیتیک عمیقی میان دو کشور وجود دارد، اما از کاهش تنش متقابل استقبال می‌کنیم.`;
    }
    return `وزارت خارجه ${aiCountry.nameFa}: آماده گسترش روابط هستیم؛ پیشنهاد رسمی پیمان دفاعی یا تجاری خود را از بخش قراردادها ارسال کنید.`;
  }

  if (msg.includes('تهدید') || msg.includes('حمله') || msg.includes('اولتیماتوم') || msg.includes('تسلیم')) {
    if (aiMil.attackScore + aiMil.defenseScore >= humMil.attackScore) {
      return `ستاد کل نیروهای مسلح ${aiCountry.nameFa}: هرگونه ماجراجویی نظامی علیه خاک ما با پاسخ کوبنده موشکی، هوایی و سایبری روبرو خواهد شد!`;
    }
    return `شورای امنیت ملی ${aiCountry.nameFa}: نیروهای مسلح ما در آماده‌باش کامل هستند و متحدان ما نیز نسبت به هرگونه تجاوز هشدار داده‌اند.`;
  }

  if (msg.includes('نفت') || msg.includes('گاز') || msg.includes('سلاح') || msg.includes('خرید')) {
    return `هیئت اقتصادی ${aiCountry.nameFa}: میز مذاکرات تجاری باز است؛ می‌توانید از منوی کشور ما پیشنهاد خرید سلاح بومی یا مبادله نفت را ثبت کنید تا فوراً بررسی و امضا کنیم.`;
  }

  if (isHostile) {
    return `سفارت ${aiCountry.nameFa}: پیام شما دریافت شد، اما تا زمان ادامه تحریم‌ها و تنش‌های امنیتی، سطح روابط سرد باقی می‌ماند.`;
  }

  return `وزارت خارجه ${aiCountry.nameFa} (${aiCountry.capitalFa}): پیام دیپلماتیک ${humanCountry.nameFa} دریافت شد. منافع مشترک دو کشور را در تصمیمات این ماه لحاظ خواهیم کرد.`;
}

/**
 * Dynamic AI Chokepoint Strategy:
 * AI controllers of Hormuz, Suez, Malacca, Bosphorus, and Gibraltar dynamically blockade or restrict
 * straits when attacked or heavily sanctioned, driving up global oil & commodity prices!
 */
function runAIChokepointStrategy(
  room: GameRoomState,
  onChokepointChanged: (country: CountryState, cpNameFa: string, nextStatus: ChokepointStatus, oilPrice: number) => void
): void {
  for (const cp of Object.values(room.chokepoints)) {
    const ctrl = room.countries[cp.controller];
    if (!ctrl || ctrl.playerId !== null || ctrl.isEliminated) continue;

    const underDirectWar = ctrl.lastAttackedBy !== null || ctrl.devastation >= 28;
    const underHeavySanctions = ctrl.sanctionedBy.length >= 3 && room.market.globalTension >= 50;
    const highGlobalCrisis = room.market.globalTension >= 72 && (ctrl.rivals.length > 0 || ctrl.sanctionedBy.length >= 2);

    let desired: ChokepointStatus = cp.status;

    if (underDirectWar && Math.random() < 0.78) {
      desired = 'BLOCKADED';
    } else if ((underHeavySanctions || highGlobalCrisis) && cp.status === 'OPEN' && Math.random() < 0.45) {
      desired = ctrl.id === 'IR' && underHeavySanctions ? 'BLOCKADED' : 'RESTRICTED';
    } else if (!underDirectWar && !underHeavySanctions && cp.status !== 'OPEN' && Math.random() < 0.5) {
      desired = cp.status === 'BLOCKADED' ? 'RESTRICTED' : 'OPEN';
    }

    if (desired !== cp.status) {
      cp.status = desired;
      if (desired === 'BLOCKADED') {
        room.market.oilPriceUsd = Math.min(245, room.market.oilPriceUsd + Math.round(cp.oilImpactFactor * 52));
        room.market.foodPriceIndex = Math.min(230, room.market.foodPriceIndex + 9);
        room.market.globalTension = Math.min(100, room.market.globalTension + 14);
      } else if (desired === 'RESTRICTED') {
        room.market.oilPriceUsd = Math.min(240, room.market.oilPriceUsd + 11);
        room.market.foodPriceIndex = Math.min(220, room.market.foodPriceIndex + 4);
      } else {
        room.market.oilPriceUsd = Math.max(68, room.market.oilPriceUsd - 14);
      }
      onChokepointChanged(ctrl, cp.nameFa, desired, room.market.oilPriceUsd);
    }
  }
}

/**
 * Living World AI Engine v3.0:
 * - Scales competitiveness with difficulty (NORMAL / HARD / EXTREME) & Single/Multi mode!
 * - Reconstructs war-damaged infrastructure & runs emergency relief so AI powers don't die passively!
 * - Researches all 8 doctrines up to Lv.10 & builds balanced Fighter/Naval/Armor/Missile forces!
 * - Dynamically blockades/opens strategic straits!
 * - Conquers or aligns strategic Minor World Nations!
 * - Launches realistic Air, Naval, Ground, Missile & Covert operations!
 */
export function runLivingWorldAITurn(
  room: GameRoomState,
  callbacks?: {
    onChokepointNews?: (country: CountryState, cpNameFa: string, status: ChokepointStatus, oilPrice: number) => void;
  }
): void {
  if (!room.settings.enableAINations) return;

  const diff = room.settings.difficulty || 'NORMAL';
  const isSingle = room.settings.gameMode === 'SINGLE';

  // AI strategic stimulus on HARD / EXTREME so AI nations genuinely keep pace & challenge skilled humans!
  const aiGrowthChance = diff === 'EXTREME' ? 0.88 : diff === 'HARD' ? 0.72 : 0.56;
  const maxWorldFlashpointAttacks =
    (diff === 'EXTREME' ? 5 : diff === 'HARD' ? 4 : 3) + (isSingle ? 1 : 0);

  if (callbacks?.onChokepointNews) {
    runAIChokepointStrategy(room, callbacks.onChokepointNews);
  }

  const aiCountries = Object.values(room.countries).filter(
    (c) => c.playerId === null && !c.isEliminated
  );
  const humanCountries = Object.values(room.countries).filter(
    (c) => c.playerId !== null && !c.isEliminated
  );

  let aiMilitaryActionsThisRound = 0;

  for (const ai of aiCountries) {
    ai.orders = [];

    if (diff === 'EXTREME') ai.treasuryB += 16;
    else if (diff === 'HARD') ai.treasuryB += 8;

    // 1. Emergency Survival & Reconstruction if under heavy devastation!
    if (ai.devastation >= 42 || ai.approval < 36) {
      const rCost = getEmergencyActionCost(ai, 'NATIONAL_RELIEF');
      if (ai.treasuryB >= rCost) {
        ai.treasuryB -= rCost;
        ai.approval = Math.min(100, ai.approval + 14);
        ai.devastation = Math.max(0, ai.devastation - 20);
      }
    }
    if (ai.powerGrid < 65) {
      const pInfo = getInfraNextCost(ai, 'POWER_PLANT', diff);
      if (ai.infrastructure.POWER_PLANT < INFRASTRUCTURE_CATALOG.POWER_PLANT.maxLevel && ai.treasuryB >= pInfo.costB) {
        ai.treasuryB -= pInfo.costB;
        if (pInfo.isRebuild && ai.damagedInfra.POWER_PLANT > 0) ai.damagedInfra.POWER_PLANT -= 1;
        ai.infrastructure.POWER_PLANT += 1;
        ai.powerGrid = Math.min(100, ai.powerGrid + 16);
      } else {
        const gCost = getEmergencyActionCost(ai, 'REPAIR_GRID');
        if (ai.treasuryB >= gCost) {
          ai.treasuryB -= gCost;
          ai.powerGrid = Math.min(100, ai.powerGrid + 24);
          ai.devastation = Math.max(0, ai.devastation - 12);
        }
      }
    }

    // Rebuild any bombed-out infrastructures
    for (const infraKey of Object.keys(INFRASTRUCTURE_CATALOG) as InfrastructureType[]) {
      if ((ai.damagedInfra[infraKey] || 0) > 0) {
        const reb = getInfraNextCost(ai, infraKey, diff);
        if (ai.treasuryB >= reb.costB + 25) {
          ai.treasuryB -= reb.costB;
          ai.damagedInfra[infraKey] -= 1;
          ai.infrastructure[infraKey] += 1;
          break;
        }
      }
    }

    // 2. Competitive National Doctrine Research (Lv.1 -> Lv.10 across 100 rounds!)
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

    // 3. Expand Infrastructure & Balanced Armed Forces
    if (ai.treasuryB >= 120 && Math.random() < aiGrowthChance * 0.8) {
      const infraPick: InfrastructureType =
        ai.oilProduction >= 70 ? 'REFINERY' : ai.approval < 62 ? 'WELFARE_HUB' : 'ARMS_FACTORY';
      const infCost = getInfraNextCost(ai, infraPick, diff);
      if (ai.infrastructure[infraPick] < INFRASTRUCTURE_CATALOG[infraPick].maxLevel && ai.treasuryB >= infCost.costB + 35) {
        ai.treasuryB -= infCost.costB;
        ai.infrastructure[infraPick] += 1;
      }
    }

    const mil = computeCountryMilitary(ai);
    if (ai.treasuryB >= 110 && mil.totalUnits < 42 && Math.random() < aiGrowthChance * 0.85) {
      const buildable = Object.values(WEAPONS_CATALOG).filter(
        (w) =>
          (w.originCountry === ai.id || ai.allies.includes(w.originCountry)) &&
          (!w.minTrack || ai.upgrades[w.minTrack.track] >= w.minTrack.level)
      );
      if (buildable.length > 0) {
        const w = buildable[Math.floor(Math.random() * buildable.length)];
        if (ai.treasuryB >= w.unitCostB + 28) {
          ai.treasuryB -= w.unitCostB;
          ai.weapons[w.id] = (ai.weapons[w.id] || 0) + 1;
        }
      }
    }

    // 4. DECISIVE RETALIATION when attacked!
    if (ai.lastAttackedBy && room.countries[ai.lastAttackedBy] && !room.countries[ai.lastAttackedBy].isEliminated) {
      const aggressor = room.countries[ai.lastAttackedBy];
      if (ai.treasuryB >= 22) {
        const opPick: MilitaryOpType =
          mil.fighterCount >= 3 && Math.random() < 0.45
            ? 'AIR_SORTIE'
            : mil.armorCount >= 3 && aggressor.integrityPct <= 75 && Math.random() < 0.35
            ? 'GROUND_CONQUEST'
            : 'MISSILE_DRONE_STRIKE';
        const opCost = opPick === 'GROUND_CONQUEST' ? 32 : 20;
        if (ai.treasuryB >= opCost) {
          ai.treasuryB -= opCost;
          ai.orders.push({
            id: uid('ai-ret'),
            actor: ai.id,
            kind: 'MILITARY_OPERATION',
            targetCountry: aggressor.id,
            militaryType: opPick,
            targetSector: Math.random() < 0.5 ? 'MILITARY_BASES' : 'POWER_PLANT',
            estimatedSuccessPct: estimateMilitarySuccessPct(ai, aggressor, opPick, room.round),
            costB: opCost,
            summaryFa: `عملیات تلافی‌جویانه ${ai.nameFa} علیه ${aggressor.nameFa}`,
            expectedImpactFa: 'پاسخ مستقیم نظامی به تجاوز دور گذشته',
          });
          ai.lastAttackedBy = null;
          continue;
        }
      }
    }

    // 5. SUPERPOWER / COALITION COLLECTIVE DEFENSE
    if (ai.aiPersonality === 'SUPERPOWER' && aiMilitaryActionsThisRound < maxWorldFlashpointAttacks) {
      const attackedAlly = ai.allies
        .map((id) => room.countries[id])
        .find((ally) => ally && !ally.isEliminated && ally.lastAttackedBy && ally.lastAttackedBy !== ai.id);
      if (attackedAlly && attackedAlly.lastAttackedBy) {
        const culprit = room.countries[attackedAlly.lastAttackedBy];
        if (culprit && !culprit.isEliminated && !ai.allies.includes(culprit.id)) {
          if (!culprit.sanctionedBy.includes(ai.id)) culprit.sanctionedBy.push(ai.id);
          if (ai.treasuryB >= 24 && Math.random() < 0.65) {
            ai.treasuryB -= 16;
            aiMilitaryActionsThisRound += 1;
            ai.orders.push({
              id: uid('ai-coalition'),
              actor: ai.id,
              kind: 'COVERT_OPERATION',
              targetCountry: culprit.id,
              covertType: 'BLACKOUT_VIRUS',
              estimatedSuccessPct: estimateCovertSuccessPct(ai, culprit, 'BLACKOUT_VIRUS'),
              costB: 16,
              summaryFa: `عملیات سایبری ائتلافی ${ai.nameFa} در حمایت از ${attackedAlly.nameFa}`,
              expectedImpactFa: 'اخلال در شبکه برق و رادار کشور مهاجم',
            });
            continue;
          }
        }
      }
    }

    // 6. AI EMPIRE EXPANSION INTO MINOR WORLD NATIONS (Keeps world map dynamic over 100 rounds!)
    if (
      (ai.aiPersonality === 'SUPERPOWER' || ai.aiPersonality === 'REGIONAL_HAWK') &&
      aiMilitaryActionsThisRound < maxWorldFlashpointAttacks &&
      ai.treasuryB >= 85 &&
      Math.random() < (diff === 'EXTREME' ? 0.24 : 0.14)
    ) {
      const nearbyMinors = Object.values(room.minorNations).filter((m) => {
        if (m.conqueredBy === ai.id) return false;
        if (m.conqueredBy && ai.allies.includes(m.conqueredBy)) return false;
        const d = Math.hypot(ai.coordinates[0] - m.coordinates[0], ai.coordinates[1] - m.coordinates[1]);
        return d < 28 && m.garrisonPower < mil.groundPower + mil.airPower * 0.4;
      });
      if (nearbyMinors.length > 0) {
        const targetM = nearbyMinors[Math.floor(Math.random() * nearbyMinors.length)];
        const useCoup = Math.random() < 0.55;
        const costB = useCoup ? 18 : 28;
        ai.treasuryB -= costB;
        aiMilitaryActionsThisRound += 1;
        ai.orders.push({
          id: uid('ai-minor'),
          actor: ai.id,
          kind: 'MINOR_NATION_OPERATION',
          targetMinorId: targetM.id,
          minorOpType: useCoup ? 'COVERT_COUP' : 'CONQUER_ANNEX',
          estimatedSuccessPct: estimateMinorOpSuccessPct(
            ai,
            targetM,
            useCoup ? 'COVERT_COUP' : 'CONQUER_ANNEX',
            room.countries
          ),
          costB,
          summaryFa: useCoup
            ? `عملیات نفوذ اطلاعاتی ${ai.nameFa} در ${targetM.nameFa}`
            : `لشکرکشی ${ai.nameFa} برای تصرف ${targetM.nameFa}`,
          expectedImpactFa: 'گسترش قلمرو نفوذ ژئوپولیتیک',
        });
        continue;
      }
    }

    // 7. GEOPOLITICAL RIVALRIES & COVERT / MILITARY FLASHPOINTS
    const aggressionProb =
      diff === 'EXTREME' ? 0.34 : diff === 'HARD' ? 0.27 : 0.2;
    if (
      (ai.aiPersonality === 'REGIONAL_HAWK' || ai.aiPersonality === 'SUPERPOWER') &&
      aiMilitaryActionsThisRound < maxWorldFlashpointAttacks &&
      ai.rivals.length > 0 &&
      ai.treasuryB >= 65 &&
      Math.random() < aggressionProb
    ) {
      const rivalId = ai.rivals[Math.floor(Math.random() * ai.rivals.length)];
      const rival = room.countries[rivalId];
      if (rival && !rival.isEliminated && !ai.allies.includes(rival.id)) {
        if (Math.random() < 0.58) {
          const covertChoices: CovertOpType[] =
            ai.id === 'KP'
              ? ['TREASURY_HEIST', 'BLACKOUT_VIRUS']
              : ai.id === 'IL' || ai.id === 'IR' || ai.id === 'RU' || ai.id === 'US'
              ? ['BLACKOUT_VIRUS', 'STUXNET_SABOTAGE', 'ASSASSINATE_COMMANDER', 'ASSASSINATE_SCIENTIST']
              : ['SAT_RECON', 'TREASURY_HEIST', 'INSURGENCY_PSYOPS'];
          const covType = covertChoices[Math.floor(Math.random() * covertChoices.length)];
          ai.treasuryB -= 18;
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-cov'),
            actor: ai.id,
            kind: 'COVERT_OPERATION',
            targetCountry: rival.id,
            covertType: covType,
            estimatedSuccessPct: estimateCovertSuccessPct(ai, rival, covType),
            costB: 18,
            summaryFa: `عملیات مخفی ${ai.nameFa} علیه ${rival.nameFa}`,
            expectedImpactFa: 'ضربه اطلاعاتی-سایبری به رقیب استراتژیک',
          });
        } else {
          const milChoices: MilitaryOpType[] = [];
          if (mil.fighterCount >= 2) milChoices.push('AIR_SORTIE');
          milChoices.push('MISSILE_DRONE_STRIKE');
          if (mil.navalCount >= 2) milChoices.push('NAVAL_BLOCKADE_STRIKE');
          if (mil.armorCount >= 3 && Math.hypot(ai.coordinates[0] - rival.coordinates[0], ai.coordinates[1] - rival.coordinates[1]) < 32) {
            milChoices.push('GROUND_CONQUEST');
          }
          const mType = milChoices[Math.floor(Math.random() * milChoices.length)];
          const mCost = mType === 'GROUND_CONQUEST' ? 32 : 20;
          ai.treasuryB -= mCost;
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-atk'),
            actor: ai.id,
            kind: 'MILITARY_OPERATION',
            targetCountry: rival.id,
            militaryType: mType,
            targetSector: Math.random() < 0.5 ? 'MILITARY_BASES' : 'REFINERY',
            estimatedSuccessPct: estimateMilitarySuccessPct(ai, rival, mType, room.round),
            costB: mCost,
            summaryFa: `عملیات نظامی ${ai.nameFa} علیه مواضع ${rival.nameFa}`,
            expectedImpactFa: 'درگیری مستقیم در کانون بحران جهانی',
          });
        }
      }
    }

    ai.isReady = true;
  }

  // 8. AI INITIATES UN / OPEC SPECIAL COMMITTEE VOTES OCCASIONALLY!
  if (room.resolutions.filter((r) => r.status === 'ACTIVE').length === 0 && room.round % 3 === 0) {
    if (room.market.oilPriceUsd < 78 && room.countries.SA && !room.countries.SA.playerId && !room.countries.SA.isEliminated) {
      room.resolutions.unshift({
        id: uid('un-ai'),
        round: room.round,
        proposer: 'SA',
        target: 'SA',
        kind: 'OPEC_OIL_CUT',
        committeeFa: 'کمیته ویژه انرژی و اوپک‌پلاس',
        titleFa: 'طرح کمیته اوپک‌پلاس برای کاهش عرضه و افزایش قیمت جهانی نفت (+$22)',
        effectSummaryFa: 'در صورت تصویب، بهای نفت خام در بازار جهانی ۲۲ دلار افزایش می‌یابد.',
        votesYes: ['SA'],
        votesNo: [],
        vetoedBy: null,
        status: 'ACTIVE',
      });
    } else if (room.market.globalTension >= 75 && room.countries.FR && !room.countries.FR.playerId && !room.countries.FR.isEliminated) {
      room.resolutions.unshift({
        id: uid('un-ai'),
        round: room.round,
        proposer: 'FR',
        target: 'US',
        kind: 'CEASEFIRE_DEMAND',
        committeeFa: 'نشست اضطراری شورای امنیت',
        titleFa: 'قطعنامه کاهش تنش جهانی و آتش‌بس بشردوستانه (-۱۸ تنش جهانی)',
        effectSummaryFa: 'کاهش ۱۸ واحدی شاخص تنش جهانی و بهبود ثبات بازارها.',
        votesYes: ['FR'],
        votesNo: [],
        vetoedBy: null,
        status: 'ACTIVE',
      });
    }
  }

  // 9. PROACTIVE AI DIPLOMATIC OFFERS & SINGLE-PLAYER IMMERSIVE DIPLOMACY!
  for (const human of humanCountries) {
    const alreadyHasPending = room.trades.some(
      (t) => t.status === 'PENDING' && t.to === human.id
    );
    if (!alreadyHasPending && Math.random() < 0.6) {
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
            noteFa: `پیشنهاد خرید فوری ۶۰ واحد نفت خام با نرخ عالی روز`,
            status: 'PENDING',
          });
        }
      } else if (human.treasuryB >= 95) {
        const friendlyProducer = aiCountries.find(
          (a) =>
            (a.id === 'RU' || a.id === 'FR' || a.id === 'US' || a.id === 'CN' || a.id === 'TR') &&
            !human.sanctionedBy.includes(a.id)
        );
        if (friendlyProducer) {
          const w = Object.values(WEAPONS_CATALOG).find(
            (spec) => spec.originCountry === friendlyProducer.id && spec.id !== 'f22' && spec.id !== 'b2_spirit'
          );
          if (w) {
            room.trades.unshift({
              id: uid('ai-arms-offer'),
              round: room.round,
              from: friendlyProducer.id,
              to: human.id,
              offerType: 'WEAPON',
              weaponId: w.id,
              amount: 1,
              priceB: w.unitCostB,
              direction: 'SELL',
              noteFa: `پیشنهاد فروش مستقیم ۱× «${w.nameFa}» به نرخ کارخانه`,
              status: 'PENDING',
            });
          }
        }
      }
    }

    // In Single-Player (or small lobbies), AI diplomats occasionally send live cables to Global/Direct chat!
    if ((isSingle || humanCountries.length <= 2) && Math.random() < 0.42) {
      const speaker = aiCountries[Math.floor(Math.random() * aiCountries.length)];
      if (speaker) {
        const isRival = speaker.rivals.includes(human.id) || speaker.sanctionedBy.includes(human.id);
        const cable = isRival
          ? `تحرکات نظامی و تسلیحاتی ${human.nameFa} را به دقت زیر نظر داریم؛ هرگونه عبور از خطوط قرمز بی‌پاسخ نمی‌ماند.`
          : speaker.allies.includes(human.id)
          ? `آماده هماهنگی دفاعی و اقتصادی با دولت ${human.nameFa} در ماه پیش رو هستیم.`
          : `بازار جهانی انرژی در شرایط حساسی قرار دارد؛ از گسترش مبادلات تجاری با قدرت‌های مستقل استقبال می‌کنیم.`;
        room.messages.push({
          id: uid('ai-msg'),
          timestamp: Date.now(),
          channel: 'GLOBAL',
          fromCountry: speaker.id,
          fromName: `${speaker.nameFa} (سفیر رسمی)`,
          text: cable,
        });
        if (room.messages.length > 140) room.messages.shift();
      }
    }
  }
}

export function castAIVotesOnResolution(room: GameRoomState, res: UNResolution): void {
  for (const c of Object.values(room.countries)) {
    if (c.playerId !== null || c.isEliminated) continue;
    if (res.votesYes.includes(c.id) || res.votesNo.includes(c.id)) continue;

    // Economic Energy Committees vote by real Oil Exporter vs Oil Importer interest!
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
      if (c.rivals.includes(res.target) || c.sanctionedBy.includes(res.target)) res.votesNo.push(c.id);
      else res.votesYes.push(c.id);
      continue;
    }

    // Security Council Resolutions (Sanctions, Condemnation, IAEA Inspection, Ceasefire)
    if (c.id === res.target || c.allies.includes(res.target)) {
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

    if (c.allies.includes(res.proposer) || c.rivals.includes(res.target)) {
      res.votesYes.push(c.id);
    } else if (res.kind === 'CEASEFIRE_DEMAND') {
      res.votesYes.push(c.id);
    } else if (Math.random() < 0.55) {
      res.votesYes.push(c.id);
    } else {
      res.votesNo.push(c.id);
    }
  }
}
