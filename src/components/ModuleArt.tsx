import { BALANCE } from "@/sim/config";
import { batteryPct, difficultyOf, failureDef } from "@/sim/engine";
import type { FailureId, Flows, ModulePart, SimState } from "@/sim/types";

/** Interpola entre cores hex. */
function mix(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

function heatColor(c: number): string {
  if (c < 45) return mix("#3fa7ff", "#5ee6c4", (c - 25) / 20);
  if (c < 65) return mix("#5ee6c4", "#ffb347", (c - 45) / 20);
  return mix("#ffb347", "#ff4040", (c - 65) / 20);
}

const PART_POS: Record<ModulePart, [number, number]> = {
  generator: [150, 100],
  radiator: [200, 34],
  hull: [262, 118],
  wiring: [200, 100],
  scrubber: [158, 128],
  battery: [200, 158],
};

export function ModuleArt({ state, flows }: { state: SimState; flows: Flows }) {
  const st = (id: FailureId) => state.failures.find((f) => f.id === id)?.status;
  const live = (id: FailureId) => st(id) === "active" || st(id) === "repairing";
  const m = flows.modifiers;
  const genOut = flows.generatorKw / difficultyOf(state).generatorKw;
  const panel = mix("#20303f", "#2f7fd6", genOut);
  const fins = heatColor(state.heatC);
  const o2 = state.oxygenPct;
  const windowColor = o2 <= BALANCE.oxygen.criticalPct ? "#ff5d5d" : o2 <= BALANCE.oxygen.warningPct ? "#ffb347" : "#9ff3ff";
  const leakDots = m.leakPerS > 0 ? Math.min(7, 2 + Math.round(m.leakPerS * 30)) : 0;
  const cells = 5;
  const filled = Math.round((batteryPct(state) / 100) * cells);
  const usable = Math.round(m.batteryCapacityFactor * cells);
  const critical = state.critical.heat > 0 || state.critical.oxygen > 0;
  const repairPart = state.repair ? failureDef(state.repair.failureId).part : null;
  const radiatorHit = live("cooling") || live("meteor");

  return (
    <figure className="module-art" aria-label="Ilustração do módulo e do estado dos sistemas">
      <svg viewBox="0 0 400 190" role="img" aria-hidden>
        <defs>
          <linearGradient id="hullGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#33475c" />
            <stop offset="1" stopColor="#141e29" />
          </linearGradient>
          <radialGradient id="coreGrad">
            <stop offset="0" stopColor="#fff6c9" />
            <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* aurora da tempestade solar */}
        {live("solar") ? <path className="art-aurora" d="M0 20 Q100 0 200 22 T400 18" stroke="#b4ff9e" strokeWidth="6" fill="none" /> : null}

        {/* painéis solares */}
        <g className={live("generator") ? "art-flicker" : undefined}>
          {[12, 290].map((x) => (
            <g key={x}>
              <rect x={x} y="74" width="98" height="52" rx="3" fill={panel} stroke="#5d7894" />
              {[1, 2, 3].map((i) => (
                <line key={i} x1={x + i * 24.5} x2={x + i * 24.5} y1="74" y2="126" stroke="#0b1520" strokeWidth="1.5" />
              ))}
              <line x1={x} x2={x + 98} y1="100" y2="100" stroke="#0b1520" strokeWidth="1.5" />
            </g>
          ))}
          <rect x="110" y="96" width="22" height="8" fill="#516b84" />
          <rect x="268" y="96" width="22" height="8" fill="#516b84" />
        </g>
        {live("solar")
          ? [40, 70, 320, 350].map((x, i) => (
              <path key={x} className="art-spark" style={{ animationDelay: `${i * 0.25}s` }} d={`M${x} 70 l6 -10 l-3 0 l6 -10`} stroke="#ffe066" strokeWidth="2" fill="none" />
            ))
          : null}

        {/* radiadores */}
        <g className={radiatorHit ? "art-blink" : undefined}>
          {[150, 176, 202, 228].map((x) => (
            <path key={x} d={`M${x} 58 L${x + 4} 22 L${x + 18} 22 L${x + 22} 58 Z`} fill={fins} opacity="0.9" stroke="#0b1520" />
          ))}
          {radiatorHit ? <path d="M182 26 l6 12 l-5 6 l7 10" stroke="#ff5d5d" strokeWidth="2" fill="none" /> : null}
        </g>

        {/* casco */}
        <rect x="132" y="58" width="136" height="84" rx="20" fill="url(#hullGrad)" stroke="#6c88a3" strokeWidth="2" />
        <rect x="132" y="92" width="136" height="16" fill="#0f1822" opacity="0.5" />

        {/* núcleo do gerador */}
        <circle cx="150" cy="100" r={10 + genOut * 8} fill="url(#coreGrad)" className="art-pulse" />
        <circle cx="150" cy="100" r="6" fill={live("generator") ? "#ff7a59" : "#ffd27a"} />

        {/* janelas: cor pelo oxigênio */}
        {[184, 206, 228].map((x) => (
          <circle key={x} cx={x} cy="80" r="7" fill={windowColor} opacity="0.85" stroke="#0b1520" strokeWidth="2" />
        ))}

        {/* incêndio */}
        {live("fire") ? (
          <g className="art-fire">
            <path d="M196 118 q4 -16 10 -8 q2 -10 8 -2 q4 8 -2 14 z" fill="#ff7a29" />
            <path d="M200 118 q3 -9 6 -4 q2 -6 5 0 q2 5 -2 6 z" fill="#ffe066" />
          </g>
        ) : (
          <rect x="190" y="110" width="22" height="12" rx="2" fill="#203040" stroke="#4a6178" />
        )}

        {/* reciclador de CO₂ */}
        <rect x="146" y="120" width="24" height="14" rx="3" fill="#1d2b39" stroke="#4a6178" />
        <circle cx="158" cy="127" r="3" className={live("scrubber") ? "art-blink" : undefined} fill={live("scrubber") ? "#ff5d5d" : "#5ee6c4"} />

        {/* vazamento */}
        {Array.from({ length: leakDots }, (_, i) => (
          <circle key={i} className="art-leak" style={{ animationDelay: `${i * 0.28}s` }} cx="266" cy="118" r="2.5" fill="#cfefff" />
        ))}
        {live("leak") || live("meteor") ? <path d="M258 112 l6 4 l-4 4 l7 3" stroke="#ff5d5d" strokeWidth="2" fill="none" /> : null}

        {/* bateria */}
        <g className={live("battery") ? "art-blink" : undefined}>
          <rect x="168" y="148" width="64" height="20" rx="4" fill="#111a24" stroke="#6c88a3" />
          {Array.from({ length: cells }, (_, i) => (
            <rect
              key={i}
              x={172 + i * 12}
              y="152"
              width="9"
              height="12"
              rx="1.5"
              fill={i >= usable ? "#3a2020" : i < filled ? (filled <= 1 ? "#ffb347" : "#5ee6c4") : "#22313f"}
            />
          ))}
          <rect x="232" y="154" width="4" height="8" fill="#6c88a3" />
        </g>
        <line x1="200" y1="142" x2="200" y2="148" stroke="#6c88a3" strokeWidth="2" />

        {/* sinalizador */}
        <circle cx="200" cy="60" r="4" fill={critical ? "#ff4040" : "#2d4157"} className={critical ? "art-beacon" : undefined} />

        {/* equipe de reparo */}
        {repairPart ? (
          <g className="art-crew" transform={`translate(${PART_POS[repairPart][0]} ${PART_POS[repairPart][1]})`}>
            <circle r="11" fill="#b79cff" opacity="0.25" />
            <circle r="7" fill="#b79cff" />
            <path d="M-3 3 l6 -6 M1 -5 a2.5 2.5 0 1 0 4 4" stroke="#160a33" strokeWidth="1.8" fill="none" />
          </g>
        ) : null}
      </svg>
      <figcaption className="sr-only">
        Painéis {Math.round(genOut * 100)}% · radiadores a {Math.round(state.heatC)} °C · oxigênio {Math.round(o2)}%
      </figcaption>
    </figure>
  );
}
