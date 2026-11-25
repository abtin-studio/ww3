import { INFRASTRUCTURE_CATALOG, WEAPONS_CATALOG } from './realWorldData.js';
import {
  ChokepointId,
  ChokepointState,
  CountryId,
  CountryState,
  GameRoomState,
  WorldMarket,
} from './types.js';

export interface MilitarySummary {
  attackScore: number;
  defenseScore: number;
  interceptRate: number; // 0 - 92%
  stealthPower: number;
  navalPower: number;
  totalUnits: number;
}

export function computeCountryMilitary(country: CountryState): MilitarySummary {
  let attackScore = 0;
  let defenseScore = 0;
  let interceptBonus = country.infrastructure.RADAR_NETWORK * 4;
  let stealthPower = 0;
  let navalPower = 0;
  let totalUnits = 0;

  for (const [weaponId, count] of Object.entries(country.weapons)) {
    if (!count || count <= 0) continue;
    const spec = WEAPONS_CATALOG[weaponId];
    if (!spec) continue;
    totalUnits += count;
    attackScore += spec.attackPower * count;
    defenseScore += spec.defensePower * count;
    interceptBonus += spec.interceptBonus * count;
    if (spec.stealth >= 70) {
      stealthPower += (spec.stealth / 20) * count;
    }
    if (spec.category === 'NAVAL') {
      navalPower += spec.attackPower * count;
    }
  }

  // Apply air/missile base bonus & commander buff
  const baseMultiplier = 1 + country.infrastructure.AIR_MISSILE_BASE * 0.04 + country.commanderBuff / 100;
  attackScore = Math.max(5, Math.round(attackScore * baseMultiplier));
  defenseScore = Math.max(5, Math.round(defenseScore * baseMultiplier));

  // Radar integrity strongly scales air defense effectiveness!
  const radarFactor = Math.max(0.2, country.radarIntegrity / 100);
  let postureBonus = 0;
  if (country.alertPosture === 'MAX_INTERCEPT') postureBonus = 22;
  if (country.alertPosture === 'SCRAMBLE_FIGHTERS') postureBonus = 16;

  const rawIntercept = (18 + interceptBonus * 0.75 + postureBonus) * radarFactor;
  const interceptRate = Math.min(92, Math.max(8, Math.round(rawIntercept)));

  return {
    attackScore,
    defenseScore,
    interceptRate,
    stealthPower: Math.round(stealthPower),
    navalPower: Math.round(navalPower),
    totalUnits,
  };
}

export interface EconomyProjection {
  netIncomeB: number;
  grossGdpIncomeB: number;
  energyExportRevenueB: number;
  militaryUpkeepB: number;
  sanctionPenaltyB: number;
  netOil: number;
  netGas: number;
  netFood: number;
}

export function computeEconomyProjection(
  country: CountryState,
  market: WorldMarket,
  chokepoints: Record<ChokepointId, ChokepointState>
): EconomyProjection {
  const refineryBoost = country.infrastructure.REFINERY * 10;
  const foodBoost = country.infrastructure.WELFARE_HUB * 8;
  const weaponOilUse = Object.entries(country.weapons).reduce((sum, [wId, qty]) => {
    const spec = WEAPONS_CATALOG[wId];
    return sum + (spec ? spec.oilUsePerRound * qty : 0);
  }, 0);

  const oilProd = country.oilProduction + refineryBoost;
  const oilCons = country.oilConsumption + Math.round(weaponOilUse * 0.7);
  const netOil = oilProd - oilCons;

  const gasProd = country.gasProduction + Math.round(refineryBoost * 0.7);
  const netGas = gasProd - country.gasConsumption;

  const foodProd = country.foodProduction + foodBoost;
  const netFood = foodProd - country.foodConsumption;

  // Base monthly GDP tax/industrial yield (~11% of GDP index + factories, scaled by powerGrid & approval)
  const gridFactor = Math.max(0.45, country.powerGrid / 100);
  const approvalFactor = country.approval < 30 ? 0.65 : country.approval > 75 ? 1.1 : 0.95;
  const grossGdpIncomeB = Math.round(
    (country.gdpB * 0.085 + country.infrastructure.ARMS_FACTORY * 7) * gridFactor * approvalFactor
  );

  // Oil & Gas net export value (or automatic market import burden if reserves are critically low)
  const oilPriceFactor = market.oilPriceUsd / 82;
  let chokepointExportMultiplier = 1;
  if (
    (country.id === 'IR' || country.id === 'SA') &&
    chokepoints.HORMUZ.status === 'BLOCKADED' &&
    chokepoints.HORMUZ.controller !== country.id
  ) {
    chokepointExportMultiplier = 0.35;
  }
  if (country.id === 'EG' && chokepoints.SUEZ.status === 'OPEN') {
    // Suez Canal transit revenue!
    chokepointExportMultiplier = 1.15;
  }

  let energyExportRevenueB = 0;
  if (netOil > 0) {
    energyExportRevenueB += Math.round(netOil * 0.48 * oilPriceFactor * chokepointExportMultiplier);
  }
  if (netGas > 0) {
    energyExportRevenueB += Math.round(netGas * 0.25 * (market.gasPriceIndex / 100));
  }
  if (country.id === 'EG' && chokepoints.SUEZ.status === 'OPEN') {
    energyExportRevenueB += 12;
  }
  if (country.id === 'TR' && chokepoints.BOSPHORUS.status === 'OPEN') {
    energyExportRevenueB += 8;
  }

  const militaryUpkeepB = Math.round(
    Object.entries(country.weapons).reduce((acc, [wId, qty]) => {
      const spec = WEAPONS_CATALOG[wId];
      return acc + (spec ? spec.unitCostB * 0.06 * qty : 0);
    }, 4)
  );

  // Sanctions hurt income, softened by allies!
  const rawSanctionCount = country.sanctionedBy.length;
  const allyMitigation = Math.min(0.55, country.allies.length * 0.15);
  const sanctionRate = Math.min(0.42, rawSanctionCount * 0.09 * (1 - allyMitigation));
  const sanctionPenaltyB = Math.round((grossGdpIncomeB + Math.max(0, energyExportRevenueB)) * sanctionRate);

  const netIncomeB = grossGdpIncomeB + energyExportRevenueB - militaryUpkeepB - sanctionPenaltyB;

  return {
    netIncomeB,
    grossGdpIncomeB,
    energyExportRevenueB,
    militaryUpkeepB,
    sanctionPenaltyB,
    netOil,
    netGas,
    netFood,
  };
}

export interface CabinetSuggestion {
  id: string;
  ministerFa: string;
  urgency: 'HIGH' | 'MEDIUM' | 'OPPORTUNITY';
  titleFa: string;
  subtitleFa: string;
  buttonLabelFa: string;
  quickAction:
    | { type: 'BUILD_INFRA'; infraType: keyof typeof INFRASTRUCTURE_CATALOG }
    | { type: 'DOMESTIC_POLICY'; policyType: 'WELFARE_PACKAGE' | 'TECH_RND_INVEST' | 'NUCLEAR_PROGRAM_PUSH' }
    | { type: 'QUICK_FLIGHT_CAP' }
    | { type: 'OPEN_COUNTRY_DRAWER'; targetCountry: CountryId; tab: 'DIPLOMACY' | 'STRIKE' | 'ESPIONAGE' };
}

export function getSmartCabinetAdvice(room: GameRoomState, countryId: CountryId): CabinetSuggestion[] {
  const c = room.countries[countryId];
  if (!c) return [];
  const econ = computeEconomyProjection(c, room.market, room.chokepoints);
  const mil = computeCountryMilitary(c);
  const suggestions: CabinetSuggestion[] = [];

  if (c.approval < 58 && c.treasuryB >= 18) {
    suggestions.push({
      id: 'adv-approval',
      ministerFa: 'وزیر کشور',
      urgency: 'HIGH',
      titleFa: `رضایت مردم روی ${c.approval}٪ است`,
      subtitleFa: 'با تصویب بسته رفاهی فوری، هم ثبات کشور بالا می‌رود و هم جلوی اعتصاب گرفته می‌شود.',
      buttonLabelFa: 'اجرای بسته رفاهی ($18B)',
      quickAction: { type: 'DOMESTIC_POLICY', policyType: 'WELFARE_PACKAGE' },
    });
  }

  if (c.powerGrid < 78 && c.treasuryB >= INFRASTRUCTURE_CATALOG.POWER_PLANT.costB) {
    suggestions.push({
      id: 'adv-power',
      ministerFa: 'وزیر نیرو',
      urgency: 'HIGH',
      titleFa: `پایداری برق (${c.powerGrid}٪) نیاز به تقویت دارد`,
      subtitleFa: 'ساخت نیروگاه جدید درآمد صنعتی و رضایت مردم را بالا نگه می‌دارد.',
      buttonLabelFa: `ساخت نیروگاه ($${INFRASTRUCTURE_CATALOG.POWER_PLANT.costB}B)`,
      quickAction: { type: 'BUILD_INFRA', infraType: 'POWER_PLANT' },
    });
  }

  if (econ.netOil < -15 && c.oilReserve < 130) {
    // Suggest buying oil from biggest non-hostile producer
    const exporter: CountryId =
      !c.sanctionedBy.includes('SA') && countryId !== 'SA'
        ? 'SA'
        : countryId !== 'RU'
        ? 'RU'
        : 'IR';
    suggestions.push({
      id: 'adv-oil-import',
      ministerFa: 'وزیر انرژی',
      urgency: 'HIGH',
      titleFa: 'کسری نفت ماهانه؛ ذخیره سوخت در حال کاهش است',
      subtitleFa: `با یک کلیک از ${room.countries[exporter].nameFa} محموله نفت وارد کنید تا ارتش و صنایع نخوابند.`,
      buttonLabelFa: `خرید نفت از ${room.countries[exporter].nameFa}`,
      quickAction: { type: 'OPEN_COUNTRY_DRAWER', targetCountry: exporter, tab: 'DIPLOMACY' },
    });
  } else if (econ.netOil > 35) {
    const buyer: CountryId = countryId !== 'CN' ? 'CN' : 'DE';
    suggestions.push({
      id: 'adv-oil-export',
      ministerFa: 'وزیر نفت و تجارت',
      urgency: 'OPPORTUNITY',
      titleFa: `مازاد عالی نفت (+${econ.netOil} در ماه)`,
      subtitleFa: `${room.countries[buyer].nameFa} خریدار نقدی انرژی است؛ با یک قرارداد فوری خزانه را پر کنید.`,
      buttonLabelFa: `فروش نفت به ${room.countries[buyer].nameFa}`,
      quickAction: { type: 'OPEN_COUNTRY_DRAWER', targetCountry: buyer, tab: 'DIPLOMACY' },
    });
  }

  if (room.defcon <= 3 && !c.orders.some((o) => o.flightType === 'CAP_PATROL')) {
    suggestions.push({
      id: 'adv-cap',
      ministerFa: 'فرمانده پدافند هوایی',
      urgency: 'MEDIUM',
      titleFa: `وضعیت امنیتی جهان حاد است (DEFCON ${room.defcon})`,
      subtitleFa: 'بلند کردن گشت هوایی ۲۴ ساعته (CAP) شانس شکار جنگنده‌ها و موشک‌های دشمن را بالا می‌برد.',
      buttonLabelFa: 'پرواز گشت هوایی ($6B)',
      quickAction: { type: 'QUICK_FLIGHT_CAP' },
    });
  }

  if (mil.interceptRate < 45 && c.treasuryB >= INFRASTRUCTURE_CATALOG.RADAR_NETWORK.costB) {
    suggestions.push({
      id: 'adv-radar',
      ministerFa: 'وزیر دفاع',
      urgency: 'MEDIUM',
      titleFa: `سپر رهگیری هوایی (${mil.interceptRate}٪) آسیب‌پذیر است`,
      subtitleFa: 'ارتقای شبکه رادار آرایه‌فازی هشدار ۳۰ ثانیه‌ای و دقت پدافند را تقویت می‌کند.',
      buttonLabelFa: `ارتقای شبکه رادار ($${INFRASTRUCTURE_CATALOG.RADAR_NETWORK.costB}B)`,
      quickAction: { type: 'BUILD_INFRA', infraType: 'RADAR_NETWORK' },
    });
  }

  if (suggestions.length < 3 && c.treasuryB >= 55) {
    suggestions.push({
      id: 'adv-tech',
      ministerFa: 'معاون علمی و فناوری',
      urgency: 'OPPORTUNITY',
      titleFa: 'خزانه آماده سرمایه‌گذاری استراتژیک است',
      subtitleFa: 'ساخت کارخانه صنایع دفاعی هزینه‌های نظامی آینده را کم و اقتصاد کشور را قوی‌تر می‌کند.',
      buttonLabelFa: `ساخت صنایع دفاعی ($${INFRASTRUCTURE_CATALOG.ARMS_FACTORY.costB}B)`,
      quickAction: { type: 'BUILD_INFRA', infraType: 'ARMS_FACTORY' },
    });
  }

  return suggestions.slice(0, 3);
}

export function getIndigenousOrAllyWeaponCost(country: CountryState, weaponId: string): {
  canBuildDirectly: boolean;
  isAllyLicensed: boolean;
  finalCostB: number;
  producerCountry: CountryId;
} {
  const spec = WEAPONS_CATALOG[weaponId];
  if (!spec) {
    return { canBuildDirectly: false, isAllyLicensed: false, finalCostB: 999, producerCountry: 'US' };
  }
  const factoryDiscount = Math.min(0.3, country.infrastructure.ARMS_FACTORY * 0.03);
  if (spec.originCountry === country.id) {
    return {
      canBuildDirectly: true,
      isAllyLicensed: false,
      finalCostB: Math.max(4, Math.round(spec.unitCostB * (1 - factoryDiscount))),
      producerCountry: spec.originCountry,
    };
  }
  if (
    country.allies.includes(spec.originCountry) &&
    !country.sanctionedBy.includes(spec.originCountry)
  ) {
    return {
      canBuildDirectly: true,
      isAllyLicensed: true,
      finalCostB: Math.max(5, Math.round(spec.unitCostB * 1.12)),
      producerCountry: spec.originCountry,
    };
  }
  return {
    canBuildDirectly: false,
    isAllyLicensed: false,
    finalCostB: Math.round(spec.unitCostB * 1.15),
    producerCountry: spec.originCountry,
  };
}
