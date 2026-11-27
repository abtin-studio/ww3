import React, { useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, GeoPermissibleObjects } from 'd3-geo';
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Tag } from 'lucide-react';
import * as topojson from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
import { ALL_COUNTRY_IDS } from '../../shared/realWorldData';
import {
  ChokepointState,
  CountryId,
  CountryState,
  GameOrder,
  GameRoomState,
  MinorNationState,
} from '../../shared/types';
import { sound } from '../utils/sound';
import { EMPIRE_COLORS, SHORT_NAME_FA } from './CountryFlag';

interface WorldMapProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
  selectedCountryId: CountryId | null;
  selectedMinorId: string | null;
  onSelectCountry: (countryId: CountryId) => void;
  onSelectMinorNation: (minorId: string) => void;
}

type ArcFilterMode = 'RELEVANT' | 'ALL' | 'NONE';

const MAP_W = 1000;
const MAP_H = 510;

const WorldMapInner: React.FC<WorldMapProps> = ({
  room,
  myCountryId,
  selectedCountryId,
  selectedMinorId,
  onSelectCountry,
  onSelectMinorNation,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [arcMode, setArcMode] = useState<ArcFilterMode>('RELEVANT');
  const [forceAllLabels, setForceAllLabels] = useState(false);
  const [hoveredMajorId, setHoveredMajorId] = useState<CountryId | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<{
    nameFa: string;
    subtitleFa: string;
    tagFa: string;
  } | null>(null);

  const dragRef = useRef<{
    pointerDown: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    pointerDown: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const { projection, spherePath, features } = useMemo(() => {
    const topo = worldAtlas as unknown as { objects: { countries: unknown } };
    const rawFc = topojson.feature(
      worldAtlas as unknown as Parameters<typeof topojson.feature>[0],
      topo.objects.countries as Parameters<typeof topojson.feature>[1]
    ) as unknown as {
      type: 'FeatureCollection';
      features: Array<{
        id?: string | number;
        type: 'Feature';
        geometry: GeoPermissibleObjects;
        properties?: { name?: string };
      }>;
    };

    const filteredFeatures = rawFc.features.filter(
      (f) => String(f.id) !== '010' && String(f.id) !== '260'
    );
    const cleanFc = { type: 'FeatureCollection' as const, features: filteredFeatures };

    const proj = geoNaturalEarth1().fitExtent(
      [
        [14, 16],
        [MAP_W - 14, MAP_H - 14],
      ],
      cleanFc as unknown as GeoPermissibleObjects
    );
    const pathGen = geoPath(proj);

    return {
      projection: proj,
      spherePath: pathGen({ type: 'Sphere' }) || '',
      features: filteredFeatures.map((f) => {
        const rawName = f.properties?.name || 'Country';
        const iso =
          f.id !== undefined
            ? String(f.id).padStart(3, '0')
            : `99-${rawName.replace(/\s+/g, '_')}`;
        return {
          iso,
          d: pathGen(f as unknown as GeoPermissibleObjects) || '',
        };
      }),
    };
  }, []);

  const isoMajorMap = useMemo(() => {
    const m = new Map<string, CountryState>();
    for (const c of Object.values(room.countries)) {
      m.set(c.isoNumeric, c);
    }
    return m;
  }, [room.countries]);

  const projectPoint = (coords: [number, number]): [number, number] => {
    const pt = projection(coords);
    return pt ? [Number(pt[0].toFixed(1)), Number(pt[1].toFixed(1))] : [MAP_W / 2, MAP_H / 2];
  };

  const buildSmartArc = (
    from: [number, number],
    to: [number, number],
    slotIndex = 0
  ): string => {
    const [x1, y1] = projectPoint(from);
    const [x2, y2] = projectPoint(to);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.max(1, Math.hypot(dx, dy));

    const nx = -dy / dist;
    const ny = dx / dist;
    const baseLift = Math.min(68, dist * 0.19);
    const slotShift = slotIndex * 12;
    const ctrlX = Math.max(20, Math.min(MAP_W - 20, (x1 + x2) / 2 + nx * slotShift));
    const ctrlY = Math.max(
      20,
      Math.min(MAP_H - 20, (y1 + y2) / 2 - baseLift + ny * slotShift)
    );

    return `M ${x1} ${y1} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${x2} ${y2}`;
  };

  const myCountry = myCountryId ? room.countries[myCountryId] : null;

  const attackedCountriesLastRound = useMemo(() => {
    const s = new Set<CountryId>();
    for (const ev of room.visualEvents) {
      if (ev.toCountry && ev.kind !== 'TRADE' && ev.kind !== 'RECON') {
        s.add(ev.toCountry);
      }
    }
    return s;
  }, [room.visualEvents]);

  const renderedArcs = useMemo(() => {
    if (arcMode === 'NONE') return [];
    const pairCounts = new Map<string, number>();
    const list: Array<{
      id: string;
      d: string;
      color: string;
      width: number;
      opacity: number;
      dashed: boolean;
    }> = [];

    // Cap visible arcs in ALL mode so map never turns into spaghetti
    const eventsToRender =
      arcMode === 'ALL' ? room.visualEvents.slice(0, 14) : room.visualEvents;

    for (const ev of eventsToRender) {
      if (arcMode === 'RELEVANT' && myCountryId) {
        const involvesMe =
          ev.fromCountry === myCountryId ||
          ev.toCountry === myCountryId ||
          ev.fromCountry === selectedCountryId ||
          ev.toCountry === selectedCountryId ||
          ev.kind === 'NUCLEAR';
        if (!involvesMe) continue;
      }

      const key = `${ev.from[0].toFixed(0)},${ev.from[1].toFixed(0)}-${ev.to[0].toFixed(0)},${ev.to[1].toFixed(0)}`;
      const slot = pairCounts.get(key) || 0;
      pairCounts.set(key, slot + 1);

      const color =
        ev.kind === 'NUCLEAR'
          ? '#f43f5e'
          : ev.kind === 'INVASION'
          ? '#fb923c'
          : ev.kind === 'NAVAL'
          ? '#22d3ee'
          : ev.kind === 'FLIGHT'
          ? '#60a5fa'
          : ev.kind === 'MISSILE' || ev.kind === 'DRONE'
          ? '#f87171'
          : ev.kind === 'CYBER'
          ? '#c084fc'
          : '#34d399';

      list.push({
        id: ev.id,
        d: buildSmartArc(ev.from, ev.to, slot % 2 === 0 ? slot / 2 : -Math.ceil(slot / 2)),
        color,
        width: ev.kind === 'NUCLEAR' ? 2.1 : 1.35,
        opacity: ev.intercepted ? 0.35 : 0.82,
        dashed: true,
      });
    }

    if (myCountry) {
      for (const ord of myCountry.orders) {
        const destCoords = ord.targetCountry
          ? room.countries[ord.targetCountry]?.coordinates
          : ord.targetMinorId
          ? room.minorNations[ord.targetMinorId]?.coordinates
          : null;
        if (!destCoords) continue;
        const key = `my-${destCoords[0].toFixed(0)},${destCoords[1].toFixed(0)}`;
        const slot = (pairCounts.get(key) || 0) + 1;
        pairCounts.set(key, slot);

        list.push({
          id: ord.id,
          d: buildSmartArc(myCountry.coordinates, destCoords, slot * 0.7),
          color: ord.kind === 'COVERT_OPERATION' ? '#d8b4fe' : '#34d399',
          width: 1.65,
          opacity: 0.95,
          dashed: true,
        });
      }
    }

    return list;
  }, [arcMode, room.visualEvents, myCountry, myCountryId, selectedCountryId, room.countries, room.minorNations]);

  const clampPan = (nx: number, ny: number, z: number) => {
    const maxPanX = MAP_W * (z - 1) + 120;
    const maxPanY = MAP_H * (z - 1) + 90;
    return {
      x: Math.max(-maxPanX, Math.min(120, nx)),
      y: Math.max(-maxPanY, Math.min(90, ny)),
    };
  };

  const applyZoom = (delta: number) => {
    sound.playClick();
    setZoom((prev) => {
      const next = Math.max(1, Math.min(4, Number((prev + delta).toFixed(2))));
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      } else {
        const cx = MAP_W / 2;
        const cy = MAP_H / 2;
        const ratio = next / prev;
        setPan((p) => clampPan(cx - (cx - p.x) * ratio, cy - (cy - p.y) * ratio, next));
      }
      return next;
    });
  };

  const focusOnCountry = (cid: CountryId | null) => {
    sound.playClick();
    if (!cid || !room.countries[cid]) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const [cx, cy] = projectPoint(room.countries[cid].coordinates);
    const nextZoom = 2.25;
    setZoom(nextZoom);
    setPan(clampPan(MAP_W / 2 - cx * nextZoom, MAP_H / 2 - cy * nextZoom, nextZoom));
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? 0.28 : -0.28);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      pointerDown: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.pointerDown) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 6) {
      dragRef.current.moved = true;
      setPan(clampPan(dragRef.current.origX + dx * 0.9, dragRef.current.origY + dy * 0.9, zoom));
    }
  };

  const handlePointerUp = () => {
    dragRef.current.pointerDown = false;
  };

  const handleSelectMajorSafe = (cid: CountryId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current.moved) return;
    sound.playRadarPing();
    onSelectCountry(cid);
  };

  const handleSelectMinorSafe = (minorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current.moved) return;
    sound.playRadarPing();
    onSelectMinorNation(minorId);
  };

  const invScale = 1 / Math.pow(zoom, 0.46);
  const myPendingOrders: GameOrder[] = myCountry ? myCountry.orders : [];

  return (
    <div className="relative w-full h-full min-h-[370px] sm:min-h-[480px] glass-panel rounded-2xl overflow-hidden select-none">
      {/* Sleek Unified Top-Right Layer Switcher */}
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
        <div className="p-0.5 rounded-xl bg-[#050c1a]/88 border border-slate-700/70 backdrop-blur-md flex items-center gap-0.5 text-[11px] font-bold shadow-lg">
          {(
            [
              ['RELEVANT', '🎯 مرتبط با من'],
              ['ALL', '🌐 عملیات‌ها'],
              ['NONE', '🗺️ نقشه خلوت'],
            ] as [ArcFilterMode, string][]
          ).map(([mode, lbl]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                sound.playClick();
                setArcMode(mode);
              }}
              className={`px-2.5 py-1 rounded-lg transition ${
                arcMode === mode
                  ? 'bg-emerald-500 text-slate-950 font-black shadow'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Crisp Hover Country Intel Card */}
      {hoveredInfo && (
        <div className="absolute top-12 right-2.5 z-10 px-3 py-2 rounded-xl bg-[#061021]/95 border border-cyan-500/40 shadow-2xl backdrop-blur-md pointer-events-none max-w-xs animate-panel-in">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-xs text-white">{hoveredInfo.nameFa}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 text-[10px] font-bold">
              {hoveredInfo.tagFa}
            </span>
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5">{hoveredInfo.subtitleFa}</div>
        </div>
      )}

      {/* Sleek Compact Floating Navigation Dock (Top-Left) */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 p-1 rounded-xl bg-[#050c1a]/88 border border-slate-700/70 backdrop-blur-md shadow-lg">
        <button
          type="button"
          title="بزرگ‌نمایی"
          onClick={() => applyZoom(0.4)}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="کوچک‌نمایی"
          onClick={() => applyZoom(-0.4)}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="نمای کامل جهان"
          onClick={() => {
            sound.playClick();
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        {myCountryId && (
          <button
            type="button"
            title="تمرکز روی پایتخت من"
            onClick={() => focusOnCountry(myCountryId)}
            className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          title="نمایش همه نام‌ها یا حالت هوشمند خلوت"
          onClick={() => {
            sound.playClick();
            setForceAllLabels((v) => !v);
          }}
          className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
            forceAllLabels
              ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Tag className="w-3 h-3" />
          <span className="hidden sm:inline">{forceAllLabels ? 'همه نام‌ها' : 'هوشمند'}</span>
        </button>
      </div>

      {/* Ultra-Clean Minimal Legend Pill */}
      <div className="absolute bottom-2.5 inset-x-3 z-10 flex items-center justify-between pointer-events-none gap-2">
        <div className="px-3 py-1 rounded-full bg-[#050c1a]/88 border border-slate-800/90 text-[10px] text-slate-300 flex items-center gap-3 backdrop-blur-md">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> کشور شما
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> متحد
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> بازیکن رقیب
          </span>
          <span className="hidden md:inline text-slate-400">
            • زوم کنید تا برچسب تمام پایتخت‌ها باز شود
          </span>
        </div>
        {(renderedArcs.length > 0 || myPendingOrders.length > 0) && (
          <div className="hidden sm:block px-2.5 py-1 rounded-full bg-emerald-500/12 border border-emerald-500/30 text-[10px] text-emerald-300 font-bold">
            {myPendingOrders.length > 0 ? `${myPendingOrders.length} دستور آماده اجرا` : `${renderedArcs.length} خط عملیاتی`}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          handlePointerUp();
          setHoveredMajorId(null);
          setHoveredInfo(null);
        }}
      >
        <defs>
          <radialGradient id="oceanModernV6" cx="50%" cy="46%" r="68%">
            <stop offset="0%" stopColor="#07152b" />
            <stop offset="65%" stopColor="#040b18" />
            <stop offset="100%" stopColor="#02050b" />
          </radialGradient>

          {ALL_COUNTRY_IDS.map((cid) => (
            <linearGradient key={`front-grad-${cid}`} id={`front-grad-${cid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0f1f38" stopOpacity="0.96" />
              <stop offset="58%" stopColor="#132645" stopOpacity="0.92" />
              <stop offset="100%" stopColor={EMPIRE_COLORS[cid]} stopOpacity="0.65" />
            </linearGradient>
          ))}
        </defs>

        <rect width={MAP_W} height={MAP_H} fill="#02050b" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {spherePath && (
            <path d={spherePath} fill="url(#oceanModernV6)" stroke="#11223d" strokeWidth={0.7 * invScale} />
          )}

          {/* ALL 195 World Country Polygons — Clean Modern Vector Style (No Grid Clutter!) */}
          {features.map((f, idx) => {
            if (!f.d) return null;
            const gameCountry = isoMajorMap.get(f.iso);
            const minorCountry: MinorNationState | undefined = !gameCountry
              ? room.minorNations[f.iso]
              : undefined;

            if (!gameCountry) {
              const conqueror = minorCountry?.conqueredBy ? room.countries[minorCountry.conqueredBy] : null;
              const occupier =
                !conqueror && minorCountry?.occupierId && (minorCountry.occupationPct || 0) > 0
                  ? room.countries[minorCountry.occupierId]
                  : null;
              const protector = minorCountry?.alignedWith ? room.countries[minorCountry.alignedWith] : null;
              const isSelectedMinor = Boolean(minorCountry && minorCountry.id === selectedMinorId);
              const isMyConquest = Boolean(minorCountry && minorCountry.conqueredBy === myCountryId);
              const isMyProtectorate = Boolean(minorCountry && minorCountry.alignedWith === myCountryId);

              const fill = isSelectedMinor
                ? '#0284c7'
                : isMyConquest
                ? '#059669'
                : conqueror
                ? EMPIRE_COLORS[conqueror.id]
                : occupier
                ? `url(#front-grad-${occupier.id})`
                : isMyProtectorate
                ? '#0e4959'
                : protector
                ? '#112642'
                : '#0c1729';

              const fillOpacity = isSelectedMinor
                ? 0.94
                : isMyConquest
                ? 0.72
                : conqueror
                ? 0.58
                : 0.94;

              const stroke = isSelectedMinor
                ? '#7dd3fc'
                : isMyConquest
                ? '#34d399'
                : conqueror
                ? EMPIRE_COLORS[conqueror.id]
                : occupier
                ? EMPIRE_COLORS[occupier.id]
                : '#172a47';

              return (
                <path
                  key={`mnr-${f.iso}-${idx}`}
                  d={f.d}
                  fill={fill}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeWidth={(isSelectedMinor ? 1.1 : conqueror || occupier ? 0.65 : 0.4) * invScale}
                  strokeDasharray={occupier ? `${2 * invScale} ${1.3 * invScale}` : undefined}
                  className={minorCountry ? 'cursor-pointer transition-opacity duration-150 hover:opacity-100' : ''}
                  onMouseEnter={() => {
                    setHoveredMajorId(null);
                    if (!minorCountry) return;
                    setHoveredInfo({
                      nameFa: minorCountry.nameFa,
                      tagFa: conqueror
                        ? `🏴 قلمرو ${conqueror.nameFa}`
                        : occupier
                        ? `⚔️ خط مقدم (${minorCountry.occupationPct}٪ پیشروی ${occupier.nameFa})`
                        : protector
                        ? `🤝 هم‌پیمان ${protector.nameFa}`
                        : 'کشور مستقل',
                      subtitleFa: `اقتصاد: $${minorCountry.gdpB}B • نفت: +${minorCountry.oilBonus} • مدافع: ${minorCountry.garrisonPower}`,
                    });
                  }}
                  onClick={(e) => {
                    if (minorCountry) handleSelectMinorSafe(minorCountry.id, e);
                  }}
                />
              );
            }

            const isMine = gameCountry.id === myCountryId;
            const isSelected = gameCountry.id === selectedCountryId;
            const isHovered = gameCountry.id === hoveredMajorId;
            const isAlly = Boolean(
              myCountry?.allies.includes(gameCountry.id) || myCountry?.secretAllies?.includes(gameCountry.id)
            );
            const isHumanOther = Boolean(gameCountry.playerId && !isMine);
            const conquerorOfMajor = gameCountry.conqueredBy ? room.countries[gameCountry.conqueredBy] : null;
            const partialInvader =
              !gameCountry.isEliminated && gameCountry.integrityPct < 100 && gameCountry.occupierId
                ? room.countries[gameCountry.occupierId]
                : null;

            const fill = gameCountry.isEliminated
              ? conquerorOfMajor
                ? EMPIRE_COLORS[conquerorOfMajor.id]
                : '#27272a'
              : isSelected
              ? '#0284c7'
              : partialInvader
              ? `url(#front-grad-${partialInvader.id})`
              : isMine
              ? '#059669'
              : isAlly
              ? '#0e7490'
              : isHumanOther
              ? '#b45309'
              : isHovered
              ? '#23437d'
              : '#172e57';

            const stroke = isSelected
              ? '#7dd3fc'
              : isMine
              ? '#34d399'
              : partialInvader
              ? EMPIRE_COLORS[partialInvader.id]
              : isHumanOther
              ? '#fbbf24'
              : isHovered
              ? '#60a5fa'
              : '#2b4b82';

            return (
              <path
                key={`pwr-${gameCountry.id}-${idx}`}
                d={f.d}
                fill={fill}
                fillOpacity={gameCountry.isEliminated ? 0.55 : isSelected ? 0.96 : 0.9}
                stroke={stroke}
                strokeWidth={(isSelected || isMine ? 1.2 : 0.62) * invScale}
                strokeDasharray={partialInvader ? `${2.4 * invScale} ${1.4 * invScale}` : undefined}
                className="cursor-pointer transition-colors duration-150"
                onMouseEnter={() => {
                  setHoveredMajorId(gameCountry.id);
                  const myRel = myCountry ? myCountry.relations[gameCountry.id] : null;
                  const isSecretAlly = Boolean(myCountry?.secretAllies?.includes(gameCountry.id));
                  setHoveredInfo({
                    nameFa: `${gameCountry.nameFa}${gameCountry.playerName ? ` (${gameCountry.playerName})` : ''}`,
                    tagFa: gameCountry.isEliminated
                      ? 'سقوط دولت!'
                      : isSecretAlly
                      ? '🕵️ متحد محرمانه شما'
                      : partialInvader
                      ? `⚔️ ${100 - gameCountry.integrityPct}٪ مرز درگیر با ${partialInvader.nameFa}`
                      : gameCountry.archetypeTagFa || 'قدرت راهبردی',
                    subtitleFa: `خاک: ${gameCountry.integrityPct}٪ • رضایت: ${gameCountry.approval}٪${
                      gameCountry.orbitalSatellites > 0 ? ` • 🛰️ ${gameCountry.orbitalSatellites}` : ''
                    }${myRel !== null && !isMine ? ` • رابطه: ${myRel > 0 ? `+${myRel}` : myRel}` : ''}`,
                  });
                }}
                onClick={(e) => handleSelectMajorSafe(gameCountry.id, e)}
              />
            );
          })}

          {/* Sleek Maritime Chokepoint Diamonds */}
          {Object.values(room.chokepoints).map((cp: ChokepointState) => {
            const [x, y] = projectPoint(cp.coordinates);
            const color =
              cp.status === 'BLOCKADED'
                ? '#ef4444'
                : cp.status === 'RESTRICTED'
                ? '#f59e0b'
                : '#10b981';

            return (
              <g key={cp.id} transform={`translate(${x}, ${y}) scale(${invScale})`}>
                {cp.status !== 'OPEN' && (
                  <circle cx={0} cy={0} r={8} fill={color} fillOpacity={0.25}>
                    <animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="fill-opacity" values="0.45;0.05;0.45" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <polygon
                  points="0,-3.8 3.8,0 0,3.8 -3.8,0"
                  fill={color}
                  stroke="#020617"
                  strokeWidth={0.85}
                />
                <title>{`${cp.nameFa} (کنترل: ${room.countries[cp.controller]?.nameFa || cp.controller}) — ${
                  cp.status === 'OPEN' ? 'آزاد' : cp.status === 'RESTRICTED' ? 'بازرسی نظامی' : 'مسدود شده!'
                }`}</title>
              </g>
            );
          })}

          {/* Filtered Operational Trajectories */}
          {renderedArcs.map((arc) => (
            <path
              key={arc.id}
              d={arc.d}
              fill="none"
              stroke={arc.color}
              strokeWidth={arc.width * invScale}
              strokeOpacity={arc.opacity}
              strokeLinecap="round"
              className={arc.dashed ? 'animate-flight-arc' : undefined}
              pointerEvents="none"
            />
          ))}

          {/* Smart Level-of-Detail (LOD) Capital Pins — Zero Overlap Clutter at Default Zoom! */}
          {Object.values(room.countries).map((c) => {
            const [ax, ay] = projectPoint(c.coordinates);
            const isMine = c.id === myCountryId;
            const isSelected = c.id === selectedCountryId;
            const isHovered = c.id === hoveredMajorId;
            const isHuman = Boolean(c.playerId);
            const wasHit = attackedCountriesLastRound.has(c.id);
            const hasSats = (c.orbitalSatellites || 0) > 0;

            // Smart LOD: Show full pill ONLY when relevant, zoomed in (>= 1.5), or explicitly toggled!
            const showFullPill =
              forceAllLabels ||
              zoom >= 1.5 ||
              isMine ||
              isHuman ||
              isSelected ||
              isHovered ||
              wasHit;

            const [rawDx, rawDy] = showFullPill && (zoom >= 1.5 || forceAllLabels) ? c.labelOffset || [0, 0] : [0, -11];
            const bx = ax + rawDx * invScale;
            const by = ay + rawDy * invScale;

            return (
              <g
                key={`pin-${c.id}`}
                onMouseEnter={() => setHoveredMajorId(c.id)}
              >
                <g
                  transform={`translate(${ax}, ${ay}) scale(${invScale})`}
                  className="cursor-pointer"
                  onClick={(e) => handleSelectMajorSafe(c.id, e)}
                >
                  {wasHit && !c.isEliminated && (
                    <circle cx={0} cy={0} r={9} fill="#ef4444" fillOpacity={0.35}>
                      <animate attributeName="r" values="4;14;4" dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="fill-opacity" values="0.5;0.05;0.5" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {isMine && !c.isEliminated && (
                    <circle cx={0} cy={0} r={9} fill="#10b981" fillOpacity={0.28}>
                      <animate attributeName="r" values="4;13;4" dur="2.4s" repeatCount="indefinite" />
                      <animate attributeName="fill-opacity" values="0.4;0.05;0.4" dur="2.4s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    cx={0}
                    cy={0}
                    r={isMine || isSelected ? 3.5 : 2.6}
                    fill={
                      c.isEliminated
                        ? '#64748b'
                        : isMine
                        ? '#34d399'
                        : isSelected
                        ? '#38bdf8'
                        : isHuman
                        ? '#fbbf24'
                        : '#e2e8f0'
                    }
                    stroke="#020617"
                    strokeWidth={0.9}
                  />
                </g>

                {showFullPill && (
                  <g
                    transform={`translate(${bx}, ${by}) scale(${invScale})`}
                    className="cursor-pointer"
                    onClick={(e) => handleSelectMajorSafe(c.id, e)}
                  >
                    <rect
                      x={-22}
                      y={-7.5}
                      width={44}
                      height={15}
                      rx={5}
                      fill={
                        c.isEliminated
                          ? '#18181b'
                          : isSelected
                          ? '#0284c7'
                          : isMine
                          ? '#065f46'
                          : isHuman
                          ? '#92400e'
                          : '#071122'
                      }
                      fillOpacity={0.94}
                      stroke={
                        c.isEliminated
                          ? '#52525b'
                          : isSelected
                          ? '#7dd3fc'
                          : isMine
                          ? '#34d399'
                          : isHuman
                          ? '#fbbf24'
                          : '#334155'
                      }
                      strokeWidth={isSelected || isMine ? 1.15 : 0.7}
                    />
                    {hasSats && !c.isEliminated && (
                      <circle cx={18} cy={-4} r={1.8} fill="#38bdf8" />
                    )}
                    <text
                      x={0}
                      y={2.5}
                      textAnchor="middle"
                      fontSize={6.3}
                      fontWeight="bold"
                      fill={c.isEliminated ? '#71717a' : '#f8fafc'}
                      pointerEvents="none"
                    >
                      {SHORT_NAME_FA[c.id]}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export const WorldMap = React.memo(WorldMapInner);
