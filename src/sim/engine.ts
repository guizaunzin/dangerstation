/**
 * Motor determinístico da missão. Funções puras: recebem um estado e devolvem um novo.
 * O tempo avança em passos fixos de BALANCE.tickS; a interface decide quando chamar `step`.
 */
import { BALANCE, DIFFICULTIES, FAILURES, MODULE_NAME, SAVE_VERSION, type Balance } from "./config";
import { scheduleFor, trainingMission } from "./random";
import type {
  Allocation,
  CriticalCause,
  DifficultyDef,
  DifficultyId,
  FailureDef,
  FailureId,
  FailureState,
  Flows,
  LogEntry,
  LogKind,
  MissionSpec,
  Modifiers,
  RepairOption,
  RepairOptionId,
  ScheduledFailure,
  SimState,
  SystemId,
  Term,
} from "./types";

export interface SimConfig {
  balance: Balance;
  failures: Record<FailureId, FailureDef>;
  difficulties: Record<DifficultyId, DifficultyDef>;
}

export const DEFAULT_CONFIG: SimConfig = { balance: BALANCE, failures: FAILURES, difficulties: DIFFICULTIES };

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
  const def = cfg.failures[id];
  if (!def) throw new Error(`Falha desconhecida: ${id}`);
  return def;
}

export function repairOption(id: FailureId, option: RepairOptionId, cfg: SimConfig = DEFAULT_CONFIG): RepairOption {
  return failureDef(id, cfg).options[option];
}

export function difficultyOf(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): DifficultyDef {
  return cfg.difficulties[state.mission.difficulty];
}

export function graceS(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): number {
  return difficultyOf(state, cfg).graceS;
}

export function createInitialState(
  mission: MissionSpec = trainingMission(),
  cfg: SimConfig = DEFAULT_CONFIG,
  schedule: ScheduledFailure[] = scheduleFor(mission),
): SimState {
  const b = cfg.balance;
  const batteryKj = (b.battery.capacityKj * b.battery.initialPct) / 100;
  return {
    version: SAVE_VERSION,
    mission: { ...mission },
    phase: "intro",
    t: 0,
    allocation: { ...b.allocation.initial },
    batteryKj,
    heatC: b.heat.initialC,
    oxygenPct: b.oxygen.initialPct,
    failures: [...schedule].sort((a, b2) => a.at - b2.at).map((f) => ({ ...f, status: "pending" as const, escalation: 0 })),
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
  lifeFactor: 1,
  leakPerS: 0,
  extraHeatPerS: 0,
  batteryCapacityFactor: 1,
  dischargeFactor: 1,
};

const FACTOR_KEYS = ["generatorFactor", "coolingFactor", "lifeFactor", "batteryCapacityFactor", "dischargeFactor"] as const;
const RATE_KEYS = ["leakPerS", "extraHeatPerS"] as const;

/** Aplica a gravidade a um efeito: fatores se afastam mais de 1, taxas crescem. */
export function scaleModifiers(mods: Partial<Modifiers>, severity: number): Partial<Modifiers> {
  const out: Partial<Modifiers> = {};
  for (const k of FACTOR_KEYS) {
    const v = mods[k];
    if (v !== undefined) out[k] = round(clamp(1 - (1 - v) * severity, 0.05, 1), 4);
  }
  for (const k of RATE_KEYS) {
    const v = mods[k];
    if (v !== undefined) out[k] = round(v * severity, 4);
  }
  return out;
}

function applyModifiers(target: Modifiers, mod: Partial<Modifiers> | undefined) {
  if (!mod) return;
  for (const k of FACTOR_KEYS) if (mod[k] !== undefined) target[k] *= mod[k]!;
  for (const k of RATE_KEYS) if (mod[k] !== undefined) target[k] += mod[k]!;
}

/** Intensidade atual: gravidade sorteada × agravamento por falta de reparo. */
export function effectiveSeverity(f: FailureState): number {
  return f.severity * (1 + (f.escalation ?? 0));
}

/** Efeito ativo de uma falha já com a gravidade do evento. */
export function activeEffect(f: FailureState, cfg: SimConfig = DEFAULT_CONFIG): Partial<Modifiers> {
  return scaleModifiers(failureDef(f.id, cfg).active, effectiveSeverity(f));
}

export interface ModifierSource {
  failureId: FailureId;
  label: string;
  mods: Partial<Modifiers>;
}

/** Cada falha ou consequência que altera o módulo agora, com o rótulo para explicar ao jogador. */
export function modifierSources(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): ModifierSource[] {
  const out: ModifierSource[] = [];
  for (const f of state.failures) {
    const def = failureDef(f.id, cfg);
    if (f.status === "active" || f.status === "repairing") {
      out.push({ failureId: f.id, label: def.title, mods: activeEffect(f, cfg) });
      if (f.status === "repairing" && state.repair?.failureId === f.id) {
        const during = def.options[state.repair.option].during;
        if (during) out.push({ failureId: f.id, label: `Reparo em andamento: ${def.options[state.repair.option].label}`, mods: during });
      }
    }
    if (f.status === "resolved" && f.resolution) {
      const after = def.options[f.resolution].after;
      if (Object.keys(after).length > 0) {
        out.push({ failureId: f.id, label: `Sequela: ${def.options[f.resolution].label}`, mods: after });
      }
    }
  }
  return out;
}

export function computeModifiers(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): Modifiers {
  const mods = { ...BASE_MODIFIERS };
  for (const s of modifierSources(state, cfg)) applyModifiers(mods, s.mods);
  return mods;
}

/** Descrição curta e numérica de um efeito, para alarmes e cartões. */
export function describeEffect(mods: Partial<Modifiers>): string {
  const parts: string[] = [];
  if (mods.generatorFactor !== undefined) parts.push(`gerador a ${Math.round(mods.generatorFactor * 100)}%`);
  if (mods.coolingFactor !== undefined) parts.push(`refrigeração a ${Math.round(mods.coolingFactor * 100)}%`);
  if (mods.lifeFactor !== undefined) parts.push(`suporte de vida a ${Math.round(mods.lifeFactor * 100)}%`);
  if (mods.extraHeatPerS !== undefined) parts.push(`+${dec(mods.extraHeatPerS, 2)} °C/s de calor`);
  if (mods.leakPerS !== undefined) parts.push(`perda de ${dec(mods.leakPerS, 2)} %/s de oxigênio`);
  if (mods.dischargeFactor !== undefined) parts.push(`descarga da bateria a ${Math.round(mods.dischargeFactor * 100)}%`);
  if (mods.batteryCapacityFactor !== undefined) parts.push(`capacidade da bateria a ${Math.round(mods.batteryCapacityFactor * 100)}%`);
  return parts.join(", ");
}

export function generatorHeatEfficiency(heatC: number, balance: Balance = BALANCE): number {
  const g = balance.generator;
  if (heatC <= g.derateStartC) return 1;
  const k = clamp((heatC - g.derateStartC) / (g.derateEndC - g.derateStartC), 0, 1);
  return 1 - k * (1 - g.minEfficiency);
}

export function batteryCapacityKj(state: SimState, cfg: SimConfig = DEFAULT_CONFIG, mods = computeModifiers(state, cfg)) {
  return cfg.balance.battery.capacityKj * mods.batteryCapacityFactor;
}

/** Calcula os fluxos do próximo passo a partir do estado atual (sem alterar o estado). */
export function computeFlows(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): Flows {
  const b = cfg.balance;
  const dt = b.tickS;
  const sources = modifierSources(state, cfg);
  const mods = { ...BASE_MODIFIERS };
  for (const s of sources) applyModifiers(mods, s.mods);
  const heatEff = generatorHeatEfficiency(state.heatC, b);
  const generatorKw = difficultyOf(state, cfg).generatorKw * mods.generatorFactor * heatEff;
  const capacityKj = b.battery.capacityKj * mods.batteryCapacityFactor;
  const usableKj = Math.min(state.batteryKj, capacityKj);

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
    const room = Math.max(0, (capacityKj - usableKj) / dt);
    const charge = chargeBlocked ? 0 : Math.max(0, Math.min(surplus, b.battery.maxChargeKw, room));
    batteryKw = charge;
    spareKw = surplus - charge;
  } else {
    const deficit = demandKw - generatorKw;
    const maxDischarge = b.battery.maxDischargeKw * mods.dischargeFactor;
    const discharge = Math.max(0, Math.min(deficit, maxDischarge, usableKj / dt));
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
  for (const s of sources) {
    if (s.mods.extraHeatPerS) heatTerms.push({ label: s.label, value: s.mods.extraHeatPerS });
  }
  if (jobOption && repairSpeed > 0 && jobOption.heatPerS > 0) {
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
  for (const s of sources) {
    if (s.mods.leakPerS) oxygenTerms.push({ label: s.label, value: -s.mods.leakPerS });
  }
  const lifeLabel =
    mods.lifeFactor < 1 - EPS
      ? `Suporte de vida (${dec(supplied.life, 1)} kW a ${Math.round(mods.lifeFactor * 100)}% de rendimento)`
      : `Suporte de vida (${dec(supplied.life, 1)} kW)`;
  oxygenTerms.push({ label: lifeLabel, value: o.recoveryPerKw * supplied.life * mods.lifeFactor });
  let oxygenRate = oxygenTerms.reduce((s, x) => s + x.value, 0);
  if (state.oxygenPct >= 100 - EPS && oxygenRate > 0) oxygenRate = 0;

  return {
    modifiers: mods,
    generatorKw,
    generatorHeatEfficiency: heatEff,
    batteryCapacityKj: capacityKj,
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

/** Carga da bateria em % da capacidade nominal. */
export function batteryPct(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): number {
  return (state.batteryKj / cfg.balance.battery.capacityKj) * 100;
}

export function remainingS(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): number {
  return Math.max(0, cfg.balance.missionDurationS - state.t);
}

/** Tempo até a perda do módulo para uma causa em nível crítico (s). */
export function criticalCountdown(state: SimState, cause: CriticalCause, cfg: SimConfig = DEFAULT_CONFIG): number {
  return Math.max(0, graceS(state, cfg) - state.critical[cause]);
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
  const grace = graceS(prev, cfg);
  const flows = computeFlows(prev, cfg);
  const s = clone(prev);

  // Integração dos três recursos.
  s.batteryKj = round(clamp(s.batteryKj + flows.batteryKw * dt, 0, b.battery.capacityKj));
  s.heatC = round(clamp(s.heatC + flows.heatRate * dt, b.heat.ambientC, b.heat.maxC));
  s.oxygenPct = round(clamp(s.oxygenPct + flows.oxygenRate * dt, 0, 100));
  if (s.repair) s.repair.progressS = round(s.repair.progressS + flows.repairSpeed * dt);
  s.t = round(s.t + dt, 3);

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
    if (f.status === "pending" && s.t >= f.warnAt && s.t < f.at) {
      f.status = "warned";
      pushLog(s, "warn", `Sensores: ${def.warnText} ${def.title} em ${Math.round(f.at - s.t)} s.`, undefined, cfg);
    }
    if ((f.status === "pending" || f.status === "warned") && s.t >= f.at) {
      f.status = "active";
      f.startedAt = s.t;
      pushLog(s, "alert", `Falha: ${def.title}. ${def.alertText} Efeito: ${describeEffect(activeEffect(f, cfg))}.`, undefined, cfg);
    }
  }

  // Falhas sem reparo pioram com o tempo (a equipe trabalhando segura o agravamento).
  for (const f of s.failures) {
    if (f.status !== "active") continue;
    const before = f.escalation ?? 0;
    f.escalation = round(Math.min(b.escalation.max, before + b.escalation.perS * dt));
    for (const mark of [0.2, 0.4, 0.6]) {
      if (before < mark - EPS && f.escalation >= mark - EPS) {
        pushLog(s, "warn", `${failureDef(f.id, cfg).title} piorou: +${Math.round(mark * 100)}% de intensidade sem reparo.`, undefined, cfg);
      }
    }
  }

  // A capacidade da bateria pode ter encolhido por uma falha ou consequência.
  const cap = batteryCapacityKj(s, cfg);
  if (s.batteryKj > cap + EPS) s.batteryKj = round(cap);

  // Estatísticas.
  s.stats.peakHeatC = Math.max(s.stats.peakHeatC, s.heatC);
  s.stats.minOxygenPct = Math.min(s.stats.minOxygenPct, s.oxygenPct);
  s.stats.minBatteryPct = Math.min(s.stats.minBatteryPct, round(batteryPct(s, cfg), 3));
  if (flows.batteryCovering) s.stats.batteryCoverSeconds += dt;
  if (flows.unmetKw > EPS) s.stats.unmetSeconds += dt;

  // Níveis críticos.
  const checks: [CriticalCause, boolean, boolean, string, string][] = [
    ["heat", isHeatCritical(s.heatC, cfg), isHeatCritical(prev.heatC, cfg), "Calor em nível crítico!", "Calor saiu do nível crítico."],
    [
      "oxygen",
      isOxygenCritical(s.oxygenPct, cfg),
      isOxygenCritical(prev.oxygenPct, cfg),
      "Oxigênio em nível crítico!",
      "Oxigênio saiu do nível crítico.",
    ],
  ];
  let anyCritical = false;
  for (const [cause, isCrit, wasCrit, enterText, leaveText] of checks) {
    const before = s.critical[cause];
    if (isCrit) {
      anyCritical = true;
      if (!wasCrit) pushLog(s, "alert", `${enterText} Perda do módulo em ${Math.ceil(grace - before)} s.`, undefined, cfg);
      s.critical[cause] = round(before + dt);
    } else {
      if (wasCrit) pushLog(s, "info", leaveText, undefined, cfg);
      s.critical[cause] = round(Math.max(0, before - b.critical.recoveryPerS * dt));
    }
  }
  if (anyCritical) s.stats.criticalSeconds += dt;

  const lostBy = (["heat", "oxygen"] as const).find((c) => s.critical[c] + EPS >= grace);
  if (lostBy) {
    s.outcome = { result: "lost", cause: lostBy, at: s.t };
    s.phase = "ended";
    pushLog(
      s,
      "alert",
      lostBy === "heat" ? "Módulo perdido: superaquecimento prolongado." : "Módulo perdido: oxigênio insuficiente por tempo demais.",
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
  pushLog(s, "info", `${MODULE_NAME}: missão iniciada. Resgate em ${formatClock(cfg.balance.missionDurationS)}.`, undefined, cfg);
  return s;
}

const SYSTEM_SHORT: Record<SystemId, string> = { cooling: "Refrig.", life: "Vida", repair: "Reparos" };

export function setAllocation(state: SimState, system: SystemId, kw: number, cfg: SimConfig = DEFAULT_CONFIG): SimState {
  if (state.phase === "ended") return state;
  const a = cfg.balance.allocation;
  const value = clamp(Math.round(kw / a.stepKw) * a.stepKw, 0, a.maxPerSystemKw);
  if (value === state.allocation[system]) return state;
  const s = clone(state);
  s.allocation[system] = value;
  const text = `Distribuição: ${(Object.keys(SYSTEM_SHORT) as SystemId[]).map((k) => `${SYSTEM_SHORT[k]} ${s.allocation[k]} kW`).join(" · ")}`;
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

export function startRepair(state: SimState, failureId: FailureId, option: RepairOptionId, cfg: SimConfig = DEFAULT_CONFIG): SimState {
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
  demandKw: number;
  generatorKw: number;
  batteryKw: number;
  /** Autonomia estimada da bateria com esse déficit (s), ou null se não houver déficit. */
  batteryAutonomyS: number | null;
  supplyRatio: number;
  /** Duração estimada no ritmo atual (s). */
  etaS: number;
  heatRate: number;
  oxygenRate: number;
}

/** Mostra ao jogador o que acontece se confirmar o reparo, sem alterar o estado. */
export function previewRepair(state: SimState, failureId: FailureId, option: RepairOptionId, cfg: SimConfig = DEFAULT_CONFIG): RepairPreview {
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
