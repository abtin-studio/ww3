import React, { useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath, GeoPermissibleObjects } from 'd3-geo';
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Eye, EyeOff } from 'lucide-react';
import * as topojson from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
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

const MAP_W = 1000;
const MAP_H = 510;

export const WorldMap: React.FC<WorldMapProps> = ({
  room,
  myCountryId,
  selectedCountryId,
  selectedMinorId,
  onSelectCountry,
  onSelectMinorNation,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showArcs, setShowArcs] = useState(true);
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

  /**
   * Builds a non-overlapping, viewport-clamped tactical trajectory!
   * Parallel arcs between the same pair of endpoints receive distinct curvature slots (`slotIndex`)
   * so lines NEVER overlap or flicker on top of each other.
   */
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

    // Normal perpendicular vector
    const nx = -dy / dist;
    const ny = dx / dist;

    // Base upward lift + distinct slot offset so multiple ops fan out cleanly
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

  // Pre-assign non-overlapping slot indices for all trajectories
  const renderedArcs = useMemo(() => {
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
  }, [room.visualEvents, myCountry, room.countries, room.minorNations]);

  const clampPan = (nx: number, ny: number, z: number) => {
    const maxPanX = MAP_W * (z - 1) + 120;
    const maxPanY = MAP_H * (z - 1) + 90;
    return {
      x: Math.max(-maxPanX, Math.min(120, nx)),
      y: Math.max(-maxPanY, Math.min(90, ny)),
    };
  };

  const applyZoom = (delta: number) => {
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
    <div className="relative w-full h-full min-h-[370px] sm:min-h-[480px] bg-[#030813] rounded-2xl border border-slate-800/90 overflow-hidden select-none shadow-2xl">
      {/* Legend */}
      <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="px-3 py-1.5 rounded-xl bg-[#071122]/90 border border-slate-700/80 text-[11px] text-slate-200 flex items-center gap-3 backdrop-blur-md">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> قلمرو شما
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> متحد
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> بازیکن رقیب
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" /> ۲۰ قدرت اصلی
          </span>
          <span className="hidden md:flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> سایر کشورهای قابل تصرف
          </span>
        </div>
      </div>

      {/* Live Hover Country Intel Pill */}
      {hoveredInfo && (
        <div className="absolute top-14 right-3 z-10 px-3.5 py-2 rounded-xl bg-[#081326]/95 border border-cyan-500/40 shadow-xl backdrop-blur-md pointer-events-none max-w-xs">
          <div className="flex items-center gap-2">
            <span className="font-black text-xs text-white">{hoveredInfo.nameFa}</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
              {hoveredInfo.tagFa}
            </span>
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5">{hoveredInfo.subtitleFa}</div>
        </div>
      )}

      {/* Zoom & Layer Controls */}
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
          title="نمایش/مخفی کردن مسیرهای عملیات"
          onClick={() => setShowArcs((v) => !v)}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-cyan-300 shadow"
        >
          {showArcs ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-2.5 inset-x-3 z-10 flex items-center justify-between pointer-events-none gap-2">
        <div className="px-3 py-1 rounded-full bg-[#071122]/90 border border-slate-800 text-[11px] text-slate-300">
          🌍 تمامی ۱۹۵ کشور نقشه کلیک‌پذیرند: ۲۰ قدرت اصلی (جنگ/دیپلماسی/جاسوسی) + سایر کشورها (کشورگشایی، کودتا و پایگاه!)
        </div>
        {(room.visualEvents.length > 0 || myPendingOrders.length > 0) && (
          <div className="hidden sm:block px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/35 text-[11px] text-rose-200 font-bold">
            ⚡ {room.visualEvents.length + myPendingOrders.length} مسیر عملیاتی فعال
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
          <radialGradient id="oceanGlowV3" cx="50%" cy="48%" r="65%">
            <stop offset="0%" stopColor="#091a36" />
            <stop offset="100%" stopColor="#02060f" />
          </radialGradient>
        </defs>

        <rect width={MAP_W} height={MAP_H} fill="#02060f" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Spherical Ocean & Subtle Tactical Graticule */}
          {spherePath && (
            <path d={spherePath} fill="url(#oceanGlowV3)" stroke="#172a4a" strokeWidth={0.8 * invScale} />
          )}
          {graticulePath && (
            <path
              d={graticulePath}
              fill="none"
              stroke="#132542"
              strokeWidth={0.35 * invScale}
              strokeOpacity={0.55}
            />
          )}

          {/* ALL World Country Polygons (20 Major Powers + 155+ Conquerable Minor Nations!) */}
          {features.map((f, idx) => {
            if (!f.d) return null;
            const gameCountry = isoMajorMap.get(f.iso);
            const minorCountry: MinorNationState | undefined = !gameCountry
              ? room.minorNations[f.iso]
              : undefined;

            if (!gameCountry) {
              const conqueror = minorCountry?.conqueredBy ? room.countries[minorCountry.conqueredBy] : null;
              const protector = minorCountry?.alignedWith ? room.countries[minorCountry.alignedWith] : null;
              const isSelectedMinor = Boolean(minorCountry && minorCountry.id === selectedMinorId);
              const isMyConquest = Boolean(minorCountry && minorCountry.conqueredBy === myCountryId);
              const isMyProtectorate = Boolean(minorCountry && minorCountry.alignedWith === myCountryId);

              const fill = isSelectedMinor
                ? '#0284c7'
                : isMyConquest
                ? '#047857'
                : conqueror
                ? EMPIRE_COLORS[conqueror.id]
                : isMyProtectorate
                ? '#0f4c5c'
                : '#0f1e36';

              const stroke = isSelectedMinor
                ? '#7dd3fc'
                : conqueror
                ? '#e2e8f0'
                : '#1c3358';

              return (
                <path
                  key={`mnr-${f.iso}-${idx}`}
                  d={f.d}
                  fill={fill}
                  fillOpacity={conqueror ? 0.68 : isSelectedMinor ? 0.9 : 0.92}
                  stroke={stroke}
                  strokeWidth={(isSelectedMinor ? 1.15 : 0.52) * invScale}
                  className={minorCountry ? 'cursor-pointer transition-opacity duration-150 hover:opacity-100' : ''}
                  onMouseEnter={() => {
                    if (!minorCountry) return;
                    setHoveredInfo({
                      nameFa: minorCountry.nameFa,
                      tagFa: conqueror
                        ? `ضمیمه ${conqueror.nameFa}`
                        : protector
                        ? `هم‌پیمان ${protector.nameFa}`
                        : 'کشور مستقل',
                      subtitleFa: `اقتصاد: $${minorCountry.gdpB}B • نفت: +${minorCountry.oilBonus} • پادگان دفاعی: ${minorCountry.garrisonPower}`,
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
            const isAlly = Boolean(myCountry?.allies.includes(gameCountry.id));
            const isHumanOther = Boolean(gameCountry.playerId && !isMine);
            const conquerorOfMajor = gameCountry.conqueredBy ? room.countries[gameCountry.conqueredBy] : null;

            const fill = gameCountry.isEliminated
              ? conquerorOfMajor
                ? EMPIRE_COLORS[conquerorOfMajor.id]
                : '#27272a'
              : isMine
              ? '#059669'
              : isSelected
              ? '#0284c7'
              : isAlly
              ? '#0e7490'
              : isHumanOther
              ? '#b45309'
              : '#1e3a6d';

            const stroke = isSelected
              ? '#7dd3fc'
              : isMine
              ? '#34d399'
              : isHumanOther
              ? '#fbbf24'
              : '#3b63a3';

            return (
              <path
                key={`pwr-${gameCountry.id}-${idx}`}
                d={f.d}
                fill={fill}
                fillOpacity={gameCountry.isEliminated ? 0.55 : isSelected ? 0.96 : 0.88}
                stroke={stroke}
                strokeWidth={(isSelected || isMine ? 1.3 : 0.72) * invScale}
                className="cursor-pointer transition-opacity duration-150 hover:opacity-100"
                onMouseEnter={() => {
                  setHoveredInfo({
                    nameFa: `${gameCountry.nameFa}${gameCountry.playerName ? ` (${gameCountry.playerName})` : ''}`,
                    tagFa: gameCountry.isEliminated
                      ? 'سقوط دولت!'
                      : gameCountry.playerId
                      ? 'بازیکن انسانی'
                      : 'قدرت فعال AI',
                    subtitleFa: `تمامیت ارضی: ${gameCountry.integrityPct}٪ • رضایت: ${gameCountry.approval}٪ • ویرانی: ${gameCountry.devastation}٪`,
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
                  points="0,-4.6 4.6,0 0,4.6 -4.6,0"
                  fill={color}
                  stroke="#020617"
                  strokeWidth={0.95}
                />
                <title>{`${cp.nameFa} (کنترل: ${room.countries[cp.controller]?.nameFa || cp.controller}) — ${
                  cp.status === 'OPEN' ? 'آزاد' : cp.status === 'RESTRICTED' ? 'بازرسی نظامی' : 'مسدود شده!'
                }`}</title>
              </g>
            );
          })}

          {/* Glitch-Free Non-Overlapping Operational Trajectories */}
          {showArcs &&
            renderedArcs.map((arc) => (
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

          {/* Minor Nation Conquest Flags (For Newly Annexed World Territories!) */}
          {Object.values(room.minorNations)
            .filter((m) => m.conqueredBy !== null)
            .map((m) => {
              const [mx, my] = projectPoint(m.coordinates);
              const owner = m.conqueredBy ? room.countries[m.conqueredBy] : null;
              if (!owner) return null;
              return (
                <g
                  key={`conq-${m.id}`}
                  transform={`translate(${mx}, ${my}) scale(${invScale})`}
                  className="cursor-pointer"
                  onClick={(e) => handleSelectMinorSafe(m.id, e)}
                >
                  <circle cx={0} cy={0} r={3.2} fill={EMPIRE_COLORS[owner.id]} stroke="#ffffff" strokeWidth={0.7} />
                </g>
              );
            })}

          {/* 20 Major Power Capital Anchors, Clean Leader Lines & Crisp Badges */}
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

            return (
              <g key={`pin-${c.id}`}>
                {/* Origin-anchored pure SVG pulse rings (zero CSS transform coordinate bugs!) */}
                <g transform={`translate(${ax}, ${ay}) scale(${invScale})`}>
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
                    r={2.3}
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

                {hasOffset && (
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    stroke={isSelected ? '#7dd3fc' : '#475569'}
                    strokeWidth={0.75 * invScale}
                    strokeOpacity={0.75}
                    pointerEvents="none"
                  />
                )}

                <g
                  transform={`translate(${bx}, ${by}) scale(${invScale})`}
                  className="cursor-pointer"
                  onClick={(e) => handleSelectMajorSafe(c.id, e)}
                >
                  <rect
                    x={-23}
                    y={-8}
                    width={46}
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
                        : '#091326'
                    }
                    fillOpacity={0.95}
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
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
