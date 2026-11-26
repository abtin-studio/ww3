export type CountryId =
  | 'IR'
  | 'US'
  | 'RU'
  | 'CN'
  | 'GB'
  | 'FR'
  | 'DE'
  | 'IL'
  | 'TR'
  | 'SA'
  | 'IN'
  | 'JP'
  | 'KP'
  | 'KR'
  | 'EG'
  | 'BR'
  | 'PK'
  | 'UA'
  | 'CA'
  | 'AU';

export type GMMode = 'AUTO' | 'HUMAN';
export type GameMode = 'SINGLE' | 'MULTI';
export type DifficultyLevel = 'NORMAL' | 'HARD' | 'EXTREME';

export type GamePhase =
  | 'LOBBY'
  | 'PLANNING'
  | 'RADAR_ALERT'
  | 'GM_REVIEW'
  | 'FINISHED';

export type DefconLevel = 5 | 4 | 3 | 2 | 1;

export type ChokepointId = 'HORMUZ' | 'SUEZ' | 'MALACCA' | 'BOSPHORUS' | 'GIBRALTAR';

export type ChokepointStatus = 'OPEN' | 'RESTRICTED' | 'BLOCKADED';

export interface ChokepointState {
  id: ChokepointId;
  nameFa: string;
  controller: CountryId;
  coordinates: [number, number]; // [lng, lat]
  status: ChokepointStatus;
  oilImpactFactor: number;
  descriptionFa: string;
}

export type InfrastructureType =
  | 'REFINERY'
  | 'POWER_PLANT'
  | 'NUCLEAR_FACILITY'
  | 'ARMS_FACTORY'
  | 'RADAR_NETWORK'
  | 'CYBER_HQ'
  | 'AIR_MISSILE_BASE'
  | 'WELFARE_HUB';

export interface InfrastructureSpec {
  type: InfrastructureType;
  nameFa: string;
  icon: string;
  costB: number;
  effectSummaryFa: string;
  maxLevel: number;
}

// 8 Deep National Progression Doctrines (Lv.1 -> Lv.10 for 100-round longevity!)
export type UpgradeTrack =
  | 'AEROSPACE'
  | 'AIR_DEFENSE'
  | 'NAVAL_POWER'
  | 'ARMOR_LAND'
  | 'CYBER_AI'
  | 'INTELLIGENCE'
  | 'INDUSTRY'
  | 'NUCLEAR';

export interface UpgradeTrackSpec {
  id: UpgradeTrack;
  nameFa: string;
  icon: string;
  baseCostB: number;
  maxLevel: number;
  perLevelBonusFa: string;
  milestonesFa: string;
}

export type WeaponCategory =
  | 'FIGHTER'
  | 'BOMBER'
  | 'DRONE'
  | 'MISSILE'
  | 'AIR_DEFENSE'
  | 'NAVAL'
  | 'ARMOR'
  | 'STRATEGIC';

export interface WeaponSpec {
  id: string;
  nameFa: string;
  nameEn: string;
  originCountry: CountryId;
  category: WeaponCategory;
  unitCostB: number;
  oilUsePerRound: number;
  attackPower: number;
  defensePower: number;
  interceptBonus: number;
  stealth: number; // 0 - 100
  rangeKm: number;
  minTrack?: { track: UpgradeTrack; level: number };
  minArmsFactory?: number;
  batchLabelFa: string;
  shortDescFa: string;
}

export type AlertPosture =
  | 'NORMAL'
  | 'MAX_INTERCEPT'
  | 'SCRAMBLE_FIGHTERS'
  | 'COUNTER_SALVO';

export type OrderKind =
  | 'MILITARY_OPERATION'
  | 'COVERT_OPERATION'
  | 'MINOR_NATION_OPERATION';

export type MilitaryOpType =
  | 'AIR_SORTIE' // Dedicated Fighter & Bomber Air Superiority / SEAD / Bombing!
  | 'MISSILE_DRONE_STRIKE' // Combined Drone Swarm + Precision Ballistic/Hypersonic Strike
  | 'NAVAL_BLOCKADE_STRIKE' // Naval Fleet Attack + Port Blockade + Coastal Strike
  | 'GROUND_CONQUEST' // Combined Land Armor + Air Offensive: Loot + Territorial Conquest!
  | 'NUCLEAR_STRIKE'; // Strategic Nuclear Warhead Launch

export type StrikeTargetSector =
  | 'MILITARY_BASES'
  | 'REFINERY'
  | 'POWER_PLANT'
  | 'ARMS_FACTORY'
  | 'AIR_DEFENSE_NET';

export type CovertOpType =
  | 'SAT_RECON' // Unlocks full intel + +15% precision for 3 rounds
  | 'INSURGENCY_PSYOPS' // Media & internal unrest: -14% approval & +12% devastation
  | 'BLACKOUT_VIRUS' // Blinds radar (suppresses 18s warning!) + drops powerGrid -26%
  | 'TREASURY_HEIST' // Cyber central bank hack: steals $22B-$42B
  | 'STUXNET_SABOTAGE' // Industrial worm: -25% nuclear & damages 1 factory/reactor
  | 'ASSASSINATE_COMMANDER' // Targeted hit on top general: -25% enemy command & defense
  | 'ASSASSINATE_SCIENTIST' // Targeted hit on nuclear/aero scientists: -28% nuclear & tech shock
  | 'ASSASSINATE_MINISTER'; // High-level political/security assassination: -16% approval & +16% crisis

export type MinorNationOpType =
  | 'CONQUER_ANNEX' // Military conquest & territorial annexation of world nation
  | 'COVERT_COUP'; // Intelligence-backed regime change & protectorate alignment

export interface GameOrder {
  id: string;
  actor: CountryId;
  kind: OrderKind;
  targetCountry?: CountryId;
  targetMinorId?: string;
  militaryType?: MilitaryOpType;
  targetSector?: StrikeTargetSector;
  covertType?: CovertOpType;
  minorOpType?: MinorNationOpType;
  estimatedSuccessPct: number;
  traceRiskPct?: number;
  summaryFa: string;
  expectedImpactFa: string;
  costB: number;
}

export interface IntelReport {
  id: string;
  round: number;
  timestamp: number;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  titleFa: string;
  detailFa: string;
  revealedCountry?: CountryId;
}

export interface RevealedSnapshot {
  round: number;
  treasuryB: number;
  oilReserve: number;
  gasReserve: number;
  warheads: number;
  nuclearProgress: number;
  devastation: number;
  integrityPct: number;
  militaryPowerScore: number;
  topWeapons: { weaponId: string; count: number }[];
}

export interface BattleOutcomeLog {
  id: string;
  round: number;
  attacker: CountryId;
  defender: CountryId | string;
  opTitleFa: string;
  succeeded: boolean;
  interceptRatePct: number;
  summaryFa: string;
  attackerLossesFa: string;
  defenderLossesFa: string;
  lootB: number;
}

export interface RoundSummaryForCountry {
  roundResolved: number;
  monthLabelFa: string;
  netIncomeB: number;
  autoSoldOilB: number;
  netOilDelta: number;
  approvalDelta: number;
  devastationDelta: number;
  myOperations: {
    titleFa: string;
    targetId?: CountryId;
    targetNameFa: string;
    succeeded: boolean;
    detailFa: string;
  }[];
  incomingAttacks: {
    attackerId: CountryId | null; // null = Untraced Covert Attack (No Identity Leak!)
    attackerLabelFa: string;
    titleFa: string;
    repelled: boolean;
    detailFa: string;
  }[];
  worldHighlightsFa: string[];
}

export type AIPersonality = 'SUPERPOWER' | 'REGIONAL_HAWK' | 'ECONOMIC_POWER' | 'FORTRESS';

export type EmergencyActionKind =
  | 'REPAIR_GRID' // Restores +24% Power Grid & -14% Devastation (works even if infra MAX!)
  | 'REPAIR_RADAR_CYBER' // Restores +45% Radar & +12% Cyber Shield
  | 'NATIONAL_RELIEF'; // Emergency Relief: +14% Approval & -20% Devastation

export interface MinorNationState {
  id: string; // ISO-3 numeric string e.g. '368' (Iraq)
  isoNumeric: string;
  code: string; // e.g. 'IQ', 'SY', 'PL', 'VE'
  nameFa: string;
  regionFa: string;
  coordinates: [number, number];
  gdpB: number; // Monthly bonus = round(gdpB * 0.06) when annexed/allied
  oilBonus: number;
  gasBonus: number;
  foodBonus: number;
  garrisonPower: number; // Real defense strength against conquest
  stability: number; // 0 - 100
  alignedWith: CountryId | null; // Friendly protectorate / base access
  conqueredBy: CountryId | null; // Annexed directly into conqueror's empire!
}

export interface Coalition {
  id: string;
  nameFa: string;
  leader: CountryId;
  members: CountryId[];
  createdRound: number;
}

export interface CountryState {
  id: CountryId;
  isoNumeric: string;
  nameFa: string;
  nameEn: string;
  flag: string;
  regionFa: string;
  capitalFa: string;
  agencyNameFa: string;
  agencyCode: string;
  isUNVetoMember: boolean;
  aiPersonality: AIPersonality;
  rivals: CountryId[];
  coordinates: [number, number]; // [lng, lat]
  labelOffset: [number, number]; // [dx, dy] on SVG map
  doctrineSummaryFa: string;
  strengthsFa: string[];
  weaknessesFa: string[];

  // Controller & Regime Status
  playerId: string | null; // null = Smart Living AI
  playerName: string | null;
  isOnline: boolean;
  isReady: boolean;
  isEliminated: boolean;
  eliminatedRound: number | null;
  eliminatedReasonFa: string | null;
  conqueredBy: CountryId | null;

  // Economy & Resources
  treasuryB: number;
  gdpB: number;
  autoSellSurplus: boolean;
  oilReserve: number;
  oilProduction: number;
  oilConsumption: number;
  gasReserve: number;
  gasProduction: number;
  gasConsumption: number;
  foodReserve: number;
  foodProduction: number;
  foodConsumption: number;
  uraniumReserve: number;

  // Stability, Integrity & Strategic Readiness
  approval: number; // 0 - 100
  devastation: number; // 0 - 100 (High devastation + low approval -> Regime Collapse!)
  integrityPct: number; // 0 - 100 (Territorial integrity; 0% -> Conquered & Eliminated!)
  regimeCrisisStreak: number; // Consecutive rounds in deep regime crisis
  powerGrid: number; // 0 - 100
  radarIntegrity: number; // 0 - 100
  cyberShield: number; // 0 - 100
  intelLevel: number; // 1 - 12
  techLevel: number; // 1 - 12
  nuclearProgress: number; // 0 - 100
  warheads: number;
  commanderBuff: number; // -35 to +30
  securityAlertBonus: number; // Temporary counter-intel boost after covert attacks
  maritimeBlockaded: boolean; // Naval blockade penalty active this round
  militaryXp: number;

  // Monthly Construction & Research Pacing
  upgradesUsedThisRound: number;
  buildsUsedThisRound: number;

  // 8 Level-Up National Progression Pillars (Lv.0 -> Lv.10)
  upgrades: Record<UpgradeTrack, number>;

  // Active Infrastructures, Damaged Ruins & Arsenal
  infrastructure: Record<InfrastructureType, number>;
  damagedInfra: Record<InfrastructureType, number>;
  weapons: Record<string, number>;

  // Diplomacy, Coalitions & Relations
  coalitionId: string | null;
  allies: CountryId[];
  sanctionedBy: CountryId[];
  airspaceOpenTo: CountryId[];
  airspaceClosedTo: CountryId[];
  lastAttackedBy: CountryId | null;

  // Round Tactical State
  alertPosture: AlertPosture;
  alertPostureCostPaidB: number;
  alertPostureConfirmed: boolean;
  incomingAlertActive: boolean;
  incomingThreatsSummaryFa: string[];
  orders: GameOrder[];
  intelReports: IntelReport[];
  knownIntel: Partial<Record<CountryId, RevealedSnapshot>>;
  lastRoundSummary: RoundSummaryForCountry | null;
}

export interface WorldMarket {
  oilPriceUsd: number;
  gasPriceIndex: number;
  foodPriceIndex: number;
  globalTension: number;
}

export interface NewsItem {
  id: string;
  round: number;
  monthLabelFa: string;
  timestamp: number;
  agencyFa: string;
  category: 'WAR' | 'DIPLOMACY' | 'ECONOMY' | 'CYBER' | 'ESPIONAGE' | 'WORLD_EVENT' | 'GM';
  breaking: boolean;
  headlineFa: string;
  bodyFa: string;
  involvedCountries: CountryId[];
}

export interface MapVisualEvent {
  id: string;
  round: number;
  from: [number, number];
  to: [number, number];
  fromCountry: CountryId;
  toCountry?: CountryId;
  toMinorId?: string;
  kind: 'FLIGHT' | 'MISSILE' | 'DRONE' | 'NAVAL' | 'CYBER' | 'INVASION' | 'NUCLEAR' | 'TRADE' | 'RECON';
  labelFa: string;
  intercepted?: boolean;
  secretActorOnly?: boolean; // Hidden from other players unless traced!
}

export type TradeResourceKind =
  | 'OIL'
  | 'GAS'
  | 'FOOD'
  | 'URANIUM'
  | 'WEAPON'
  | 'ALLIANCE'
  | 'LIFT_SANCTION';

export interface TradeOffer {
  id: string;
  round: number;
  from: CountryId;
  to: CountryId;
  offerType: TradeResourceKind;
  amount: number;
  weaponId?: string;
  priceB: number;
  direction: 'SELL' | 'BUY' | 'PACT';
  noteFa: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  responseReasonFa?: string;
}

export interface ChatMessage {
  id: string;
  timestamp: number;
  channel: 'GLOBAL' | 'COALITION' | 'DIRECT' | 'GM_WHISPER';
  coalitionId?: string;
  fromCountry: CountryId | 'GM';
  fromName: string;
  toCountry?: CountryId;
  text: string;
}

export type ResolutionKind =
  | 'GLOBAL_SANCTION'
  | 'CONDEMN_AGGRESSION'
  | 'CEASEFIRE_DEMAND'
  | 'OPEC_OIL_CUT'
  | 'OPEC_OIL_BOOST'
  | 'EMERGENCY_AID_PACKAGE'
  | 'IAEA_INSPECTION';

export interface UNResolution {
  id: string;
  round: number;
  proposer: CountryId;
  target: CountryId;
  kind: ResolutionKind;
  committeeFa: string;
  titleFa: string;
  effectSummaryFa: string;
  votesYes: CountryId[];
  votesNo: CountryId[];
  vetoedBy: CountryId | null;
  status: 'ACTIVE' | 'PASSED' | 'FAILED' | 'VETOED';
}

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isGM: boolean;
  countryId: CountryId | null;
  connected: boolean;
}

export interface GameSettings {
  gameMode: GameMode;
  difficulty: DifficultyLevel;
  gmMode: GMMode;
  maxRounds: number;
  planningTimerSec: number;
  enableAINations: boolean;
}

export interface GameRoomState {
  schemaVersion: 3;
  roomCode: string;
  roomName: string;
  createdAt: number;
  phase: GamePhase;
  round: number;
  calendarLabelFa: string;
  phaseEndsAt: number | null;
  defcon: DefconLevel;
  settings: GameSettings;
  players: LobbyPlayer[];
  countries: Record<CountryId, CountryState>;
  minorNations: Record<string, MinorNationState>;
  coalitions: Record<string, Coalition>;
  chokepoints: Record<ChokepointId, ChokepointState>;
  market: WorldMarket;
  news: NewsItem[];
  battles: BattleOutcomeLog[];
  visualEvents: MapVisualEvent[];
  trades: TradeOffer[];
  messages: ChatMessage[];
  resolutions: UNResolution[];
  winnerSummaryFa: string | null;
  rankings: {
    countryId: CountryId;
    score: number;
    economicScore: number;
    militaryScore: number;
    stabilityScore: number;
    influenceScore: number;
    territoriesCount: number;
  }[];
}
