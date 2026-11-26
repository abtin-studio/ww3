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

// 6 Level-Up National Progression Pillars (Lv.1 -> Lv.5)
export type UpgradeTrack =
  | 'AEROSPACE'
  | 'AIR_DEFENSE'
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
  minAerospaceLevel?: number;
  batchLabelFa: string;
  shortDescFa: string;
}

export type AlertPosture =
  | 'NORMAL'
  | 'MAX_INTERCEPT'
  | 'SCRAMBLE_FIGHTERS'
  | 'COUNTER_SALVO';

// Streamlined, crystal-clear strategic operations queued for end-of-round clash
export type OrderKind = 'MILITARY_OPERATION' | 'COVERT_OPERATION';

export type MilitaryOpType =
  | 'SEAD_DRONE_SWARM' // Saturates & suppresses enemy air defense (-35% intercept) + damages radar
  | 'PRECISION_STRIKE' // Missiles + Airstrikes on chosen sector (Refinery / Power / Military)
  | 'FULL_INVASION' // Combined Armor + Naval + Air offensive: war loot ($B + Oil) & unit casualties on both sides!
  | 'NUCLEAR_STRIKE'; // Strategic nuclear strike

export type StrikeTargetSector =
  | 'REFINERY'
  | 'POWER_PLANT'
  | 'MILITARY_BASES';

export type CovertOpType =
  | 'SAT_RECON' // Unlocks full intel + gives +15% attack accuracy against target
  | 'BLACKOUT_VIRUS' // Blinds radar (suppresses 18s radar warning!) + drops target powerGrid -25%
  | 'TREASURY_HEIST' // Cyber central bank hack: steals $20B-$38B directly into your treasury!
  | 'SABOTAGE_ASSASSINATION'; // Stuxnet + targeted assassination: -22% nuclear/tech & -20% military readiness!

export interface GameOrder {
  id: string;
  actor: CountryId;
  kind: OrderKind;
  targetCountry: CountryId;
  militaryType?: MilitaryOpType;
  targetSector?: StrikeTargetSector;
  covertType?: CovertOpType;
  estimatedSuccessPct: number;
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
  militaryPowerScore: number;
  topWeapons: { weaponId: string; count: number }[];
}

export interface BattleOutcomeLog {
  id: string;
  round: number;
  attacker: CountryId;
  defender: CountryId;
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
  myOperations: {
    titleFa: string;
    targetId: CountryId;
    succeeded: boolean;
    detailFa: string;
  }[];
  incomingAttacks: {
    attackerId: CountryId;
    titleFa: string;
    repelled: boolean;
    detailFa: string;
  }[];
  worldHighlightsFa: string[];
}

export type AIPersonality = 'SUPERPOWER' | 'REGIONAL_HAWK' | 'ECONOMIC_POWER' | 'FORTRESS';

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
  labelOffset: [number, number]; // [dx, dy] on SVG map so pins NEVER overlap!
  doctrineSummaryFa: string;
  strengthsFa: string[];
  weaknessesFa: string[];

  // Controller
  playerId: string | null; // null = Smart Living AI
  playerName: string | null;
  isOnline: boolean;
  isReady: boolean;
  isEliminated: boolean;

  // Economy & Resources
  treasuryB: number;
  gdpB: number;
  autoSellSurplus: boolean; // Auto-sells excess oil & gas each round!
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

  // Stability & Strategic Capabilities
  approval: number; // 0 - 100
  powerGrid: number; // 0 - 100
  radarIntegrity: number; // 0 - 100
  cyberShield: number; // 0 - 100
  intelLevel: number; // 1 - 10
  techLevel: number; // 1 - 10
  nuclearProgress: number; // 0 - 100
  warheads: number;
  commanderBuff: number; // -30 to +25
  militaryXp: number; // Combat experience -> Veteran rank stars!

  // 6 Level-Up National Progression Pillars (1 to 5)
  upgrades: Record<UpgradeTrack, number>;

  // Infrastructures & Arsenal
  infrastructure: Record<InfrastructureType, number>;
  weapons: Record<string, number>;

  // Diplomacy & Relations
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
  toCountry: CountryId;
  kind: 'FLIGHT' | 'MISSILE' | 'DRONE' | 'CYBER' | 'INVASION' | 'NUCLEAR' | 'TRADE' | 'RECON';
  labelFa: string;
  intercepted?: boolean;
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
  channel: 'GLOBAL' | 'DIRECT' | 'GM_WHISPER';
  fromCountry: CountryId | 'GM';
  fromName: string;
  toCountry?: CountryId;
  text: string;
}

export interface UNResolution {
  id: string;
  round: number;
  proposer: CountryId;
  target: CountryId;
  kind: 'GLOBAL_SANCTION' | 'CONDEMN_AGGRESSION' | 'CEASEFIRE_DEMAND';
  titleFa: string;
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
  gmMode: GMMode;
  maxRounds: number;
  planningTimerSec: number;
  enableAINations: boolean;
}

export interface GameRoomState {
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
  }[];
}
