/**
 * Motor determinístico da missão. Funções puras: recebem um estado e devolvem um novo.
 * O tempo avança em passos fixos de BALANCE.tickS; a interface decide quando chamar `step`.
 */
import { BALANCE, SCENARIO, SAVE_VERSION, type Balance } from "./config";
import type {
  Allocation,
  CriticalCause,
  FailureDef,
  FailureId,
  Flows,
  LogEntry,
  LogKind,
  Modifiers,
  RepairOption,
  RepairOptionId,
  Scenario,
  SimState,
  SystemId,
  Term,
} from "./types";

export interface SimConfig {
  balance: Balance;
  scenario: Scenario;
}

export const DEFAULT_CONFIG: SimConfig = { balance: BALANCE, scenario: SCENARIO };

const EPS = 1e-9;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Arredonda para evitar acúmulo de ruído de ponto flutuante no estado salvo. */
function round(v: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Número com vírgula decimal (pt-BR), para textos gerados pela simulação. */
export function dec(v: number, digits = 1): string {
  const out = v.toFixed(digits);
  return (out.startsWith("-") && Number(out) === 0 ? out.slice(1) : out).replace(".", ",");
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - EPS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function failureDef(id: FailureId, cfg: SimConfig = DEFAULT_CONFIG): FailureDef {
  const def = cfg.scenario.failures.find((f) => f.id === id);
  if (!def) throw new Error(`Falha desconhecida: ${id}`);
  return def;
}

export function repairOption(
  id: FailureId,
  option: RepairOptionId,
  cfg: SimConfig = DEFAULT_CONFIG,
): RepairOption {
  return failureDef(id, cfg).options[option];
}

export function createInitialState(cfg: SimConfig = DEFAULT_CONFIG): SimState {
  const b = cfg.balance;
  const batteryKj = (b.battery.capacityKj * b.battery.initialPct) / 100;
  const state: SimState = {
    version: SAVE_VERSION,
    scenarioId: cfg.scenario.id,
    phase: "intro",
    t: 0,
    allocation: { ...b.allocation.initial },
    batteryKj,
    heatC: b.heat.initialC,
    oxygenPct: b.oxygen.initialPct,
    failures: cfg.scenario.failures.map((f) => ({ id: f.id, status: "pending" })),
    repair: null,
    critical: { heat: 0, oxygen: 0 },
    log: [],
    nextLogId: 1,
    stats: {
      peakHeatC: b.heat.initialC,
      minOxygenPct: b.oxygen.initialPct,
      minBatteryPct: b.battery.initialPct,
      batteryCoverSeconds: 0,
      unmetSeconds: 0,
      criticalSeconds: 0,
    },
    outcome: null,
    tutorial: { firstAdjustDone: false },
  };
  return state;
}

function pushLog(state: SimState, kind: LogKind, text: string, tag?: LogEntry["tag"], cfg = DEFAULT_CONFIG) {
  if (tag) {
    const last = [...state.log].reverse().find((l) => l.tag === tag);
    if (last && state.t - last.t <= 5) {
      last.text = text;
      last.t = state.t;
      return;
    }
  }
  state.log.push({ id: state.nextLogId++, t: state.t, kind, text, ...(tag ? { tag } : {}) });
  if (state.log.length > cfg.balance.logLimit) state.log.splice(0, state.log.length - cfg.balance.logLimit);
}

const BASE_MODIFIERS: Modifiers = {
  generatorFactor: 1,
  coolingFactor: 1,
  leakPerS: 0,
  extraHeatPerS: 0,
};

function applyModifiers(target: Modifiers, mod: Partial<Modifiers> | undefined) {
  if (!mod) return;
  if (mod.generatorFactor !== undefined) target.generatorFactor *= mod.generatorFactor;
  if (mod.coolingFactor !== undefined) target.coolingFactor *= mod.coolingFactor;
  if (mod.leakPerS !== undefined) target.leakPerS += mod.leakPerS;
  if (mod.extraHeatPerS !== undefined) target.extraHeatPerS += mod.extraHeatPerS;
}

export function computeModifiers(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): Modifiers {
  const mods = { ...BASE_MODIFIERS };
  for (const f of state.failures) {
    const def = failureDef(f.id, cfg);
    if (f.status === "active" || f.status === "repairing") applyModifiers(mods, def.active);
    if (f.status === "repairing" && state.repair?.failureId === f.id) {
      applyModifiers(mods, def.options[state.repair.option].during);
    }
    if (f.status === "resolved" && f.resolution) applyModifiers(mods, def.options[f.resolution].after);
  }
  return mods;
}

export function generatorHeatEfficiency(heatC: number, balance: Balance = BALANCE): number {
  const g = balance.generator;
  if (heatC <= g.derateStartC) return 1;
  const k = clamp((heatC - g.derateStartC) / (g.derateEndC - g.derateStartC), 0, 1);
  return 1 - k * (1 - g.minEfficiency);
}

/** Calcula os fluxos do próximo passo a partir do estado atual (sem alterar o estado). */
export function computeFlows(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): Flows {
  const b = cfg.balance;
  const dt = b.tickS;
  const mods = computeModifiers(state, cfg);
  const heatEff = generatorHeatEfficiency(state.heatC, b);
  const generatorKw = b.generator.nominalKw * mods.generatorFactor * heatEff;

  const job = state.repair;
  const jobOption = job ? repairOption(job.failureId, job.option, cfg) : null;
  const demand: Allocation = {
    cooling: state.allocation.cooling,
    life: state.allocation.life,
    repair: jobOption ? Math.min(state.allocation.repair, jobOption.powerKw) : 0,
  };
  const demandKw = demand.cooling + demand.life + demand.repair;

  const chargeBlocked = state.heatC >= b.battery.chargeBlockedAboveC;
  let batteryKw = 0;
  let supplyRatio = 1;
  let spareKw = 0;
  let unmetKw = 0;

  if (generatorKw + EPS >= demandKw) {
    const surplus = generatorKw - demandKw;
    const room = (b.battery.capacityKj - state.batteryKj) / dt;
    const charge = chargeBlocked ? 0 : Math.max(0, Math.min(surplus, b.battery.maxChargeKw, room));
    batteryKw = charge;
    spareKw = surplus - charge;
  } else {
    const deficit = demandKw - generatorKw;
    const discharge = Math.max(0, Math.min(deficit, b.battery.maxDischargeKw, state.batteryKj / dt));
    batteryKw = -discharge;
    supplyRatio = demandKw > 0 ? (generatorKw + discharge) / demandKw : 1;
    unmetKw = deficit - discharge;
  }

  const supplied: Allocation = {
    cooling: demand.cooling * supplyRatio,
    life: demand.life * supplyRatio,
    repair: demand.repair * supplyRatio,
  };
  const inUseKw = supplied.cooling + supplied.life + supplied.repair;
  const repairSpeed = jobOption && jobOption.powerKw > 0 ? supplied.repair / jobOption.powerKw : 0;

  const h = b.heat;
  const heatTerms: Term[] = [
    { label: "Equipamentos do módulo", value: h.baseGainPerS },
    { label: `Carga elétrica (${dec(inUseKw, 1)} kW em uso)`, value: h.gainPerKw * inUseKw },
  ];
  if (mods.extraHeatPerS > 0) heatTerms.push({ label: "Barramento auxiliar aquecido", value: mods.extraHeatPerS });
  if (jobOption && repairSpeed > 0) {
    heatTerms.push({ label: `Reparo: ${jobOption.label}`, value: jobOption.heatPerS * repairSpeed });
  }
  const coolingLabel =
    mods.coolingFactor < 1 - EPS
      ? `Refrigeração (${dec(supplied.cooling, 1)} kW a ${Math.round(mods.coolingFactor * 100)}% de eficiência)`
      : `Refrigeração (${dec(supplied.cooling, 1)} kW)`;
  heatTerms.push({ label: coolingLabel, value: -h.coolingPerKw * supplied.cooling * mods.coolingFactor });
  heatTerms.push({
    label: "Dissipação pelo casco",
    value: -h.passiveLossRate * Math.max(0, state.heatC - h.ambientC),
  });
  const heatRate = heatTerms.reduce((s, x) => s + x.value, 0);

  const o = b.oxygen;
  const oxygenTerms: Term[] = [{ label: "Consumo da tripulação", value: -o.crewUsePerS }];
  if (mods.leakPerS > 0) {
    const leakFailure = state.failures.find((f) => f.id === "leak");
    const label = leakFailure?.status === "resolved" ? "Perda residual da vedação rápida" : "Vazamento na antepara";
    oxygenTerms.push({ label, value: -mods.leakPerS });
  }
  oxygenTerms.push({
    label: `Suporte de vida (${dec(supplied.life, 1)} kW)`,
    value: o.recoveryPerKw * supplied.life,
  });
  let oxygenRate = oxygenTerms.reduce((s, x) => s + x.value, 0);
  if (state.oxygenPct >= 100 - EPS && oxygenRate > 0) oxygenRate = 0;

  return {
    modifiers: mods,
    generatorKw,
    generatorHeatEfficiency: heatEff,
    demand,
    demandKw,
    supplyRatio,
    supplied,
    batteryKw,
    batteryCovering: batteryKw < -EPS,
    chargeBlocked,
    unmetKw,
    spareKw,
    heatRate,
    heatTerms,
    oxygenRate,
    oxygenTerms,
    repairSpeed,
  };
}

export function batteryPct(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): number {
  return (state.batteryKj / cfg.balance.battery.capacityKj) * 100;
}

export function remainingS(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): number {
  return Math.max(0, cfg.balance.missionDurationS - state.t);
}

/** Tempo até a perda do módulo para uma causa em nível crítico (s). */
export function criticalCountdown(state: SimState, cause: CriticalCause, cfg: SimConfig = DEFAULT_CONFIG): number {
  return Math.max(0, cfg.balance.critical.graceS - state.critical[cause]);
}

export function isHeatCritical(heatC: number, cfg: SimConfig = DEFAULT_CONFIG) {
  return heatC >= cfg.balance.heat.criticalC;
}

export function isOxygenCritical(oxygenPct: number, cfg: SimConfig = DEFAULT_CONFIG) {
  return oxygenPct <= cfg.balance.oxygen.criticalPct;
}

/** Avança um passo fixo. Fora da fase ativa devolve o próprio estado. */
export function step(prev: SimState, cfg: SimConfig = DEFAULT_CONFIG): SimState {
  if (prev.phase !== "active" || prev.outcome) return prev;
  const b = cfg.balance;
  const dt = b.tickS;
  const flows = computeFlows(prev, cfg);
  const s = clone(prev);

  // Integração dos três recursos.
  s.batteryKj = round(clamp(s.batteryKj + flows.batteryKw * dt, 0, b.battery.capacityKj));
  s.heatC = round(clamp(s.heatC + flows.heatRate * dt, b.heat.ambientC, b.heat.maxC));
  s.oxygenPct = round(clamp(s.oxygenPct + flows.oxygenRate * dt, 0, 100));
  if (s.repair) s.repair.progressS = round(s.repair.progressS + flows.repairSpeed * dt);
  s.t = round(s.t + dt, 3);

  // Estatísticas.
  s.stats.peakHeatC = Math.max(s.stats.peakHeatC, s.heatC);
  s.stats.minOxygenPct = Math.min(s.stats.minOxygenPct, s.oxygenPct);
  s.stats.minBatteryPct = Math.min(s.stats.minBatteryPct, round(batteryPct(s, cfg), 3));
  if (flows.batteryCovering) s.stats.batteryCoverSeconds += dt;
  if (flows.unmetKw > EPS) s.stats.unmetSeconds += dt;

  // Avisos de energia (apenas na transição, para não poluir o registro).
  const prevPct = batteryPct(prev, cfg);
  const nowPct = batteryPct(s, cfg);
  if (prevPct > 20 && nowPct <= 20) pushLog(s, "warn", "Bateria abaixo de 20%.", undefined, cfg);
  if (prevPct > 0 && nowPct <= EPS) {
    pushLog(s, "alert", "Bateria esgotada: os sistemas recebem só o que o gerador produz.", undefined, cfg);
  }

  // Conclusão do reparo.
  if (s.repair) {
    const opt = repairOption(s.repair.failureId, s.repair.option, cfg);
    if (s.repair.progressS + EPS >= opt.durationS) {
      const f = s.failures.find((x) => x.id === s.repair!.failureId)!;
      f.status = "resolved";
      f.resolution = s.repair.option;
      f.resolvedAt = s.t;
      pushLog(s, "success", `Reparo concluído: ${opt.label}. ${opt.effectText}`, undefined, cfg);
      s.repair = null;
      if (s.allocation.repair > 0) {
        s.allocation.repair = 0;
        pushLog(s, "info", "Potência de reparos liberada (0 kW).", undefined, cfg);
      }
    }
  }

  // Eventos programados.
  for (const f of s.failures) {
    const def = failureDef(f.id, cfg);
    if (f.status === "pending" && s.t >= def.warnAt && s.t < def.at) {
      f.status = "warned";
      pushLog(s, "warn", def.warnText, undefined, cfg);
    }
    if ((f.status === "pending" || f.status === "warned") && s.t >= def.at) {
      f.status = "active";
      f.startedAt = s.t;
      pushLog(s, "alert", def.alertText, undefined, cfg);
    }
  }

  // Níveis críticos.
  const causes: [CriticalCause, boolean, string, string][] = [
    ["heat", isHeatCritical(s.heatC, cfg), "Calor em nível crítico!", "Calor saiu do nível crítico."],
    ["oxygen", isOxygenCritical(s.oxygenPct, cfg), "Oxigênio em nível crítico!", "Oxigênio saiu do nível crítico."],
  ];
  let anyCritical = false;
  for (const [cause, isCrit, enterText, leaveText] of causes) {
    const before = s.critical[cause];
    if (isCrit) {
      anyCritical = true;
      if (before === 0 || !(cause === "heat" ? isHeatCritical(prev.heatC, cfg) : isOxygenCritical(prev.oxygenPct, cfg))) {
        pushLog(s, "alert", `${enterText} Perda do módulo em ${Math.ceil(b.critical.graceS - before)} s.`, undefined, cfg);
      }
      s.critical[cause] = round(before + dt);
    } else {
      const wasCrit = cause === "heat" ? isHeatCritical(prev.heatC, cfg) : isOxygenCritical(prev.oxygenPct, cfg);
      if (wasCrit) pushLog(s, "info", leaveText, undefined, cfg);
      s.critical[cause] = round(Math.max(0, before - b.critical.recoveryPerS * dt));
    }
  }
  if (anyCritical) s.stats.criticalSeconds += dt;

  const lostBy = (["heat", "oxygen"] as const).find((c) => s.critical[c] + EPS >= b.critical.graceS);
  if (lostBy) {
    s.outcome = { result: "lost", cause: lostBy, at: s.t };
    s.phase = "ended";
    pushLog(
      s,
      "alert",
      lostBy === "heat"
        ? "Módulo perdido: superaquecimento prolongado."
        : "Módulo perdido: oxigênio insuficiente por tempo demais.",
      undefined,
      cfg,
    );
    return s;
  }

  if (s.t + EPS >= b.missionDurationS) {
    s.outcome = { result: "won", at: s.t };
    s.phase = "ended";
    pushLog(s, "success", "Nave de resgate acoplada. Tripulação a salvo!", undefined, cfg);
  }
  return s;
}

/** Avança vários segundos de jogo (útil em testes e no relógio acelerado). */
export function advance(state: SimState, seconds: number, cfg: SimConfig = DEFAULT_CONFIG): SimState {
  const steps = Math.round(seconds / cfg.balance.tickS);
  let s = state;
  for (let i = 0; i < steps && s.phase === "active"; i++) s = step(s, cfg);
  return s;
}

// ————————————————————————————————————————— Ações do jogador

export function beginMission(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): SimState {
  if (state.phase !== "intro") return state;
  const s = clone(state);
  s.phase = "active";
  pushLog(s, "info", `${cfg.scenario.moduleName}: missão iniciada. Resgate em ${formatClock(cfg.balance.missionDurationS)}.`, undefined, cfg);
  return s;
}

const SYSTEM_SHORT: Record<SystemId, string> = { cooling: "Refrig.", life: "Vida", repair: "Reparos" };

export function setAllocation(
  state: SimState,
  system: SystemId,
  kw: number,
  cfg: SimConfig = DEFAULT_CONFIG,
): SimState {
  if (state.phase === "ended") return state;
  const a = cfg.balance.allocation;
  const value = clamp(Math.round(kw / a.stepKw) * a.stepKw, 0, a.maxPerSystemKw);
  if (value === state.allocation[system]) return state;
  const s = clone(state);
  s.allocation[system] = value;
  const text = `Distribuição: ${(Object.keys(SYSTEM_SHORT) as SystemId[])
    .map((k) => `${SYSTEM_SHORT[k]} ${s.allocation[k]} kW`)
    .join(" · ")}`;
  pushLog(s, "decision", text, "allocation", cfg);
  if (!s.tutorial.firstAdjustDone && s.allocation.cooling >= 4) {
    s.tutorial.firstAdjustDone = true;
    pushLog(s, "success", "Primeiro ajuste feito: a refrigeração agora vence o calor.", undefined, cfg);
  }
  return s;
}

export type RepairBlock = "not-active" | "busy" | "ended" | null;

export function repairBlockReason(state: SimState, failureId: FailureId): RepairBlock {
  if (state.phase !== "active") return "ended";
  const f = state.failures.find((x) => x.id === failureId);
  if (!f || f.status !== "active") return "not-active";
  if (state.repair) return "busy";
  return null;
}

export function startRepair(
  state: SimState,
  failureId: FailureId,
  option: RepairOptionId,
  cfg: SimConfig = DEFAULT_CONFIG,
): SimState {
  if (repairBlockReason(state, failureId) !== null) return state;
  const opt = repairOption(failureId, option, cfg);
  const s = clone(state);
  const f = s.failures.find((x) => x.id === failureId)!;
  f.status = "repairing";
  s.repair = { failureId, option, progressS: 0, startedAt: s.t };
  if (s.allocation.repair < opt.powerKw) s.allocation.repair = opt.powerKw;
  pushLog(s, "decision", `Decisão: ${opt.label} (${opt.powerKw} kW, ${opt.durationS} s).`, undefined, cfg);
  return s;
}

export function abortRepair(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): SimState {
  if (!state.repair || state.phase !== "active") return state;
  const s = clone(state);
  const opt = repairOption(s.repair!.failureId, s.repair!.option, cfg);
  const f = s.failures.find((x) => x.id === s.repair!.failureId)!;
  f.status = "active";
  s.repair = null;
  s.allocation.repair = 0;
  pushLog(s, "warn", `Reparo interrompido: ${opt.label}. O progresso foi perdido.`, undefined, cfg);
  return s;
}

export interface RepairPreview {
  option: RepairOption;
  /** Demanda total e geração com o reparo em andamento. */
  demandKw: number;
  generatorKw: number;
  batteryKw: number;
  /** Autonomia estimada da bateria com esse déficit (s), ou null se não houver déficit. */
  batteryAutonomyS: number | null;
  /** Fração atendida se a bateria não der conta. */
  supplyRatio: number;
  /** Duração estimada no ritmo atual (s). */
  etaS: number;
  /** Calor e oxigênio previstos por segundo durante o reparo. */
  heatRate: number;
  oxygenRate: number;
}

/** Mostra ao jogador o que acontece se confirmar o reparo, sem alterar o estado. */
export function previewRepair(
  state: SimState,
  failureId: FailureId,
  option: RepairOptionId,
  cfg: SimConfig = DEFAULT_CONFIG,
): RepairPreview {
  const opt = repairOption(failureId, option, cfg);
  const hypothetical = clone(state);
  const f = hypothetical.failures.find((x) => x.id === failureId)!;
  if (f.status === "active") f.status = "repairing";
  hypothetical.repair = { failureId, option, progressS: 0, startedAt: state.t };
  if (hypothetical.allocation.repair < opt.powerKw) hypothetical.allocation.repair = opt.powerKw;
  const flows = computeFlows(hypothetical, cfg);
  const discharge = -Math.min(0, flows.batteryKw);
  return {
    option: opt,
    demandKw: flows.demandKw,
    generatorKw: flows.generatorKw,
    batteryKw: flows.batteryKw,
    batteryAutonomyS: discharge > EPS ? state.batteryKj / discharge : null,
    supplyRatio: flows.supplyRatio,
    etaS: flows.repairSpeed > EPS ? opt.durationS / flows.repairSpeed : Infinity,
    heatRate: flows.heatRate,
    oxygenRate: flows.oxygenRate,
  };
}
