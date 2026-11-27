import React, { useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath, GeoPermissibleObjects } from 'd3-geo';
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
  const [showLabels, setShowLabels] = useState(true);
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

  const { projection, spherePath, graticulePath, features } = useMemo(() => {
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
        [14, 18],
        [MAP_W - 14, MAP_H - 14],
      ],
      cleanFc as unknown as GeoPermissibleObjects
    );
    const pathGen = geoPath(proj);

    return {
      projection: proj,
      spherePath: pathGen({ type: 'Sphere' }) || '',
      graticulePath: pathGen(geoGraticule10()) || '',
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
    const baseLift = Math.min(72, dist * 0.2);
    const slotShift = slotIndex * 14;
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

    for (const ev of room.visualEvents) {
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
          ? '#f97316'
          : ev.kind === 'NAVAL'
          ? '#06b6d4'
          : ev.kind === 'FLIGHT'
          ? '#38bdf8'
          : ev.kind === 'MISSILE' || ev.kind === 'DRONE'
          ? '#ef4444'
          : ev.kind === 'CYBER'
          ? '#c084fc'
          : '#10b981';

      list.push({
        id: ev.id,
        d: buildSmartArc(ev.from, ev.to, slot % 2 === 0 ? slot / 2 : -Math.ceil(slot / 2)),
        color,
        width: ev.kind === 'NUCLEAR' ? 2.2 : 1.45,
        opacity: ev.intercepted ? 0.42 : 0.88,
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
          d: buildSmartArc(myCountry.coordinates, destCoords, slot * 0.8),
          color: ord.kind === 'COVERT_OPERATION' ? '#d8b4fe' : '#fb7185',
          width: 1.75,
          opacity: 0.96,
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
    const nextZoom = 2.2;
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

  const invScale = 1 / Math.pow(zoom, 0.42);
  const myPendingOrders: GameOrder[] = myCountry ? myCountry.orders : [];

  return (
    <div className="relative w-full h-full min-h-[370px] sm:min-h-[480px] glass-panel rounded-2xl overflow-hidden select-none">
      {/* Top Right Layer Filter Bar */}
      <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center gap-1.5">
        <div className="p-1 rounded-xl bg-[#060f1f]/90 border border-slate-700/80 backdrop-blur-md flex items-center gap-1 text-[11px] font-bold">
          {(
            [
              ['RELEVANT', '🎯 فقط مرتبط با من'],
              ['ALL', '🌍 کل عملیات جهان'],
              ['NONE', '🗺️ نمای سیاسی خالص'],
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
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Live Hover Country Intel Pill */}
      {hoveredInfo && (
        <div className="absolute top-14 right-3 z-10 px-3.5 py-2 rounded-xl bg-[#071225]/95 border border-cyan-500/40 shadow-xl backdrop-blur-md pointer-events-none max-w-xs animate-panel-in">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-xs text-white">{hoveredInfo.nameFa}</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
              {hoveredInfo.tagFa}
            </span>
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5">{hoveredInfo.subtitleFa}</div>
        </div>
      )}

      {/* Zoom & Label Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          title="بزرگ‌نمایی"
          onClick={() => applyZoom(0.38)}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="کوچک‌نمایی"
          onClick={() => applyZoom(-0.38)}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="نمای کامل جهان"
          onClick={() => {
            sound.playClick();
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        {myCountryId && (
          <button
            type="button"
            title="تمرکز روی پایتخت من"
            onClick={() => focusOnCountry(myCountryId)}
            className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 shadow"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          title="نمایش/مخفی کردن برچسب نام کشورها"
          onClick={() => {
            sound.playClick();
            setShowLabels((v) => !v);
          }}
          className={`p-2 rounded-xl border shadow ${
            showLabels
              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
              : 'bg-[#0b1528]/90 border-slate-700 text-slate-400'
          }`}
        >
          <Tag className="w-4 h-4" />
        </button>
      </div>

      {/* Clean Minimal Legend */}
      <div className="absolute bottom-2.5 inset-x-3 z-10 flex items-center justify-between pointer-events-none gap-2">
        <div className="px-3 py-1 rounded-full bg-[#060f1f]/90 border border-slate-800 text-[10px] sm:text-[11px] text-slate-300 flex items-center gap-3 backdrop-blur-md">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> قلمرو شما
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" /> متحد
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> رقیب انسانی
          </span>
          <span className="hidden sm:inline text-slate-400">
            • هم‌رنگ شدن مرزها = قلمرو ضمیمه‌شده به امپراتوری
          </span>
        </div>
        {(renderedArcs.length > 0 || myPendingOrders.length > 0) && (
          <div className="hidden sm:block px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/35 text-[11px] text-rose-200 font-bold">
            ⚡ {renderedArcs.length} مسیر فعال
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
          setHoveredInfo(null);
        }}
      >
        <defs>
          <radialGradient id="oceanGlowV5" cx="50%" cy="48%" r="65%">
            <stop offset="0%" stopColor="#081832" />
            <stop offset="100%" stopColor="#02060e" />
          </radialGradient>

          {/* Silky Smooth Frontline Gradient for Partially Contested Countries (Zero Ugly Stripes!) */}
          {ALL_COUNTRY_IDS.map((cid) => (
            <linearGradient key={`front-grad-${cid}`} id={`front-grad-${cid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#12233f" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#152847" stopOpacity="0.9" />
              <stop offset="100%" stopColor={EMPIRE_COLORS[cid]} stopOpacity="0.62" />
            </linearGradient>
          ))}
        </defs>

        <rect width={MAP_W} height={MAP_H} fill="#02060e" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {spherePath && (
            <path d={spherePath} fill="url(#oceanGlowV5)" stroke="#162947" strokeWidth={0.8 * invScale} />
          )}
          {graticulePath && (
            <path
              d={graticulePath}
              fill="none"
              stroke="#12233e"
              strokeWidth={0.32 * invScale}
              strokeOpacity={0.45}
            />
          )}

          {/* ALL 195 World Country Polygons — Clean Velvet Sovereign Shading */}
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
                ? '#0f4c5c'
                : protector
                ? '#142c4c'
                : '#0e1b30';

              const fillOpacity = isSelectedMinor
                ? 0.92
                : isMyConquest
                ? 0.68
                : conqueror
                ? 0.56
                : 0.92;

              const stroke = isSelectedMinor
                ? '#7dd3fc'
                : isMyConquest
                ? '#34d399'
                : conqueror
                ? EMPIRE_COLORS[conqueror.id]
                : occupier
                ? EMPIRE_COLORS[occupier.id]
                : '#1b3154';

              return (
                <path
                  key={`mnr-${f.iso}-${idx}`}
                  d={f.d}
                  fill={fill}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeWidth={(isSelectedMinor ? 1.15 : conqueror || occupier ? 0.7 : 0.46) * invScale}
                  strokeDasharray={occupier ? `${2.2 * invScale} ${1.4 * invScale}` : undefined}
                  className={minorCountry ? 'cursor-pointer transition-opacity duration-150 hover:opacity-100' : ''}
                  onMouseEnter={() => {
                    if (!minorCountry) return;
                    setHoveredInfo({
                      nameFa: minorCountry.nameFa,
                      tagFa: conqueror
                        ? `🏴 قلمرو ${conqueror.nameFa}`
                        : occupier
                        ? `⚔️ خط مقدم نبرد (${minorCountry.occupationPct}٪ پیشروی ${occupier.nameFa})`
                        : protector
                        ? `🤝 هم‌پیمان ${protector.nameFa}`
                        : 'کشور مستقل',
                      subtitleFa: `اقتصاد: $${minorCountry.gdpB}B • نفت: +${minorCountry.oilBonus} • ارتش مدافع: ${minorCountry.garrisonPower}`,
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
              : '#1c3564';

            const stroke = isSelected
              ? '#7dd3fc'
              : isMine
              ? '#34d399'
              : partialInvader
              ? EMPIRE_COLORS[partialInvader.id]
              : isHumanOther
              ? '#fbbf24'
              : '#365a96';

            return (
              <path
                key={`pwr-${gameCountry.id}-${idx}`}
                d={f.d}
                fill={fill}
                fillOpacity={gameCountry.isEliminated ? 0.55 : isSelected ? 0.95 : 0.88}
                stroke={stroke}
                strokeWidth={(isSelected || isMine ? 1.25 : 0.7) * invScale}
                strokeDasharray={partialInvader ? `${2.6 * invScale} ${1.5 * invScale}` : undefined}
                className="cursor-pointer transition-opacity duration-150 hover:opacity-100"
                onMouseEnter={() => {
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
                      gameCountry.orbitalSatellites > 0 ? ` • 🛰️ ${gameCountry.orbitalSatellites} ماهواره` : ''
                    }${myRel !== null && !isMine ? ` • رابطه: ${myRel > 0 ? `+${myRel}` : myRel}` : ''}`,
                  });
                }}
                onClick={(e) => handleSelectMajorSafe(gameCountry.id, e)}
              />
            );
          })}

          {/* Strategic Maritime Chokepoints */}
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
                  <circle cx={0} cy={0} r={9} fill={color} fillOpacity={0.28}>
                    <animate attributeName="r" values="5;13;5" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="fill-opacity" values="0.45;0.06;0.45" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <polygon
                  points="0,-4.4 4.4,0 0,4.4 -4.4,0"
                  fill={color}
                  stroke="#020617"
                  strokeWidth={0.9}
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

          {/* 20 Major Power Capital Anchors & Badges */}
          {Object.values(room.countries).map((c) => {
            const [ax, ay] = projectPoint(c.coordinates);
            const [rawDx, rawDy] = c.labelOffset || [0, 0];
            const dx = rawDx * invScale;
            const dy = rawDy * invScale;
            const bx = ax + dx;
            const by = ay + dy;
            const hasOffset = Math.hypot(rawDx, rawDy) > 4;

            const isMine = c.id === myCountryId;
            const isSelected = c.id === selectedCountryId;
            const isHuman = Boolean(c.playerId);
            const wasHit = attackedCountriesLastRound.has(c.id);
            const hasSats = (c.orbitalSatellites || 0) > 0;

            return (
              <g key={`pin-${c.id}`}>
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
                    r={2.4}
                    fill={
                      c.isEliminated
                        ? '#64748b'
                        : isMine
                        ? '#34d399'
                        : isHuman
                        ? '#fbbf24'
                        : '#cbd5e1'
                    }
                  />
                </g>

                {showLabels && hasOffset && (
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    stroke={isSelected ? '#7dd3fc' : '#475569'}
                    strokeWidth={0.72 * invScale}
                    strokeOpacity={0.7}
                    pointerEvents="none"
                  />
                )}

                {showLabels && (
                  <g
                    transform={`translate(${bx}, ${by}) scale(${invScale})`}
                    className="cursor-pointer"
                    onClick={(e) => handleSelectMajorSafe(c.id, e)}
                  >
                    <rect
                      x={-24}
                      y={-8}
                      width={48}
                      height={16}
                      rx={4.5}
                      fill={
                        c.isEliminated
                          ? '#18181b'
                          : isSelected
                          ? '#0284c7'
                          : isMine
                          ? '#065f46'
                          : isHuman
                          ? '#92400e'
                          : '#081224'
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
                      strokeWidth={isSelected || isMine ? 1.2 : 0.7}
                    />
                    {/* Subtle cyan satellite indicator dot on top-right of badge */}
                    {hasSats && !c.isEliminated && (
                      <circle cx={20} cy={-4.5} r={2} fill="#38bdf8" />
                    )}
                    <text
                      x={0}
                      y={2.8}
                      textAnchor="middle"
                      fontSize={6.5}
                      fontWeight="bold"
                      fill={c.isEliminated ? '#71717a' : '#f8fafc'}
                    >
                      {c.isEliminated ? `✕ ${SHORT_NAME_FA[c.id]}` : SHORT_NAME_FA[c.id]}
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
