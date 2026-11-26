import { INFRASTRUCTURE_CATALOG, UPGRADE_TRACKS, WEAPONS_CATALOG } from './realWorldData.js';
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
  interceptRate: number; // 8 - 93%
  stealthPower: number;
  fighterCount: number;
  droneCount: number;
  navalCount: number;
  armorCount: number;
  totalUnits: number;
  veteranStars: number; // 0 - 5
}

export function computeCountryMilitary(country: CountryState): MilitarySummary {
  let rawAttack = 0;
  let rawDefense = 0;
  let airPower = 10 + country.upgrades.AEROSPACE * 14;
  let missileDronePower = 12 + country.upgrades.AEROSPACE * 15;
  let navalPower = 10 + country.upgrades.NAVAL_POWER * 16;
  let groundPower = 14 + country.upgrades.ARMOR_LAND * 16;
  let interceptBonus =
    country.infrastructure.RADAR_NETWORK * 3.5 + country.upgrades.AIR_DEFENSE * 6.5;
  let stealthPower = 0;
  let fighterCount = 0;
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

    if (spec.stealth >= 70) {
      stealthPower += (spec.stealth / 22) * count;
    }
    if (spec.category === 'FIGHTER' || spec.category === 'BOMBER') {
      fighterCount += count;
      airPower += spec.attackPower * count * 1.15;
    } else if (spec.category === 'MISSILE' || spec.category === 'STRATEGIC') {
      missileDronePower += spec.attackPower * count * 1.1;
    } else if (spec.category === 'DRONE') {
      droneCount += count;
      missileDronePower += spec.attackPower * count;
      airPower += spec.attackPower * count * 0.4;
    } else if (spec.category === 'NAVAL') {
      navalCount += count;
      navalPower += spec.attackPower * count * 1.25;
    } else if (spec.category === 'ARMOR') {
      armorCount += count;
      groundPower += spec.attackPower * count * 1.3;
    }
  }

  const veteranStars = Math.min(5, Math.floor(country.militaryXp / 35));
  const fuelReadiness = country.oilReserve <= 0 ? 0.68 : country.oilReserve < 30 ? 0.86 : 1;
  const devastationPenalty = Math.max(0.55, 1 - country.devastation * 0.004);
  const cmdFactor = 1 + country.commanderBuff / 100;

  const atkMult =
    (1 +
      country.upgrades.AEROSPACE * 0.06 +
      country.upgrades.ARMOR_LAND * 0.04 +
      country.upgrades.NAVAL_POWER * 0.04 +
      veteranStars * 0.05 +
      country.infrastructure.AIR_MISSILE_BASE * 0.03) *
    cmdFactor *
    fuelReadiness *
    devastationPenalty;

  const defMult =
    (1 +
      country.upgrades.AIR_DEFENSE * 0.07 +
      country.upgrades.ARMOR_LAND * 0.05 +
      veteranStars * 0.05) *
    cmdFactor *
    fuelReadiness *
    devastationPenalty;

  const attackScore = Math.max(10, Math.round(rawAttack * atkMult));
  const defenseScore = Math.max(10, Math.round(rawDefense * defMult));
  airPower = Math.round(airPower * cmdFactor * fuelReadiness);
  missileDronePower = Math.round(missileDronePower * cmdFactor);
  navalPower = Math.round(navalPower * (1 + country.upgrades.NAVAL_POWER * 0.09) * fuelReadiness);
  groundPower = Math.round(groundPower * (1 + country.upgrades.ARMOR_LAND * 0.09) * fuelReadiness);

  const radarFactor = Math.max(0.18, country.radarIntegrity / 100);
  const gridRadarFactor = country.powerGrid < 40 ? 0.75 : country.powerGrid < 65 ? 0.9 : 1;
  let postureBonus = 0;
  if (country.alertPosture === 'MAX_INTERCEPT') postureBonus = 24;
  if (country.alertPosture === 'SCRAMBLE_FIGHTERS') postureBonus = 16 + Math.min(10, fighterCount * 2);

  const rawIntercept =
    (14 + interceptBonus * 0.68 + postureBonus + country.commanderBuff * 0.35) *
    radarFactor *
    gridRadarFactor;
  const interceptRate = Math.min(93, Math.max(8, Math.round(rawIntercept)));

  return {
    attackScore,
    defenseScore,
    airPower,
    missileDronePower,
    navalPower,
    groundPower,
    interceptRate,
    stealthPower: Math.round(stealthPower),
    fighterCount,
    droneCount,
    navalCount,
    armorCount,
    totalUnits,
    veteranStars,
  };
}

export function getMaxBuildsPerRound(country: CountryState): number {
  return 2 + Math.floor((country.upgrades.INDUSTRY || 0) / 3);
}

export function getDifficultyPlayerCostMult(difficulty: DifficultyLevel, isHuman: boolean): number {
  if (!isHuman) {
    return difficulty === 'EXTREME' ? 0.84 : difficulty === 'HARD' ? 0.92 : 1;
  }
  return difficulty === 'EXTREME' ? 1.24 : difficulty === 'HARD' ? 1.12 : 1;
}

export function getUpgradeNextCost(
  country: CountryState,
  track: UpgradeTrack,
  difficulty: DifficultyLevel = 'NORMAL'
): number {
  const spec = UPGRADE_TRACKS[track];
  const cur = country.upgrades[track] || 0;
  const diffMult = getDifficultyPlayerCostMult(difficulty, country.playerId !== null);
  return Math.round(spec.baseCostB * (1 + Math.pow(cur, 1.22) * 0.34) * diffMult);
}

export function getInfraNextCost(
  country: CountryState,
  type: InfrastructureType,
  difficulty: DifficultyLevel = 'NORMAL'
): { costB: number; isRebuild: boolean } {
  const spec = INFRASTRUCTURE_CATALOG[type];
  const cur = country.infrastructure[type] || 0;
  const damaged = country.damagedInfra?.[type] || 0;
  const industryDiscount = Math.min(0.35, (country.upgrades.INDUSTRY || 0) * 0.04);
  const diffMult = getDifficultyPlayerCostMult(difficulty, country.playerId !== null);

  const normalCost = Math.max(
    12,
    Math.round(spec.costB * (1 + Math.max(0, cur - 3) * 0.18) * (1 - industryDiscount) * diffMult)
  );

  if (damaged > 0) {
    return {
      costB: Math.max(8, Math.round(normalCost * 0.55)),
      isRebuild: true,
    };
  }
  return { costB: normalCost, isRebuild: false };
}

export function getEmergencyActionCost(country: CountryState, kind: EmergencyActionKind): number {
  const scale = Math.max(0.8, Math.min(1.6, country.gdpB / 500));
  if (kind === 'REPAIR_GRID') return Math.round(22 * scale);
  if (kind === 'REPAIR_RADAR_CYBER') return Math.round(20 * scale);
  return Math.round(25 * scale);
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
  const buyOil = Math.max(14, Math.round(26 * oilUnit));
  const sellOil = Math.max(11, Math.round(22 * oilUnit));
  const buyGas = Math.max(12, Math.round(20 * (market.gasPriceIndex / 100)));
  const sellGas = Math.max(10, Math.round(16 * (market.gasPriceIndex / 100)));
  const buyFood = Math.max(11, Math.round(18 * (market.foodPriceIndex / 100)));
  const sellFood = Math.max(9, Math.round(14 * (market.foodPriceIndex / 100)));
  return {
    oilBuy50B: buyOil,
    oilSell50B: sellOil,
    gasBuy50B: buyGas,
    gasSell50B: sellGas,
    foodBuy50B: buyFood,
    foodSell50B: sellFood,
    uraniumBuy20B: 30,
  };
}

export interface EconomyProjection {
  netIncomeB: number;
  grossGdpIncomeB: number;
  empireBonusIncomeB: number;
  energyExportRevenueB: number;
  militaryUpkeepB: number;
  sanctionPenaltyB: number;
  netOil: number;
  netGas: number;
  netFood: number;
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
  let territoriesAnnexed = 0;
  let protectoratesCount = 0;

  for (const m of Object.values(minorNations)) {
    if (m.conqueredBy === country.id) {
      territoriesAnnexed += 1;
      empireGdpBonus += Math.round(m.gdpB * 0.055);
      empireOil += m.oilBonus;
      empireGas += m.gasBonus;
      empireFood += m.foodBonus;
    } else if (m.alignedWith === country.id) {
      protectoratesCount += 1;
      empireGdpBonus += Math.round(m.gdpB * 0.022);
      empireOil += Math.round(m.oilBonus * 0.3);
    }
  }

  const refineryBoost = country.infrastructure.REFINERY * 10;
  const foodBoost = country.infrastructure.WELFARE_HUB * 9;
  const weaponOilUse = Object.entries(country.weapons).reduce((sum, [wId, qty]) => {
    const spec = WEAPONS_CATALOG[wId];
    return sum + (spec ? spec.oilUsePerRound * qty : 0);
  }, 0);

  const territoryScale = Math.max(0.35, country.integrityPct / 100);
  const devastationEconFactor = Math.max(0.35, 1 - country.devastation * 0.0065);

  const oilProd = Math.round((country.oilProduction + refineryBoost) * territoryScale) + empireOil;
  const oilCons = country.oilConsumption + Math.round(weaponOilUse * 0.72);
  const netOil = oilProd - oilCons;

  const gasProd = Math.round((country.gasProduction + Math.round(refineryBoost * 0.7)) * territoryScale) + empireGas;
  const netGas = gasProd - country.gasConsumption;

  const foodProd = Math.round((country.foodProduction + foodBoost) * territoryScale) + empireFood;
  const netFood = foodProd - country.foodConsumption;

  const gridFactor = Math.max(0.4, country.powerGrid / 100);
  const approvalFactor = country.approval < 35 ? 0.66 : country.approval > 72 ? 1.1 : 0.96;
  const industryTrackBonus = country.upgrades.INDUSTRY * 18;

  const grossGdpIncomeB = Math.round(
    (country.gdpB * 0.078 * territoryScale + country.infrastructure.ARMS_FACTORY * 8 + industryTrackBonus) *
      gridFactor *
      approvalFactor *
      devastationEconFactor
  );

  const oilPriceFactor = market.oilPriceUsd / 82;
  let chokepointExportMultiplier = country.maritimeBlockaded ? 0.62 : 1;
  if (
    (country.id === 'IR' || country.id === 'SA') &&
    chokepoints.HORMUZ.status === 'BLOCKADED' &&
    chokepoints.HORMUZ.controller !== country.id
  ) {
    chokepointExportMultiplier *= 0.35;
  }

  let energyExportRevenueB = 0;
  if (netOil > 0) {
    energyExportRevenueB += Math.round(netOil * 0.48 * oilPriceFactor * chokepointExportMultiplier);
  }
  if (netGas > 0) {
    energyExportRevenueB += Math.round(netGas * 0.24 * (market.gasPriceIndex / 100) * chokepointExportMultiplier);
  }
  if (country.id === 'EG' && chokepoints.SUEZ.status === 'OPEN') energyExportRevenueB += 14;
  if (country.id === 'TR' && chokepoints.BOSPHORUS.status === 'OPEN') energyExportRevenueB += 10;

  // Realistic progressive military upkeep so overbuilding 60 units strains budget!
  const rawUnitsUpkeep = Object.entries(country.weapons).reduce((acc, [wId, qty]) => {
    const spec = WEAPONS_CATALOG[wId];
    return acc + (spec ? spec.unitCostB * 0.068 * qty : 0);
  }, 5);
  const militaryUpkeepB = Math.round(rawUnitsUpkeep);

  const rawSanctionCount = country.sanctionedBy.length;
  const selfReliance = Math.min(0.72, country.allies.length * 0.14 + (country.upgrades.INDUSTRY >= 7 ? 0.2 : 0));
  const sanctionRate = Math.min(0.42, rawSanctionCount * 0.085 * (1 - selfReliance));
  const sanctionPenaltyB = Math.round(
    (grossGdpIncomeB + empireGdpBonus + Math.max(0, energyExportRevenueB)) * sanctionRate
  );

  const netIncomeB =
    grossGdpIncomeB + empireGdpBonus + energyExportRevenueB - militaryUpkeepB - sanctionPenaltyB;

  return {
    netIncomeB,
    grossGdpIncomeB,
    empireBonusIncomeB: empireGdpBonus,
    energyExportRevenueB,
    militaryUpkeepB,
    sanctionPenaltyB,
    netOil,
    netGas,
    netFood,
    territoriesAnnexed,
    protectoratesCount,
  };
}

export interface OpChanceBreakdown {
  winPct: number;
  tracePct: number;
  factorsFa: string[];
}

export function evaluateMilitaryOpDetails(
  attacker: CountryState,
  defender: CountryState,
  opType: MilitaryOpType,
  currentRound = 1
): OpChanceBreakdown {
  const atk = computeCountryMilitary(attacker);
  const def = computeCountryMilitary(defender);
  const factorsFa: string[] = [];

  const intel = attacker.knownIntel[defender.id];
  const intelAge = intel ? Math.max(0, currentRound - intel.round) : 99;
  const reconBonus = intelAge <= 2 ? 15 : intelAge <= 5 ? 8 : 0;
  if (reconBonus > 0) factorsFa.push(`+${reconBonus}٪ اشراف اطلاعاتی به‌روز`);

  const seadOrAirQueued = attacker.orders.some(
    (o) =>
      o.targetCountry === defender.id &&
      (o.militaryType === 'AIR_SORTIE' || o.covertType === 'BLACKOUT_VIRUS')
  );
  const comboBonus = seadOrAirQueued && opType !== 'AIR_SORTIE' ? 20 : 0;
  if (comboBonus > 0) factorsFa.push(`+${comboBonus}٪ سرکوب رادار/پدافند در این دور`);

  if (defender.radarIntegrity < 65) factorsFa.push('+۱۲٪ ضعف شبکه رادار هدف');
  if (defender.commanderBuff < -10) factorsFa.push('+۱۰٪ اختلال فرماندهی هدف');

  if (opType === 'AIR_SORTIE') {
    if (atk.fighterCount === 0) {
      factorsFa.push('-۲۸٪ فقدان اسکادران جنگنده فعال!');
    } else {
      factorsFa.push(`+${Math.min(28, atk.fighterCount * 5)}٪ قدرت اسکادران‌های جنگنده و بمب‌افکن`);
    }
    factorsFa.push(`-${Math.round(def.interceptRate * 0.45)}٪ سپر پدافند و رهگیر هدف`);
    const raw =
      48 +
      (atk.fighterCount === 0 ? -24 : Math.min(30, atk.fighterCount * 5)) +
      atk.stealthPower * 1.5 +
      attacker.upgrades.AEROSPACE * 4 -
      def.interceptRate * 0.45 +
      reconBonus;
    return { winPct: Math.min(93, Math.max(12, Math.round(raw))), tracePct: 100, factorsFa };
  }

  if (opType === 'MISSILE_DRONE_STRIKE') {
    const saturation = Math.min(24, atk.droneCount * 3.5 + attacker.upgrades.AEROSPACE * 3.5);
    factorsFa.push(`+${Math.round(saturation)}٪ اشباع پهپادی و موشکی`);
    factorsFa.push(`-${Math.round(def.interceptRate * 0.6)}٪ نرخ رهگیری پدافند هدف`);
    const raw =
      56 +
      saturation +
      atk.stealthPower * 1.4 -
      def.interceptRate * 0.6 +
      reconBonus +
      comboBonus +
      (defender.radarIntegrity < 65 ? 12 : 0);
    return { winPct: Math.min(94, Math.max(16, Math.round(raw))), tracePct: 100, factorsFa };
  }

  if (opType === 'NAVAL_BLOCKADE_STRIKE') {
    const navRatio = (atk.navalPower + atk.airPower * 0.25) / Math.max(30, def.navalPower + def.defenseScore * 0.25);
    if (atk.navalCount === 0) factorsFa.push('-۲۲٪ نبود ناوگان رزمی دریایی');
    else factorsFa.push(`نسبت قدرت دریایی: ${navRatio.toFixed(1)} برابر`);
    const raw = navRatio * 48 + (atk.navalCount === 0 ? -18 : 6) + reconBonus * 0.7 + comboBonus * 0.5;
    return { winPct: Math.min(92, Math.max(14, Math.round(raw))), tracePct: 100, factorsFa };
  }

  if (opType === 'GROUND_CONQUEST') {
    const dist = Math.hypot(
      attacker.coordinates[0] - defender.coordinates[0],
      attacker.coordinates[1] - defender.coordinates[1]
    );
    const logisticsPenalty = dist > 75 && attacker.upgrades.NAVAL_POWER < 5 ? -16 : dist < 26 ? 10 : 0;
    if (logisticsPenalty < 0) factorsFa.push(`${logisticsPenalty}٪ فاصله لجستیکی بین‌قاره‌ای`);
    else if (logisticsPenalty > 0) factorsFa.push(`+${logisticsPenalty}٪ همسایگی و برتری لجستیک زمینی`);

    const landRatio =
      (atk.groundPower + atk.airPower * 0.35) /
      Math.max(35, def.groundPower + def.defenseScore * 0.45);
    factorsFa.push(`نسبت توان زرهی/زمینی: ${landRatio.toFixed(1)} برابر`);
    const raw =
      landRatio * 46 +
      logisticsPenalty +
      reconBonus * 0.8 +
      comboBonus * 0.7 +
      (defender.devastation >= 45 ? 12 : 0);
    return { winPct: Math.min(91, Math.max(12, Math.round(raw))), tracePct: 100, factorsFa };
  }

  // NUCLEAR_STRIKE
  factorsFa.push(`-${Math.round(def.interceptRate * 0.32)}٪ سپر ضدبالستیک فرا-جوّی هدف`);
  const raw = 84 - def.interceptRate * 0.32 + attacker.upgrades.AEROSPACE * 2.5 + comboBonus * 0.5;
  return { winPct: Math.min(96, Math.max(32, Math.round(raw))), tracePct: 100, factorsFa };
}

export function estimateMilitarySuccessPct(
  attacker: CountryState,
  defender: CountryState,
  opType: MilitaryOpType,
  currentRound = 1
): number {
  return evaluateMilitaryOpDetails(attacker, defender, opType, currentRound).winPct;
}

export function evaluateCovertOpDetails(
  attacker: CountryState,
  defender: CountryState,
  covertType: CovertOpType
): OpChanceBreakdown {
  const factorsFa: string[] = [];
  const alertPenalty = defender.securityAlertBonus || 0;
  if (alertPenalty > 0) {
    factorsFa.push(`-${alertPenalty}٪ آماده‌باش امنیتی اخیر هدف`);
  }
  const gridWeakness = defender.powerGrid < 55 ? 9 : 0;
  if (gridWeakness > 0) factorsFa.push(`+${gridWeakness}٪ اختلال زیرساخت برق هدف`);

  const isCyber =
    covertType === 'BLACKOUT_VIRUS' ||
    covertType === 'TREASURY_HEIST' ||
    covertType === 'STUXNET_SABOTAGE';

  if (covertType === 'SAT_RECON') {
    const raw =
      66 +
      attacker.upgrades.INTELLIGENCE * 4.5 +
      attacker.upgrades.AEROSPACE * 2.5 -
      defender.upgrades.AIR_DEFENSE * 2.2 -
      alertPenalty * 0.4;
    const tracePct = Math.min(45, Math.max(5, Math.round(12 + defender.upgrades.CYBER_AI * 3 - attacker.upgrades.INTELLIGENCE * 2)));
    factorsFa.push(`+${attacker.upgrades.INTELLIGENCE * 4}٪ توان اشراف ماهواره‌ای`);
    return { winPct: Math.min(95, Math.max(35, Math.round(raw))), tracePct, factorsFa };
  }

  if (isCyber) {
    const myCyber =
      attacker.cyberShield * 0.5 +
      attacker.upgrades.CYBER_AI * 8.5 +
      attacker.infrastructure.CYBER_HQ * 3;
    const defCyber =
      defender.cyberShield * 0.5 +
      defender.upgrades.CYBER_AI * 7.5 +
      defender.infrastructure.CYBER_HQ * 2.8;
    const diff = Math.round((myCyber - defCyber) * 0.85);
    factorsFa.push(`${diff >= 0 ? `+${diff}` : diff}٪ توازن قدرت سایبری دو کشور`);

    const difficultyMod = covertType === 'STUXNET_SABOTAGE' ? -6 : 0;
    const winPct = Math.min(
      91,
      Math.max(16, Math.round(50 + diff + gridWeakness + difficultyMod - alertPenalty * 0.7))
    );

    // Counter-Cyber Forensics Attribution Chance!
    // If defender lacks Cyber HQ (<3) and CYBER_AI (<4), trace chance is very low (anonymous attack!)
    const hasForensics = defender.upgrades.CYBER_AI >= 4 || defender.infrastructure.CYBER_HQ >= 4;
    const rawTrace = hasForensics
      ? 34 + defender.upgrades.CYBER_AI * 6 + defender.infrastructure.CYBER_HQ * 3 - attacker.upgrades.CYBER_AI * 5
      : 8 + defender.upgrades.CYBER_AI * 3 - attacker.upgrades.CYBER_AI * 3;
    const tracePct = Math.min(85, Math.max(5, Math.round(rawTrace)));
    return { winPct, tracePct, factorsFa };
  }

  // Espionage, Insurgency & Targeted Assassinations
  const mySpy = attacker.intelLevel * 4.5 + attacker.upgrades.INTELLIGENCE * 8.5;
  const defSpy =
    defender.intelLevel * 4.5 +
    defender.upgrades.INTELLIGENCE * 7.8 +
    defender.infrastructure.CYBER_HQ * 1.8;
  const diff = Math.round((mySpy - defSpy) * 0.9);
  factorsFa.push(`${diff >= 0 ? `+${diff}` : diff}٪ توازن سرویس اطلاعاتی (${attacker.agencyCode} در برابر ${defender.agencyCode})`);

  const targetHardness =
    covertType === 'ASSASSINATE_MINISTER'
      ? -8
      : covertType === 'ASSASSINATE_COMMANDER'
      ? -5
      : covertType === 'ASSASSINATE_SCIENTIST'
      ? -3
      : 2;

  const winPct = Math.min(
    89,
    Math.max(14, Math.round(48 + diff + targetHardness + (defender.devastation >= 40 ? 8 : 0) - alertPenalty))
  );

  // Counter-Intelligence Attribution Chance: if defender lacks strong counter-intel, attacker remains UNKNOWN!
  const hasCounterIntel = defender.upgrades.INTELLIGENCE >= 4 || defender.intelLevel >= 8;
  const rawTrace = hasCounterIntel
    ? 38 + defender.upgrades.INTELLIGENCE * 6 + alertPenalty - attacker.upgrades.INTELLIGENCE * 5
    : 10 + defender.upgrades.INTELLIGENCE * 3 - attacker.upgrades.INTELLIGENCE * 3;
  const tracePct = Math.min(88, Math.max(6, Math.round(rawTrace)));

  return { winPct, tracePct, factorsFa };
}

export function estimateCovertSuccessPct(
  attacker: CountryState,
  defender: CountryState,
  covertType: CovertOpType
): number {
  return evaluateCovertOpDetails(attacker, defender, covertType).winPct;
}

export function estimateMinorOpSuccessPct(
  attacker: CountryState,
  minor: MinorNationState,
  opType: MinorNationOpType,
  countries?: Record<CountryId, CountryState>
): number {
  const mil = computeCountryMilitary(attacker);
  const protector = minor.conqueredBy
    ? countries?.[minor.conqueredBy]
    : minor.alignedWith
    ? countries?.[minor.alignedWith]
    : null;
  const protectorBonus = protector && protector.id !== attacker.id ? computeCountryMilitary(protector).defenseScore * 0.28 : 0;
  const effectiveGarrison = minor.garrisonPower + protectorBonus;

  if (opType === 'CONQUER_ANNEX') {
    const ratio = (mil.groundPower + mil.airPower * 0.45 + mil.navalPower * 0.25) / Math.max(40, effectiveGarrison);
    return Math.min(93, Math.max(15, Math.round(ratio * 46)));
  }
  // COVERT_COUP
  const spyPower = attacker.intelLevel * 9 + attacker.upgrades.INTELLIGENCE * 14;
  return Math.min(90, Math.max(18, Math.round(35 + (spyPower - effectiveGarrison * 0.55) * 0.65)));
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
    | { type: 'SPOT_TRADE'; resource: 'OIL' | 'FOOD'; mode: 'BUY' | 'SELL' }
    | { type: 'OPEN_COUNTRY_DRAWER'; targetCountry: CountryId };
}

export function getSmartCabinetAdvice(room: GameRoomState, countryId: CountryId): CabinetSuggestion[] {
  const c = room.countries[countryId];
  if (!c || c.isEliminated) return [];
  const spot = getGlobalSpotPrices(room.market);
  const suggestions: CabinetSuggestion[] = [];
  const maxBuilds = getMaxBuildsPerRound(c);
  const canBuildMore = c.buildsUsedThisRound < maxBuilds;

  // 1. Urgent Regime Survival / War Devastation Rescue! (Works EVEN IF all buildings are MAX!)
  if (c.devastation >= 45 || c.approval < 38) {
    const eCost = getEmergencyActionCost(c, 'NATIONAL_RELIEF');
    if (c.treasuryB >= eCost) {
      suggestions.push({
        id: 'adv-emergency-relief',
        ministerFa: '🚨 شورای عالی امنیت ملی',
        urgency: 'HIGH',
        titleFa: `خطر سقوط کابینه! (رضایت ${c.approval}٪ | ویرانی ${c.devastation}٪)`,
        subtitleFa: 'بسته امداد و بازسازی اضطراری فوری +۱۴٪ رضایت مردم و -۲۰٪ بحران ویرانی ایجاد می‌کند.',
        buttonLabelFa: `امداد اضطراری ($${eCost}B)`,
        quickAction: { type: 'EMERGENCY_ACTION', emergencyKind: 'NATIONAL_RELIEF' },
      });
    }
  }

  if (c.powerGrid < 68) {
    const pInfo = getInfraNextCost(c, 'POWER_PLANT', room.settings.difficulty);
    if (canBuildMore && c.infrastructure.POWER_PLANT < INFRASTRUCTURE_CATALOG.POWER_PLANT.maxLevel && c.treasuryB >= pInfo.costB) {
      suggestions.push({
        id: 'adv-power',
        ministerFa: 'وزیر نیرو',
        urgency: 'HIGH',
        titleFa: pInfo.isRebuild ? `بازسازی نیروگاه بمباران‌شده (${c.powerGrid}٪ برق)` : `تقویت فوری شبکه برق (${c.powerGrid}٪)`,
        subtitleFa: 'کمبود برق، تولید اقتصادی و دقت رادارهای پدافند کشور را کاهش می‌دهد.',
        buttonLabelFa: `${pInfo.isRebuild ? 'بازسازی نیروگاه' : 'ساخت نیروگاه'} ($${pInfo.costB}B)`,
        quickAction: { type: 'INSTANT_INFRA', infraType: 'POWER_PLANT' },
      });
    } else {
      const gCost = getEmergencyActionCost(c, 'REPAIR_GRID');
      if (c.treasuryB >= gCost) {
        suggestions.push({
          id: 'adv-grid-emergency',
          ministerFa: 'وزیر نیرو',
          urgency: 'HIGH',
          titleFa: `ترمیم اضطراری شبکه برق (${c.powerGrid}٪)`,
          subtitleFa: 'بازگرداندن فوری +۲۴٪ برق سراسری و کاهش خسارات جنگ حتی در سقف زیرساخت!',
          buttonLabelFa: `ترمیم شبکه برق ($${gCost}B)`,
          quickAction: { type: 'EMERGENCY_ACTION', emergencyKind: 'REPAIR_GRID' },
        });
      }
    }
  }

  if (c.oilReserve < 65 && c.treasuryB >= spot.oilBuy50B) {
    suggestions.push({
      id: 'adv-buy-oil',
      ministerFa: 'وزیر انرژی',
      urgency: 'HIGH',
      titleFa: 'ذخیره سوخت ارتش و صنایع پایین است!',
      subtitleFa: 'همین الان ۵۰ واحد نفت از بورس بخرید تا قدرت رزمی ارتش افت نکند.',
      buttonLabelFa: `خرید ۵۰ نفت ($${spot.oilBuy50B}B)`,
      quickAction: { type: 'SPOT_TRADE', resource: 'OIL', mode: 'BUY' },
    });
  }

  if (
    suggestions.length < 3 &&
    c.upgradesUsedThisRound < 1 &&
    c.upgrades.INDUSTRY < UPGRADE_TRACKS.INDUSTRY.maxLevel
  ) {
    const cost = getUpgradeNextCost(c, 'INDUSTRY', room.settings.difficulty);
    if (c.treasuryB >= cost) {
      suggestions.push({
        id: 'adv-industry',
        ministerFa: 'وزیر اقتصاد و صنعت',
        urgency: 'OPPORTUNITY',
        titleFa: `ارتقای دکترین ابرصنعت به سطح ${c.upgrades.INDUSTRY + 1}`,
        subtitleFa: '+$18B درآمد دائمی ماهانه، مقاومت تحریمی و تخفیف ساخت سلاح.',
        buttonLabelFa: `ارتقای ابرصنعت ($${cost}B)`,
        quickAction: { type: 'INSTANT_UPGRADE', track: 'INDUSTRY' },
      });
    }
  }

  if (
    suggestions.length < 3 &&
    c.upgradesUsedThisRound < 1 &&
    c.upgrades.AEROSPACE < UPGRADE_TRACKS.AEROSPACE.maxLevel
  ) {
    const cost = getUpgradeNextCost(c, 'AEROSPACE', room.settings.difficulty);
    if (c.treasuryB >= cost) {
      suggestions.push({
        id: 'adv-aero',
        ministerFa: 'فرمانده هوافضا',
        urgency: 'MEDIUM',
        titleFa: `ارتقای دکترین هوافضا به سطح ${c.upgrades.AEROSPACE + 1}`,
        subtitleFa: '+۱۱٪ قدرت جنگنده‌ها و موشک‌ها در تمام عملیات‌های هوایی.',
        buttonLabelFa: `لول‌آپ هوافضا ($${cost}B)`,
        quickAction: { type: 'INSTANT_UPGRADE', track: 'AEROSPACE' },
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
  producerCountry: CountryId;
} {
  const spec = WEAPONS_CATALOG[weaponId];
  if (!spec) {
    return {
      canBuildDirectly: false,
      isAllyLicensed: false,
      lockedReasonFa: 'نامعتبر',
      finalCostB: 999,
      producerCountry: 'US',
    };
  }

  const diffMult = getDifficultyPlayerCostMult(difficulty, country.playerId !== null);
  const discount = Math.min(
    0.36,
    country.infrastructure.ARMS_FACTORY * 0.025 + country.upgrades.INDUSTRY * 0.035
  );

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
      finalCostB: Math.max(5, Math.round(spec.unitCostB * (1 - discount) * diffMult)),
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
      finalCostB: Math.max(6, Math.round(spec.unitCostB * (1.1 - discount * 0.45) * diffMult)),
      producerCountry: spec.originCountry,
    };
  }
  return {
    canBuildDirectly: false,
    isAllyLicensed: false,
    lockedReasonFa: null,
    finalCostB: Math.round(spec.unitCostB * 1.15 * diffMult),
    producerCountry: spec.originCountry,
  };
}
