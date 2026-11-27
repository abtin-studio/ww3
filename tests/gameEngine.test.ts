import { describe, expect, it } from 'vitest';
import { io as ClientSocket } from 'socket.io-client';
import { evaluateAITradeOffer, processInteractiveAIChat } from '../server/aiNations';
import {
  applyCreatorCheat,
  createCoalition,
  createNewRoomState,
  executeAcceptedTrade,
  executeDiplomaticAction,
  instantBuildInfra,
  instantEmergencyAction,
  instantLaunchSatellite,
  instantProduceWeapon,
  instantRespondFlashpoint,
  instantSellWeapon,
  instantSpotTrade,
  instantUpgradeTrack,
  joinCoalition,
  leaveCoalition,
  prepareEndOfPlanning,
  queuePlayerOrder,
  resolveCurrentRound,
  sanitizeRoomForPlayer,
} from '../server/gameEngine';
import { createAppServer } from '../server/index';
import { INFRASTRUCTURE_CATALOG } from '../shared/realWorldData';

const DEFAULT_SETTINGS = {
  gameMode: 'MULTI' as const,
  difficulty: 'HARD' as const,
  gmMode: 'AUTO' as const,
  maxRounds: 100,
  planningTimerSec: 0,
  enableAINations: true,
};

describe('WW3 Global Command v4.0 — Diplomacy, Quotas, Anti-Wipeout, Save/Load, F5 Safety & Creator Console', () => {
  it('initializes v4.0 schema with Food/Water ecosystem, Bilateral Relations, Science Academy & 7-pillar Rankings', () => {
    const room = createNewRoomState('V4A', 'World v4', 'p1', 'Abtin', DEFAULT_SETTINGS);
    expect(room.schemaVersion).toBe(5);
    expect(Object.keys(room.countries).length).toBe(20);
    expect(room.countries.IR.waterReserve).toBeGreaterThan(50);
    expect(room.countries.IR.foodReserve).toBeGreaterThan(50);
    expect(room.countries.IR.secretMissions.length).toBe(2);
    expect(room.countries.US.orbitalSatellites).toBeGreaterThanOrEqual(1);
    expect(room.countries.IR.relations.RU).toBeGreaterThan(30);
    expect(room.countries.IR.relations.IL).toBeLessThan(-50);
    expect(room.rankings[0].tierFa).toBe('ابرقدرت جهانی');
    expect(room.rankings[0].techScore).toBeGreaterThan(0);
  });

  it('executes v5.0 Proxy Warfare, Secret Defense Pact Ambush, Space Command (Satellite/ASAT), Secret Missions, Flashpoints & Battle Replay', () => {
    const room = createNewRoomState('V5X', 'World v5', 'p1', 'Abtin', {
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
    const us = room.countries.US;
    ir.playerId = 'p1';
    ir.treasuryB = 900;
    ir.oilReserve = 400;
    ir.upgrades.AEROSPACE = 4;

    // 1. Space Command: Launch Satellite -> Auto-completes Energy/Wealth Secret Mission too!
    expect(instantLaunchSatellite(room, 'IR').ok).toBe(true);
    expect(ir.orbitalSatellites).toBe(1);
    expect(ir.secretMissions[0].completed).toBe(true);

    // 2. Secret Backroom Defense Pact between IR and RU (masked from DE!)
    const secretPact = {
      id: 'sec-1',
      round: 1,
      from: 'IR' as const,
      to: 'RU' as const,
      offerType: 'SECRET_DEFENSE_PACT' as const,
      amount: 1,
      priceB: 20,
      direction: 'PACT' as const,
      noteFa: '',
      status: 'PENDING' as const,
    };
    expect(evaluateAITradeOffer(room, secretPact).accepted).toBe(true);
    expect(executeAcceptedTrade(room, secretPact).ok).toBe(true);
    expect(ir.secretAllies).toContain('RU');
    // Verify other players (p2 / DE) CANNOT see IR's secret allies or secret missions!
    const sanitizedForDE = sanitizeRoomForPlayer(room, 'p2');
    expect(sanitizedForDE.countries.IR.secretAllies.length).toBe(0);
    expect(sanitizedForDE.countries.IR.secretMissions.length).toBe(0);

    // 3. Queue Proxy Insurgency + ASAT Strike on US (which starts with 1 satellite) + US attacks IR (triggering RU Secret Ambush!)
    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'COVERT_OPERATION',
        targetCountry: 'US',
        covertType: 'PROXY_INSURGENCY',
      }).ok
    ).toBe(true);
    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'MILITARY_OPERATION',
        targetCountry: 'US',
        militaryType: 'ASAT_STRIKE',
      }).ok
    ).toBe(true);
    expect(
      queuePlayerOrder(room, 'US', {
        kind: 'MILITARY_OPERATION',
        targetCountry: 'IR',
        militaryType: 'MISSILE_DRONE_STRIKE',
      }).ok
    ).toBe(true);

    resolveCurrentRound(room);

    // Secret ambush sprung -> RU unveiled as ally & recorded in Cinematic Battle Replay!
    expect(ir.allies).toContain('RU');
    expect(room.lastRoundReplay.some((ev) => ev.kind === 'SECRET_AMBUSH')).toBe(true);
    expect(room.lastRoundReplay.some((ev) => ev.kind === 'ASAT')).toBe(true);

    // Round 2 spawns Interactive Global Flashpoint!
    expect(room.round).toBe(2);
    expect(room.activeFlashpoint).not.toBeNull();
    expect(instantRespondFlashpoint(room, 'IR', 'A').ok).toBe(true);
    expect(room.activeFlashpoint?.chosenBy.IR).toBe('A');
  });

  it('signs Peace Treaties even between bitter rivals, lifts sanctions, sets 3-month truce & blocks attacks', () => {
    const room = createNewRoomState('V4B', 'Peace', 'p1', 'Abtin', DEFAULT_SETTINGS);
    room.phase = 'PLANNING';
    const ir = room.countries.IR;
    const us = room.countries.US;
    ir.playerId = 'p1';
    ir.treasuryB = 300;
    ir.sanctionedBy.push('US');
    us.lastAttackedBy = 'IR';

    const offer = {
      id: 'peace-1',
      round: 1,
      from: 'IR' as const,
      to: 'US' as const,
      offerType: 'PEACE_TREATY' as const,
      amount: 1,
      priceB: 20,
      direction: 'PACT' as const,
      noteFa: '',
      status: 'PENDING' as const,
    };

    const aiDecision = evaluateAITradeOffer(room, offer);
    expect(aiDecision.accepted).toBe(true);
    expect(executeAcceptedTrade(room, offer).ok).toBe(true);

    expect(ir.sanctionedBy.includes('US')).toBe(false);
    expect(us.lastAttackedBy).toBeNull();
    expect(ir.nonAggressionPacts.US).toBe(4);

    // Attempting to attack during active truce is cleanly blocked!
    const blockedAttack = queuePlayerOrder(room, 'IR', {
      kind: 'MILITARY_OPERATION',
      targetCountry: 'US',
      militaryType: 'MISSILE_DRONE_STRIKE',
    });
    expect(blockedAttack.ok).toBe(false);
  });

  it('supports Diplomatic Statecraft (Improve Relations, Ultimatum Coercion, Sow Discord & Interactive AI Chat)', () => {
    const room = createNewRoomState('V4C', 'Statecraft', 'p1', 'Abtin', DEFAULT_SETTINGS);
    room.phase = 'PLANNING';
    const us = room.countries.US;
    us.playerId = 'p1';
    us.treasuryB = 500;
    us.upgrades.INTELLIGENCE = 10;

    // 1. Improve Relations
    const beforeRel = us.relations.BR;
    expect(executeDiplomaticAction(room, 'US', 'BR', 'IMPROVE_RELATIONS').ok).toBe(true);
    expect(us.relations.BR).toBeGreaterThan(beforeRel);

    // 2. Threaten weaker AI state to lift sanction!
    us.sanctionedBy.push('EG');
    const ultRes = executeDiplomaticAction(room, 'US', 'EG', 'THREATEN_ULTIMATUM', {
      ultimatum: 'LIFT_SANCTION',
    });
    expect(ultRes.ok).toBe(true);
    expect(us.sanctionedBy.includes('EG')).toBe(false);

    // 3. Interactive AI Chat shifts relations
    const beforeChatRel = room.countries.FR.relations.US;
    const reply = processInteractiveAIChat(room, room.countries.FR, us, 'سلام پیشنهاد صلح و دوستی و همکاری داریم');
    expect(reply).toContain('وزارت خارجه');
    expect(room.countries.FR.relations.US).toBeGreaterThan(beforeChatRel);
  });

  it('unlocks 2 and 3 monthly doctrine upgrades via Science Academy, supports Water Spot Trade & Selling Weapons', () => {
    const room = createNewRoomState('V4D', 'Science', 'p1', 'Abtin', DEFAULT_SETTINGS);
    room.phase = 'PLANNING';
    const cn = room.countries.CN;
    cn.playerId = 'p1';
    cn.treasuryB = 1200;

    // Science Academy Lv.5 unlocks 2 upgrades per month!
    cn.infrastructure.SCIENCE_ACADEMY = 5;
    expect(instantUpgradeTrack(room, 'CN', 'AEROSPACE').ok).toBe(true);
    expect(instantUpgradeTrack(room, 'CN', 'CYBER_AI').ok).toBe(true);
    expect(instantUpgradeTrack(room, 'CN', 'NAVAL_POWER').ok).toBe(false);

    // Water Spot Trade & Surplus Weapon Sale
    expect(instantSpotTrade(room, 'CN', 'WATER', 'BUY').ok).toBe(true);
    expect(instantProduceWeapon(room, 'CN', 'j20', 1).ok).toBe(true);
    const cashBeforeSell = cn.treasuryB;
    expect(instantSellWeapon(room, 'CN', 'j20', 1).ok).toBe(true);
    expect(cn.treasuryB).toBeGreaterThan(cashBeforeSell);

    // Emergency Rebuild still works at max level
    cn.infrastructure.POWER_PLANT = INFRASTRUCTURE_CATALOG.POWER_PLANT.maxLevel;
    cn.powerGrid = 40;
    expect(instantEmergencyAction(room, 'CN', 'REPAIR_GRID').ok).toBe(true);
  });

  it('prevents 1-month country wipeout (caps integrity loss at 24%/mo) and enforces progressive minor conquest', () => {
    const room = createNewRoomState('V4E', 'AntiWipeout', 'p1', 'Abtin', {
      ...DEFAULT_SETTINGS,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    const ru = room.countries.RU;
    const ua = room.countries.UA;
    ru.playerId = 'p1';
    ru.upgrades.ARMOR_LAND = 10;
    ru.weapons.t90m_armata = 15;

    // Even if RU, TR, and PK all invade UA simultaneously in Round 1, UA cannot be wiped out in 1 month!
    for (const invId of ['RU', 'TR', 'PK'] as const) {
      room.countries[invId].weapons.t90m_armata = 10;
      room.countries[invId].upgrades.NAVAL_POWER = 6;
      room.countries[invId].treasuryB = 400;
      room.countries[invId].oilReserve = 300;
      expect(
        queuePlayerOrder(room, invId, {
          kind: 'MILITARY_OPERATION',
          targetCountry: 'UA',
          militaryType: 'GROUND_CONQUEST',
        }).ok
      ).toBe(true);
    }

    // Also test progressive minor conquest on Iraq ('368') by IR
    room.countries.IR.treasuryB = 300;
    room.countries.IR.oilReserve = 300;
    room.countries.IR.upgrades.ARMOR_LAND = 8;
    room.countries.IR.weapons.karrar_armor = 12;
    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'MINOR_NATION_OPERATION',
        targetMinorId: '368',
        minorOpType: 'CONQUER_ANNEX',
      }).ok
    ).toBe(true);

    resolveCurrentRound(room);
    expect(ua.isEliminated).toBe(false);
    expect(ua.integrityPct).toBeGreaterThanOrEqual(76);
    expect(room.minorNations['368'].conqueredBy).toBeNull(); // Progressive: takes >= 2 months!
  });

  it('verifies Secret Creator Cheat Console & Coalition Leave', () => {
    const room = createNewRoomState('V4F', 'Creator', 'p1', 'Abtin', DEFAULT_SETTINGS);
    expect(
      applyCreatorCheat(room, {
        secretKey: 'wrong',
        targetCountry: 'IR',
        action: 'SET_DOCTRINES_MAX',
      }).ok
    ).toBe(false);

    expect(
      applyCreatorCheat(room, {
        secretKey: 'abtin',
        targetCountry: 'IR',
        action: 'SET_DOCTRINES_MAX',
      }).ok
    ).toBe(true);
    expect(room.countries.IR.upgrades.AEROSPACE).toBe(10);

    expect(createCoalition(room, 'IR', 'اتحاد نوین').ok).toBe(true);
    const cid = room.countries.IR.coalitionId!;
    expect(joinCoalition(room, 'RU', cid).ok).toBe(true);
    expect(leaveCoalition(room, 'IR').ok).toBe(true);
    expect(room.countries.IR.coalitionId).toBeNull();
    expect(room.coalitions[cid].leader).toBe('RU');
  });

  it('handles F5 browser refresh race, Host Pause/Resume, Save/Load Snapshot & Rematch over Socket.io', async () => {
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

      // Simulate exact F5 race: new socket joins BEFORE old socket disconnects!
      refreshedTab = ClientSocket(url, { transports: ['websocket'] });
      await new Promise<{ ok: boolean }>((r) =>
        refreshedTab!.emit('lobby:join', { roomCode: code, playerId: 'host-u1', playerName: 'Abtin' }, r)
      );
      oldTab.disconnect();
      await new Promise((r) => setTimeout(r, 120));

      // Host Pause & Resume works on refreshed socket
      const pauseRes = await new Promise<{ ok: boolean; isPaused?: boolean }>((r) =>
        refreshedTab!.emit('game:toggle_pause', r)
      );
      expect(pauseRes.ok).toBe(true);
      expect(pauseRes.isPaused).toBe(true);

      const unpauseRes = await new Promise<{ ok: boolean; isPaused?: boolean }>((r) =>
        refreshedTab!.emit('game:toggle_pause', r)
      );
      expect(unpauseRes.isPaused).toBe(false);

      // Ready advances to Round 2 seamlessly after F5 refresh!
      const round2Promise = new Promise<number>((resolve) => {
        refreshedTab!.on('room:state', (st) => {
          if (st.round === 2 && st.phase === 'PLANNING') resolve(st.round);
        });
      });
      prepareEndOfPlanning; // ensure living world runs via toggle_ready
      refreshedTab.emit('game:toggle_ready', true);
      const r2 = await round2Promise;
      expect(r2).toBe(2);

      // Save Snapshot & Load into a brand-new Resumed Lobby!
      const saveRes = await new Promise<{ ok: boolean; saveCode?: string; roomJson?: string }>((r) =>
        refreshedTab!.emit('game:save_snapshot', r)
      );
      expect(saveRes.ok).toBe(true);
      expect(saveRes.roomJson).toBeTruthy();

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
