import { motion, AnimatePresence } from "framer-motion";
import type { SeatingConfig, SeatingStyle, VipTable } from "@/types";

interface Props {
  totalSeats: number;
  config: SeatingConfig;
  onChange: (c: SeatingConfig) => void;
}

const VIP_GOLD = "#d4af37";
const VIP_GOLD_RING = "rgba(212,175,55,0.55)";
const VIP_GOLD_FILL = "rgba(212,175,55,0.18)";

function newVipId(): string {
  return `vip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Style definitions ─────────────────────────────────────────────────────────

const STYLES: {
  key: SeatingStyle;
  name: string;
  desc: string;
  defaultSeatsPerRow?: number;
  defaultSeatsPerTable?: number;
  defaultTablesPerSide?: number;
}[] = [
  { key: "theater",    name: "Theater",    desc: "Rows of chairs, no tables",          defaultSeatsPerRow: 10 },
  { key: "auditorium", name: "Auditorium", desc: "Fixed tiered seating",               defaultSeatsPerRow: 12 },
  { key: "banquet",    name: "Banquet",    desc: "Round tables with chairs",            defaultSeatsPerTable: 10, defaultTablesPerSide: 2 },
  { key: "classroom",  name: "Classroom",  desc: "Rows of desks and chairs",           defaultSeatsPerRow: 6 },
  { key: "runway",     name: "Runway",     desc: "Stage, red carpet aisle, side seats", defaultSeatsPerRow: 5 },
  { key: "banquet-runway", name: "Banquet Runway", desc: "Stage, red carpet aisle, round tables on each side", defaultSeatsPerTable: 10, defaultTablesPerSide: 1 },
];

// ─── Style card diagrams ───────────────────────────────────────────────────────

// ─── Diagram primitives ──────────────────────────────────────────────────────
// All diagrams use a consistent 80×60 viewBox with a stage bar at the top so
// each card reads at a glance. Active = brand-blue ink; inactive = muted gray.

const D_WIDTH = 80;
const D_HEIGHT = 60;

function StageStrip({ active, height = 5 }: { active: boolean; height?: number }) {
  return (
    <rect
      x="4"
      y="3"
      width={D_WIDTH - 8}
      height={height}
      rx="1.5"
      fill={active ? "rgba(61,155,245,0.55)" : "rgba(107,114,128,0.4)"}
    />
  );
}

function TheaterDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} fill="none">
      <StageStrip active={active} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={9 + col * 12.5}
            cy={20 + row * 9}
            r="2.6"
            fill={c}
            opacity={active ? 0.95 - row * 0.12 : 0.55 - row * 0.08}
          />
        ))
      )}
    </svg>
  );
}

function AuditoriumDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} fill="none">
      <StageStrip active={active} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={9 + col * 12.5 - row * 2}
            cy={20 + row * 9}
            r="2.6"
            fill={c}
            opacity={active ? 0.95 - row * 0.12 : 0.55 - row * 0.08}
          />
        ))
      )}
    </svg>
  );
}

function BanquetDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  const tables: [number, number][] = [[22, 22], [58, 22], [22, 44], [58, 44]];
  const angles = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} fill="none">
      {tables.map(([cx, cy], ti) => (
        <g key={ti}>
          <circle
            cx={cx}
            cy={cy}
            r="6"
            fill={c}
            opacity={active ? 0.16 : 0.09}
            stroke={c}
            strokeWidth="0.8"
            strokeOpacity={active ? 0.6 : 0.35}
          />
          {angles.map((a, ai) => {
            const rad = (a * Math.PI) / 180;
            return (
              <circle
                key={ai}
                cx={cx + Math.cos(rad) * 9.5}
                cy={cy + Math.sin(rad) * 9.5}
                r="2"
                fill={c}
                opacity={active ? 0.9 : 0.55}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}

function RunwayDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} fill="none">
      <StageStrip active={active} height={6} />
      {/* Red carpet aisle */}
      <rect x="36" y="14" width="8" height={D_HEIGHT - 18} rx="2" fill="rgba(220,38,38,0.55)" />
      {/* Left side seats */}
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2].map((col) => (
          <circle
            key={`l${row}${col}`}
            cx={8 + col * 8}
            cy={20 + row * 9}
            r="2.4"
            fill={c}
            opacity={active ? 0.9 : 0.55}
          />
        ))
      )}
      {/* Right side seats */}
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2].map((col) => (
          <circle
            key={`r${row}${col}`}
            cx={52 + col * 8}
            cy={20 + row * 9}
            r="2.4"
            fill={c}
            opacity={active ? 0.9 : 0.55}
          />
        ))
      )}
    </svg>
  );
}

function BanquetRunwayDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  const sides: [number, number][] = [
    [18, 22], [18, 46],
    [62, 22], [62, 46],
  ];
  const angles = [0, 72, 144, 216, 288];
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} fill="none">
      <StageStrip active={active} />
      <rect x="38" y="13" width="4" height={D_HEIGHT - 17} rx="1.5" fill="rgba(220,38,38,0.55)" />
      {sides.map(([cx, cy], ti) => (
        <g key={ti}>
          <circle
            cx={cx}
            cy={cy}
            r="5"
            fill={c}
            opacity={active ? 0.18 : 0.1}
            stroke={c}
            strokeWidth="0.7"
            strokeOpacity={active ? 0.55 : 0.3}
          />
          {angles.map((a, ai) => {
            const rad = (a * Math.PI) / 180;
            return (
              <circle
                key={ai}
                cx={cx + Math.cos(rad) * 7.5}
                cy={cy + Math.sin(rad) * 7.5}
                r="1.5"
                fill={c}
                opacity={active ? 0.9 : 0.55}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}

function ClassroomDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} fill="none">
      <StageStrip active={active} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1].map((col) => (
          <g key={`${row}-${col}`}>
            <rect
              x={9 + col * 33}
              y={15 + row * 11}
              width="29"
              height="8"
              rx="1.5"
              fill={c}
              opacity={active ? 0.28 : 0.16}
            />
            {[0, 1, 2].map((seat) => (
              <circle
                key={seat}
                cx={14 + col * 33 + seat * 9.5}
                cy={15 + row * 11 + 4}
                r="2.2"
                fill={c}
                opacity={active ? 0.9 : 0.55}
              />
            ))}
          </g>
        ))
      )}
    </svg>
  );
}

// ─── Live preview ──────────────────────────────────────────────────────────────

function LivePreview({ totalSeats, config }: { totalSeats: number; config: SeatingConfig }) {
  const MAX_VISIBLE = 60;
  const accent = "rgba(61,155,245,0.7)";
  const accentFill = "rgba(61,155,245,0.15)";

  if (config.style === "runway") {
    const perSide = config.seatsPerRow ?? 5;
    const fullRowSize = perSide * 2;
    const visibleSeats = Math.min(totalSeats, MAX_VISIBLE);
    const numRows = Math.ceil(visibleSeats / fullRowSize);
    const S = 9;
    const G = 2.5;
    const AISLE_W = 10;
    const sideW = perSide * (S + G) - G;
    const svgW = sideW * 2 + AISLE_W + 14;
    const svgH = numRows * (S + G) + 20;

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: "100%" }}>
        {/* Stage */}
        <rect x="3" y="2" width={svgW - 6} height="5" rx="1.5" fill="rgba(61,155,245,0.3)" />
        {/* Red carpet */}
        <rect x={5 + sideW + (AISLE_W - 4) / 2} y="9" width="4" height={svgH - 11} rx="1.5" fill="rgba(220,38,38,0.3)" />
        {/* Seats */}
        {Array.from({ length: visibleSeats }).map((_, i) => {
          const rowIndex = Math.floor(i / fullRowSize);
          const posInRow = i % fullRowSize;
          const isLeft = posInRow < perSide;
          const colInSide = isLeft ? posInRow : posInRow - perSide;
          const x = isLeft
            ? 3 + colInSide * (S + G)
            : 3 + sideW + AISLE_W + colInSide * (S + G);
          const y = 10 + rowIndex * (S + G);
          return (
            <circle key={i} cx={x + S / 2} cy={y + S / 2} r={S / 2 - 0.5} fill={accentFill} stroke={accent} strokeWidth="0.5" />
          );
        })}
        {totalSeats > MAX_VISIBLE && (
          <text x={svgW / 2} y={svgH - 1} textAnchor="middle" fontSize="7" fill="var(--muted)">
            +{totalSeats - MAX_VISIBLE} more…
          </text>
        )}
      </svg>
    );
  }

  if (config.style === "banquet-runway") {
    const seatsPerTable = config.seatsPerTable ?? 10;
    const tablesPerSide = Math.max(1, Math.min(6, config.tablesPerSide ?? 1));
    const perRow = tablesPerSide * 2;
    const tableCount = Math.ceil(totalSeats / seatsPerTable);
    const visibleTables = Math.min(tableCount, Math.max(8, perRow * 4));
    const TABLE_R = 9;
    const SEAT_R = 2;
    const ORBIT_R = TABLE_R + SEAT_R + 1.5;
    const CELL_W = (ORBIT_R + SEAT_R + 2) * 2;
    const CELL_GAP = 4;
    const ROW_H = (ORBIT_R + SEAT_R + 1) * 2 + 2;
    const AISLE_W = 10;
    const sideW = tablesPerSide * CELL_W + (tablesPerSide - 1) * CELL_GAP;
    const svgW = sideW * 2 + AISLE_W + 8;
    const rowsNeeded = Math.ceil(visibleTables / perRow);
    const svgH = rowsNeeded * ROW_H + 16;
    const lastTableSeats = totalSeats - (tableCount - 1) * seatsPerTable;

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: "100%", overflow: "visible" }}>
        {/* Stage */}
        <rect x="3" y="2" width={svgW - 6} height="5" rx="1.5" fill="rgba(61,155,245,0.3)" />
        {/* Red carpet aisle */}
        <rect x={(svgW - 4) / 2} y="9" width="4" height={svgH - 11} rx="1.5" fill="rgba(220,38,38,0.3)" />
        {/* Tables */}
        {Array.from({ length: visibleTables }).map((_, ti) => {
          const rowIdx = Math.floor(ti / perRow);
          const posInRow = ti % perRow;
          const isLeft = posInRow < tablesPerSide;
          const colInSide = isLeft ? posInRow : posInRow - tablesPerSide;
          const cx = isLeft
            ? 4 + CELL_W / 2 + colInSide * (CELL_W + CELL_GAP)
            : svgW - 4 - CELL_W / 2 - (tablesPerSide - 1 - colInSide) * (CELL_W + CELL_GAP);
          const cy = 12 + rowIdx * ROW_H + ROW_H / 2;
          const seatCount = ti === tableCount - 1 ? Math.max(lastTableSeats, 1) : seatsPerTable;
          return (
            <g key={ti}>
              <circle cx={cx} cy={cy} r={TABLE_R} fill="var(--surface-3)" stroke="rgba(61,155,245,0.3)" strokeWidth="0.8" />
              <text x={cx} y={cy + 2.5} textAnchor="middle" fontSize="5.5" fill={accent} fontFamily="'Fira Code', monospace">
                T{ti + 1}
              </text>
              {Array.from({ length: seatCount }).map((_, si) => {
                const angle = (si / seatCount) * Math.PI * 2 - Math.PI / 2;
                return (
                  <circle
                    key={si}
                    cx={cx + Math.cos(angle) * ORBIT_R}
                    cy={cy + Math.sin(angle) * ORBIT_R}
                    r={SEAT_R}
                    fill={accentFill}
                    stroke={accent}
                    strokeWidth="0.5"
                  />
                );
              })}
            </g>
          );
        })}
        {tableCount > visibleTables && (
          <text x={svgW / 2} y={svgH - 2} textAnchor="middle" fontSize="7" fill="var(--muted)">
            +{tableCount - visibleTables} more…
          </text>
        )}
      </svg>
    );
  }

  if (config.style === "banquet") {
    const seatsPerTable = config.seatsPerTable ?? 10;
    const tableCount = Math.ceil(totalSeats / seatsPerTable);
    const lastTableSeats = totalSeats - (tableCount - 1) * seatsPerTable;
    const TABLE_R = 16;
    const SEAT_R = 3.5;
    const ORBIT_R = TABLE_R + SEAT_R + 3;
    const CELL = (ORBIT_R + SEAT_R + 2) * 2 + 4;

    // New mode: explicit tablesPerSide → fixed left/right structure with center gutter.
    if (config.tablesPerSide != null) {
      const tablesPerSide = Math.max(1, Math.min(6, config.tablesPerSide));
      const perRow = tablesPerSide * 2;
      const visibleTables = Math.min(tableCount, Math.max(6, perRow * 3));
      const CELL_GAP = 8;
      const CENTER_GAP = 18;
      const sideW = tablesPerSide * CELL + (tablesPerSide - 1) * CELL_GAP;
      const svgW = sideW * 2 + CENTER_GAP + 8;
      const rowsNeeded = Math.ceil(visibleTables / perRow);
      const svgH = rowsNeeded * (CELL + CELL_GAP) + 8;

      return (
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: "100%", overflow: "visible" }}>
          {Array.from({ length: visibleTables }).map((_, ti) => {
            const rowIdx = Math.floor(ti / perRow);
            const posInRow = ti % perRow;
            const isLeft = posInRow < tablesPerSide;
            const colInSide = isLeft ? posInRow : posInRow - tablesPerSide;
            const cx = isLeft
              ? 4 + CELL / 2 + colInSide * (CELL + CELL_GAP)
              : svgW - 4 - CELL / 2 - (tablesPerSide - 1 - colInSide) * (CELL + CELL_GAP);
            const cy = 4 + CELL / 2 + rowIdx * (CELL + CELL_GAP);
            const seatCount = ti === tableCount - 1 ? Math.max(lastTableSeats, 1) : seatsPerTable;
            return (
              <g key={ti}>
                <circle cx={cx} cy={cy} r={TABLE_R} fill="var(--surface-3)" stroke="rgba(61,155,245,0.3)" strokeWidth="1" />
                <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="7" fill={accent} fontFamily="'Fira Code', monospace">
                  T{ti + 1}
                </text>
                {Array.from({ length: seatCount }).map((_, si) => {
                  const angle = (si / seatCount) * Math.PI * 2 - Math.PI / 2;
                  return (
                    <circle
                      key={si}
                      cx={cx + Math.cos(angle) * ORBIT_R}
                      cy={cy + Math.sin(angle) * ORBIT_R}
                      r={SEAT_R}
                      fill={accentFill}
                      stroke={accent}
                      strokeWidth="0.75"
                    />
                  );
                })}
              </g>
            );
          })}
          {tableCount > visibleTables && (
            <text x={svgW / 2} y={svgH - 2} textAnchor="middle" fontSize="8" fill="var(--muted)">
              +{tableCount - visibleTables} more…
            </text>
          )}
        </svg>
      );
    }

    // Legacy mode: no tablesPerSide → keep the original 3-col grid renderer.
    const visibleTables = Math.min(tableCount, 6);
    const cols = Math.min(visibleTables, 3);
    const rows = Math.ceil(visibleTables / cols);
    const svgW = cols * (CELL + 8) + 4;
    const svgH = rows * (CELL + 8) + 4;

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: "100%", overflow: "visible" }}>
        {Array.from({ length: visibleTables }).map((_, ti) => {
          const col = ti % cols;
          const row = Math.floor(ti / cols);
          const cx = CELL / 2 + 4 + col * (CELL + 8);
          const cy = CELL / 2 + 4 + row * (CELL + 8);
          const seatCount = ti === tableCount - 1 ? Math.max(lastTableSeats, 1) : seatsPerTable;
          return (
            <g key={ti}>
              <circle cx={cx} cy={cy} r={TABLE_R} fill="var(--surface-3)" stroke="rgba(61,155,245,0.3)" strokeWidth="1" />
              <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="7" fill={accent} fontFamily="'Fira Code', monospace">
                T{ti + 1}
              </text>
              {Array.from({ length: seatCount }).map((_, si) => {
                const angle = (si / seatCount) * Math.PI * 2 - Math.PI / 2;
                return (
                  <circle
                    key={si}
                    cx={cx + Math.cos(angle) * ORBIT_R}
                    cy={cy + Math.sin(angle) * ORBIT_R}
                    r={SEAT_R}
                    fill={accentFill}
                    stroke={accent}
                    strokeWidth="0.75"
                  />
                );
              })}
            </g>
          );
        })}
        {tableCount > visibleTables && (
          <text x={svgW / 2} y={svgH - 2} textAnchor="middle" fontSize="8" fill="var(--muted)">
            +{tableCount - visibleTables} more…
          </text>
        )}
      </svg>
    );
  }

  // Grid styles
  const seatsPerRow = config.seatsPerRow ?? 10;
  const visibleSeats = Math.min(totalSeats, MAX_VISIBLE);
  const rowCount = Math.ceil(visibleSeats / seatsPerRow);
  const S = 9;
  const G = 2.5;
  const topPad = config.style === "classroom" ? 12 : 4;
  const bottomPad = config.style !== "classroom" ? 12 : 0;
  const svgW = seatsPerRow * (S + G) + 6;
  const svgH = rowCount * (S + G) + topPad + bottomPad + 6;

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: "100%" }}>
      {(config.style === "theater" || config.style === "auditorium") && (
        <rect x="3" y={svgH - 7} width={svgW - 6} height="4" rx="1.5" fill="rgba(61,155,245,0.3)" />
      )}
      {config.style === "classroom" && (
        <rect x="3" y="2" width={svgW - 6} height="5" rx="1" fill="rgba(61,155,245,0.2)" />
      )}
      {Array.from({ length: visibleSeats }).map((_, i) => {
        const col = i % seatsPerRow;
        const row = Math.floor(i / seatsPerRow);
        const offsetX = config.style === "auditorium" ? row * 1.5 : 0;
        const x = 3 + col * (S + G) - offsetX;
        const y = topPad + row * (S + G);
        return config.style === "classroom" ? (
          <rect key={i} x={x} y={y} width={S} height={S - 1.5} rx="1.5" fill={accentFill} stroke={accent} strokeWidth="0.5" />
        ) : (
          <circle key={i} cx={x + S / 2} cy={y + S / 2} r={S / 2 - 0.5} fill={accentFill} stroke={accent} strokeWidth="0.5" />
        );
      })}
      {totalSeats > MAX_VISIBLE && (
        <text x={svgW / 2} y={svgH - (config.style !== "classroom" ? 14 : 2)} textAnchor="middle" fontSize="7" fill="var(--muted)">
          +{totalSeats - MAX_VISIBLE} more…
        </text>
      )}
    </svg>
  );
}

// ─── Check icon ────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── VIP tables editor ────────────────────────────────────────────────────────

function VipTablesEditor({
  vipTables,
  onChange,
}: {
  vipTables: VipTable[];
  onChange: (next: VipTable[]) => void;
}) {
  const update = (idx: number, patch: Partial<VipTable>) => {
    const next = vipTables.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChange(next);
  };
  const remove = (idx: number) => onChange(vipTables.filter((_, i) => i !== idx));
  const add = () => onChange([
    ...vipTables,
    { id: newVipId(), label: `VIP ${vipTables.length + 1}`, seats: 12 },
  ]);

  return (
    <div className="space-y-2 pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="flex items-center justify-between mt-2">
        <div>
          <p className="text-xs font-semibold" style={{ color: VIP_GOLD, letterSpacing: "0.05em" }}>
            VIP Tables
          </p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            Rendered near the stage, separate from the standard grid. Seat numbers continue above the normal range.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="text-[11px] font-semibold rounded-md px-2.5 py-1 cursor-pointer transition-colors shrink-0"
          style={{
            background: VIP_GOLD_FILL,
            color: VIP_GOLD,
            border: `1px solid ${VIP_GOLD_RING}`,
          }}
        >
          + Add
        </button>
      </div>

      {vipTables.length === 0 ? (
        <p className="text-[10px] italic" style={{ color: "var(--muted)" }}>
          No VIP tables. Add one to reserve seats near the stage.
        </p>
      ) : (
        <div className="space-y-1.5">
          {vipTables.map((t, idx) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              style={{ background: "var(--surface)", border: `1px solid ${VIP_GOLD_RING}` }}
            >
              <input
                type="text"
                value={t.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                placeholder="Label, e.g. Stage Front"
                className="flex-1 min-w-0 px-2 py-1 rounded text-xs text-white"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", outline: "none" }}
              />
              <input
                type="number"
                min={4}
                max={20}
                value={t.seats}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  update(idx, { seats: Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 1 });
                }}
                className="w-14 px-2 py-1 rounded text-xs text-white text-center"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", outline: "none" }}
                title="Seats around the table"
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label={`Remove ${t.label}`}
                className="w-6 h-6 rounded flex items-center justify-center cursor-pointer transition-colors shrink-0"
                style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SeatingConfigurator({ totalSeats, config, onChange }: Props) {
  const selected = config.style;

  const handleStyleChange = (style: SeatingStyle) => {
    const def = STYLES.find((s) => s.key === style)!;
    const newConfig: SeatingConfig = { style };
    if (def.defaultSeatsPerRow   != null) newConfig.seatsPerRow   = def.defaultSeatsPerRow;
    if (def.defaultSeatsPerTable != null) newConfig.seatsPerTable = def.defaultSeatsPerTable;
    if (def.defaultTablesPerSide != null) newConfig.tablesPerSide = def.defaultTablesPerSide;
    onChange(newConfig);
  };

  const tableCount = (config.style === "banquet" || config.style === "banquet-runway")
    ? Math.ceil(totalSeats / (config.seatsPerTable ?? 10))
    : null;

  return (
    <div className="space-y-5">
      {/* Style selector */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)", letterSpacing: "0.12em" }}>
            Seating Layout
          </p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            {totalSeats} total seats
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {STYLES.map((s) => {
            const isSelected = selected === s.key;
            const Diagram =
              s.key === "theater"         ? TheaterDiagram :
              s.key === "auditorium"      ? AuditoriumDiagram :
              s.key === "banquet"         ? BanquetDiagram :
              s.key === "runway"          ? RunwayDiagram :
              s.key === "banquet-runway"  ? BanquetRunwayDiagram :
              ClassroomDiagram;

            return (
              <button
                key={s.key}
                type="button"
                onClick={() => handleStyleChange(s.key)}
                aria-pressed={isSelected}
                className="group relative flex flex-col text-left rounded-xl overflow-hidden transition-all duration-150 cursor-pointer"
                style={{
                  background: isSelected ? "rgba(61,155,245,0.06)" : "var(--surface-3)",
                  border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "rgba(61,155,245,0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "var(--border)";
                  }
                }}
              >
                {/* Diagram canvas — framed area */}
                <div
                  className="w-full flex items-center justify-center transition-colors duration-150"
                  style={{
                    height: 92,
                    background: isSelected
                      ? "linear-gradient(180deg, rgba(61,155,245,0.10) 0%, rgba(61,155,245,0.02) 100%)"
                      : "var(--surface-2)",
                    borderBottom: `1px solid ${isSelected ? "rgba(61,155,245,0.20)" : "var(--border)"}`,
                  }}
                >
                  <Diagram active={isSelected} />
                </div>

                {/* Label area */}
                <div className="p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className="text-[13px] font-semibold leading-tight transition-colors duration-150"
                      style={{ color: isSelected ? "#fff" : "var(--foreground)" }}
                    >
                      {s.name}
                    </p>
                    <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--muted)" }}>
                      {s.desc}
                    </p>
                  </div>

                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: "backOut" }}
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: "var(--accent)" }}
                      >
                        <CheckIcon />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Config panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={config.style}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="rounded-xl p-4 space-y-3"
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
        >
          {config.style !== "banquet" && config.style !== "banquet-runway" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                {config.style === "runway" ? "Seats per side per row" : "Seats per row"}
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={config.seatsPerRow ?? ""}
                onChange={(e) => onChange({ ...config, seatsPerRow: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 rounded-lg text-sm text-white transition-all duration-150"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                ≈ <strong style={{ color: "var(--foreground)" }}>
                  {Math.ceil(totalSeats / ((config.seatsPerRow ?? 10) * (config.style === "runway" ? 2 : 1)))}
                </strong> rows for {totalSeats} total seats
                {config.style === "runway" && ` (${config.seatsPerRow ?? 5} seats each side)`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Seats per table
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.seatsPerTable ?? ""}
                  onChange={(e) => onChange({ ...config, seatsPerTable: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white transition-all duration-150"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
                {tableCount !== null && (
                  <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                    ≈ <strong style={{ color: "var(--foreground)" }}>{tableCount}</strong> tables for {totalSeats} total seats
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Tables per side
                </label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={config.tablesPerSide ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value);
                    onChange({ ...config, tablesPerSide: Number.isFinite(n) && n > 0 ? Math.min(n, 6) : 1 });
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white transition-all duration-150"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", outline: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
                <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                  Each row will have <strong style={{ color: "var(--foreground)" }}>{config.tablesPerSide ?? 1}</strong> {(config.tablesPerSide ?? 1) === 1 ? "table" : "tables"} on each side
                  {" "}(<strong style={{ color: "var(--foreground)" }}>{(config.tablesPerSide ?? 1) * 2}</strong> tables per row total).
                </p>
              </div>

              <VipTablesEditor
                vipTables={config.vipTables ?? []}
                onChange={(vipTables) => onChange({ ...config, vipTables: vipTables.length > 0 ? vipTables : undefined })}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Live preview — large framed canvas */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent)", boxShadow: "0 0 6px rgba(61,155,245,0.6)" }}
            />
            <p
              className="text-[10px] font-semibold uppercase"
              style={{ color: "var(--foreground)", letterSpacing: "0.15em" }}
            >
              Layout Preview
            </p>
          </div>
          <p className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
            {totalSeats} seats
            {(config.vipTables?.length ?? 0) > 0 && (
              <span style={{ color: VIP_GOLD }}>
                {" "}· +{config.vipTables!.reduce((n, t) => n + t.seats, 0)} VIP
              </span>
            )}
          </p>
        </div>
        <div
          className="flex justify-center items-center overflow-x-auto"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(61,155,245,0.04) 0%, transparent 70%)",
            padding: "24px 16px",
            minHeight: 180,
          }}
        >
          <LivePreview totalSeats={totalSeats} config={config} />
        </div>
        {(config.vipTables?.length ?? 0) > 0 && (
          <div
            className="px-4 py-2 text-center"
            style={{ borderTop: "1px solid var(--border)", background: "rgba(212,175,55,0.04)" }}
          >
            <p className="text-[10px]" style={{ color: VIP_GOLD }}>
              {config.vipTables!.length} VIP table{config.vipTables!.length === 1 ? "" : "s"} near the stage
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
