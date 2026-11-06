import { BALANCE } from "@/sim/config";
import { batteryPct, criticalCountdown, graceS } from "@/sim/engine";
import { batteryStatus, mainReasons, trendOf, type Trend } from "@/sim/insights";
import type { Flows, SimState, Term } from "@/sim/types";
import { num, signed } from "./format";
import {
  IconAlert,
  IconBattery,
  IconCheck,
  IconCritical,
  IconDown,
  IconFlat,
  IconHeat,
  IconOxygen,
  IconUp,
} from "./Icons";

export type Level = "ok" | "warning" | "critical";

const LEVEL_LABEL: Record<Level, string> = { ok: "NORMAL", warning: "ALERTA", critical: "CRÍTICO" };

export function LevelBadge({ level }: { level: Level }) {
  const Icon = level === "critical" ? IconCritical : level === "warning" ? IconAlert : IconCheck;
  return (
    <span className={`badge badge-${level}`}>
      <Icon /> {LEVEL_LABEL[level]}
    </span>
  );
}

function TrendTag({ trend, text }: { trend: Trend; text: string }) {
  const Icon = trend === "up" ? IconUp : trend === "down" ? IconDown : IconFlat;
  const label = trend === "up" ? "subindo" : trend === "down" ? "caindo" : "estável";
  return (
    <span className={`trend trend-${trend}`}>
      <Icon /> <span className="sr-only">{label}</span>
      {text}
    </span>
  );
}

function Reasons({ terms, rate, unit }: { terms: Term[]; rate: number; unit: string }) {
  const reasons = mainReasons(terms, rate);
  const trend = trendOf(rate);
  return (
    <ul className="reasons">
      <li className="reasons-head">
        {trend === "up" ? "Sobe por causa de:" : trend === "down" ? "Cai por causa de:" : "Equilibrado entre:"}
      </li>
      {reasons.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <span className="mono">
            {signed(r.value, 2)} {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface BarProps {
  value: number;
  min: number;
  max: number;
  level: Level;
  marks: { at: number; label: string; kind: "warning" | "critical" }[];
  label: string;
}

function Bar({ value, min, max, level, marks, label }: BarProps) {
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <div
      className="bar"
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <div className={`bar-fill fill-${level}`} style={{ width: `${pct}%` }} />
      {marks.map((m) => (
        <div
          key={m.label}
          className={`bar-mark mark-${m.kind}`}
          style={{ left: `${((m.at - min) / (max - min)) * 100}%` }}
          title={m.label}
        />
      ))}
    </div>
  );
}

function CriticalTimer({ state, cause }: { state: SimState; cause: "heat" | "oxygen" }) {
  const used = state.critical[cause];
  if (used <= 0) return null;
  const left = Math.ceil(criticalCountdown(state, cause));
  const inCritical =
    cause === "heat" ? state.heatC >= BALANCE.heat.criticalC : state.oxygenPct <= BALANCE.oxygen.criticalPct;
  return (
    <p className={`crit-timer ${inCritical ? "is-critical" : "is-recovering"}`} role="status">
      <IconCritical />
      {inCritical ? (
        <>
          Falha crítica em <strong className="mono">{left} s</strong>
        </>
      ) : (
        <>
          Margem se recuperando: <strong className="mono">{left} s</strong> de {graceS(state)} s
        </>
      )}
    </p>
  );
}

export function heatLevel(heatC: number): Level {
  if (heatC >= BALANCE.heat.criticalC) return "critical";
  if (heatC >= BALANCE.heat.warningC) return "warning";
  return "ok";
}

export function oxygenLevel(o: number): Level {
  if (o <= BALANCE.oxygen.criticalPct) return "critical";
  if (o <= BALANCE.oxygen.warningPct) return "warning";
  return "ok";
}

export function SystemsPanel({ state, flows }: { state: SimState; flows: Flows }) {
  const bat = batteryPct(state);
  const batInfo = batteryStatus(state, flows);
  const batLevel: Level = bat <= 0.01 && flows.unmetKw > 0 ? "critical" : bat < 20 ? "warning" : "ok";
  const hLevel = heatLevel(state.heatC);
  const oLevel = oxygenLevel(state.oxygenPct);
  const heatTrend = trendOf(flows.heatRate);
  const oxyTrend = trendOf(flows.oxygenRate);

  return (
    <section className="panel systems" aria-labelledby="systems-title">
      <h2 id="systems-title" className="panel-title">
        Sistemas do módulo
      </h2>
      <div className="system-grid">
        <article className={`system-card level-${batLevel}`} aria-label="Bateria">
          <header>
            <h3>
              <IconBattery /> Bateria
            </h3>
            <LevelBadge level={batLevel} />
          </header>
          <div className="readout">
            <p className="big-value mono">
              {num(bat, 0)}
              <small>%</small>
            </p>
            <TrendTag trend={batInfo.trend} text={` ${signed(flows.batteryKw, 1)} kW`} />
          </div>
          <Bar
            value={bat}
            min={0}
            max={100}
            level={batLevel}
            label="Carga da bateria"
            marks={[{ at: 20, label: "Reserva baixa (20%)", kind: "warning" }]}
          />
          {flows.batteryCovering ? null : <p className="reason-line">{batInfo.text}</p>}
          {flows.batteryCovering ? (
            <p className="cover-flag" role="status">
              <IconBattery /> BATERIA COBRINDO DÉFICIT de {num(-flows.batteryKw, 1)} kW · autonomia{" "}
              <strong className="mono">{num(state.batteryKj / -flows.batteryKw / 60, 1)} min</strong>
            </p>
          ) : null}
        </article>

        <article className={`system-card level-${hLevel}`} aria-label="Calor">
          <header>
            <h3>
              <IconHeat /> Calor
            </h3>
            <LevelBadge level={hLevel} />
          </header>
          <div className="readout">
            <p className="big-value mono">
              {num(state.heatC, 1)}
              <small>°C</small>
            </p>
            <TrendTag trend={heatTrend} text={` ${signed(flows.heatRate, 2)} °C/s`} />
          </div>
          <Bar
            value={state.heatC}
            min={20}
            max={100}
            level={hLevel}
            label="Temperatura do módulo"
            marks={[
              { at: BALANCE.heat.warningC, label: `Alerta (${BALANCE.heat.warningC} °C)`, kind: "warning" },
              { at: BALANCE.heat.criticalC, label: `Crítico (${BALANCE.heat.criticalC} °C)`, kind: "critical" },
            ]}
          />
          <Reasons terms={flows.heatTerms} rate={flows.heatRate} unit="°C/s" />
          {flows.generatorHeatEfficiency < 0.999 ? (
            <p className="reason-line warn-text">
              <IconAlert /> Calor reduz o gerador a {num(flows.generatorHeatEfficiency * 100, 0)}% da eficiência
            </p>
          ) : null}
          <CriticalTimer state={state} cause="heat" />
        </article>

        <article className={`system-card level-${oLevel}`} aria-label="Oxigênio">
          <header>
            <h3>
              <IconOxygen /> Oxigênio
            </h3>
            <LevelBadge level={oLevel} />
          </header>
          <div className="readout">
            <p className="big-value mono">
              {num(state.oxygenPct, 1)}
              <small>%</small>
            </p>
            <TrendTag trend={oxyTrend} text={` ${signed(flows.oxygenRate, 2)} %/s`} />
          </div>
          <Bar
            value={state.oxygenPct}
            min={0}
            max={100}
            level={oLevel}
            label="Nível de oxigênio"
            marks={[
              { at: BALANCE.oxygen.criticalPct, label: `Crítico (${BALANCE.oxygen.criticalPct}%)`, kind: "critical" },
              { at: BALANCE.oxygen.warningPct, label: `Alerta (${BALANCE.oxygen.warningPct}%)`, kind: "warning" },
            ]}
          />
          <Reasons terms={flows.oxygenTerms} rate={flows.oxygenRate} unit="%/s" />
          <CriticalTimer state={state} cause="oxygen" />
        </article>
      </div>
    </section>
  );
}
