import { INFRASTRUCTURE_CATALOG, UPGRADE_TRACKS, WEAPONS_CATALOG } from './realWorldData.js';
import {
  ChokepointId,
  ChokepointState,
  CountryId,
  CountryState,
  CovertOpType,
  GameRoomState,
  InfrastructureType,
  MilitaryOpType,
  UpgradeTrack,
  WorldMarket,
} from './types.js';

export interface MilitarySummary {
  attackScore: number;
  defenseScore: number;
  interceptRate: number; // 8 - 92%
  stealthPower: number;
  navalArmorPower: number;
  droneCount: number;
  totalUnits: number;
  veteranStars: number; // 0 - 5 stars from combat XP!
}

export function computeCountryMilitary(country: CountryState): MilitarySummary {
  let attackScore = 0;
  let defenseScore = 0;
  let interceptBonus = country.infrastructure.RADAR_NETWORK * 4 + country.upgrades.AIR_DEFENSE * 8;
  let stealthPower = 0;
  let navalArmorPower = 0;
  let droneCount = 0;
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
    if (spec.category === 'NAVAL' || spec.category === 'ARMOR') {
      navalArmorPower += spec.attackPower * count;
    }
    if (spec.category === 'DRONE') {
      droneCount += count;
    }
  }

  const veteranStars = Math.min(5, Math.floor(country.militaryXp / 30));
  const aerospaceBonus = country.upgrades.AEROSPACE * 0.14;
  const baseMultiplier =
    1 +
    aerospaceBonus +
    veteranStars * 0.06 +
    country.infrastructure.AIR_MISSILE_BASE * 0.04 +
    country.commanderBuff / 100;

  attackScore = Math.max(8, Math.round(attackScore * baseMultiplier));
  defenseScore = Math.max(
    8,
    Math.round(defenseScore * (1 + country.upgrades.AIR_DEFENSE * 0.1 + veteranStars * 0.05 + country.commanderBuff / 100))
  );

  const radarFactor = Math.max(0.2, country.radarIntegrity / 100);
  let postureBonus = 0;
  if (country.alertPosture === 'MAX_INTERCEPT') postureBonus = 24;
  if (country.alertPosture === 'SCRAMBLE_FIGHTERS') postureBonus = 18;

  const rawIntercept = (16 + interceptBonus * 0.72 + postureBonus) * radarFactor;
  const interceptRate = Math.min(92, Math.max(8, Math.round(rawIntercept)));

  return {
    attackScore,
    defenseScore,
    interceptRate,
    stealthPower: Math.round(stealthPower),
    navalArmorPower: Math.round(navalArmorPower),
    droneCount,
    totalUnits,
    veteranStars,
  };
}

export function getUpgradeNextCost(country: CountryState, track: UpgradeTrack): number {
  const spec = UPGRADE_TRACKS[track];
  const cur = country.upgrades[track] || 0;
  return Math.round(spec.baseCostB * (1 + cur * 0.35));
}

export function getInfraNextCost(country: CountryState, type: InfrastructureType): number {
  const spec = INFRASTRUCTURE_CATALOG[type];
  const cur = country.infrastructure[type] || 0;
  const industryDiscount = Math.min(0.32, country.upgrades.INDUSTRY * 0.06);
  return Math.max(10, Math.round(spec.costB * (1 + Math.max(0, cur - 3) * 0.15) * (1 - industryDiscount)));
}

export function getGlobalSpotPrices(market: WorldMarket): {
  oilBuy50B: number;
  oilSell50B: number;
  gasBuy50B: number;
  gasSell50B: number;
  foodBuy50B: number;
  foodSell50B: number;
  uraniumBuy20B: number;
} {
  const oilUnit = market.oilPriceUsd / 82;
  const buyOil = Math.max(14, Math.round(25 * oilUnit));
  const sellOil = Math.max(12, Math.round(22 * oilUnit));
  const buyGas = Math.max(12, Math.round(19 * (market.gasPriceIndex / 100)));
  const sellGas = Math.max(10, Math.round(16 * (market.gasPriceIndex / 100)));
  const buyFood = Math.max(11, Math.round(17 * (market.foodPriceIndex / 100)));
  const sellFood = Math.max(9, Math.round(14 * (market.foodPriceIndex / 100)));
  return {
    oilBuy50B: buyOil,
    oilSell50B: sellOil,
    gasBuy50B: buyGas,
    gasSell50B: sellGas,
    foodBuy50B: buyFood,
    foodSell50B: sellFood,
    uraniumBuy20B: 28,
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
  const foodBoost = country.infrastructure.WELFARE_HUB * 9;
  const weaponOilUse = Object.entries(country.weapons).reduce((sum, [wId, qty]) => {
    const spec = WEAPONS_CATALOG[wId];
    return sum + (spec ? spec.oilUsePerRound * qty : 0);
  }, 0);

  const oilProd = country.oilProduction + refineryBoost;
  const oilCons = country.oilConsumption + Math.round(weaponOilUse * 0.65);
  const netOil = oilProd - oilCons;

  const gasProd = country.gasProduction + Math.round(refineryBoost * 0.7);
  const netGas = gasProd - country.gasConsumption;

  const foodProd = country.foodProduction + foodBoost;
  const netFood = foodProd - country.foodConsumption;

  const gridFactor = Math.max(0.45, country.powerGrid / 100);
  const approvalFactor = country.approval < 35 ? 0.7 : country.approval > 72 ? 1.12 : 0.98;
  const industryTrackBonus = country.upgrades.INDUSTRY * 22;

  const grossGdpIncomeB = Math.round(
    (country.gdpB * 0.085 + country.infrastructure.ARMS_FACTORY * 9 + industryTrackBonus) *
      gridFactor *
      approvalFactor
  );

  const oilPriceFactor = market.oilPriceUsd / 82;
  let chokepointExportMultiplier = 1;
  if (
    (country.id === 'IR' || country.id === 'SA') &&
    chokepoints.HORMUZ.status === 'BLOCKADED' &&
    chokepoints.HORMUZ.controller !== country.id
  ) {
    chokepointExportMultiplier = 0.35;
  }

  let energyExportRevenueB = 0;
  if (netOil > 0) {
    energyExportRevenueB += Math.round(netOil * 0.52 * oilPriceFactor * chokepointExportMultiplier);
  }
  if (netGas > 0) {
    energyExportRevenueB += Math.round(netGas * 0.26 * (market.gasPriceIndex / 100));
  }
  if (country.id === 'EG' && chokepoints.SUEZ.status === 'OPEN') energyExportRevenueB += 14;
  if (country.id === 'TR' && chokepoints.BOSPHORUS.status === 'OPEN') energyExportRevenueB += 10;

  const militaryUpkeepB = Math.round(
    Object.entries(country.weapons).reduce((acc, [wId, qty]) => {
      const spec = WEAPONS_CATALOG[wId];
      return acc + (spec ? spec.unitCostB * 0.05 * qty : 0);
    }, 4)
  );

  const rawSanctionCount = country.sanctionedBy.length;
  const allyMitigation = Math.min(0.6, country.allies.length * 0.16);
  const sanctionRate = Math.min(0.38, rawSanctionCount * 0.08 * (1 - allyMitigation));
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

/**
 * Computes exact transparent Win / Penetration % BEFORE the player clicks an operation!
 */
export function estimateMilitarySuccessPct(
  attacker: CountryState,
  defender: CountryState,
  opType: MilitaryOpType
): number {
  const atk = computeCountryMilitary(attacker);
  const def = computeCountryMilitary(defender);
  const hasRecon = Boolean(attacker.knownIntel[defender.id]);
  const reconBonus = hasRecon ? 14 : 0;

  // Check if attacker already queued SEAD_DRONE_SWARM against this defender in the same turn!
  const seadQueued = attacker.orders.some(
    (o) => o.targetCountry === defender.id && o.militaryType === 'SEAD_DRONE_SWARM'
  );
  const seadBonus = seadQueued && opType !== 'SEAD_DRONE_SWARM' ? 28 : 0;

  if (opType === 'SEAD_DRONE_SWARM') {
    const raw = 62 + atk.droneCount * 5 + attacker.upgrades.AEROSPACE * 4 - def.interceptRate * 0.25 + reconBonus;
    return Math.min(94, Math.max(30, Math.round(raw)));
  }

  if (opType === 'PRECISION_STRIKE') {
    const raw =
      100 -
      def.interceptRate +
      atk.stealthPower * 2.2 +
      attacker.upgrades.AEROSPACE * 7 +
      reconBonus +
      seadBonus;
    return Math.min(93, Math.max(18, Math.round(raw)));
  }

  if (opType === 'FULL_INVASION') {
    const ratio = (atk.attackScore + atk.navalArmorPower * 0.6) / Math.max(40, def.defenseScore);
    const raw = ratio * 52 + reconBonus + seadBonus * 0.6;
    return Math.min(92, Math.max(15, Math.round(raw)));
  }

  // NUCLEAR_STRIKE
  const raw = 85 - def.interceptRate * 0.35 + attacker.upgrades.AEROSPACE * 4 + seadBonus * 0.5;
  return Math.min(96, Math.max(35, Math.round(raw)));
}

export function estimateCovertSuccessPct(
  attacker: CountryState,
  defender: CountryState,
  covertType: CovertOpType
): number {
  if (covertType === 'SAT_RECON') {
    const raw = 68 + attacker.upgrades.INTELLIGENCE * 7 + attacker.upgrades.AEROSPACE * 3 - defender.upgrades.AIR_DEFENSE * 3;
    return Math.min(96, Math.max(40, Math.round(raw)));
  }
  if (covertType === 'BLACKOUT_VIRUS' || covertType === 'TREASURY_HEIST') {
    const myCyber = attacker.cyberShield * 0.55 + attacker.upgrades.CYBER_AI * 12 + attacker.infrastructure.CYBER_HQ * 4;
    const defCyber = defender.cyberShield * 0.55 + defender.upgrades.CYBER_AI * 9 + defender.infrastructure.CYBER_HQ * 3;
    return Math.min(92, Math.max(20, Math.round(52 + (myCyber - defCyber) * 0.9)));
  }
  // SABOTAGE_ASSASSINATION
  const mySpy = attacker.intelLevel * 5 + attacker.upgrades.INTELLIGENCE * 12;
  const defSpy = defender.intelLevel * 5 + defender.upgrades.INTELLIGENCE * 9;
  return Math.min(90, Math.max(18, Math.round(48 + (mySpy - defSpy) * 0.95)));
}

export interface CabinetSuggestion {
  id: string;
  ministerFa: string;
  urgency: 'HIGH' | 'MEDIUM' | 'OPPORTUNITY';
  titleFa: string;
  subtitleFa: string;
  buttonLabelFa: string;
  quickAction:
    | { type: 'INSTANT_INFRA'; infraType: InfrastructureType }
    | { type: 'INSTANT_UPGRADE'; track: UpgradeTrack }
    | { type: 'SPOT_TRADE'; resource: 'OIL' | 'FOOD'; mode: 'BUY' | 'SELL' }
    | { type: 'OPEN_COUNTRY_DRAWER'; targetCountry: CountryId };
}

export function getSmartCabinetAdvice(room: GameRoomState, countryId: CountryId): CabinetSuggestion[] {
  const c = room.countries[countryId];
  if (!c) return [];
  const spot = getGlobalSpotPrices(room.market);
  const suggestions: CabinetSuggestion[] = [];

  if (c.approval < 58 && c.treasuryB >= getInfraNextCost(c, 'WELFARE_HUB')) {
    const cost = getInfraNextCost(c, 'WELFARE_HUB');
    suggestions.push({
      id: 'adv-welfare',
      ministerFa: 'وزیر کشور',
      urgency: 'HIGH',
      titleFa: `رضایت مردم (${c.approval}٪) نیاز به توجه فوری دارد`,
      subtitleFa: 'با ساخت مرکز رفاه و سلامت، همزمان +۱۰٪ رضایت مردم و تولید غذا فوری بالا می‌رود.',
      buttonLabelFa: `احداث مرکز رفاه ($${cost}B)`,
      quickAction: { type: 'INSTANT_INFRA', infraType: 'WELFARE_HUB' },
    });
  }

  if (c.oilReserve < 70 && c.treasuryB >= spot.oilBuy50B) {
    suggestions.push({
      id: 'adv-buy-oil',
      ministerFa: 'وزیر انرژی',
      urgency: 'HIGH',
      titleFa: 'ذخیره سوخت کشور پایین آمده است!',
      subtitleFa: 'همین الان با ۱ کلیک از بورس جهانی ۵۰ واحد نفت بخرید تا ارتش و برق کشور آسیب نبینند.',
      buttonLabelFa: `خرید فوری ۵۰ نفت ($${spot.oilBuy50B}B)`,
      quickAction: { type: 'SPOT_TRADE', resource: 'OIL', mode: 'BUY' },
    });
  } else if (c.oilReserve >= 260) {
    suggestions.push({
      id: 'adv-sell-oil',
      ministerFa: 'وزیر نفت',
      urgency: 'OPPORTUNITY',
      titleFa: 'انبار نفت پر است؛ تبدیل فوری به پول نقد!',
      subtitleFa: `با ۱ کلیک ۵۰ واحد نفت در بورس جهانی بفروشید و درجا +$${spot.oilSell50B}B بگیرید.`,
      buttonLabelFa: `فروش فوری ۵۰ نفت (+$${spot.oilSell50B}B)`,
      quickAction: { type: 'SPOT_TRADE', resource: 'OIL', mode: 'SELL' },
    });
  }

  if (c.powerGrid < 80 && c.treasuryB >= getInfraNextCost(c, 'POWER_PLANT')) {
    const cost = getInfraNextCost(c, 'POWER_PLANT');
    suggestions.push({
      id: 'adv-power',
      ministerFa: 'وزیر نیرو',
      urgency: 'HIGH',
      titleFa: `برق کشور (${c.powerGrid}٪) کمبود دارد`,
      subtitleFa: 'ساخت نیروگاه مدرن بلافاصله ظرفیت برق را +۱۶٪ تقویت می‌کند.',
      buttonLabelFa: `ساخت فوری نیروگاه ($${cost}B)`,
      quickAction: { type: 'INSTANT_INFRA', infraType: 'POWER_PLANT' },
    });
  }

  if (c.upgrades.INDUSTRY < 5 && c.treasuryB >= getUpgradeNextCost(c, 'INDUSTRY')) {
    const cost = getUpgradeNextCost(c, 'INDUSTRY');
    suggestions.push({
      id: 'adv-industry',
      ministerFa: 'وزیر اقتصاد',
      urgency: 'OPPORTUNITY',
      titleFa: `لول‌آپ اقتصاد کشور به سطح ${c.upgrades.INDUSTRY + 1}`,
      subtitleFa: 'درآمد ماهانه شما را برای همیشه +$22B بیشتر و ساخت سلاح را ارزان‌تر می‌کند!',
      buttonLabelFa: `ارتقای ابرصنعت ($${cost}B)`,
      quickAction: { type: 'INSTANT_UPGRADE', track: 'INDUSTRY' },
    });
  }

  if (suggestions.length < 3 && c.upgrades.AEROSPACE < 5 && c.treasuryB >= getUpgradeNextCost(c, 'AEROSPACE')) {
    const cost = getUpgradeNextCost(c, 'AEROSPACE');
    suggestions.push({
      id: 'adv-aero',
      ministerFa: 'فرمانده هوافضا',
      urgency: 'MEDIUM',
      titleFa: `ارتقای موشکی و هوافضا به سطح ${c.upgrades.AEROSPACE + 1}`,
      subtitleFa: '+۱۶٪ قدرت تخریب موشک‌ها و جنگنده‌ها در تمام نبردها.',
      buttonLabelFa: `لول‌آپ هوافضا ($${cost}B)`,
      quickAction: { type: 'INSTANT_UPGRADE', track: 'AEROSPACE' },
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
  const discount = Math.min(
    0.38,
    country.infrastructure.ARMS_FACTORY * 0.03 + country.upgrades.INDUSTRY * 0.05
  );
  if (spec.originCountry === country.id) {
    return {
      canBuildDirectly: true,
      isAllyLicensed: false,
      finalCostB: Math.max(4, Math.round(spec.unitCostB * (1 - discount))),
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
      finalCostB: Math.max(5, Math.round(spec.unitCostB * (1.08 - discount * 0.5))),
      producerCountry: spec.originCountry,
    };
  }
  return {
    canBuildDirectly: false,
    isAllyLicensed: false,
    finalCostB: Math.round(spec.unitCostB * 1.12),
    producerCountry: spec.originCountry,
  };
}
