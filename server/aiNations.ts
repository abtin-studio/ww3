import {
  computeCountryMilitary,
  estimateCovertSuccessPct,
  estimateMilitarySuccessPct,
  getInfraNextCost,
  getUpgradeNextCost,
} from '../shared/advisor.js';
import { UPGRADE_TRACKS, WEAPONS_CATALOG } from '../shared/realWorldData.js';
import {
  CountryId,
  GameRoomState,
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
  if (!ai || !sender) {
    return { accepted: false, reasonFa: 'کشور مقصد نامعتبر است.' };
  }

  const isHostile =
    ai.sanctionedBy.includes(sender.id) ||
    sender.sanctionedBy.includes(ai.id) ||
    ai.lastAttackedBy === sender.id;

  if (offer.offerType === 'LIFT_SANCTION') {
    if (offer.priceB >= 30 && ai.lastAttackedBy !== sender.id) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} با دریافت امتیاز اقتصادی تحریم‌ها علیه ${sender.nameFa} را لغو کرد.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} با لغو تحریم مخالفت کرد (حداقل ۳۰ میلیارد دلار امتیاز لازم است و نباید درگیر جنگ باشید).`,
    };
  }

  if (offer.offerType === 'ALLIANCE') {
    if (isHostile || ai.rivals.includes(sender.id)) {
      return {
        accepted: false,
        reasonFa: `${ai.nameFa} به علت رقابت ژئوپولیتیک مستقیم، پیمان نظامی با ${sender.nameFa} را رد کرد.`,
      };
    }
    if (ai.allies.includes(sender.id)) {
      return { accepted: true, reasonFa: 'پیمان دفاعی برقرار است.' };
    }
    if (offer.priceB >= 20) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} پیمان دفاعی و امنیتی مشترک با ${sender.nameFa} را امضا کرد!`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} برای امضای پیمان دفاعی مشترک حداقل ۲۰ میلیارد دلار بودجه همکاری مشترک می‌خواهد.`,
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
        reasonFa: `کنگره ${ai.nameFa} صادرات ${spec.nameEn} را فقط به متحدان رسمی محدود کرده است؛ ابتدا پیمان دفاعی ببندید.`,
      };
    }

    const qty = Math.max(1, offer.amount || 1);
    const minPrice = Math.round(spec.unitCostB * qty * (ai.allies.includes(sender.id) ? 1.0 : 1.1));
    if (offer.priceB >= minPrice) {
      return {
        accepted: true,
        reasonFa: `قرارداد دفاعی تایید شد؛ ${ai.nameFa} محموله «${spec.nameFa}» را تحویل ارتش ${sender.nameFa} داد!`,
      };
    }
    return {
      accepted: false,
      reasonFa: `وزارت دفاع ${ai.nameFa} حداقل قیمت این قرارداد را $${minPrice}B اعلام کرد.`,
    };
  }

  // Bilateral resource deals
  const unitFair: Record<string, number> = {
    OIL: (room.market.oilPriceUsd / 82) * 0.45,
    GAS: (room.market.gasPriceIndex / 100) * 0.35,
    FOOD: (room.market.foodPriceIndex / 100) * 0.32,
    URANIUM: 1.2,
  };
  const fairTotalB = Math.max(5, Math.round((unitFair[offer.offerType] || 0.4) * offer.amount));

  if (offer.direction === 'SELL') {
    if (ai.treasuryB < offer.priceB + 15) {
      return { accepted: false, reasonFa: `${ai.nameFa} بودجه مازاد برای این خرید ندارد.` };
    }
    if (offer.priceB <= Math.round(fairTotalB * 1.25)) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} محموله ارسالی ${sender.nameFa} را به مبلغ $${offer.priceB}B خریداری کرد.`,
      };
    }
    return { accepted: false, reasonFa: `${ai.nameFa} قیمت پیشنهادی را بالاتر از نرخ بازار جهانی دانست.` };
  }

  if (offer.direction === 'BUY') {
    if (offer.priceB >= Math.round(fairTotalB * 0.85)) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} محموله درخواستی را به ${sender.nameFa} صادر کرد.`,
      };
    }
    return { accepted: false, reasonFa: `${ai.nameFa} قیمت پیشنهادی را کمتر از ارزش واقعی محموله دانست.` };
  }

  return { accepted: false, reasonFa: 'پیشنهاد رد شد.' };
}

/**
 * Living World AI Engine:
 * - AI nations upgrade their tech pillars, build infrastructures, produce indigenous arms,
 * - Retaliate decisively when attacked by players or rivals!
 * - Execute realistic regional flashpoint clashes/cyber ops so the world feels dynamically alive!
 * - Send proactive incoming trade/alliance offers to human players!
 */
export function runLivingWorldAITurn(room: GameRoomState): void {
  if (!room.settings.enableAINations) return;

  const aiCountries = Object.values(room.countries).filter(
    (c) => c.playerId === null && !c.isEliminated
  );
  const humanCountries = Object.values(room.countries).filter(
    (c) => c.playerId !== null && !c.isEliminated
  );

  let aiMilitaryActionsThisRound = 0;
  const maxWorldFlashpointAttacks = 2; // Keeps global feed exciting & readable without chaotic spam!

  for (const ai of aiCountries) {
    ai.orders = [];

    // 1. Instant domestic growth & upgrades (just like human players!)
    if (ai.powerGrid < 78) {
      const pCost = getInfraNextCost(ai, 'POWER_PLANT');
      if (ai.treasuryB >= pCost + 25) {
        ai.treasuryB -= pCost;
        ai.infrastructure.POWER_PLANT += 1;
        ai.powerGrid = Math.min(100, ai.powerGrid + 16);
      }
    } else if (ai.approval < 56) {
      const wCost = getInfraNextCost(ai, 'WELFARE_HUB');
      if (ai.treasuryB >= wCost + 20) {
        ai.treasuryB -= wCost;
        ai.infrastructure.WELFARE_HUB += 1;
        ai.approval = Math.min(100, ai.approval + 10);
      }
    } else if (ai.treasuryB >= 130 && Math.random() < 0.55) {
      const tracks: UpgradeTrack[] = ['INDUSTRY', 'AEROSPACE', 'AIR_DEFENSE', 'CYBER_AI', 'INTELLIGENCE'];
      const chosenTrack = tracks[Math.floor(Math.random() * tracks.length)];
      const upCost = getUpgradeNextCost(ai, chosenTrack);
      if (ai.upgrades[chosenTrack] < UPGRADE_TRACKS[chosenTrack].maxLevel && ai.treasuryB >= upCost + 40) {
        ai.treasuryB -= upCost;
        ai.upgrades[chosenTrack] += 1;
      }
    }

    // 2. Build indigenous military units if wealthy
    const mil = computeCountryMilitary(ai);
    if (ai.treasuryB >= 150 && mil.totalUnits < 26 && Math.random() < 0.45) {
      const ownWeapons = Object.values(WEAPONS_CATALOG).filter((w) => w.originCountry === ai.id);
      if (ownWeapons.length > 0) {
        const w = ownWeapons[Math.floor(Math.random() * ownWeapons.length)];
        if (ai.treasuryB >= w.unitCostB + 35) {
          ai.treasuryB -= w.unitCostB;
          ai.weapons[w.id] = (ai.weapons[w.id] || 0) + 1;
        }
      }
    }

    // 3. DECISIVE RETALIATION: If someone attacked this AI country last round, strike back!
    if (ai.lastAttackedBy && room.countries[ai.lastAttackedBy] && !room.countries[ai.lastAttackedBy].isEliminated) {
      const aggressor = room.countries[ai.lastAttackedBy];
      if (ai.treasuryB >= 22) {
        ai.treasuryB -= 20;
        const pct = estimateMilitarySuccessPct(ai, aggressor, 'PRECISION_STRIKE');
        ai.orders.push({
          id: uid('ai-ret'),
          actor: ai.id,
          kind: 'MILITARY_OPERATION',
          targetCountry: aggressor.id,
          militaryType: 'PRECISION_STRIKE',
          targetSector: 'MILITARY_BASES',
          estimatedSuccessPct: pct,
          costB: 20,
          summaryFa: `حمله تلافی‌جویانه موشکی ${ai.nameFa} علیه ${aggressor.nameFa}`,
          expectedImpactFa: 'پاسخ مستقیم به تجاوز نظامی ماه گذشته',
        });
        ai.lastAttackedBy = null;
        continue;
      }
    }

    // 4. ALLIED SUPERPOWER RESPONSE: If a player attacked an ally of a Superpower AI, Superpower sanctions or strikes!
    if (ai.aiPersonality === 'SUPERPOWER' && aiMilitaryActionsThisRound < maxWorldFlashpointAttacks) {
      const attackedAlly = ai.allies
        .map((id) => room.countries[id])
        .find((ally) => ally && ally.lastAttackedBy && ally.lastAttackedBy !== ai.id);
      if (attackedAlly && attackedAlly.lastAttackedBy) {
        const culprit = room.countries[attackedAlly.lastAttackedBy];
        if (culprit && !culprit.sanctionedBy.includes(ai.id)) {
          culprit.sanctionedBy.push(ai.id);
        }
        if (culprit && ai.treasuryB >= 25 && Math.random() < 0.55) {
          ai.treasuryB -= 15;
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-coalition'),
            actor: ai.id,
            kind: 'COVERT_OPERATION',
            targetCountry: culprit.id,
            covertType: 'BLACKOUT_VIRUS',
            estimatedSuccessPct: estimateCovertSuccessPct(ai, culprit, 'BLACKOUT_VIRUS'),
            costB: 15,
            summaryFa: `حمله سایبری ائتلافی ${ai.nameFa} در دفاع از ${attackedAlly.nameFa}`,
            expectedImpactFa: 'قطع شبکه برق و رادار کشور مهاجم',
          });
          continue;
        }
      }
    }

    // 5. GEOPOLITICAL RIVALRIES & ACTIVE WORLD FLASHPOINTS (Attacks on rivals — including aggressive rivals vs weak players!)
    if (
      (ai.aiPersonality === 'REGIONAL_HAWK' || ai.aiPersonality === 'SUPERPOWER') &&
      aiMilitaryActionsThisRound < maxWorldFlashpointAttacks &&
      ai.rivals.length > 0 &&
      ai.treasuryB >= 55 &&
      Math.random() < 0.24
    ) {
      const rivalId = ai.rivals[Math.floor(Math.random() * ai.rivals.length)];
      const rival = room.countries[rivalId];
      if (rival && !rival.isEliminated && !ai.allies.includes(rival.id)) {
        // Choose between Cyber/Covert op (60%) or Military Strike (40%)!
        if (Math.random() < 0.58) {
          const covType = ai.id === 'KP' ? 'TREASURY_HEIST' : 'BLACKOUT_VIRUS';
          ai.treasuryB -= 15;
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-cov'),
            actor: ai.id,
            kind: 'COVERT_OPERATION',
            targetCountry: rival.id,
            covertType: covType,
            estimatedSuccessPct: estimateCovertSuccessPct(ai, rival, covType),
            costB: 15,
            summaryFa: `عملیات سایبری ${ai.nameFa} علیه ${rival.nameFa}`,
            expectedImpactFa: 'ضربه سایبری به رقیب ژئوپولیتیک',
          });
        } else {
          ai.treasuryB -= 20;
          aiMilitaryActionsThisRound += 1;
          ai.orders.push({
            id: uid('ai-atk'),
            actor: ai.id,
            kind: 'MILITARY_OPERATION',
            targetCountry: rival.id,
            militaryType: 'PRECISION_STRIKE',
            targetSector: Math.random() < 0.5 ? 'MILITARY_BASES' : 'REFINERY',
            estimatedSuccessPct: estimateMilitarySuccessPct(ai, rival, 'PRECISION_STRIKE'),
            costB: 20,
            summaryFa: `حمله موشکی و هوایی ${ai.nameFa} به مواضع ${rival.nameFa}`,
            expectedImpactFa: 'درگیری نظامی در کانون بحران منطقه‌ای',
          });
        }
      }
    }

    ai.isReady = true;
  }

  // 6. PROACTIVE AI DIPLOMATIC OFFERS TO HUMAN PLAYERS! (1 offer per round per human so inbox feels alive!)
  for (const human of humanCountries) {
    const alreadyHasPending = room.trades.some(
      (t) => t.status === 'PENDING' && t.to === human.id
    );
    if (alreadyHasPending || Math.random() > 0.55) continue;

    // If human has lots of oil -> an importer AI offers generous cash to buy 60 oil!
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
    } else if (human.treasuryB >= 90) {
      // An arms exporter AI offers to sell 1 elite weapon system at friendly discount!
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
            noteFa: `پیشنهاد ویژه فروش مستقیم ۱× «${w.nameFa}» به قیمت کارخانه`,
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

    if (c.id === res.target || c.allies.includes(res.target)) {
      res.votesNo.push(c.id);
      if (c.isUNVetoMember && res.kind !== 'CEASEFIRE_DEMAND' && !res.vetoedBy) {
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
