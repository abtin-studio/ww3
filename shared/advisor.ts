import {
  INFRASTRUCTURE_CATALOG,
  SPACE_CONSTELLATIONS_CATALOG,
  UPGRADE_TRACKS,
  WEAPONS_CATALOG,
} from './realWorldData.js';
import {
  ChokepointId,
  ChokepointState,
  CountryId,
  CountryState,
  CovertOpType,
  DifficultyLevel,
  EmergencyActionKind,
  GameRoomState,
  InfrastructureType,
  MilitaryOpType,
  MinorNationOpType,
  MinorNationState,
  RequestLeverageMode,
  SpaceConstellationId,
  StrategicRequestKind,
  UpgradeTrack,
  WorldMarket,
} from './types.js';

export interface MilitarySummary {
  attackScore: number;
  defenseScore: number;
  airPower: number;
  missileDronePower: number;
  navalPower: number;
  groundPower: number;
  interceptRate: number; // 8 - 94%
  stealthPower: number;
  hypersonicUnits: number;
  antiBallisticUnits: number;
  submarineUnits: number;
  carrierUnits: number;
  fighterCount: number;
  missileCount: number;
  droneCount: number;
  navalCount: number;
  armorCount: number;
  totalUnits: number;
  veteranStars: number; // 0 - 5
}

export function getConstellationLevel(country: CountryState, id: SpaceConstellationId): number {
  return country.constellations?.[id] || 0;
}

export function getTotalConstellationSatellites(country: CountryState): number {
  if (!country.constellations) return country.orbitalSatellites || 0;
  return (
    (country.constellations.RECON_OPTICAL || 0) +
    (country.constellations.GNSS_NAVI || 0) +
    (country.constellations.SBIRS_SHIELD || 0) +
    (country.constellations.SATCOM_EW || 0)
  );
}

export function computeCountryMilitary(country: CountryState): MilitarySummary {
  let rawAttack = 0;
  let rawDefense = 0;
  const gnssLv = getConstellationLevel(country, 'GNSS_NAVI');
  const sbirsLv = getConstellationLevel(country, 'SBIRS_SHIELD');
  const satcomLv = getConstellationLevel(country, 'SATCOM_EW');
  const spaceDocLv = country.upgrades.SPACE_ORBITAL || 0;

  let airPower = 8 + country.upgrades.AEROSPACE * 12 + gnssLv * 10;
  let missileDronePower = 10 + country.upgrades.AEROSPACE * 13 + gnssLv * 12 + spaceDocLv * 5;
  let navalPower = 8 + country.upgrades.NAVAL_POWER * 14;
  let groundPower = 12 + country.upgrades.ARMOR_LAND * 14;
  let interceptBonus =
    country.infrastructure.RADAR_NETWORK * 3.5 +
    country.upgrades.AIR_DEFENSE * 6 +
    sbirsLv * 11 +
    satcomLv * 5 +
    (country.upgrades.AIR_DEFENSE >= 10 ? 12 : 0) +
    (spaceDocLv >= 10 ? 12 : 0);
  let stealthPower = 0;

  let hypersonicUnits = 0;
  let antiBallisticUnits = 0;
  let submarineUnits = 0;
  let carrierUnits = 0;
  let fighterCount = 0;
  let missileCount = 0;
  let droneCount = 0;
  let navalCount = 0;
  let armorCount = 0;
  let totalUnits = 0;

  for (const [weaponId, count] of Object.entries(country.weapons)) {
    if (!count || count <= 0) continue;
    const spec = WEAPONS_CATALOG[weaponId];
    if (!spec) continue;
    totalUnits += count;
    rawAttack += spec.attackPower * count;
    rawDefense += spec.defensePower * count;
    interceptBonus += spec.interceptBonus * count;

    if (spec.stealth >= 75) {
      stealthPower += (spec.stealth / 20) * count;
    }
    if (weaponId === 'fattah2' || weaponId === 'iskander_kinzhal' || weaponId === 'df21d') {
      hypersonicUnits += count;
    }
    if (
      weaponId === 'thaad' ||
      weaponId === 's400' ||
      weaponId === 'iron_dome_arrow' ||
      weaponId === 'bavar373' ||
      weaponId === 'aegis_maya'
    ) {
      antiBallisticUnits += count;
    }
    if (weaponId === 'borei_sub' || weaponId === 'astute_sub' || weaponId === 'irgc_fast_subs') {
      submarineUnits += count;
    }
    if (weaponId === 'ford_carrier' || weaponId === 'type055_fleet') {
      carrierUnits += count;
    }

    if (spec.category === 'FIGHTER' || spec.category === 'BOMBER') {
      fighterCount += count;
      airPower += spec.attackPower * count * 1.2;
    } else if (spec.category === 'MISSILE' || spec.category === 'STRATEGIC') {
      missileCount += count;
      missileDronePower += spec.attackPower * count * 1.15;
    } else if (spec.category === 'DRONE') {
      droneCount += count;
      missileDronePower += spec.attackPower * count;
      airPower += spec.attackPower * count * 0.35;
    } else if (spec.category === 'NAVAL') {
      navalCount += count;
      navalPower += spec.attackPower * count * 1.25;
      if (weaponId === 'ford_carrier') airPower += 28 * count;
    } else if (spec.category === 'ARMOR') {
      armorCount += count;
      groundPower += spec.attackPower * count * 1.35;
    }
  }

  const veteranStars = Math.min(5, Math.floor(country.militaryXp / 35));
  const fuelReadiness = country.oilReserve <= 0 ? 0.62 : country.oilReserve < 35 ? 0.84 : 1;
  const devastationPenalty = Math.max(0.55, 1 - country.devastation * 0.004);
  const cmdFactor = 1 + country.commanderBuff / 100;

  const atkMult =
    (1 +
      country.upgrades.AEROSPACE * 0.055 +
      country.upgrades.ARMOR_LAND * 0.04 +
      country.upgrades.NAVAL_POWER * 0.04 +
      gnssLv * 0.05 +
      veteranStars * 0.05 +
      country.infrastructure.AIR_MISSILE_BASE * 0.03) *
    cmdFactor *
    fuelReadiness *
    devastationPenalty;

  const defMult =
    (1 +
      country.upgrades.AIR_DEFENSE * 0.065 +
      country.upgrades.ARMOR_LAND * 0.05 +
      sbirsLv * 0.045 +
      veteranStars * 0.05) *
    cmdFactor *
    fuelReadiness *
    devastationPenalty;

  const attackScore = Math.max(10, Math.round(rawAttack * atkMult));
  const defenseScore = Math.max(10, Math.round(rawDefense * defMult));
  airPower = Math.round(airPower * cmdFactor * fuelReadiness);
  missileDronePower = Math.round(missileDronePower * cmdFactor);
  navalPower = Math.round(navalPower * (1 + country.upgrades.NAVAL_POWER * 0.08) * fuelReadiness);
  groundPower = Math.round(groundPower * (1 + country.upgrades.ARMOR_LAND * 0.08) * fuelReadiness);

  // SBIRS orbital shield prevents radar blindness even during cyber blackouts!
  const minRadarFloor = sbirsLv > 0 ? 0.56 + sbirsLv * 0.1 : 0.18;
  const radarFactor = Math.max(minRadarFloor, country.radarIntegrity / 100);
  const gridRadarFactor =
    sbirsLv >= 2
      ? 0.94
      : country.powerGrid < 40
      ? 0.72
      : country.powerGrid < 68
      ? 0.88
      : 1;

  let postureBonus = 0;
  if (country.alertPosture === 'MAX_INTERCEPT') postureBonus = 24;
  if (country.alertPosture === 'SCRAMBLE_FIGHTERS') postureBonus = 14 + Math.min(12, fighterCount * 2.5);

  const rawIntercept =
    (14 + interceptBonus * 0.66 + postureBonus + country.commanderBuff * 0.35) *
    radarFactor *
    gridRadarFactor;
  const interceptRate = Math.min(94, Math.max(8, Math.round(rawIntercept)));

  return {
    attackScore,
    defenseScore,
    airPower,
    missileDronePower,
    navalPower,
    groundPower,
    interceptRate,
    stealthPower: Math.round(stealthPower),
    hypersonicUnits,
    antiBallisticUnits,
    submarineUnits,
    carrierUnits,
    fighterCount,
    missileCount,
    droneCount,
    navalCount,
    armorCount,
    totalUnits,
    veteranStars,
  };
}

export function getMaxUpgradesPerRound(country: CountryState): number {
  const sci = country.infrastructure?.SCIENCE_ACADEMY || 0;
  if (sci >= 11 && country.upgrades.INDUSTRY >= 6) return 3;
  if (sci >= 5 || country.upgrades.INDUSTRY >= 6) return 2;
  return 1;
}

export function getMaxBuildsPerRound(country: CountryState): number {
  return 2 + Math.floor((country.upgrades.INDUSTRY || 0) / 3);
}

export function getMaxMilitaryOrdersPerRound(country: CountryState): number {
  let slots = 2;
  if (country.upgrades.AEROSPACE >= 10 || country.upgrades.ARMOR_LAND >= 10) slots += 1;
  else if (country.upgrades.AEROSPACE >= 7 && country.upgrades.ARMOR_LAND >= 7) slots += 1;
  return slots;
}

export function getMaxCovertOrdersPerRound(country: CountryState): number {
  return country.upgrades.CYBER_AI >= 10 || country.upgrades.INTELLIGENCE >= 10 ||
    (country.upgrades.CYBER_AI >= 7 && country.upgrades.INTELLIGENCE >= 7)
    ? 3
    : 2;
}

export function getMaxSpotSalesPerRound(country: CountryState): number {
  return (country.upgrades.ECONOMIC_SOVEREIGNTY || 0) >= 6 ? 3 : 2;
}

export function getDifficultyPlayerCostMult(difficulty: DifficultyLevel, isHuman: boolean): number {
  if (!isHuman) {
    return difficulty === 'EXTREME' ? 0.82 : difficulty === 'HARD' ? 0.9 : 1;
  }
  return difficulty === 'EXTREME' ? 1.26 : difficulty === 'HARD' ? 1.14 : 1;
}

export function getUpgradeNextCost(
  country: CountryState,
  track: UpgradeTrack,
  difficulty: DifficultyLevel = 'NORMAL'
): number {
  const spec = UPGRADE_TRACKS[track];
  const cur = country.upgrades[track] || 0;
  const diffMult = getDifficultyPlayerCostMult(difficulty, country.playerId !== null);
  return Math.round(spec.baseCostB * (1 + Math.pow(cur, 1.26) * 0.36) * diffMult);
}

export function getInfraNextCost(
  country: CountryState,
  type: InfrastructureType,
  difficulty: DifficultyLevel = 'NORMAL'
): { costB: number; isRebuild: boolean } {
  const spec = INFRASTRUCTURE_CATALOG[type];
  const cur = country.infrastructure[type] || 0;
  const damaged = country.damagedInfra?.[type] || 0;
  const industryDiscount = Math.min(0.32, (country.upgrades.INDUSTRY || 0) * 0.035);
  const diffMult = getDifficultyPlayerCostMult(difficulty, country.playerId !== null);

  const normalCost = Math.max(
    14,
    Math.round(spec.costB * (1 + Math.max(0, cur - 3) * 0.21) * (1 - industryDiscount) * diffMult)
  );

  if (damaged > 0) {
    return {
      costB: Math.max(9, Math.round(normalCost * 0.56)),
      isRebuild: true,
    };
  }
  return { costB: normalCost, isRebuild: false };
}

export function getConstellationUpgradeInfo(
  country: CountryState,
  constellationId: SpaceConstellationId,
  difficulty: DifficultyLevel = 'NORMAL'
): {
  currentLevel: number;
  maxLevel: number;
  costB: number;
  fuelCost: number;
  canUpgrade: boolean;
  lockedReasonFa: string | null;
} {
  const spec = SPACE_CONSTELLATIONS_CATALOG[constellationId];
  const cur = getConstellationLevel(country, constellationId);
  const diffMult = getDifficultyPlayerCostMult(difficulty, country.playerId !== null);
  if (cur >= spec.maxLevel) {
    return {
      currentLevel: cur,
      maxLevel: spec.maxLevel,
      costB: 0,
      fuelCost: 0,
      canUpgrade: false,
      lockedReasonFa: 'این منظومه فضایی به حداکثر سطح مداری (سطح ۳) رسیده است.',
    };
  }
  const nextLv = cur + 1;
  const reqDoc = spec.minSpaceDoctrineByLevel[nextLv] || 0;
  const spaceDoc = country.upgrades.SPACE_ORBITAL || 0;
  const costB = Math.round((spec.baseCostB + cur * 18) * diffMult);
  const fuelCost = 8 + cur * 2;

  if (spaceDoc < reqDoc) {
    return {
      currentLevel: cur,
      maxLevel: spec.maxLevel,
      costB,
      fuelCost,
      canUpgrade: false,
      lockedReasonFa: `برای ارتقا به سطح ${nextLv}، نیازمند دکترین «فرماندهی فضایی» سطح ${reqDoc} هستید.`,
    };
  }
  if (country.oilReserve < fuelCost) {
    return {
      currentLevel: cur,
      maxLevel: spec.maxLevel,
      costB,
      fuelCost,
      canUpgrade: false,
      lockedReasonFa: `نیازمند ${fuelCost} واحد سوخت پرتاب فضایی است.`,
    };
  }
  if (country.treasuryB < costB) {
    return {
      currentLevel: cur,
      maxLevel: spec.maxLevel,
      costB,
      fuelCost,
      canUpgrade: false,
      lockedReasonFa: `بودجه کافی ندارید ($${costB}B مورد نیاز است).`,
    };
  }
  return {
    currentLevel: cur,
    maxLevel: spec.maxLevel,
    costB,
    fuelCost,
    canUpgrade: true,
    lockedReasonFa: null,
  };
}

export function getSatelliteLaunchCost(
  country: CountryState,
  difficulty: DifficultyLevel = 'NORMAL'
): number {
  return getConstellationUpgradeInfo(country, 'RECON_OPTICAL', difficulty).costB || 38;
}

export function getEmergencyActionCost(country: CountryState, kind: EmergencyActionKind): number {
  const scale = Math.max(0.85, Math.min(1.7, country.gdpB / 500));
  if (kind === 'REPAIR_GRID') return Math.round(24 * scale);
  if (kind === 'REPAIR_RADAR_CYBER') return Math.round(22 * scale);
  return Math.round(28 * scale);
}

/**
 * Tightened Spot Market Spread (v6.0 Item #5):
 * Buying emergency resources is expensive; dumping surplus on spot market yields modest wholesale rates
 * so players must negotiate bilateral contracts, manage upkeep, or build real GDP instead of farming cash!
 */
export function getGlobalSpotPrices(market: WorldMarket): {
  oilBuy50B: number;
  oilSell50B: number;
  gasBuy50B: number;
  gasSell50B: number;
  foodBuy50B: number;
  foodSell50B: number;
  waterBuy50B: number;
  waterSell50B: number;
  uraniumBuy20B: number;
} {
  const oilUnit = market.oilPriceUsd / 82;
  const buyOil = Math.max(18, Math.round(28 * oilUnit));
  const sellOil = Math.max(8, Math.round(12 * oilUnit));
  const buyGas = Math.max(15, Math.round(22 * (market.gasPriceIndex / 100)));
  const sellGas = Math.max(7, Math.round(10 * (market.gasPriceIndex / 100)));
  const buyFood = Math.max(14, Math.round(20 * (market.foodPriceIndex / 100)));
  const sellFood = Math.max(7, Math.round(9 * (market.foodPriceIndex / 100)));
  return {
    oilBuy50B: buyOil,
    oilSell50B: sellOil,
    gasBuy50B: buyGas,
    gasSell50B: sellGas,
    foodBuy50B: buyFood,
    foodSell50B: sellFood,
    waterBuy50B: 17,
    waterSell50B: 8,
    uraniumBuy20B: 34,
  };
}

export interface EconomyProjection {
  netIncomeB: number;
  grossGdpIncomeB: number;
  empireBonusIncomeB: number;
  energyExportRevenueB: number;
  infraUpkeepB: number;
  militaryUpkeepB: number;
  overextensionPenaltyB: number;
  sanctionPenaltyB: number;
  netOil: number;
  netGas: number;
  netFood: number;
  netWater: number;
  territoriesAnnexed: number;
  protectoratesCount: number;
}

export function computeEconomyProjection(
  country: CountryState,
  market: WorldMarket,
  chokepoints: Record<ChokepointId, ChokepointState>,
  minorNations: Record<string, MinorNationState> = {}
): EconomyProjection {
  let empireGdpBonus = 0;
  let empireOil = 0;
  let empireGas = 0;
  let empireFood = 0;
  let empireWater = 0;
  let territoriesAnnexed = 0;
  let protectoratesCount = 0;

  for (const m of Object.values(minorNations)) {
    if (m.conqueredBy === country.id) {
      territoriesAnnexed += 1;
      empireGdpBonus += Math.round(m.gdpB * 0.036);
      empireOil += m.oilBonus;
      empireGas += m.gasBonus;
      empireFood += m.foodBonus;
      empireWater += m.waterBonus || 4;
    } else if (m.alignedWith === country.id) {
      protectoratesCount += 1;
      empireGdpBonus += Math.round(m.gdpB * 0.015);
      empireOil += Math.round(m.oilBonus * 0.2);
    }
  }

  const refineryBoost = country.infrastructure.REFINERY * 10;
  const welfareFoodBoost = country.infrastructure.WELFARE_HUB * 10;
  const welfareWaterBoost = country.infrastructure.WELFARE_HUB * 12;

  let totalUnits = 0;
  const weaponOilUse = Object.entries(country.weapons).reduce((sum, [wId, qty]) => {
    totalUnits += qty || 0;
    const spec = WEAPONS_CATALOG[wId];
    return sum + (spec ? spec.oilUsePerRound * qty : 0);
  }, 0);

  const territoryScale = Math.max(0.35, country.integrityPct / 100);
  const devastationEconFactor = Math.max(0.3, 1 - country.devastation * 0.007);

  const oilProd = Math.round((country.oilProduction + refineryBoost) * territoryScale) + empireOil;
  const oilCons = country.oilConsumption + Math.round(weaponOilUse * 0.85);
  const netOil = oilProd - oilCons;

  const hasCleanNuclearPower = country.upgrades.NUCLEAR >= 3 || country.infrastructure.NUCLEAR_FACILITY >= 3;
  const powerPlantGasUse = hasCleanNuclearPower
    ? country.infrastructure.POWER_PLANT * 2
    : country.infrastructure.POWER_PLANT * 5;
  const gasProd = Math.round((country.gasProduction + Math.round(refineryBoost * 0.7)) * territoryScale) + empireGas;
  const netGas = gasProd - (country.gasConsumption + powerPlantGasUse);

  const foodProd = Math.round((country.foodProduction + welfareFoodBoost) * territoryScale) + empireFood;
  const netFood = foodProd - country.foodConsumption;

  const waterProd = Math.round(((country.waterProduction || 60) + welfareWaterBoost) * territoryScale) + empireWater;
  const netWater = waterProd - (country.waterConsumption || 50);

  const gridFactor = Math.max(0.34, country.powerGrid / 100);
  const approvalFactor = country.approval < 35 ? 0.62 : country.approval > 75 ? 1.06 : 0.94;
  const satcomLv = getConstellationLevel(country, 'SATCOM_EW');
  const econSovLv = country.upgrades.ECONOMIC_SOVEREIGNTY || 0;

  const doctrineIncomeBonus =
    country.upgrades.INDUSTRY * 11 +
    econSovLv * 10 +
    (country.infrastructure.SCIENCE_ACADEMY || 0) * 3 +
    satcomLv * 9;

  // Tightened Realistic Macro-Economy (v6.0 Item #5: No more easy cash!)
  const grossGdpIncomeB = Math.round(
    (country.gdpB * 0.044 * territoryScale + country.infrastructure.ARMS_FACTORY * 5 + doctrineIncomeBonus) *
      gridFactor *
      approvalFactor *
      devastationEconFactor
  );

  const oilPriceFactor = market.oilPriceUsd / 82;
  let chokepointExportMultiplier = country.maritimeBlockaded ? 0.52 : 1;
  if (
    (country.id === 'IR' || country.id === 'SA') &&
    chokepoints.HORMUZ.status === 'BLOCKADED' &&
    chokepoints.HORMUZ.controller !== country.id
  ) {
    chokepointExportMultiplier *= 0.3;
  }

  let energyExportRevenueB = 0;
  if (netOil > 0 && country.autoSellSurplus) {
    energyExportRevenueB += Math.round(netOil * 0.22 * oilPriceFactor * chokepointExportMultiplier);
  }
  if (netGas > 0 && country.autoSellSurplus) {
    energyExportRevenueB += Math.round(netGas * 0.11 * (market.gasPriceIndex / 100) * chokepointExportMultiplier);
  }
  if (country.id === 'EG' && chokepoints.SUEZ.status === 'OPEN') energyExportRevenueB += 10;
  if (country.id === 'TR' && chokepoints.BOSPHORUS.status === 'OPEN') energyExportRevenueB += 8;

  // National Infrastructure Maintenance Cost (prevents infinite free snowballs)
  const totalInfraCount = Object.values(country.infrastructure).reduce((s, v) => s + (v || 0), 0);
  const infraDiscount = country.upgrades.INDUSTRY >= 10 ? 0.7 : 1;
  const infraUpkeepB = Math.round(Math.max(0, totalInfraCount - 14) * 1.45 * infraDiscount);

  // Realistic Progressive Military Maintenance
  const baseUnitsUpkeep = Object.entries(country.weapons).reduce((acc, [wId, qty]) => {
    const spec = WEAPONS_CATALOG[wId];
    return acc + (spec ? spec.unitCostB * 0.095 * qty : 0);
  }, 6);
  const largeArmySurcharge = totalUnits > 22 ? Math.pow(totalUnits - 22, 1.38) * 2.6 : 0;
  const militaryUpkeepB = Math.round(baseUnitsUpkeep + largeArmySurcharge);

  const overextensionPenaltyB =
    (territoriesAnnexed > 2 ? (territoriesAnnexed - 2) * 16 : 0) +
    (country.treasuryB > 550 ? Math.round((country.treasuryB - 550) * 0.06) : 0);

  const rawSanctionCount = country.sanctionedBy.length;
  const econSovShield = Math.min(0.85, econSovLv * 0.09);
  const selfReliance = Math.min(
    0.88,
    econSovShield + country.allies.length * 0.09 + (country.upgrades.INDUSTRY >= 7 ? 0.14 : 0)
  );
  const sanctionRate = Math.min(0.48, rawSanctionCount * 0.1 * (1 - selfReliance));
  const sanctionPenaltyB = Math.round(
    (grossGdpIncomeB + empireGdpBonus + Math.max(0, energyExportRevenueB)) * sanctionRate
  );

  const netIncomeB =
    grossGdpIncomeB +
    empireGdpBonus +
    energyExportRevenueB -
    infraUpkeepB -
    militaryUpkeepB -
    overextensionPenaltyB -
    sanctionPenaltyB;

  return {
    netIncomeB,
    grossGdpIncomeB,
    empireBonusIncomeB: empireGdpBonus,
    energyExportRevenueB,
    infraUpkeepB,
    militaryUpkeepB,
    overextensionPenaltyB,
    sanctionPenaltyB,
    netOil,
    netGas,
    netFood,
    netWater,
    territoriesAnnexed,
    protectoratesCount,
  };
}

export interface OpChanceBreakdown {
  winPct: number;
  tracePct: number;
  canExecute: boolean;
  requirementErrorFa: string | null;
  fuelCost: number;
  factorsFa: string[];
}

export function canReachByLandOrSea(
  attacker: CountryState,
  targetCoords: [number, number],
  minorNations: Record<string, MinorNationState> = {}
): { reachable: boolean; isCloseBorder: boolean; viaSeaOrBase: boolean } {
  const directDist = Math.hypot(
    attacker.coordinates[0] - targetCoords[0],
    attacker.coordinates[1] - targetCoords[1]
  );
  if (directDist <= 29) {
    return { reachable: true, isCloseBorder: true, viaSeaOrBase: false };
  }
  for (const m of Object.values(minorNations)) {
    if (m.conqueredBy === attacker.id || m.alignedWith === attacker.id) {
      const d = Math.hypot(m.coordinates[0] - targetCoords[0], m.coordinates[1] - targetCoords[1]);
      if (d <= 22) {
        return { reachable: true, isCloseBorder: false, viaSeaOrBase: true };
      }
    }
  }
  const atkMil = computeCountryMilitary(attacker);
  if (attacker.upgrades.NAVAL_POWER >= 5 || atkMil.carrierUnits >= 1) {
    return { reachable: true, isCloseBorder: false, viaSeaOrBase: true };
  }
  return { reachable: false, isCloseBorder: false, viaSeaOrBase: false };
}

export function evaluateMilitaryOpDetails(
  attacker: CountryState,
  defender: CountryState,
  opType: MilitaryOpType,
  currentRound = 1,
  minorNations: Record<string, MinorNationState> = {}
): OpChanceBreakdown {
  const atk = computeCountryMilitary(attacker);
  const def = computeCountryMilitary(defender);
  const factorsFa: string[] = [];

  const gnssLv = getConstellationLevel(attacker, 'GNSS_NAVI');
  const reconSatLv = getConstellationLevel(attacker, 'RECON_OPTICAL');
  const defSbirsLv = getConstellationLevel(defender, 'SBIRS_SHIELD');
  const defSatcomLv = getConstellationLevel(defender, 'SATCOM_EW');
  const fuelDiscountMult = Math.max(0.7, 1 - gnssLv * 0.1);
  const calcFuel = (base: number) => Math.max(2, Math.round(base * fuelDiscountMult));

  if (opType === 'LIBERATION_COUNTEROFFENSIVE') {
    const fuelCost = calcFuel(12);
    const canExec = atk.armorCount + atk.fighterCount >= 1 && attacker.oilReserve >= fuelCost;
    const ratio = (atk.groundPower + atk.airPower * 0.5) / Math.max(40, def.groundPower * 0.75);
    factorsFa.push('+۱۸٪ انگیزه مقاومت ملی در خاک میهن');
    return {
      winPct: Math.min(92, Math.max(25, Math.round(ratio * 48 + 18))),
      tracePct: 100,
      canExecute: canExec,
      requirementErrorFa: !canExec ? `نیازمند حداقل ۱ لشکر زرهی/جنگنده و ${fuelCost} واحد سوخت نفت است.` : null,
      fuelCost,
      factorsFa,
    };
  }

  const intel = attacker.knownIntel[defender.id];
  const intelAge = intel ? Math.max(0, currentRound - intel.round) : 99;
  const satBonus = reconSatLv * 7 + gnssLv * 6;
  const reconBonus = (intelAge <= 2 ? 12 : intelAge <= 5 ? 6 : 0) + satBonus;
  if (reconBonus > 0) factorsFa.push(`+${reconBonus}٪ اشراف اپتیکال و ناوبری مداری`);

  if (opType === 'ASAT_STRIKE') {
    const fuelCost = calcFuel(8);
    const targetSats = getTotalConstellationSatellites(defender);
    if (targetSats <= 0) {
      return {
        winPct: 0,
        tracePct: 100,
        canExecute: false,
        requirementErrorFa: 'کشور هدف هیچ ماهواره فعالی در مدار زمین ندارد!',
        fuelCost,
        factorsFa: ['بدون هدف مداری'],
      };
    }
    if (attacker.upgrades.SPACE_ORBITAL < 2 && attacker.upgrades.AEROSPACE < 3 && atk.missileCount < 2) {
      return {
        winPct: 0,
        tracePct: 100,
        canExecute: false,
        requirementErrorFa: 'نیازمند دکترین فرماندهی فضایی سطح ۲ یا هوافضای سطح ۳ است!',
        fuelCost,
        factorsFa: ['فاقد موشک ضدماهواره'],
      };
    }
    const raw =
      48 +
      (attacker.upgrades.SPACE_ORBITAL || 0) * 6 +
      attacker.upgrades.AEROSPACE * 3.5 +
      reconSatLv * 5 -
      (defender.upgrades.SPACE_ORBITAL || 0) * 4 -
      defender.upgrades.CYBER_AI * 2.5;
    factorsFa.push(`+${(attacker.upgrades.SPACE_ORBITAL || 0) * 6}٪ توان جنگ مداری`);
    return {
      winPct: Math.min(91, Math.max(20, Math.round(raw))),
      tracePct: 100,
      canExecute: attacker.oilReserve >= fuelCost,
      requirementErrorFa: attacker.oilReserve < fuelCost ? 'کمبود سوخت پرتاب مداری!' : null,
      fuelCost,
      factorsFa,
    };
  }

  const seadOrAirQueued = attacker.orders.some(
    (o) =>
      o.targetCountry === defender.id &&
      (o.militaryType === 'AIR_SORTIE' || o.covertType === 'BLACKOUT_VIRUS')
  );
  const comboBonus = seadOrAirQueued && opType !== 'AIR_SORTIE' ? 16 : 0;
  if (comboBonus > 0) factorsFa.push(`+${comboBonus}٪ ترکیب با سرکوب رادار`);

  if (opType === 'AIR_SORTIE') {
    const fuelCost = calcFuel(12);
    if (atk.fighterCount < 1) {
      return {
        winPct: 0,
        tracePct: 100,
        canExecute: false,
        requirementErrorFa: 'نیازمند حداقل ۱ اسکادران جنگنده یا بمب‌افکن در ارتش شماست!',
        fuelCost,
        factorsFa: ['فاقد اسکادران هوایی'],
      };
    }
    const stealthBypass = Math.min(26, Math.round(atk.stealthPower * 1.6));
    if (stealthBypass > 6) factorsFa.push(`+${stealthBypass}٪ رادارگریزی نسل ۵`);
    factorsFa.push(`+${Math.min(28, atk.fighterCount * 5)}٪ قدرت اسکادران هوایی`);
    factorsFa.push(`-${Math.round(def.interceptRate * 0.48)}٪ پدافند و رهگیر هدف`);
    const raw =
      46 +
      Math.min(28, atk.fighterCount * 5) +
      stealthBypass +
      attacker.upgrades.AEROSPACE * 3.5 +
      (attacker.upgrades.AEROSPACE >= 6 ? 8 : 0) -
      def.interceptRate * 0.48 +
      reconBonus;
    return {
      winPct: Math.min(92, Math.max(14, Math.round(raw))),
      tracePct: 100,
      canExecute: attacker.oilReserve >= fuelCost,
      requirementErrorFa: attacker.oilReserve < fuelCost ? `نیازمند حداقل ${fuelCost} واحد ذخیره سوخت نفت!` : null,
      fuelCost,
      factorsFa,
    };
  }

  if (opType === 'MISSILE_DRONE_STRIKE') {
    const fuelCost = calcFuel(6);
    if (atk.missileCount + atk.droneCount < 1) {
      return {
        winPct: 0,
        tracePct: 100,
        canExecute: false,
        requirementErrorFa: 'نیازمند حداقل ۱ تیپ موشکی یا ناوگان پهپادی در ارتش شماست!',
        fuelCost,
        factorsFa: ['فاقد واحد موشکی/پهپادی'],
      };
    }
    const hyperBonus = Math.min(24, atk.hypersonicUnits * 8);
    if (hyperBonus > 0) factorsFa.push(`+${hyperBonus}٪ عبور موشک‌های هایپرسونیک از پدافند`);
    const droneSwarmBonus = Math.max(0, Math.min(18, atk.droneCount * 3.5) - defSatcomLv * 4);
    if (droneSwarmBonus > 0) factorsFa.push(`+${Math.round(droneSwarmBonus)}٪ اشباع پهپادی`);
    const abmPenalty = Math.min(24, def.antiBallisticUnits * 3.5 + defSbirsLv * 5);
    if (abmPenalty > 0) factorsFa.push(`-${Math.round(abmPenalty)}٪ سپر ضدبالستیک و هشدار مداری هدف`);

    const raw =
      50 +
      hyperBonus +
      droneSwarmBonus +
      atk.missileCount * 2.5 -
      def.interceptRate * 0.55 -
      abmPenalty * 0.5 +
      reconBonus +
      comboBonus;
    return {
      winPct: Math.min(93, Math.max(15, Math.round(raw))),
      tracePct: 100,
      canExecute: attacker.oilReserve >= fuelCost,
      requirementErrorFa: attacker.oilReserve < fuelCost ? 'کمبود سوخت موشکی/پهپادی!' : null,
      fuelCost,
      factorsFa,
    };
  }

  if (opType === 'NAVAL_BLOCKADE_STRIKE') {
    const fuelCost = calcFuel(14);
    if (atk.navalCount < 1) {
      return {
        winPct: 0,
        tracePct: 100,
        canExecute: false,
        requirementErrorFa: 'نیازمند حداقل ۱ ناوگان دریایی یا زیردریایی در ارتش شماست!',
        fuelCost,
        factorsFa: ['فاقد نیروی دریایی'],
      };
    }
    const subAmbush = atk.submarineUnits > 0 && def.carrierUnits > 0 ? 14 : 0;
    if (subAmbush > 0) factorsFa.push('+۱۴٪ کمین زیردریایی علیه ناو هواپیمابر');
    const navRatio = (atk.navalPower + atk.airPower * 0.2) / Math.max(30, def.navalPower + def.defenseScore * 0.22);
    factorsFa.push(`نسبت قدرت دریایی: ${navRatio.toFixed(1)} برابر`);
    const raw = navRatio * 46 + subAmbush + reconBonus * 0.7 + comboBonus * 0.5;
    return {
      winPct: Math.min(91, Math.max(15, Math.round(raw))),
      tracePct: 100,
      canExecute: attacker.oilReserve >= fuelCost,
      requirementErrorFa: attacker.oilReserve < fuelCost ? `نیازمند ${fuelCost} واحد سوخت دریایی!` : null,
      fuelCost,
      factorsFa,
    };
  }

  if (opType === 'GROUND_CONQUEST') {
    const fuelCost = calcFuel(18);
    if (atk.armorCount < 1) {
      return {
        winPct: 0,
        tracePct: 100,
        canExecute: false,
        requirementErrorFa: 'تهاجم زمینی نیازمند حداقل ۱ لشکر زرهی/تانک در ارتش شماست!',
        fuelCost,
        factorsFa: ['فاقد لشکر زرهی'],
      };
    }
    const reach = canReachByLandOrSea(attacker, defender.coordinates, minorNations);
    if (!reach.reachable) {
      return {
        winPct: 0,
        tracePct: 100,
        canExecute: false,
        requirementErrorFa:
          'مرز زمینی مستقیم ندارید! ابتدا کشور همسایه هدف را هم‌پیمان/فتح کنید یا ناو هواپیمابر / نیروی دریایی سطح ۵ بسازید.',
        fuelCost,
        factorsFa: ['عدم دسترسی لجستیکی زمینی/آبی-خاکی'],
      };
    }
    if (reach.isCloseBorder) factorsFa.push('+۱۰٪ مرز مشترک و لجستیک مستقیم زمینی');
    else factorsFa.push('عملیات آبی-خاکی / پایگاه مقدم');

    const landRatio =
      (atk.groundPower + atk.airPower * 0.35) /
      Math.max(40, def.groundPower + def.defenseScore * 0.5);
    factorsFa.push(`نسبت توان زرهی: ${landRatio.toFixed(1)} برابر`);
    const raw =
      landRatio * 44 +
      (reach.isCloseBorder ? 8 : -6) +
      reconBonus * 0.8 +
      comboBonus * 0.6 +
      (defender.devastation >= 45 ? 10 : 0);
    return {
      winPct: Math.min(89, Math.max(14, Math.round(raw))),
      tracePct: 100,
      canExecute: attacker.oilReserve >= fuelCost,
      requirementErrorFa: attacker.oilReserve < fuelCost ? `نیازمند ${fuelCost} واحد سوخت برای ستون زرهی!` : null,
      fuelCost,
      factorsFa,
    };
  }

  // NUCLEAR_STRIKE
  const fuelCost = calcFuel(10);
  const canNuke = attacker.warheads > 0;
  const sbirsIntercept = defSbirsLv * 6;
  factorsFa.push(`-${Math.round(def.interceptRate * 0.35 + def.antiBallisticUnits * 3 + sbirsIntercept)}٪ سپر ضدبالستیک و SBIRS`);
  const raw =
    84 -
    def.interceptRate * 0.35 -
    def.antiBallisticUnits * 3 -
    sbirsIntercept +
    attacker.upgrades.AEROSPACE * 2.5 +
    (attacker.upgrades.NUCLEAR >= 9 ? 10 : 0) +
    comboBonus * 0.5;
  return {
    winPct: Math.min(95, Math.max(24, Math.round(raw))),
    tracePct: 100,
    canExecute: canNuke,
    requirementErrorFa: !canNuke ? 'فاقد کلاهک هسته‌ای عملیاتی (نیازمند دکترین هسته‌ای سطح ۵)' : null,
    fuelCost,
    factorsFa,
  };
}

export function estimateMilitarySuccessPct(
  attacker: CountryState,
  defender: CountryState,
  opType: MilitaryOpType,
  currentRound = 1,
  minorNations: Record<string, MinorNationState> = {}
): number {
  return evaluateMilitaryOpDetails(attacker, defender, opType, currentRound, minorNations).winPct;
}

export function evaluateCovertOpDetails(
  attacker: CountryState,
  defender: CountryState,
  covertType: CovertOpType
): OpChanceBreakdown {
  const factorsFa: string[] = [];
  const alertPenalty = defender.securityAlertBonus || 0;
  if (alertPenalty > 0) factorsFa.push(`-${alertPenalty}٪ آماده‌باش امنیتی اخیر هدف`);
  const gridWeakness = defender.powerGrid < 55 ? 9 : 0;
  if (gridWeakness > 0) factorsFa.push(`+${gridWeakness}٪ ضعف شبکه برق هدف`);

  const reconSatLv = getConstellationLevel(attacker, 'RECON_OPTICAL');
  const atkSatcomLv = getConstellationLevel(attacker, 'SATCOM_EW');
  const defSatcomLv = getConstellationLevel(defender, 'SATCOM_EW');

  const isCyber =
    covertType === 'BLACKOUT_VIRUS' ||
    covertType === 'TREASURY_HEIST' ||
    covertType === 'STUXNET_SABOTAGE';

  if (covertType === 'SAT_RECON') {
    const raw =
      66 +
      attacker.upgrades.INTELLIGENCE * 4.5 +
      reconSatLv * 8 +
      (attacker.upgrades.SPACE_ORBITAL || 0) * 3 -
      defender.upgrades.AIR_DEFENSE * 2.2 -
      alertPenalty * 0.4;
    const tracePct = Math.min(
      45,
      Math.max(5, Math.round(12 + defender.upgrades.CYBER_AI * 3 - attacker.upgrades.INTELLIGENCE * 2))
    );
    factorsFa.push(`+${attacker.upgrades.INTELLIGENCE * 4 + reconSatLv * 8}٪ اشراف اطلاعاتی و اپتیکال`);
    return {
      winPct: Math.min(96, Math.max(35, Math.round(raw))),
      tracePct,
      canExecute: true,
      requirementErrorFa: null,
      fuelCost: 0,
      factorsFa,
    };
  }

  if (isCyber) {
    const myCyber =
      attacker.cyberShield * 0.5 +
      attacker.upgrades.CYBER_AI * 8.5 +
      attacker.infrastructure.CYBER_HQ * 3 +
      atkSatcomLv * 6;
    const defCyber =
      defender.cyberShield * 0.5 +
      defender.upgrades.CYBER_AI * 7.5 +
      defender.infrastructure.CYBER_HQ * 2.8 +
      defSatcomLv * 6;
    const diff = Math.round((myCyber - defCyber) * 0.85);
    factorsFa.push(`${diff >= 0 ? `+${diff}` : diff}٪ توازن قدرت سایبری و مداری`);

    const difficultyMod = covertType === 'STUXNET_SABOTAGE' ? -6 : 0;
    const winPct = Math.min(
      91,
      Math.max(16, Math.round(50 + diff + gridWeakness + difficultyMod - alertPenalty * 0.7))
    );

    const hasForensics = defender.upgrades.CYBER_AI >= 4 || defender.infrastructure.CYBER_HQ >= 4;
    const rawTrace = hasForensics
      ? 34 + defender.upgrades.CYBER_AI * 6 + defender.infrastructure.CYBER_HQ * 3 - attacker.upgrades.CYBER_AI * 5
      : 8 + defender.upgrades.CYBER_AI * 3 - attacker.upgrades.CYBER_AI * 3;
    const tracePct = Math.min(85, Math.max(5, Math.round(rawTrace)));
    return { winPct, tracePct, canExecute: true, requirementErrorFa: null, fuelCost: 0, factorsFa };
  }

  const mySpy = attacker.intelLevel * 4.5 + attacker.upgrades.INTELLIGENCE * 8.5 + reconSatLv * 5;
  const defSpy =
    defender.intelLevel * 4.5 +
    defender.upgrades.INTELLIGENCE * 7.8 +
    defender.infrastructure.CYBER_HQ * 1.8;
  const diff = Math.round((mySpy - defSpy) * 0.9);
  factorsFa.push(`${diff >= 0 ? `+${diff}` : diff}٪ توازن سرویس اطلاعاتی`);

  const targetHardness =
    covertType === 'ASSASSINATE_MINISTER'
      ? -8
      : covertType === 'ASSASSINATE_COMMANDER'
      ? -5
      : covertType === 'ASSASSINATE_SCIENTIST'
      ? -3
      : covertType === 'PROXY_INSURGENCY'
      ? 6
      : 2;

  const winPct = Math.min(
    90,
    Math.max(16, Math.round(48 + diff + targetHardness + (defender.devastation >= 40 ? 8 : 0) - alertPenalty))
  );

  const hasCounterIntel = defender.upgrades.INTELLIGENCE >= 4 || defender.intelLevel >= 8;
  const proxyStealthBonus = covertType === 'PROXY_INSURGENCY' ? -14 : 0;
  const rawTrace = hasCounterIntel
    ? 38 + defender.upgrades.INTELLIGENCE * 6 + alertPenalty - attacker.upgrades.INTELLIGENCE * 5 + proxyStealthBonus
    : 10 + defender.upgrades.INTELLIGENCE * 3 - attacker.upgrades.INTELLIGENCE * 3 + proxyStealthBonus;
  const tracePct = Math.min(85, Math.max(5, Math.round(rawTrace)));

  return { winPct, tracePct, canExecute: true, requirementErrorFa: null, fuelCost: 0, factorsFa };
}

export function estimateCovertSuccessPct(
  attacker: CountryState,
  defender: CountryState,
  covertType: CovertOpType
): number {
  return evaluateCovertOpDetails(attacker, defender, covertType).winPct;
}

/**
 * Renamed & Balanced False-Flag Diplomatic Sabotage (v6.0 Item #3):
 * "عملیات فریب و بحران‌سازی دیپلماتیک (پرچم دروغین)"
 * - Costs $32B + 1 covert operation quota + pair cooldown of 3 rounds
 * - Scales realistically against existing trust between Target & Third Country
 */
export function evaluateFalseFlagSabotageChance(
  actor: CountryState,
  target: CountryState,
  third: CountryState,
  currentRound: number
): {
  winPct: number;
  exposureRiskPct: number;
  costB: number;
  currentPairRel: number;
  expectedRelDrop: number;
  canExecute: boolean;
  errorFa: string | null;
  factorsFa: string[];
} {
  const costB = 32;
  const currentPairRel = target.relations[third.id] ?? 0;
  const pairKey = [target.id, third.id].sort().join('-');
  const cooldownUntil = actor.sabotageCooldowns?.[pairKey] || 0;
  const maxCovert = getMaxCovertOrdersPerRound(actor);

  const factorsFa: string[] = [];
  const myIntel = actor.intelLevel * 4 + actor.upgrades.INTELLIGENCE * 8 + actor.upgrades.CYBER_AI * 3;
  const pairCounterIntel =
    Math.max(target.intelLevel, third.intelLevel) * 3.8 +
    Math.max(target.upgrades.INTELLIGENCE, third.upgrades.INTELLIGENCE) * 7.2;

  const intelEdge = Math.round((myIntel - pairCounterIntel) * 0.75);
  factorsFa.push(`${intelEdge >= 0 ? `+${intelEdge}` : intelEdge}٪ برتری سرویس اطلاعاتی بر ضدجاسوسی دو کشور`);

  // Historic allies (+75) are much harder to fool than suspicious neutrals (+10)
  const trustResistance =
    target.allies.includes(third.id)
      ? 24
      : currentPairRel >= 60
      ? 16
      : currentPairRel >= 25
      ? 8
      : currentPairRel <= -25
      ? -10
      : 0;
  if (trustResistance > 0) {
    factorsFa.push(`-${trustResistance}٪ اعتماد عمیق و کانال امنیتی مشترک بین دو کشور`);
  } else if (trustResistance < 0) {
    factorsFa.push(`+${Math.abs(trustResistance)}٪ بی‌اعتمادی و تنش قبلی بین دو کشور`);
  }

  const winPct = Math.min(82, Math.max(14, Math.round(46 + intelEdge - trustResistance)));
  const exposureRiskPct = Math.min(
    84,
    Math.max(12, Math.round(36 + (pairCounterIntel - myIntel) * 0.65 + (target.allies.includes(third.id) ? 12 : 0)))
  );
  const expectedRelDrop = target.allies.includes(third.id) ? 26 : 34;

  let errorFa: string | null = null;
  if (target.id === third.id || target.id === actor.id || third.id === actor.id) {
    errorFa = 'دو کشور متمایز خارج از کشور خود انتخاب کنید.';
  } else if (actor.upgrades.INTELLIGENCE < 2) {
    errorFa = 'نیازمند دکترین «سازمان اطلاعات» حداقل سطح ۲ است.';
  } else if (actor.covertOrdersUsedThisRound >= maxCovert) {
    errorFa = `سهمیه عملیات مخفی این ماه شما (${maxCovert}/${maxCovert}) تکمیل شده است.`;
  } else if (cooldownUntil > currentRound) {
    errorFa = `سرویس‌های امنیتی این دو کشور هوشیارند (قابل تکرار از ماه ${cooldownUntil}).`;
  } else if (currentPairRel <= -85 && !target.allies.includes(third.id)) {
    errorFa = 'روابط این دو کشور هم‌اکنون در اوج خصومت کامل است!';
  } else if (actor.treasuryB < costB) {
    errorFa = `نیازمند $${costB}B بودجه مخفی عملیات است.`;
  }

  return {
    winPct,
    exposureRiskPct,
    costB,
    currentPairRel,
    expectedRelDrop,
    canExecute: errorFa === null,
    errorFa,
    factorsFa,
  };
}

/**
 * Smart Comprehensive Strategic Requests Evaluator (v6.0 Item #4):
 * Never trivial! Weighs bilateral relations, 3rd-country rivalry/alliance, military deterrence,
 * chokepoint ownership, offered financial incentive, and 1-request-per-target monthly cap.
 */
export function evaluateStrategicRequestChance(
  actor: CountryState,
  target: CountryState,
  kind: StrategicRequestKind,
  leverage: RequestLeverageMode,
  offeredCashB: number,
  chokepoints: Record<ChokepointId, ChokepointState>,
  thirdCountry?: CountryState | null,
  chokepointId?: ChokepointId
): {
  acceptPct: number;
  canSend: boolean;
  errorFa: string | null;
  factorsFa: string[];
} {
  const factorsFa: string[] = [];
  const rel = target.relations[actor.id] ?? 0;
  const actorMil = computeCountryMilitary(actor);
  const targetMil = computeCountryMilitary(target);
  const powerRatio = (actorMil.attackScore + actor.warheads * 25) / Math.max(40, targetMil.defenseScore + target.warheads * 22);

  if ((actor.requestsSentToThisRound || []).includes(target.id)) {
    return {
      acceptPct: 0,
      canSend: false,
      errorFa: `در این ماه قبلاً یک درخواست رسمی برای ${target.nameFa} ارسال کرده‌اید.`,
      factorsFa: [],
    };
  }
  if (offeredCashB > 0 && actor.treasuryB < offeredCashB) {
    return {
      acceptPct: 0,
      canSend: false,
      errorFa: `خزانه شما برای پرداخت مشوق $${offeredCashB}B کافی نیست.`,
      factorsFa: [],
    };
  }

  let score = 26;

  if (leverage === 'DIPLOMATIC_INCENTIVE') {
    const relMod = Math.round(rel * 0.42);
    score += relMod;
    factorsFa.push(`${relMod >= 0 ? `+${relMod}` : relMod}٪ سطح روابط دیپلماتیک فعلی (${rel})`);
    if (target.allies.includes(actor.id) || target.secretAllies.includes(actor.id)) {
      score += 18;
      factorsFa.push('+۱۸٪ تعهد هم‌پیمانی راهبردی');
    }
    const cashBonus = Math.min(34, Math.round(offeredCashB * 0.42));
    if (cashBonus > 0) {
      score += cashBonus;
      factorsFa.push(`+${cashBonus}٪ بسته مشوق مالی ($${offeredCashB}B)`);
    }
  } else {
    // COERCIVE_PRESSURE
    const detBonus = Math.min(44, Math.max(-28, Math.round((powerRatio - 1.05) * 34)));
    score += detBonus;
    factorsFa.push(`${detBonus >= 0 ? `+${detBonus}` : detBonus}٪ نسبت بازدارندگی نظامی (${powerRatio.toFixed(1)}x)`);
    if (target.isUNVetoMember || target.aiPersonality === 'SUPERPOWER') {
      score -= 22;
      factorsFa.push('-۲۲٪ مقاومت ابرقدرت‌ها در برابر تهدید و اولتیماتوم');
    }
    if (target.devastation >= 35) {
      score += 14;
      factorsFa.push('+۱۴٪ فرسودگی و فشار بحران داخلی هدف');
    }
  }

  // Specific Request Feasibility & Geopolitical Logic
  if (kind === 'OPEN_CHOKEPOINT' || kind === 'BLOCKADE_CHOKEPOINT') {
    const cp = chokepointId ? chokepoints[chokepointId] : undefined;
    if (!cp || cp.controller !== target.id) {
      return {
        acceptPct: 0,
        canSend: false,
        errorFa: `${target.nameFa} کنترل‌کننده مستقیم این تنگه نیست!`,
        factorsFa: [],
      };
    }
    if (kind === 'BLOCKADE_CHOKEPOINT') {
      score -= 18;
      factorsFa.push('-۱۸٪ هزینه سنگین بستن آبراه بین‌المللی برای کشور کنترل‌کننده');
    } else if (cp.status === 'OPEN') {
      return {
        acceptPct: 0,
        canSend: false,
        errorFa: `${cp.nameFa} هم‌اکنون کاملاً باز است!`,
        factorsFa: [],
      };
    }
  }

  if (kind === 'JOINT_MILITARY_STRIKE' || kind === 'JOINT_CYBER_SABOTAGE' || kind === 'IMPOSE_SANCTION') {
    if (!thirdCountry || thirdCountry.id === actor.id || thirdCountry.id === target.id) {
      return {
        acceptPct: 0,
        canSend: false,
        errorFa: 'کشور سوم هدف را به درستی انتخاب کنید.',
        factorsFa: [],
      };
    }
    const targetToThirdRel = target.relations[thirdCountry.id] ?? 0;
    if (target.allies.includes(thirdCountry.id) || target.secretAllies.includes(thirdCountry.id)) {
      score -= 55;
      factorsFa.push(`-۵۵٪ ${thirdCountry.nameFa} متحد رسمی ${target.nameFa} است!`);
    } else if (targetToThirdRel <= -35 || target.rivals.includes(thirdCountry.id)) {
      score += 24;
      factorsFa.push(`+۲۴٪ دشمنی مشترک ${target.nameFa} با ${thirdCountry.nameFa}`);
    } else if (targetToThirdRel >= 25) {
      score -= 24;
      factorsFa.push(`-۲۴٪ روابط حسنه ${target.nameFa} با ${thirdCountry.nameFa}`);
    }
    if (kind === 'JOINT_MILITARY_STRIKE') {
      score -= 18;
      factorsFa.push('-۱۸٪ ریسک ورود مستقیم به جنگ نظامی');
    } else if (kind === 'JOINT_CYBER_SABOTAGE') {
      score -= 8;
      factorsFa.push('-۸٪ حساسیت عملیات سایبری مشترک');
    }
  }

  if (kind === 'LIFT_SANCTION_ON_ME') {
    if (!actor.sanctionedBy.includes(target.id)) {
      return {
        acceptPct: 0,
        canSend: false,
        errorFa: `${target.nameFa} تحریمی علیه کشور شما اعمال نکرده است.`,
        factorsFa: [],
      };
    }
    score -= 10;
  }

  if (kind === 'ECONOMIC_AID') {
    if (target.treasuryB < 110) {
      score -= 35;
      factorsFa.push('-۳۵٪ محدودیت بودجه خزانه کشور مقابل');
    } else {
      score -= 14;
    }
    if (leverage === 'COERCIVE_PRESSURE') {
      score -= 10;
      factorsFa.push('-۱۰٪ مقاومت در برابر باج‌گیری مالی');
    }
  }

  if (kind === 'FORM_FRIENDSHIP') {
    if (target.allies.includes(actor.id)) {
      return {
        acceptPct: 0,
        canSend: false,
        errorFa: `شما هم‌اکنون متحد رسمی ${target.nameFa} هستید.`,
        factorsFa: [],
      };
    }
    if (leverage === 'COERCIVE_PRESSURE') {
      score -= 30;
      factorsFa.push('-۳۰٪ دوستی با تهدید نظامی شکل نمی‌گیرد!');
    } else {
      score += 10;
    }
  }

  const acceptPct = Math.min(93, Math.max(4, Math.round(score)));
  return { acceptPct, canSend: true, errorFa: null, factorsFa };
}

export function evaluateMinorOpDetails(
  attacker: CountryState,
  minor: MinorNationState,
  opType: MinorNationOpType,
  countries?: Record<CountryId, CountryState>,
  allMinors?: Record<string, MinorNationState>
): { winPct: number; canExecute: boolean; errorFa: string | null; expectedProgressPct: number } {
  const mil = computeCountryMilitary(attacker);
  const protector = minor.conqueredBy
    ? countries?.[minor.conqueredBy]
    : minor.alignedWith
    ? countries?.[minor.alignedWith]
    : null;
  const protectorBonus =
    protector && protector.id !== attacker.id ? computeCountryMilitary(protector).defenseScore * 0.35 : 0;
  const effectiveGarrison = minor.garrisonPower + protectorBonus;

  if (opType === 'CONQUER_ANNEX') {
    if (mil.armorCount < 1) {
      return {
        winPct: 0,
        canExecute: false,
        errorFa: 'برای لشکرکشی زمینی حداقل ۱ لشکر زرهی/تانک نیاز دارید!',
        expectedProgressPct: 0,
      };
    }
    const reach = canReachByLandOrSea(attacker, minor.coordinates, allMinors || {});
    if (!reach.reachable) {
      return {
        winPct: 0,
        canExecute: false,
        errorFa: 'مسیر زمینی یا ناوگان آبی-خاکی دوربرد (نیروی دریایی سطح ۵ / ناو هواپیمابر) برای اعزام ارتش به این منطقه ندارید!',
        expectedProgressPct: 0,
      };
    }
    const ratio = (mil.groundPower + mil.airPower * 0.45 + mil.navalPower * 0.2) / Math.max(50, effectiveGarrison);
    const winPct = Math.min(91, Math.max(14, Math.round(ratio * 44 + (reach.isCloseBorder ? 8 : -5))));
    const armorBoost = attacker.upgrades.ARMOR_LAND >= 6 ? 12 : 0;
    const expectedProgressPct =
      (minor.garrisonPower >= 165 ? 38 : minor.garrisonPower >= 120 ? 50 : 60) + armorBoost;
    return {
      winPct,
      canExecute: attacker.oilReserve >= 12,
      errorFa: attacker.oilReserve < 12 ? 'کمبود ۱۲ واحد سوخت نفت!' : null,
      expectedProgressPct,
    };
  }

  const spyPower = attacker.intelLevel * 9 + attacker.upgrades.INTELLIGENCE * 14;
  const winPct = Math.min(88, Math.max(16, Math.round(34 + (spyPower - effectiveGarrison * 0.55) * 0.6)));
  return { winPct, canExecute: true, errorFa: null, expectedProgressPct: 0 };
}

export function estimateMinorOpSuccessPct(
  attacker: CountryState,
  minor: MinorNationState,
  opType: MinorNationOpType,
  countries?: Record<CountryId, CountryState>,
  allMinors?: Record<string, MinorNationState>
): number {
  return evaluateMinorOpDetails(attacker, minor, opType, countries, allMinors).winPct;
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
    | { type: 'EMERGENCY_ACTION'; emergencyKind: EmergencyActionKind }
    | { type: 'SPOT_TRADE'; resource: 'OIL' | 'FOOD' | 'WATER'; mode: 'BUY' | 'SELL' }
    | { type: 'OPEN_COUNTRY_DRAWER'; targetCountry: CountryId };
}

export function getSmartCabinetAdvice(room: GameRoomState, countryId: CountryId): CabinetSuggestion[] {
  const c = room.countries[countryId];
  if (!c || c.isEliminated) return [];
  const spot = getGlobalSpotPrices(room.market);
  const suggestions: CabinetSuggestion[] = [];
  const maxBuilds = getMaxBuildsPerRound(c);
  const maxUps = getMaxUpgradesPerRound(c);
  const canBuildMore = c.buildsUsedThisRound < maxBuilds;

  if (c.devastation >= 45 || c.approval < 38) {
    const eCost = getEmergencyActionCost(c, 'NATIONAL_RELIEF');
    if (c.treasuryB >= eCost) {
      suggestions.push({
        id: 'adv-emergency-relief',
        ministerFa: '🚨 شورای عالی امنیت ملی',
        urgency: 'HIGH',
        titleFa: `خطر سقوط کابینه! (رضایت ${c.approval}٪ | ویرانی ${c.devastation}٪)`,
        subtitleFa: 'بسته امداد فوری +۱۴٪ رضایت مردم و -۲۰٪ بحران ویرانی ایجاد می‌کند.',
        buttonLabelFa: `امداد اضطراری ($${eCost}B)`,
        quickAction: { type: 'EMERGENCY_ACTION', emergencyKind: 'NATIONAL_RELIEF' },
      });
    }
  }

  if (c.foodReserve < 45 && c.treasuryB >= spot.foodBuy50B) {
    suggestions.push({
      id: 'adv-buy-food',
      ministerFa: 'وزیر جهاد کشاورزی',
      urgency: 'HIGH',
      titleFa: `ذخیره غلات و غذا (${c.foodReserve}) رو به اتمام است!`,
      subtitleFa: 'کمبود غذا رضایت مردم را به شدت کاهش می‌دهد؛ همین الان ۵۰ واحد غذا بخرید.',
      buttonLabelFa: `خرید ۵۰ غذا ($${spot.foodBuy50B}B)`,
      quickAction: { type: 'SPOT_TRADE', resource: 'FOOD', mode: 'BUY' },
    });
  } else if ((c.waterReserve || 0) < 45 && c.treasuryB >= spot.waterBuy50B) {
    suggestions.push({
      id: 'adv-buy-water',
      ministerFa: 'وزیر نیرو و آب',
      urgency: 'HIGH',
      titleFa: `ذخیره آب کشور (${c.waterReserve}) بحرانی است!`,
      subtitleFa: 'با ۱ کلیک ذخیره آب اضطراری تامین کنید یا مجتمع شیرین‌سازی آب بسازید.',
      buttonLabelFa: `تامین ۵۰ آب ($${spot.waterBuy50B}B)`,
      quickAction: { type: 'SPOT_TRADE', resource: 'WATER', mode: 'BUY' },
    });
  }

  if (c.powerGrid < 68) {
    const pInfo = getInfraNextCost(c, 'POWER_PLANT', room.settings.difficulty);
    if (
      canBuildMore &&
      c.infrastructure.POWER_PLANT < INFRASTRUCTURE_CATALOG.POWER_PLANT.maxLevel &&
      c.treasuryB >= pInfo.costB
    ) {
      suggestions.push({
        id: 'adv-power',
        ministerFa: 'وزیر نیرو',
        urgency: 'HIGH',
        titleFa: pInfo.isRebuild
          ? `بازسازی نیروگاه آسیب‌دیده (${c.powerGrid}٪ برق)`
          : `تقویت فوری شبکه برق (${c.powerGrid}٪)`,
        subtitleFa: 'افت برق، درآمد اقتصادی و دقت رادار پدافند را کاهش می‌دهد.',
        buttonLabelFa: `${pInfo.isRebuild ? 'بازسازی نیروگاه' : 'ساخت نیروگاه'} ($${pInfo.costB}B)`,
        quickAction: { type: 'INSTANT_INFRA', infraType: 'POWER_PLANT' },
      });
    }
  }

  if (
    suggestions.length < 3 &&
    c.sanctionedBy.length >= 2 &&
    c.upgradesUsedThisRound < maxUps &&
    c.upgrades.ECONOMIC_SOVEREIGNTY < UPGRADE_TRACKS.ECONOMIC_SOVEREIGNTY.maxLevel
  ) {
    const cost = getUpgradeNextCost(c, 'ECONOMIC_SOVEREIGNTY', room.settings.difficulty);
    if (c.treasuryB >= cost) {
      suggestions.push({
        id: 'adv-econ-sov',
        ministerFa: 'رئیس کل بانک مرکزی',
        urgency: 'HIGH',
        titleFa: `خنثی‌سازی تحریم‌ها با دکترین اقتصاد مقاومتی سطح ${c.upgrades.ECONOMIC_SOVEREIGNTY + 1}`,
        subtitleFa: 'کاهش مستقیم زیان تحریم‌ها و +$10B درآمد ارزی پایدار.',
        buttonLabelFa: `ارتقای اقتصاد مقاومتی ($${cost}B)`,
        quickAction: { type: 'INSTANT_UPGRADE', track: 'ECONOMIC_SOVEREIGNTY' },
      });
    }
  }

  if (
    suggestions.length < 3 &&
    c.upgradesUsedThisRound < maxUps &&
    c.upgrades.INDUSTRY < UPGRADE_TRACKS.INDUSTRY.maxLevel
  ) {
    const cost = getUpgradeNextCost(c, 'INDUSTRY', room.settings.difficulty);
    if (c.treasuryB >= cost) {
      suggestions.push({
        id: 'adv-industry',
        ministerFa: 'وزیر صمت و اقتصاد',
        urgency: 'OPPORTUNITY',
        titleFa: `ارتقای دکترین ابرصنعت به سطح ${c.upgrades.INDUSTRY + 1}`,
        subtitleFa: '+$11B درآمد صنعتی خالص و تخفیف ساخت تسلیحات بومی.',
        buttonLabelFa: `ارتقای ابرصنعت ($${cost}B)`,
        quickAction: { type: 'INSTANT_UPGRADE', track: 'INDUSTRY' },
      });
    }
  }

  return suggestions.slice(0, 3);
}

export function getIndigenousOrAllyWeaponCost(
  country: CountryState,
  weaponId: string,
  difficulty: DifficultyLevel = 'NORMAL'
): {
  canBuildDirectly: boolean;
  isAllyLicensed: boolean;
  lockedReasonFa: string | null;
  finalCostB: number;
  sellRefundB: number;
  producerCountry: CountryId;
} {
  const spec = WEAPONS_CATALOG[weaponId];
  if (!spec) {
    return {
      canBuildDirectly: false,
      isAllyLicensed: false,
      lockedReasonFa: 'نامعتبر',
      finalCostB: 999,
      sellRefundB: 5,
      producerCountry: 'US',
    };
  }

  const diffMult = getDifficultyPlayerCostMult(difficulty, country.playerId !== null);
  const discount = Math.min(
    0.32,
    country.infrastructure.ARMS_FACTORY * 0.022 + country.upgrades.INDUSTRY * 0.032
  );
  // Secondhand / scrap refund reduced to 50% so reselling weapons cannot print easy cash
  const sellRefundB = Math.max(4, Math.round(spec.unitCostB * 0.5));

  let lockedReasonFa: string | null = null;
  if (spec.minTrack && (country.upgrades[spec.minTrack.track] || 0) < spec.minTrack.level) {
    const trSpec = UPGRADE_TRACKS[spec.minTrack.track];
    lockedReasonFa = `نیازمند «${trSpec.nameFa}» سطح ${spec.minTrack.level}`;
  }

  if (spec.originCountry === country.id) {
    return {
      canBuildDirectly: true,
      isAllyLicensed: false,
      lockedReasonFa,
      finalCostB: Math.max(6, Math.round(spec.unitCostB * (1 - discount) * diffMult)),
      sellRefundB,
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
      lockedReasonFa,
      finalCostB: Math.max(7, Math.round(spec.unitCostB * (1.14 - discount * 0.4) * diffMult)),
      sellRefundB,
      producerCountry: spec.originCountry,
    };
  }
  return {
    canBuildDirectly: false,
    isAllyLicensed: false,
    lockedReasonFa: null,
    finalCostB: Math.round(spec.unitCostB * 1.18 * diffMult),
    sellRefundB,
    producerCountry: spec.originCountry,
  };
}
