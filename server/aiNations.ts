import { computeCountryMilitary, computeEconomyProjection } from '../shared/advisor.js';
import { INFRASTRUCTURE_CATALOG, WEAPONS_CATALOG } from '../shared/realWorldData.js';
import {
  CountryId,
  GameOrder,
  GameRoomState,
  TradeOffer,
  UNResolution,
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
    ai.airspaceClosedTo.includes(sender.id);

  // Lifting sanctions
  if (offer.offerType === 'LIFT_SANCTION') {
    if (offer.priceB >= 35) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} با دریافت امتیاز اقتصادی موافقت کرد تحریم‌های دوجانبه علیه ${sender.nameFa} را تعلیق کند.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} اعلام کرد امتیاز پیشنهادی برای لغو تحریم‌ها کافی نیست (حداقل ۳۵ میلیارد دلار امتیاز تجاری لازم است).`,
    };
  }

  if (offer.offerType === 'ALLIANCE') {
    if (isHostile) {
      return {
        accepted: false,
        reasonFa: `وزارت خارجه ${ai.nameFa} به دلیل اختلافات ژئوپولیتیک عمیق، پیمان دفاعی با ${sender.nameFa} را رد کرد.`,
      };
    }
    if (ai.allies.includes(sender.id)) {
      return { accepted: true, reasonFa: 'پیمان دفاعی پیش‌تر برقرار شده است.' };
    }
    if (offer.priceB >= 25 || ai.airspaceOpenTo.includes(sender.id)) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} پیمان همکاری دفاعی و امنیتی مشترک با ${sender.nameFa} را امضا کرد.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} برای امضای پیمان دفاعی مشترک خواستار حداقل ۲۵ میلیارد دلار سرمایه‌گذاری مشترک است.`,
    };
  }

  if (offer.offerType === 'AIRSPACE') {
    if (isHostile && offer.priceB < 30) {
      return {
        accepted: false,
        reasonFa: `${ai.nameFa} اجازه عبور نظامی از حریم هوایی خود را صادر نکرد.`,
      };
    }
    if (offer.priceB >= 10 || ai.allies.includes(sender.id)) {
      return {
        accepted: true,
        reasonFa: `سازمان هواپیمایی و پدافند ${ai.nameFa} کریدور پروازی برای ${sender.nameFa} باز کرد.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} برای صدور مجوز کریدور هوایی درخواست حق ترانزیت حداقل ۱۰ میلیارد دلاری دارد.`,
    };
  }

  // Arms Export Request (sender wants to BUY weapon from AI producer)
  if (offer.offerType === 'WEAPON' && offer.weaponId) {
    const spec = WEAPONS_CATALOG[offer.weaponId];
    if (!spec) return { accepted: false, reasonFa: 'سامانه تسلیحاتی یافت نشد.' };

    if (sender.sanctionedBy.includes(ai.id)) {
      return {
        accepted: false,
        reasonFa: `${ai.nameFa} به دلیل تحریم تسلیحاتی جاری از فروش «${spec.nameFa}» به ${sender.nameFa} خودداری کرد.`,
      };
    }
    // F-22 and B-2 strategic export restriction unless formal ally!
    if ((spec.id === 'f22' || spec.id === 'b2_spirit') && !ai.allies.includes(sender.id)) {
      return {
        accepted: false,
        reasonFa: `کنگره ${ai.nameFa} صادرات تسلیحات فوق‌محرمانه (${spec.nameEn}) به کشورهای غیرمتحد را ممنوع کرده است. ابتدا پیمان دفاعی ببندید.`,
      };
    }

    const qty = Math.max(1, offer.amount || 1);
    const minAcceptablePrice = Math.round(spec.unitCostB * qty * (ai.allies.includes(sender.id) ? 1.0 : 1.1));
    if (offer.direction === 'BUY') {
      if (offer.priceB < minAcceptablePrice) {
        return {
          accepted: false,
          reasonFa: `وزارت دفاع ${ai.nameFa} حداقل قیمت صادراتی ${qty} واحد «${spec.nameFa}» را $${minAcceptablePrice}B اعلام کرد.`,
        };
      }
      return {
        accepted: true,
        reasonFa: `قرارداد تسلیحاتی امضا شد؛ ${ai.nameFa} تحویل ${qty} بسته «${spec.nameFa}» به ${sender.nameFa} را تایید کرد.`,
      };
    }
  }

  // Resource Trade (OIL, GAS, FOOD, URANIUM)
  const unitFairPriceB: Record<string, number> = {
    OIL: (room.market.oilPriceUsd / 82) * 0.45,
    GAS: (room.market.gasPriceIndex / 100) * 0.35,
    FOOD: (room.market.foodPriceIndex / 100) * 0.32,
    URANIUM: 1.2,
  };
  const fairTotalB = Math.max(5, Math.round((unitFairPriceB[offer.offerType] || 0.4) * offer.amount));

  if (sender.sanctionedBy.includes(ai.id) && offer.direction === 'BUY') {
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} به علت تحریم‌های جاری از فروش منابع استراتژیک به ${sender.nameFa} خودداری کرد.`,
    };
  }

  // Sender is SELLING resource to AI (AI pays sender priceB)
  if (offer.direction === 'SELL') {
    // Sanctioned sellers must offer a discount (like real oil discounts!)
    const maxPayMultiplier = sender.sanctionedBy.includes(ai.id) ? 0.8 : 1.25;
    const maxWillingToPay = Math.round(fairTotalB * maxPayMultiplier);
    if (ai.treasuryB < offer.priceB + 15) {
      return {
        accepted: false,
        reasonFa: `خزانه ${ai.nameFa} در این ماه بودجه کافی برای خرید این حجم محموله را ندارد.`,
      };
    }
    if (offer.priceB <= maxWillingToPay) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} پیشنهاد خرید ${offer.amount} واحد محموله از ${sender.nameFa} به ارزش $${offer.priceB}B را پذیرفت.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} قیمت پیشنهادی ($${offer.priceB}B) را بالاتر از نرخ بازار دانست (حداکثر رقم قابل قبول: $${maxWillingToPay}B).`,
    };
  }

  // Sender is BUYING resource from AI (Sender pays AI priceB)
  if (offer.direction === 'BUY') {
    const reserveKey =
      offer.offerType === 'OIL'
        ? ai.oilReserve
        : offer.offerType === 'GAS'
        ? ai.gasReserve
        : offer.offerType === 'FOOD'
        ? ai.foodReserve
        : ai.uraniumReserve;
    if (reserveKey < offer.amount + 45) {
      return {
        accepted: false,
        reasonFa: `${ai.nameFa} اعلام کرد به دلیل نیاز داخلی امکان صادرات این مقدار ذخیره را ندارد.`,
      };
    }
    const minSellPrice = Math.round(fairTotalB * 0.88);
    if (offer.priceB >= minSellPrice) {
      return {
        accepted: true,
        reasonFa: `${ai.nameFa} با صادرات فوری ${offer.amount} واحد محموله به ${sender.nameFa} در قبال $${offer.priceB}B موافقت کرد.`,
      };
    }
    return {
      accepted: false,
      reasonFa: `${ai.nameFa} حداقل قیمت فروش این محموله را $${minSellPrice}B اعلام کرد.`,
    };
  }

  return { accepted: false, reasonFa: 'پیشنهاد تجاری توسط طرف مقابل رد شد.' };
}

export function generateAINationOrders(room: GameRoomState): void {
  if (!room.settings.enableAINations) return;

  for (const country of Object.values(room.countries)) {
    if (country.playerId !== null || country.isEliminated) continue;
    country.orders = [];

    const econ = computeEconomyProjection(country, room.market, room.chokepoints);
    const mil = computeCountryMilitary(country);

    // 1. Stabilize power or approval if low
    if (country.powerGrid < 76 && country.treasuryB >= INFRASTRUCTURE_CATALOG.POWER_PLANT.costB + 20) {
      const cost = INFRASTRUCTURE_CATALOG.POWER_PLANT.costB;
      country.treasuryB -= cost;
      country.orders.push({
        id: uid('ai-ord'),
        actor: country.id,
        kind: 'BUILD_INFRA',
        infraType: 'POWER_PLANT',
        costB: cost,
        summaryFa: 'ساخت نیروگاه برق جدید',
      });
    } else if (country.approval < 55 && country.treasuryB >= 25) {
      country.treasuryB -= 18;
      country.orders.push({
        id: uid('ai-ord'),
        actor: country.id,
        kind: 'DOMESTIC_POLICY',
        policyType: 'WELFARE_PACKAGE',
        costB: 18,
        summaryFa: 'اجرای بسته حمایت رفاهی',
      });
    } else if (econ.netOil > 20 && country.treasuryB >= 80 && country.infrastructure.REFINERY < 8 && Math.random() < 0.35) {
      const cost = INFRASTRUCTURE_CATALOG.REFINERY.costB;
      country.treasuryB -= cost;
      country.orders.push({
        id: uid('ai-ord'),
        actor: country.id,
        kind: 'BUILD_INFRA',
        infraType: 'REFINERY',
        costB: cost,
        summaryFa: 'توسعه پالایشگاه و میدان انرژی',
      });
    }

    // 2. Defensive posture when global tension is elevated
    if (room.defcon <= 3 && country.treasuryB >= 15 && Math.random() < 0.6) {
      country.treasuryB -= 6;
      country.orders.push({
        id: uid('ai-ord'),
        actor: country.id,
        kind: 'FLIGHT_MISSION',
        flightType: 'CAP_PATROL',
        targetCountry: country.id,
        costB: 6,
        summaryFa: 'پرواز گشت هوایی پدافندی (CAP)',
      });
    }

    // 3. Build indigenous defense / fighter if rich
    if (country.treasuryB >= 140 && mil.totalUnits < 24 && Math.random() < 0.45) {
      const ownWeapons = Object.values(WEAPONS_CATALOG).filter(
        (w) => w.originCountry === country.id || country.allies.includes(w.originCountry)
      );
      if (ownWeapons.length > 0) {
        const chosen = ownWeapons[Math.floor(Math.random() * ownWeapons.length)];
        if (country.treasuryB >= chosen.unitCostB + 30) {
          country.treasuryB -= chosen.unitCostB;
          country.orders.push({
            id: uid('ai-ord'),
            actor: country.id,
            kind: 'PRODUCE_WEAPON',
            weaponId: chosen.id,
            quantity: 1,
            costB: chosen.unitCostB,
            summaryFa: `تولید ${chosen.nameFa}`,
          });
        }
      }
    }

    country.isReady = true;
  }
}

export function castAIVotesOnResolution(room: GameRoomState, res: UNResolution): void {
  for (const c of Object.values(room.countries)) {
    if (c.playerId !== null || c.isEliminated) continue;
    if (res.votesYes.includes(c.id) || res.votesNo.includes(c.id)) continue;

    // Target or target's allies vote NO (and VETO if permanent UNSC member!)
    if (c.id === res.target || c.allies.includes(res.target)) {
      res.votesNo.push(c.id);
      if (c.isUNVetoMember && res.kind !== 'CEASEFIRE_DEMAND' && !res.vetoedBy) {
        res.vetoedBy = c.id;
        res.status = 'VETOED';
      }
      continue;
    }

    if (c.allies.includes(res.proposer) || res.target && c.sanctionedBy.includes(res.target)) {
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
