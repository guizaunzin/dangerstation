import { BALANCE } from "@/sim/config";
import { batteryPct, criticalCountdown, dec, difficultyOf, graceS } from "@/sim/engine";
import { batteryStatus, mainReasons, trendOf, type Trend } from "@/sim/insights";
import type { Flows, SimState, SystemId, Term } from "@/sim/types";
import { num, signed } from "./format";
import {
  IconAlert,
  IconBattery,
  IconCheck,
  IconCritical,
  IconDown,
  IconFlat,
  IconHeat,
  IconLungs,
  IconMinus,
  IconOxygen,
  IconPlus,
  IconSnow,
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

/**
 * Seta e taxa de variação. A cor diz se a variação é boa ou ruim para o módulo
 * (oxigênio e bateria subindo é bom; calor subindo é ruim), não apenas a direção.
 */
export function TrendTag({ trend, text, goodWhen }: { trend: Trend; text: string; goodWhen: "up" | "down" }) {
  const Icon = trend === "up" ? IconUp : trend === "down" ? IconDown : IconFlat;
  const label = trend === "up" ? "subindo" : trend === "down" ? "caindo" : "estável";
  const tone = trend === "stable" ? "stable" : trend === goodWhen ? "good" : "bad";
  return (
    <span className={`trend trend-${tone}`}>
      <Icon /> <span className="sr-only">{label}</span>
      {text}
    </span>
  );
}

export function Reasons({ terms, rate, unit }: { terms: Term[]; rate: number; unit: string }) {
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

export function Bar({ value, min, max, level, marks, label }: BarProps) {
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

export function CriticalTimer({ state, cause }: { state: SimState; cause: "heat" | "oxygen" }) {
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

interface StepperProps {
  system: SystemId;
  name: string;
  value: number;
  disabled: boolean;
  onSet: (system: SystemId, kw: number) => void;
}

/** Botões − e + de potência, com 48 px para toque. */
export function Stepper({ system, name, value, disabled, onSet }: StepperProps) {
  const step = BALANCE.allocation.stepKw;
  const max = BALANCE.allocation.maxPerSystemKw;
  return (
    <div className="stepper" role="group" aria-label={`Potência para ${name}`}>
      <button
        type="button"
        className="step-btn"
        aria-label={`Diminuir ${name}`}
        disabled={disabled || value <= 0}
        onClick={() => onSet(system, value - step)}
      >
        <IconMinus />
      </button>
      <output className="step-value mono" aria-live="polite">
        {value}
        <small> kW</small>
      </output>
      <button
        type="button"
        className="step-btn"
        aria-label={`Aumentar ${name}`}
        disabled={disabled || value >= max}
        onClick={() => onSet(system, value + step)}
      >
        <IconPlus />
      </button>
    </div>
  );
}

/** Barra de "pips": cada kW pedido; listrado quando não chega inteiro. */
export function Pips({ value, supplied }: { value: number; supplied: number }) {
  const max = BALANCE.allocation.maxPerSystemKw;
  return (
    <div className="alloc-pips" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? (i < supplied - 0.01 ? "pip on" : "pip short") : "pip"} />
      ))}
    </div>
  );
}

interface CardProps {
  state: SimState;
  flows: Flows;
  disabled: boolean;
  onSet: (system: SystemId, kw: number) => void;
}

/** Calor e o controle que mexe nele: a refrigeração. */
export function HeatCard({ state, flows, disabled, onSet }: CardProps) {
  const level = heatLevel(state.heatC);
  const supplied = flows.supplied.cooling;
  const coolingEffect = BALANCE.heat.coolingPerKw * supplied * flows.modifiers.coolingFactor;
  const coach = state.mission.kind === "training" && state.phase === "active" && !state.tutorial.firstAdjustDone;
  return (
    <article className={`system-card level-${level}${coach ? " coach-target" : ""}`} aria-label="Calor">
      <header>
        <h3>
          <IconHeat /> Calor <span className="card-sub">· Refrigeração</span>
        </h3>
        <LevelBadge level={level} />
      </header>
      <div className="readout">
        <p className="big-value mono">
          {num(state.heatC, 1)}
          <small>°C</small>
        </p>
        <TrendTag trend={trendOf(flows.heatRate)} goodWhen="down" text={` ${signed(flows.heatRate, 2)} °C/s`} />
      </div>
      <Bar
        value={state.heatC}
        min={20}
        max={100}
        level={level}
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
      <div className="card-control">
        <div className="control-info">
          <span className="control-name">
            <IconSnow /> Refrigeração
          </span>
          <span className="control-status mono">
            recebendo {dec(supplied, 1)} kW · −{dec(coolingEffect, 2)} °C/s
            {flows.modifiers.coolingFactor < 0.999 ? ` · eficiência ${Math.round(flows.modifiers.coolingFactor * 100)}%` : ""}
          </span>
        </div>
        <Stepper system="cooling" name="Refrigeração" value={state.allocation.cooling} disabled={disabled} onSet={onSet} />
        <Pips value={state.allocation.cooling} supplied={supplied} />
      </div>
      {coach ? (
        <p className="coach" role="note">
          <strong>Primeiro ajuste:</strong> o calor está subindo porque 2 kW de refrigeração não vencem o calor dos equipamentos. Toque
          em <strong>+</strong> até chegar a <strong>4 kW</strong>. Há excedente no gerador, então não falta energia.
        </p>
      ) : null}
    </article>
  );
}

/** Oxigênio e o controle que mexe nele: o suporte de vida. */
export function OxygenCard({ state, flows, disabled, onSet }: CardProps) {
  const level = oxygenLevel(state.oxygenPct);
  const supplied = flows.supplied.life;
  const lifeEffect = BALANCE.oxygen.recoveryPerKw * supplied * flows.modifiers.lifeFactor;
  return (
    <article className={`system-card level-${level}`} aria-label="Oxigênio">
      <header>
        <h3>
          <IconOxygen /> Oxigênio <span className="card-sub">· Suporte de vida</span>
        </h3>
        <LevelBadge level={level} />
      </header>
      <div className="readout">
        <p className="big-value mono">
          {num(state.oxygenPct, 1)}
          <small>%</small>
        </p>
        <TrendTag trend={trendOf(flows.oxygenRate)} goodWhen="up" text={` ${signed(flows.oxygenRate, 2)} %/s`} />
      </div>
      <Bar
        value={state.oxygenPct}
        min={0}
        max={100}
        level={level}
        label="Nível de oxigênio"
        marks={[
          { at: BALANCE.oxygen.criticalPct, label: `Crítico (${BALANCE.oxygen.criticalPct}%)`, kind: "critical" },
          { at: BALANCE.oxygen.warningPct, label: `Alerta (${BALANCE.oxygen.warningPct}%)`, kind: "warning" },
        ]}
      />
      <Reasons terms={flows.oxygenTerms} rate={flows.oxygenRate} unit="%/s" />
      <CriticalTimer state={state} cause="oxygen" />
      <div className="card-control">
        <div className="control-info">
          <span className="control-name">
            <IconLungs /> Suporte de vida
          </span>
          <span className="control-status mono">
            recebendo {dec(supplied, 1)} kW · +{dec(lifeEffect, 2)} %/s
            {flows.modifiers.lifeFactor < 0.999 ? ` · rendimento ${Math.round(flows.modifiers.lifeFactor * 100)}%` : ""}
          </span>
        </div>
        <Stepper system="life" name="Suporte de vida" value={state.allocation.life} disabled={disabled} onSet={onSet} />
        <Pips value={state.allocation.life} supplied={supplied} />
      </div>
    </article>
  );
}

/** Bateria, gerador e o saldo da distribuição. */
export function EnergyCard({ state, flows }: { state: SimState; flows: Flows }) {
  const bat = batteryPct(state);
  const info = batteryStatus(state, flows);
  const level: Level = bat <= 0.01 && flows.unmetKw > 0 ? "critical" : bat < 20 || flows.batteryCovering ? "warning" : "ok";
  const balance = flows.generatorKw - flows.demandKw;
  const genFactor = flows.modifiers.generatorFactor;
  return (
    <article className={`system-card level-${level}`} aria-label="Bateria">
      <header>
        <h3>
          <IconBattery /> Energia <span className="card-sub">· Bateria</span>
        </h3>
        {flows.batteryCovering ? <span className="badge badge-warning">COBRINDO</span> : <LevelBadge level={level} />}
      </header>
      <div className="readout">
        <p className="big-value mono">
          {num(bat, 0)}
          <small>%</small>
        </p>
        <TrendTag trend={info.trend} goodWhen="up" text={` ${signed(flows.batteryKw, 1)} kW`} />
      </div>
      <Bar
        value={bat}
        min={0}
        max={100}
        level={level}
        label="Carga da bateria"
        marks={[{ at: 20, label: "Reserva baixa (20%)", kind: "warning" }]}
      />
      <dl className="energy-grid">
        <div>
          <dt>Gerador</dt>
          <dd className="mono">{dec(flows.generatorKw, 1)} kW</dd>
          <dd className="sub">
            de {dec(difficultyOf(state).generatorKw, 1)} kW
            {genFactor < 0.999 ? ` · ${Math.round(genFactor * 100)}% por avaria` : ""}
            {flows.generatorHeatEfficiency < 0.999 ? ` · ${Math.round(flows.generatorHeatEfficiency * 100)}% pelo calor` : ""}
          </dd>
        </div>
        <div>
          <dt>Pedido</dt>
          <dd className="mono">{dec(flows.demandKw, 1)} kW</dd>
          <dd className="sub">soma dos sistemas</dd>
        </div>
        <div className={balance < -0.01 ? "neg" : "pos"}>
          <dt>Saldo</dt>
          <dd className="mono">{signed(balance, 1)} kW</dd>
          <dd className="sub">{balance < -0.01 ? "déficit" : "excedente"}</dd>
        </div>
      </dl>
      {flows.batteryCovering ? (
        <p className="cover-flag" role="status">
          <IconBattery /> Bateria cobrindo {num(-flows.batteryKw, 1)} kW · autonomia{" "}
          <strong className="mono">{num(state.batteryKj / -flows.batteryKw / 60, 1)} min</strong>
        </p>
      ) : flows.unmetKw > 0.05 ? (
        <p className="cover-flag is-critical" role="status">
          <IconBattery /> Bateria vazia: os sistemas recebem só {num(flows.supplyRatio * 100, 0)}% do pedido.
        </p>
      ) : (
        <p className="reason-line">{info.text}</p>
      )}
    </article>
  );
}
