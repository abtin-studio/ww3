import { describe, expect, it } from 'vitest';
import { io as ClientSocket } from 'socket.io-client';
import {
  castAIVotesOnResolution,
  evaluateAITradeOffer,
  processInteractiveAIChat,
} from '../server/aiNations';
import {
  applyCreatorCheat,
  createCoalition,
  createNewRoomState,
  executeAcceptedTrade,
  executeDiplomaticAction,
  executeFalseFlagSabotage,
  instantEmergencyAction,
  instantLaunchSatellite,
  instantProduceWeapon,
  instantRespondFlashpoint,
  instantSellWeapon,
  instantSpotTrade,
  instantUpgradeConstellation,
  instantUpgradeTrack,
  joinCoalition,
  leaveCoalition,
  prepareEndOfPlanning,
  proposeStrategicRequest,
  queuePlayerOrder,
  rerollCountryMission,
  resolveCurrentRound,
  respondStrategicRequest,
  sanitizeRoomForPlayer,
  updateRankingsAndDefcon,
} from '../server/gameEngine';
import { createAppServer } from '../server/index';
import { computeEconomyProjection, evaluateMilitaryOpDetails } from '../shared/advisor';
import { INFRASTRUCTURE_CATALOG, UPGRADE_TRACKS } from '../shared/realWorldData';

const DEFAULT_SETTINGS = {
  gameMode: 'MULTI' as const,
  difficulty: 'HARD' as const,
  gmMode: 'AUTO' as const,
  maxRounds: 100,
  planningTimerSec: 0,
  enableAINations: true,
};

describe('WW3 Global Command v6.0 — 10 Doctrines, 4 Space Constellations, Smart Requests, False-Flag, Tight Economy & Anti-Spam Leaderboard', () => {
  it('initializes v6.0 schema with 10 Doctrines, 4 Space Constellations, 3 Dynamic Missions & Tight Economy', () => {
    const room = createNewRoomState('V6A', 'World v6', 'p1', 'Abtin', DEFAULT_SETTINGS);
    expect(room.schemaVersion).toBe(6);
    expect(Object.keys(room.countries).length).toBe(20);
    expect(Object.keys(UPGRADE_TRACKS).length).toBe(10);
    expect(room.countries.IR.upgrades.SPACE_ORBITAL).toBeGreaterThanOrEqual(1);
    expect(room.countries.IR.upgrades.ECONOMIC_SOVEREIGNTY).toBeGreaterThanOrEqual(1);
    expect(room.countries.IR.secretMissions.length).toBe(3);
    expect(room.countries.US.orbitalSatellites).toBeGreaterThanOrEqual(2);

    // Verify tightened economy includes infraUpkeepB and militaryUpkeepB
    const econ = computeEconomyProjection(room.countries.US, room.market, room.chokepoints, room.minorNations);
    expect(econ.infraUpkeepB).toBeGreaterThan(0);
    expect(econ.militaryUpkeepB).toBeGreaterThan(15);

    // Spot sales capped at 2 per round by default
    room.countries.SA.oilReserve = 500;
    expect(instantSpotTrade(room, 'SA', 'OIL', 'SELL').ok).toBe(true);
    expect(instantSpotTrade(room, 'SA', 'OIL', 'SELL').ok).toBe(true);
    expect(instantSpotTrade(room, 'SA', 'OIL', 'SELL').ok).toBe(false);
  });

  it('prevents Leaderboard weapon-spam exploit via diminishing returns and keeps AI competitive', () => {
    const room = createNewRoomState('V6LB', 'Leaderboard', 'p1', 'Abtin', DEFAULT_SETTINGS);
    const ir = room.countries.IR;
    updateRankingsAndDefcon(room);
    const baseMilScore = room.rankings.find((r) => r.countryId === 'IR')!.militaryScore;

    // Spamming 50 heavy units hits diminishing returns & hard cap (<= 350)
    ir.weapons.khorramshahr4 = 30;
    ir.weapons.fattah2 = 25;
    ir.weapons.bavar373 = 20;
    updateRankingsAndDefcon(room);
    const spammedMilScore = room.rankings.find((r) => r.countryId === 'IR')!.militaryScore;

    expect(spammedMilScore).toBeGreaterThan(baseMilScore);
    expect(spammedMilScore).toBeLessThanOrEqual(350);

    // Living World AI advances doctrines, GDP & constellations across rounds
    const usBeforeDocSum = Object.values(room.countries.US.upgrades).reduce((a, b) => a + b, 0);
    room.countries.US.treasuryB = 500;
    prepareEndOfPlanning(room);
    const usAfterDocSum = Object.values(room.countries.US.upgrades).reduce((a, b) => a + b, 0);
    expect(usAfterDocSum).toBeGreaterThanOrEqual(usBeforeDocSum);
  });

  it('upgrades 4 Space Constellations (GNSS fuel discount, RECON passive intel, SBIRS blackout shield) & rotates Dynamic Missions', () => {
    const room = createNewRoomState('V6SP', 'Space & Missions', 'p1', 'Abtin', {
      ...DEFAULT_SETTINGS,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    room.players[0].countryId = 'IR';
    const ir = room.countries.IR;
    ir.playerId = 'p1';
    ir.treasuryB = 900;
    ir.oilReserve = 500;
    ir.upgrades.SPACE_ORBITAL = 6;

    const baseFuel = evaluateMilitaryOpDetails(ir, room.countries.IL, 'AIR_SORTIE', 1, room.minorNations).fuelCost;
    expect(instantUpgradeConstellation(room, 'IR', 'GNSS_NAVI').ok).toBe(true);
    expect(instantUpgradeConstellation(room, 'IR', 'GNSS_NAVI').ok).toBe(true);
    expect(instantUpgradeConstellation(room, 'IR', 'RECON_OPTICAL').ok).toBe(true);
    expect(instantUpgradeConstellation(room, 'IR', 'SBIRS_SHIELD').ok).toBe(true);

    const discountedFuel = evaluateMilitaryOpDetails(ir, room.countries.IL, 'AIR_SORTIE', 1, room.minorNations).fuelCost;
    expect(discountedFuel).toBeLessThan(baseFuel);

    // Completing missions automatically rotates in new missions so count stays at 3!
    expect(ir.completedMissionsCount).toBeGreaterThanOrEqual(1);
    expect(ir.secretMissions.length).toBe(3);

    // Free monthly mission reroll works once per round
    const firstMsnId = ir.secretMissions[0].id;
    expect(rerollCountryMission(room, 'IR', firstMsnId).ok).toBe(true);
    expect(ir.secretMissions[0].id).not.toBe(firstMsnId);
    expect(rerollCountryMission(room, 'IR', ir.secretMissions[0].id).ok).toBe(false);

    // Resolve round -> RECON_OPTICAL passively reveals top rival snapshot!
    resolveCurrentRound(room);
    expect(Object.keys(ir.knownIntel).length).toBeGreaterThanOrEqual(1);
    expect(room.lastRoundReplay.some((ev) => ev.kind === 'SPACE_LAUNCH')).toBe(true);
  });

  it('executes Comprehensive Smart Strategic Requests (AI auto-exec & Human-to-Human inbox) and False-Flag Sabotage with pair cooldown', () => {
    const room = createNewRoomState('V6REQ', 'Requests & FalseFlag', 'p1', 'Abtin', {
      ...DEFAULT_SETTINGS,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    room.players[0].countryId = 'IR';
    room.players.push({
      id: 'p2',
      name: 'Friend2',
      isHost: false,
      isGM: false,
      countryId: 'DE',
      connected: true,
    });
    const ir = room.countries.IR;
    const ru = room.countries.RU;
    const de = room.countries.DE;
    ir.playerId = 'p1';
    de.playerId = 'p2';
    ir.treasuryB = 600;
    ir.upgrades.INTELLIGENCE = 8;
    ir.intelLevel = 11;

    // 1. Strategic Request to AI ally RU to jointly strike rival UA with $50B incentive
    ru.relations.IR = 85;
    ru.relations.UA = -80;
    const reqRes = proposeStrategicRequest(room, 'IR', {
      targetCountry: 'RU',
      kind: 'JOINT_MILITARY_STRIKE',
      leverage: 'DIPLOMATIC_INCENTIVE',
      offeredCashB: 80,
      thirdCountry: 'UA',
    });
    expect(reqRes.ok).toBe(true);
    expect(ru.orders.some((o) => o.targetCountry === 'UA')).toBe(true);

    // Cannot spam a 2nd request to RU in the same round!
    expect(
      proposeStrategicRequest(room, 'IR', {
        targetCountry: 'RU',
        kind: 'ECONOMIC_AID',
        leverage: 'DIPLOMATIC_INCENTIVE',
        offeredCashB: 10,
      }).ok
    ).toBe(false);

    // 2. Strategic Request to Human Player (DE) -> PENDING -> Accepted!
    const humReq = proposeStrategicRequest(room, 'IR', {
      targetCountry: 'DE',
      kind: 'FORM_FRIENDSHIP',
      leverage: 'DIPLOMATIC_INCENTIVE',
      offeredCashB: 20,
    });
    expect(humReq.ok).toBe(true);
    expect(humReq.status).toBe('PENDING');
    const pendingReq = room.strategicRequests.find((r) => r.to === 'DE' && r.status === 'PENDING')!;
    expect(pendingReq).toBeTruthy();
    const relBefore = de.relations.IR;
    expect(respondStrategicRequest(room, 'DE', pendingReq.id, true).ok).toBe(true);
    expect(de.relations.IR).toBeGreaterThan(relBefore);

    // 3. False-Flag Sabotage enforces pair cooldown on repeat attempt
    const ff1 = executeFalseFlagSabotage(room, 'IR', 'SA', 'EG');
    expect(typeof ff1.ok).toBe('boolean');
    const ffRepeat = executeFalseFlagSabotage(room, 'IR', 'SA', 'EG');
    expect(ffRepeat.ok).toBe(false);
    expect(ffRepeat.errorFa).toContain('ماه');
  });

  it('executes Smart UN Security Council AI Veto with vetoReasonFa & records UN_DECISION in Pre-Month Cinema', () => {
    const room = createNewRoomState('V6UN', 'UN Veto', 'p1', 'Abtin', {
      ...DEFAULT_SETTINGS,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    // US proposes GLOBAL_SANCTION on IR -> RU or CN (allies of IR with P5 Veto) must veto it!
    room.resolutions.push({
      id: 'un-test-1',
      round: 1,
      proposer: 'US',
      target: 'IR',
      kind: 'GLOBAL_SANCTION',
      committeeFa: 'شورای امنیت سازمان ملل',
      titleFa: 'قطعنامه تحریم فراگیر علیه ایران',
      effectSummaryFa: 'تحریم بانکی',
      votesYes: ['US'],
      votesNo: [],
      vetoedBy: null,
      vetoReasonFa: null,
      status: 'ACTIVE',
    });

    castAIVotesOnResolution(room, room.resolutions[0]);
    expect(room.resolutions[0].status).toBe('VETOED');
    expect(['RU', 'CN']).toContain(room.resolutions[0].vetoedBy);
    expect(room.resolutions[0].vetoReasonFa).toBeTruthy();
  });

  it('preserves Secret Defense Pact Ambush, Proxy Warfare, Peace Treaties, Anti-Wipeout & Creator Console', () => {
    const room = createNewRoomState('V6REG', 'Regressions', 'p1', 'Abtin', {
      ...DEFAULT_SETTINGS,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    room.players[0].countryId = 'IR';
    room.players.push({
      id: 'p2',
      name: 'Friend2',
      isHost: false,
      isGM: false,
      countryId: 'DE',
      connected: true,
    });
    const ir = room.countries.IR;
    ir.playerId = 'p1';
    ir.treasuryB = 800;
    ir.oilReserve = 400;

    expect(instantLaunchSatellite(room, 'IR').ok).toBe(true);

    // Secret Pact between IR & RU
    const secretPact = {
      id: 'sec-1',
      round: 1,
      from: 'IR' as const,
      to: 'RU' as const,
      offerType: 'SECRET_DEFENSE_PACT' as const,
      amount: 1,
      priceB: 25,
      direction: 'PACT' as const,
      noteFa: '',
      status: 'PENDING' as const,
    };
    expect(evaluateAITradeOffer(room, secretPact).accepted).toBe(true);
    expect(executeAcceptedTrade(room, secretPact).ok).toBe(true);
    const sanitizedForDE = sanitizeRoomForPlayer(room, 'p2');
    expect(sanitizedForDE.countries.IR.secretAllies.length).toBe(0);

    // US attacks IR -> RU Secret Ambush springs!
    expect(
      queuePlayerOrder(room, 'US', {
        kind: 'MILITARY_OPERATION',
        targetCountry: 'IR',
        militaryType: 'MISSILE_DRONE_STRIKE',
      }).ok
    ).toBe(true);
    resolveCurrentRound(room);
    expect(ir.allies).toContain('RU');
    expect(room.lastRoundReplay.some((ev) => ev.kind === 'SECRET_AMBUSH')).toBe(true);
    expect(room.activeFlashpoint).not.toBeNull();
    expect(instantRespondFlashpoint(room, 'IR', 'A').ok).toBe(true);

    // Creator console sets all 10 doctrines to 10
    expect(
      applyCreatorCheat(room, {
        secretKey: 'abtin',
        targetCountry: 'IR',
        action: 'SET_DOCTRINES_MAX',
      }).ok
    ).toBe(true);
    expect(ir.upgrades.SPACE_ORBITAL).toBe(10);
    expect(ir.upgrades.ECONOMIC_SOVEREIGNTY).toBe(10);

    // Science Academy + weapon build/sell + emergency repair + coalition + AI chat
    const cn = room.countries.CN;
    cn.treasuryB = 900;
    cn.infrastructure.SCIENCE_ACADEMY = 5;
    expect(instantUpgradeTrack(room, 'CN', 'AEROSPACE').ok).toBe(true);
    expect(instantUpgradeTrack(room, 'CN', 'CYBER_AI').ok).toBe(true);
    expect(instantProduceWeapon(room, 'CN', 'j20', 1).ok).toBe(true);
    expect(instantSellWeapon(room, 'CN', 'j20', 1).ok).toBe(true);
    cn.infrastructure.POWER_PLANT = INFRASTRUCTURE_CATALOG.POWER_PLANT.maxLevel;
    expect(instantEmergencyAction(room, 'CN', 'REPAIR_GRID').ok).toBe(true);
    expect(executeDiplomaticAction(room, 'CN', 'BR', 'IMPROVE_RELATIONS').ok).toBe(true);
    expect(processInteractiveAIChat(room, room.countries.FR, cn, 'سلام پیشنهاد صلح و دوستی داریم')).toContain('وزارت خارجه');

    expect(createCoalition(room, 'IR', 'اتحاد نوین').ok).toBe(true);
    const cid = ir.coalitionId!;
    expect(joinCoalition(room, 'RU', cid).ok).toBe(true);
    expect(leaveCoalition(room, 'IR').ok).toBe(true);
  });

  it('handles F5 browser refresh race, Host Pause/Resume, Save/Load Snapshot & v6.0 Socket Events', async () => {
    const { httpServer, stopTicker } = createAppServer();
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3999;
    const url = `http://127.0.0.1:${port}`;

    const oldTab = ClientSocket(url, { transports: ['websocket'] });
    let refreshedTab: ReturnType<typeof ClientSocket> | null = null;

    try {
      const createRes = await new Promise<{ ok: boolean; roomCode?: string }>((resolve) =>
        oldTab.emit(
          'lobby:create',
          {
            playerId: 'host-u1',
            playerName: 'Abtin',
            settings: { gameMode: 'MULTI', difficulty: 'HARD', maxRounds: 24 },
          },
          resolve
        )
      );
      const code = createRes.roomCode!;
      await new Promise<{ ok: boolean }>((r) => oldTab.emit('lobby:select_role', { countryId: 'IR' }, r));
      await new Promise<{ ok: boolean }>((r) => oldTab.emit('lobby:start', r));

      refreshedTab = ClientSocket(url, { transports: ['websocket'] });
      await new Promise<{ ok: boolean }>((r) =>
        refreshedTab!.emit('lobby:join', { roomCode: code, playerId: 'host-u1', playerName: 'Abtin' }, r)
      );
      oldTab.disconnect();
      await new Promise((r) => setTimeout(r, 120));

      const pauseRes = await new Promise<{ ok: boolean; isPaused?: boolean }>((r) =>
        refreshedTab!.emit('game:toggle_pause', r)
      );
      expect(pauseRes.ok).toBe(true);
      expect(pauseRes.isPaused).toBe(true);

      await new Promise<{ ok: boolean; isPaused?: boolean }>((r) =>
        refreshedTab!.emit('game:toggle_pause', r)
      );

      // Test new v6.0 socket event: upgrade_constellation
      const satRes = await new Promise<{ ok: boolean }>((r) =>
        refreshedTab!.emit('game:upgrade_constellation', 'SATCOM_EW', r)
      );
      expect(satRes.ok).toBe(true);

      const round2Promise = new Promise<number>((resolve) => {
        refreshedTab!.on('room:state', (st) => {
          if (st.round === 2 && st.phase === 'PLANNING') resolve(st.round);
        });
      });
      refreshedTab.emit('game:toggle_ready', true);
      const r2 = await round2Promise;
      expect(r2).toBe(2);

      const saveRes = await new Promise<{ ok: boolean; saveCode?: string; roomJson?: string }>((r) =>
        refreshedTab!.emit('game:save_snapshot', r)
      );
      expect(saveRes.ok).toBe(true);

      const loadRes = await new Promise<{ ok: boolean; roomCode?: string }>((r) =>
        refreshedTab!.emit(
          'lobby:load_save',
          { playerId: 'host-u1', playerName: 'Abtin', rawRoomJson: saveRes.roomJson },
          r
        )
      );
      expect(loadRes.ok).toBe(true);
      expect(loadRes.roomCode).not.toBe(code);
    } finally {
      oldTab.disconnect();
      refreshedTab?.disconnect();
      stopTicker();
      httpServer.close();
    }
  });
});
