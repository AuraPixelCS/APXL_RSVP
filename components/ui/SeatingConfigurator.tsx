import { motion, AnimatePresence } from "framer-motion";
import type { SeatingConfig, SeatingStyle } from "@/types";

interface Props {
  totalSeats: number;
  config: SeatingConfig;
  onChange: (c: SeatingConfig) => void;
}

// ─── Style definitions ─────────────────────────────────────────────────────────

const STYLES: {
  key: SeatingStyle;
  name: string;
  desc: string;
  defaultSeatsPerRow?: number;
  defaultSeatsPerTable?: number;
}[] = [
  { key: "theater",    name: "Theater",    desc: "Rows of chairs, no tables",          defaultSeatsPerRow: 10 },
  { key: "auditorium", name: "Auditorium", desc: "Fixed tiered seating",               defaultSeatsPerRow: 12 },
  { key: "banquet",    name: "Banquet",    desc: "Round tables with chairs",            defaultSeatsPerTable: 10 },
  { key: "classroom",  name: "Classroom",  desc: "Rows of desks and chairs",           defaultSeatsPerRow: 6 },
  { key: "runway",     name: "Runway",     desc: "Stage, red carpet aisle, side seats", defaultSeatsPerRow: 5 },
  { key: "banquet-runway", name: "Banquet Runway", desc: "Stage, red carpet aisle, round tables on each side", defaultSeatsPerTable: 10 },
];

// ─── Style card diagrams ───────────────────────────────────────────────────────

function TheaterDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  return (
    <svg width="60" height="44" viewBox="0 0 60 44" fill="none">
      <rect x="4" y="36" width="52" height="5" rx="2" fill={c} opacity="0.4" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4].map((col) => (
          <circle key={`${row}-${col}`} cx={8 + col * 11} cy={8 + row * 9} r="3.5" fill={c} opacity={active ? 0.85 - row * 0.15 : 0.5 - row * 0.1} />
        ))
      )}
    </svg>
  );
}

function AuditoriumDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  return (
    <svg width="60" height="44" viewBox="0 0 60 44" fill="none">
      <rect x="8" y="37" width="44" height="4" rx="2" fill={c} opacity="0.4" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={7 + col * 11 - row * 1.8}
            cy={8 + row * 9}
            r="3.5"
            fill={c}
            opacity={active ? 0.85 - row * 0.15 : 0.5 - row * 0.1}
          />
        ))
      )}
    </svg>
  );
}

function BanquetDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  const tables = [{ cx: 18, cy: 22 }, { cx: 42, cy: 22 }];
  const angles = [0, 60, 120, 180, 240, 300];
  return (
    <svg width="60" height="44" viewBox="0 0 60 44" fill="none">
      {tables.map((t, ti) => (
        <g key={ti}>
          <circle cx={t.cx} cy={t.cy} r="9" fill={c} opacity={active ? 0.12 : 0.07} stroke={c} strokeWidth="1" strokeOpacity={active ? 0.5 : 0.3} />
          {angles.map((a, ai) => {
            const rad = (a * Math.PI) / 180;
            return <circle key={ai} cx={t.cx + Math.cos(rad) * 13} cy={t.cy + Math.sin(rad) * 13} r="3" fill={c} opacity={active ? 0.8 : 0.45} />;
          })}
        </g>
      ))}
    </svg>
  );
}

function RunwayDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  return (
    <svg width="60" height="44" viewBox="0 0 60 44" fill="none">
      {/* Stage */}
      <rect x="4" y="2" width="52" height="8" rx="2" fill={c} opacity={active ? 0.35 : 0.2} />
      {/* Red carpet center aisle */}
      <rect x="26" y="12" width="8" height="30" rx="2" fill="rgba(220,38,38,0.5)" />
      {/* Left seats — 2 cols × 3 rows */}
      {[0, 1, 2].map((row) =>
        [0, 1].map((col) => (
          <circle key={`l${row}${col}`} cx={7 + col * 9} cy={17 + row * 9} r="3" fill={c} opacity={active ? 0.8 : 0.45} />
        ))
      )}
      {/* Right seats — 2 cols × 3 rows */}
      {[0, 1, 2].map((row) =>
        [0, 1].map((col) => (
          <circle key={`r${row}${col}`} cx={37 + col * 9} cy={17 + row * 9} r="3" fill={c} opacity={active ? 0.8 : 0.45} />
        ))
      )}
    </svg>
  );
}

function BanquetRunwayDiagram({ active }: { active: boolean }) {
  const c = active ? "#3d9bf5" : "#6b7280";
  const sides: [number, number][] = [
    [13, 16], [13, 32],   // left tables (x, y)
    [47, 16], [47, 32],   // right tables
  ];
  const angles = [0, 72, 144, 216, 288];
  return (
    <svg width="60" height="44" viewBox="0 0 60 44" fill="none">
      {/* Stage */}
      <rect x="4" y="2" width="52" height="6" rx="2" fill={c} opacity={active ? 0.35 : 0.2} />
      {/* Red carpet center aisle */}
      <rect x="28" y="10" width="4" height="32" rx="1.5" fill="rgba(220,38,38,0.5)" />
      {/* Tables on each side with orbital seats */}
      {sides.map(([cx, cy], ti) => (
        <g key={ti}>
          <circle cx={cx} cy={cy} r="5" fill={c} opacity={active ? 0.18 : 0.08} stroke={c} strokeWidth="0.75" strokeOpacity={active ? 0.55 : 0.3} />
          {angles.map((a, ai) => {
            const rad = (a * Math.PI) / 180;
            return (
              <circle
                key={ai}
                cx={cx + Math.cos(rad) * 7.5}
                cy={cy + Math.sin(rad) * 7.5}
                r="1.6"
                fill={c}
                opacity={active ? 0.85 : 0.5}
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
    <svg width="60" height="44" viewBox="0 0 60 44" fill="none">
      <rect x="4" y="2" width="52" height="5" rx="1" fill={c} opacity={active ? 0.4 : 0.25} />
      {[0, 1, 2].map((row) =>
        [0, 1].map((col) => (
          <g key={`${row}-${col}`}>
            <rect x={5 + col * 28} y={13 + row * 10} width="20" height="7" rx="1.5" fill={c} opacity={active ? 0.3 : 0.18} />
            {[0, 1].map((seat) => (
              <circle key={seat} cx={10 + col * 28 + seat * 9} cy={13 + row * 10 + 3.5} r="2.5" fill={c} opacity={active ? 0.8 : 0.45} />
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
    const tableCount = Math.ceil(totalSeats / seatsPerTable);
    const visibleTables = Math.min(tableCount, 8);
    // Tables stack vertically; alternate left/right around the central runway.
    const TABLE_R = 9;
    const SEAT_R = 2;
    const ORBIT_R = TABLE_R + SEAT_R + 1.5;
    const ROW_H = (ORBIT_R + SEAT_R + 1) * 2 + 2;
    const AISLE_W = 10;
    const sideW = ORBIT_R + SEAT_R + 4;
    const svgW = sideW * 2 + AISLE_W + 8;
    const rowsNeeded = Math.ceil(visibleTables / 2);
    const svgH = rowsNeeded * ROW_H + 16;
    const lastTableSeats = totalSeats - (tableCount - 1) * seatsPerTable;

    return (
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: "100%", overflow: "visible" }}>
        {/* Stage */}
        <rect x="3" y="2" width={svgW - 6} height="5" rx="1.5" fill="rgba(61,155,245,0.3)" />
        {/* Red carpet aisle */}
        <rect x={(svgW - 4) / 2} y="9" width="4" height={svgH - 11} rx="1.5" fill="rgba(220,38,38,0.3)" />
        {/* Tables — alternating left/right pairs */}
        {Array.from({ length: visibleTables }).map((_, ti) => {
          const rowIdx = Math.floor(ti / 2);
          const isLeft = ti % 2 === 0;
          const cx = isLeft ? sideW / 2 + 2 : svgW - sideW / 2 - 2;
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
    const visibleTables = Math.min(tableCount, 6);
    const TABLE_R = 16;
    const SEAT_R = 3.5;
    const ORBIT_R = TABLE_R + SEAT_R + 3;
    const CELL = (ORBIT_R + SEAT_R + 2) * 2 + 4;
    const cols = Math.min(visibleTables, 3);
    const rows = Math.ceil(visibleTables / cols);
    const svgW = cols * (CELL + 8) + 4;
    const svgH = rows * (CELL + 8) + 4;

    const lastTableSeats = totalSeats - (tableCount - 1) * seatsPerTable;

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

// ─── Main component ────────────────────────────────────────────────────────────

export default function SeatingConfigurator({ totalSeats, config, onChange }: Props) {
  const selected = config.style;

  const handleStyleChange = (style: SeatingStyle) => {
    const def = STYLES.find((s) => s.key === style)!;
    const newConfig: SeatingConfig = { style };
    if (def.defaultSeatsPerRow  != null) newConfig.seatsPerRow   = def.defaultSeatsPerRow;
    if (def.defaultSeatsPerTable != null) newConfig.seatsPerTable = def.defaultSeatsPerTable;
    onChange(newConfig);
  };

  const tableCount = (config.style === "banquet" || config.style === "banquet-runway")
    ? Math.ceil(totalSeats / (config.seatsPerTable ?? 10))
    : null;

  return (
    <div className="space-y-5">
      {/* Style selector label */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
          Choose seating layout
        </p>

        {/* 2×2 style card grid */}
        <div className="grid grid-cols-2 gap-2.5">
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
                className="relative flex flex-col items-center gap-2 p-3.5 rounded-xl text-center transition-all duration-150 cursor-pointer"
                style={{
                  background: isSelected ? "rgba(61,155,245,0.07)" : "var(--surface-3)",
                  border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  boxShadow: isSelected ? "0 0 0 1px rgba(61,155,245,0.15), 0 4px 20px rgba(61,155,245,0.08)" : "none",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "rgba(61,155,245,0.4)";
                    e.currentTarget.style.background = "rgba(61,155,245,0.03)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--surface-3)";
                  }
                }}
              >
                {/* Checkmark badge */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: "backOut" }}
                      className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: "var(--accent)" }}
                    >
                      <CheckIcon />
                    </motion.div>
                  )}
                </AnimatePresence>

                <Diagram active={isSelected} />
                <div>
                  <p
                    className="text-xs font-semibold transition-colors duration-150"
                    style={{ color: isSelected ? "white" : "var(--foreground)" }}
                  >
                    {s.name}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                    {s.desc}
                  </p>
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
          )}
        </motion.div>
      </AnimatePresence>

      {/* Live preview */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--muted)", letterSpacing: "0.15em" }}>
          Layout Preview
        </p>
        <div className="flex justify-center overflow-x-auto">
          <LivePreview totalSeats={totalSeats} config={config} />
        </div>
      </div>
    </div>
  );
}
