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
  coordinates: [number, number];
  status: ChokepointStatus;
  oilImpactFactor: number;
  descriptionFa: string;
}

export type InfrastructureType =
  | 'REFINERY'
  | 'POWER_PLANT'
  | 'WELFARE_HUB'
  | 'SCIENCE_ACADEMY'
  | 'ARMS_FACTORY'
  | 'RADAR_NETWORK'
  | 'CYBER_HQ'
  | 'AIR_MISSILE_BASE'
  | 'NUCLEAR_FACILITY';

export interface InfrastructureSpec {
  type: InfrastructureType;
  nameFa: string;
  icon: string;
  costB: number;
  effectSummaryFa: string;
  maxLevel: number;
}

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
  roleTagFa: string; // e.g. 'رادارگریز ضدپدافند' | 'هایپرسونیک سپرشکن' | 'شکارچی ناو'
  unitCostB: number;
  oilUsePerRound: number;
  attackPower: number;
  defensePower: number;
  interceptBonus: number;
  stealth: number; // 0 - 100
  rangeKm: number;
  minTrack?: { track: UpgradeTrack; level: number };
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
  | 'AIR_SORTIE'
  | 'MISSILE_DRONE_STRIKE'
  | 'NAVAL_BLOCKADE_STRIKE'
  | 'GROUND_CONQUEST'
  | 'LIBERATION_COUNTEROFFENSIVE'
  | 'ASAT_STRIKE'
  | 'NUCLEAR_STRIKE';

export type StrikeTargetSector =
  | 'MILITARY_BASES'
  | 'REFINERY'
  | 'POWER_PLANT'
  | 'ARMS_FACTORY'
  | 'AIR_DEFENSE_NET';

export type CovertOpType =
  | 'SAT_RECON'
  | 'PROXY_INSURGENCY'
  | 'INSURGENCY_PSYOPS'
  | 'BLACKOUT_VIRUS'
  | 'TREASURY_HEIST'
  | 'STUXNET_SABOTAGE'
  | 'ASSASSINATE_COMMANDER'
  | 'ASSASSINATE_SCIENTIST'
  | 'ASSASSINATE_MINISTER';

export type MinorNationOpType =
  | 'CONQUER_ANNEX'
  | 'COVERT_COUP';

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
  fuelCost: number;
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
  foodReserve: number;
  waterReserve: number;
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
  netFoodDelta: number;
  netWaterDelta: number;
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
    attackerId: CountryId | null;
    attackerLabelFa: string;
    titleFa: string;
    repelled: boolean;
    detailFa: string;
  }[];
  worldHighlightsFa: string[];
}

export type AIPersonality = 'SUPERPOWER' | 'REGIONAL_HAWK' | 'ECONOMIC_POWER' | 'FORTRESS';

export type EmergencyActionKind =
  | 'REPAIR_GRID'
  | 'REPAIR_RADAR_CYBER'
  | 'NATIONAL_RELIEF';

export type DiplomaticActionKind =
  | 'IMPROVE_RELATIONS' // Diplomatic envoy & goodwill ($14B -> +18 relation)
  | 'THREATEN_ULTIMATUM' // Military coercion: forces weaker rival to back down / lift sanction / open strait!
  | 'SOW_DISCORD'; // Covertly pits targetCountry against thirdCountry (-35 relation between them & breaks alliance!)

export type UltimatumDemand =
  | 'STOP_ATTACKS'
  | 'LIFT_SANCTION'
  | 'OPEN_CHOKEPOINT';

export type SecretMissionKind =
  | 'ENERGY_WEALTH'
  | 'DIPLOMATIC_PEACE'
  | 'REGIONAL_INFLUENCE'
  | 'SPACE_TECH_MASTER';

export interface SecretMission {
  id: string;
  kind: SecretMissionKind;
  titleFa: string;
  descFa: string;
  targetValue: number;
  currentValue: number;
  rewardCashB: number;
  rewardScore: number;
  completed: boolean;
  completedRound: number | null;
}

export interface FlashpointOption {
  id: 'A' | 'B' | 'C';
  labelFa: string;
  effectFa: string;
  costB: number;
}

export interface GlobalFlashpoint {
  id: string;
  round: number;
  icon: string;
  titleFa: string;
  descFa: string;
  options: FlashpointOption[];
  chosenBy: Partial<Record<CountryId, 'A' | 'B' | 'C'>>;
}

export type ReplayEventKind =
  | 'MISSILE'
  | 'AIR'
  | 'NAVAL'
  | 'GROUND'
  | 'NUCLEAR'
  | 'ASAT'
  | 'PROXY'
  | 'SECRET_AMBUSH'
  | 'CYBER';

export interface CinematicReplayEvent {
  id: string;
  round: number;
  from: [number, number];
  to: [number, number];
  attackerId: CountryId | null;
  attackerNameFa: string;
  defenderId?: CountryId;
  targetNameFa: string;
  kind: ReplayEventKind;
  succeeded: boolean;
  intercepted: boolean;
  secretAllyId?: CountryId;
  secretAllyNameFa?: string;
  headlineFa: string;
  impactBadgeFa: string;
  secretActorOnly?: boolean;
}

export interface MinorNationState {
  id: string;
  isoNumeric: string;
  code: string;
  nameFa: string;
  regionFa: string;
  coordinates: [number, number];
  gdpB: number;
  oilBonus: number;
  gasBonus: number;
  foodBonus: number;
  waterBonus: number;
  garrisonPower: number;
  stability: number;
  alignedWith: CountryId | null;
  occupierId: CountryId | null; // Invader currently occupying part of this nation
  occupationPct: number; // 0..100% (100% = Fully Annexed!)
  conqueredBy: CountryId | null;
}

export interface Coalition {
  id: string;
  nameFa: string;
  leader: CountryId;
  members: CountryId[];
  invited: CountryId[];
  createdRound: number;
}

export interface CountryState {
  id: CountryId;
  isoNumeric: string;
  nameFa: string;
  nameEn: string;
  flag: string;
  regionFa: string;
  archetypeTagFa: string;
  capitalFa: string;
  agencyNameFa: string;
  agencyCode: string;
  isUNVetoMember: boolean;
  aiPersonality: AIPersonality;
  rivals: CountryId[];
  coordinates: [number, number];
  labelOffset: [number, number];
  doctrineSummaryFa: string;
  strengthsFa: string[];
  weaknessesFa: string[];

  // Controller & Regime Status
  playerId: string | null;
  playerName: string | null;
  isOnline: boolean;
  isReady: boolean;
  isEliminated: boolean;
  eliminatedRound: number | null;
  eliminatedReasonFa: string | null;
  conqueredBy: CountryId | null;
  occupierId: CountryId | null; // Tracks chief invader occupying border provinces

  // Economy & 5 Strategic Resources (Treasury, Oil, Gas, Food, Water + Uranium)
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
  waterReserve: number;
  waterProduction: number;
  waterConsumption: number;
  uraniumReserve: number;

  // Stability, Integrity & Strategic Readiness
  approval: number; // 0 - 100
  devastation: number; // 0 - 100
  integrityPct: number; // 0 - 100
  regimeCrisisStreak: number;
  powerGrid: number; // 0 - 100
  radarIntegrity: number; // 0 - 100
  cyberShield: number; // 0 - 100
  intelLevel: number; // 1 - 12
  techLevel: number; // 1 - 12
  nuclearProgress: number; // 0 - 100
  warheads: number;
  orbitalSatellites: number; // 0 - 3 Space Command satellites
  commanderBuff: number;
  securityAlertBonus: number;
  maritimeBlockaded: boolean;
  militaryXp: number;
  missionBonusScore: number;
  secretMissions: SecretMission[];

  // Monthly Pacing & Operational Quotas
  upgradesUsedThisRound: number;
  buildsUsedThisRound: number;
  militaryOrdersUsedThisRound: number;
  covertOrdersUsedThisRound: number;
  assassinationsUsedThisRound: number;

  // 8 Level-Up National Progression Pillars (Lv.0 -> Lv.10)
  upgrades: Record<UpgradeTrack, number>;

  // Active Infrastructures, Damaged Ruins & Arsenal
  infrastructure: Record<InfrastructureType, number>;
  damagedInfra: Record<InfrastructureType, number>;
  weapons: Record<string, number>;

  // Diplomacy, Bilateral Relations (-100..+100), Truces, Secret Defense Pacts & Coalitions
  coalitionId: string | null;
  relations: Record<CountryId, number>;
  nonAggressionPacts: Partial<Record<CountryId, number>>; // CountryId -> expiresAtRound
  allies: CountryId[];
  secretAllies: CountryId[]; // Hidden backroom defense pacts!
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
  secretActorOnly?: boolean;
}

export type TradeResourceKind =
  | 'OIL'
  | 'GAS'
  | 'FOOD'
  | 'WATER'
  | 'URANIUM'
  | 'WEAPON'
  | 'PEACE_TREATY'
  | 'SECRET_DEFENSE_PACT'
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
  isReadyInLobby?: boolean;
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

export interface RankingEntry {
  countryId: CountryId;
  score: number;
  tierFa: 'ابرقدرت جهانی' | 'قدرت بزرگ' | 'قدرت منطقه‌ای' | 'در بحران' | 'سقوط‌کرده';
  economicScore: number;
  militaryScore: number;
  techScore: number;
  stabilityScore: number;
  influenceScore: number;
  territoriesCount: number;
  totalUnits: number;
  gdpB: number;
}

export interface CreatorCheatPayload {
  secretKey: string;
  targetCountry: CountryId;
  action:
    | 'ADD_RESOURCES'
    | 'SET_DOCTRINES_MAX'
    | 'HEAL_ALL'
    | 'ADD_ELITE_ARMY'
    | 'FORCE_COLLAPSE'
    | 'REVIVE_COUNTRY'
    | 'FORCE_NEXT_ROUND';
  treasuryDelta?: number;
  oilDelta?: number;
  foodDelta?: number;
  waterDelta?: number;
  warheadsDelta?: number;
  approvalDelta?: number;
  devastationDelta?: number;
}

export interface GameRoomState {
  schemaVersion: 5;
  roomCode: string;
  roomName: string;
  createdAt: number;
  matchStartedAt: number | null;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  savedElapsedMs: number;
  phase: GamePhase;
  isPaused: boolean;
  pausedRemainingMs: number | null;
  isResumedSave?: boolean;
  lastSavedCode?: string | null;
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
  activeFlashpoint: GlobalFlashpoint | null;
  lastRoundReplay: CinematicReplayEvent[];
  news: NewsItem[];
  battles: BattleOutcomeLog[];
  visualEvents: MapVisualEvent[];
  trades: TradeOffer[];
  messages: ChatMessage[];
  resolutions: UNResolution[];
  winnerSummaryFa: string | null;
  rankings: RankingEntry[];
}
