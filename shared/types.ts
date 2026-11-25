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
  | 'BR';

export type GMMode = 'AUTO' | 'HUMAN';

export type GamePhase =
  | 'LOBBY'
  | 'PLANNING'
  | 'RADAR_ALERT'
  | 'GM_REVIEW'
  | 'RESOLUTION_SHOWCASE'
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
  batchLabelFa: string; // e.g. "۱ اسکادران (۱۲ فروند)" or "۱ آتشبار"
  shortDescFa: string;
}

export type AlertPosture =
  | 'NORMAL'
  | 'MAX_INTERCEPT'
  | 'SCRAMBLE_FIGHTERS'
  | 'COUNTER_SALVO';

export type OrderKind =
  | 'BUILD_INFRA'
  | 'PRODUCE_WEAPON'
  | 'FLIGHT_MISSION'
  | 'MILITARY_STRIKE'
  | 'CYBER_ATTACK'
  | 'ESPIONAGE_OP'
  | 'DOMESTIC_POLICY';

export type FlightMissionType = 'CAP_PATROL' | 'RECON_FLIGHT' | 'AIRSTRIKE' | 'AIRLIFT';

export type StrikeSubType =
  | 'DRONE_SWARM'
  | 'CRUISE_MISSILE'
  | 'BALLISTIC_MISSILE'
  | 'NAVAL_STRIKE'
  | 'GROUND_OFFENSIVE'
  | 'NUCLEAR_STRIKE';

export type StrikeTargetSector =
  | 'REFINERY'
  | 'POWER_PLANT'
  | 'RADAR_NETWORK'
  | 'MILITARY_BASES'
  | 'NUCLEAR_FACILITY';

export type CyberAttackType =
  | 'STUXNET_SABOTAGE'
  | 'GRID_BLACKOUT'
  | 'RADAR_BLIND'
  | 'CENTRAL_BANK_HACK';

export type EspionageOpType =
  | 'DEEP_RECON'
  | 'ASSASSINATE_SCIENTIST'
  | 'ASSASSINATE_COMMANDER'
  | 'COVERT_SABOTAGE'
  | 'COUNTER_INTEL_SWEEP';

export type DomesticPolicyType =
  | 'WELFARE_PACKAGE'
  | 'SECURITY_CRACKDOWN'
  | 'NUCLEAR_PROGRAM_PUSH'
  | 'TECH_RND_INVEST'
  | 'TOGGLE_CHOKEPOINT';

export interface GameOrder {
  id: string;
  actor: CountryId;
  kind: OrderKind;
  targetCountry?: CountryId;
  infraType?: InfrastructureType;
  weaponId?: string;
  quantity?: number;
  flightType?: FlightMissionType;
  strikeType?: StrikeSubType;
  targetSector?: StrikeTargetSector;
  cyberType?: CyberAttackType;
  espionageType?: EspionageOpType;
  policyType?: DomesticPolicyType;
  chokepointStatus?: ChokepointStatus;
  summaryFa: string;
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
  coordinates: [number, number]; // [lng, lat]
  doctrineSummaryFa: string;
  strengthsFa: string[];
  weaknessesFa: string[];

  // Controller
  playerId: string | null; // null = Smart AI
  playerName: string | null;
  isOnline: boolean;
  isReady: boolean;
  isEliminated: boolean;

  // Economy & Resources
  treasuryB: number; // Billions USD
  gdpB: number; // Base economic power
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
  radarIntegrity: number; // 0 - 100 (resets/recovers per round unless bombed/hacked)
  cyberShield: number; // 0 - 100
  intelLevel: number; // 1 - 10
  techLevel: number; // 1 - 10
  nuclearProgress: number; // 0 - 100
  warheads: number;
  commanderBuff: number; // -30 to +20 (affected by assassination / CAP)

  // Infrastructures & Arsenal
  infrastructure: Record<InfrastructureType, number>;
  weapons: Record<string, number>;

  // Diplomacy
  allies: CountryId[];
  sanctionedBy: CountryId[];
  airspaceOpenTo: CountryId[];
  airspaceClosedTo: CountryId[];

  // Round Tactical State
  alertPosture: AlertPosture;
  incomingAlertActive: boolean;
  incomingThreatsSummaryFa: string[];
  orders: GameOrder[];
  intelReports: IntelReport[];
  knownIntel: Partial<Record<CountryId, RevealedSnapshot>>;
}

export interface WorldMarket {
  oilPriceUsd: number; // Baseline ~$82/bbl, spikes with Hormuz/wars!
  gasPriceIndex: number; // Baseline 100
  foodPriceIndex: number; // Baseline 100
  globalTension: number; // 0 - 100 -> drives DEFCON
}

export interface NewsItem {
  id: string;
  round: number;
  monthLabelFa: string;
  timestamp: number;
  agencyFa: string; // e.g., "رویترز جهانی", "الجزیره فوری", "گزارش شورای امنیت", "راوی بازی"
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
  kind: 'FLIGHT' | 'MISSILE' | 'DRONE' | 'CYBER' | 'NAVAL' | 'NUCLEAR' | 'TRADE' | 'RECON';
  labelFa: string;
  intercepted?: boolean;
}

export type TradeResourceKind = 'OIL' | 'GAS' | 'FOOD' | 'URANIUM' | 'WEAPON' | 'ALLIANCE' | 'AIRSPACE' | 'LIFT_SANCTION';

export interface TradeOffer {
  id: string;
  round: number;
  from: CountryId;
  to: CountryId;
  offerType: TradeResourceKind;
  amount: number;
  weaponId?: string;
  priceB: number; // Money paid by buyer to seller (positive = 'to' pays 'from' if selling, etc.)
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
  maxRounds: number; // e.g., 12, 18, 24 months
  planningTimerSec: number; // 0 = untimed (advance when all ready), or 180 / 300 / 480
  enableAINations: boolean;
}

export interface GameRoomState {
  roomCode: string;
  roomName: string;
  createdAt: number;
  phase: GamePhase;
  round: number;
  calendarLabelFa: string; // e.g. "فروردین ۱۴۰۶ / ژانویه ۲۰۲۷"
  phaseEndsAt: number | null;
  defcon: DefconLevel;
  settings: GameSettings;
  players: LobbyPlayer[];
  countries: Record<CountryId, CountryState>;
  chokepoints: Record<ChokepointId, ChokepointState>;
  market: WorldMarket;
  news: NewsItem[];
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
