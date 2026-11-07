/**
 * Leituras derivadas do estado para a interface: alertas ativos, tendências e relatório final.
 * Tudo puro e testável; a interface só desenha.
 */
import {
  batteryPct,
  computeFlows,
  criticalCountdown,
  dec,
  DEFAULT_CONFIG,
  failureDef,
  formatClock,
  graceS,
  remainingS,
  type SimConfig,
} from "./engine";
import type { FailureId, Flows, SimState, Term } from "./types";

export type AlertLevel = "critical" | "warning" | "info";

export interface Alert {
  id: string;
  level: AlertLevel;
  text: string;
  /** Falha a que o alerta se refere, quando há uma. */
  failureId?: FailureId;
  /** Ação oferecida junto do alerta. */
  action?: "decide" | "cancel-queue" | "abort";
  /** Tipo visual: reparo em andamento e fila ganham barra/estilo próprios. */
  kind?: "repair" | "queue";
  /** Progresso do reparo (0–1). */
  progress?: number;
}

export function activeAlerts(state: SimState, flows: Flows = computeFlows(state), cfg: SimConfig = DEFAULT_CONFIG): Alert[] {
  const b = cfg.balance;
  const out: Alert[] = [];
  if (state.heatC >= b.heat.criticalC) {
    out.push({
      id: "heat-critical",
      level: "critical",
      text: `CALOR CRÍTICO — perda do módulo em ${Math.ceil(criticalCountdown(state, "heat", cfg))} s`,
    });
  } else if (state.heatC >= b.heat.warningC) {
    out.push({ id: "heat-warning", level: "warning", text: `Calor alto (${dec(state.heatC, 0)} °C): gerador perdendo eficiência` });
  }
  if (state.oxygenPct <= b.oxygen.criticalPct) {
    out.push({
      id: "oxygen-critical",
      level: "critical",
      text: `OXIGÊNIO CRÍTICO — perda do módulo em ${Math.ceil(criticalCountdown(state, "oxygen", cfg))} s`,
    });
  } else if (state.oxygenPct <= b.oxygen.warningPct) {
    out.push({ id: "oxygen-warning", level: "warning", text: `Oxigênio baixo (${dec(state.oxygenPct, 0)}%)` });
  }
  for (const cause of ["heat", "oxygen"] as const) {
    const inCrit = cause === "heat" ? state.heatC >= b.heat.criticalC : state.oxygenPct <= b.oxygen.criticalPct;
    if (!inCrit && state.critical[cause] > 0) {
      out.push({
        id: `${cause}-recovering`,
        level: "warning",
        text: `${cause === "heat" ? "Calor" : "Oxigênio"} fora do crítico — margem se recuperando (${Math.ceil(
          criticalCountdown(state, cause, cfg),
        )} s de ${graceS(state, cfg)} s)`,
      });
    }
  }
  if (flows.unmetKw > 0.05) {
    out.push({
      id: "unmet",
      level: "critical",
      text: `Energia insuficiente: sistemas recebem ${Math.round(flows.supplyRatio * 100)}% do pedido`,
    });
  }
  if (flows.batteryCovering) {
    const autonomy = state.batteryKj / -flows.batteryKw;
    out.push({
      id: "battery-cover",
      level: "warning",
      text: `Bateria cobrindo déficit de ${dec(-flows.batteryKw, 1)} kW — autonomia ${formatClock(autonomy)}`,
    });
  }
  for (const f of state.failures) {
    const def = failureDef(f.id, cfg);
    const worse = f.escalation > 0.005 ? ` (+${Math.round(f.escalation * 100)}%)` : "";
    if (f.status === "active" && state.queue?.failureId === f.id) {
      const opt = def.options[state.queue.option];
      const left = state.repair ? repairRemainingS(state, flows, cfg) : 0;
      out.push({
        id: `queue-${f.id}`,
        level: "warning",
        kind: "queue",
        failureId: f.id,
        action: "cancel-queue",
        text: `Na fila: ${opt.label}${Number.isFinite(left) ? ` · começa em ${Math.ceil(left)} s` : ""}${worse}`,
      });
    } else if (f.status === "active" && f.ack === "new") {
      out.push({ id: `failure-${f.id}`, level: "critical", failureId: f.id, text: `Decisão pendente: ${def.title}${worse}` });
    } else if (f.status === "active") {
      out.push({ id: `failure-${f.id}`, level: "critical", failureId: f.id, action: "decide", text: `${def.title} sem reparo${worse}` });
    }
    if (f.status === "repairing" && state.repair?.failureId === f.id) {
      const opt = def.options[state.repair.option];
      const left = repairRemainingS(state, flows, cfg);
      const slow = flows.repairSpeed < 0.999 ? ` · ritmo ${Math.round(flows.repairSpeed * 100)}%` : "";
      out.push({
        id: `repair-${f.id}`,
        level: "info",
        kind: "repair",
        failureId: f.id,
        action: "abort",
        progress: Math.min(1, state.repair.progressS / opt.durationS),
        text: `Reparo: ${opt.label} · ${Number.isFinite(left) ? `faltam ${Math.ceil(left)} s` : "parado sem potência"}${slow}`,
      });
    }
    if (f.status === "warned") {
      out.push({ id: `warn-${f.id}`, level: "info", failureId: f.id, text: `Sensores: ${def.title} em ${Math.max(0, Math.ceil(f.at - state.t))} s` });
    }
  }
  // Ordem: críticos, depois o reparo em andamento e a fila, depois alertas e avisos.
  const rank = (a: Alert) => (a.level === "critical" ? 0 : a.kind ? 1 : a.level === "warning" ? 2 : 3);
  return out.sort((a, b2) => rank(a) - rank(b2));
}

/** Tempo até a equipe liberar, no ritmo atual (s). */
export function repairRemainingS(state: SimState, flows: Flows = computeFlows(state), cfg: SimConfig = DEFAULT_CONFIG): number {
  if (!state.repair) return 0;
  const opt = failureDef(state.repair.failureId, cfg).options[state.repair.option];
  return flows.repairSpeed > 0.001 ? (opt.durationS - state.repair.progressS) / flows.repairSpeed : Infinity;
}

export type Trend = "up" | "down" | "stable";

export function trendOf(rate: number, threshold = 0.004): Trend {
  if (rate > threshold) return "up";
  if (rate < -threshold) return "down";
  return "stable";
}

/** Principal motivo da variação: o termo dominante na direção da tendência. */
export function mainReasons(terms: Term[], rate: number, max = 2): Term[] {
  const dir = trendOf(rate);
  const filtered = terms.filter((t) => (dir === "up" ? t.value > 0 : dir === "down" ? t.value < 0 : t.value !== 0));
  return [...filtered].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, max);
}

export interface BatteryStatus {
  trend: Trend;
  text: string;
}

export function batteryStatus(state: SimState, flows: Flows, cfg: SimConfig = DEFAULT_CONFIG): BatteryStatus {
  if (flows.batteryCovering) {
    return { trend: "down", text: `Cobrindo déficit: demanda ${dec(flows.demandKw, 1)} kW > geração ${dec(flows.generatorKw, 1)} kW` };
  }
  if (flows.unmetKw > 0.05) return { trend: "stable", text: "Esgotada: sem reserva para cobrir o déficit" };
  if (flows.batteryKw > 0.01) return { trend: "up", text: `Recarregando com excedente de ${dec(flows.batteryKw, 1)} kW` };
  if (state.batteryKj >= flows.batteryCapacityKj - 0.01) {
    return {
      trend: "stable",
      text:
        flows.batteryCapacityKj < cfg.balance.battery.capacityKj - 0.01
          ? `Carga completa da capacidade restante (${Math.round(flows.modifiers.batteryCapacityFactor * 100)}%)`
          : "Carga completa",
    };
  }
  if (flows.chargeBlocked) {
    return { trend: "stable", text: `Recarga bloqueada: proteção térmica acima de ${cfg.balance.battery.chargeBlockedAboveC} °C` };
  }
  return { trend: "stable", text: "Sem excedente para recarregar" };
}

export interface ReportLine {
  label: string;
  value: string;
}

export interface FinalReport {
  result: "won" | "lost";
  title: string;
  cause: string;
  lines: ReportLine[];
  decisions: string[];
}

export function buildReport(state: SimState, cfg: SimConfig = DEFAULT_CONFIG): FinalReport | null {
  if (!state.outcome) return null;
  const b = cfg.balance;
  const won = state.outcome.result === "won";
  let cause: string;
  if (won) {
    const issues: string[] = [];
    if (state.heatC >= b.heat.warningC) issues.push("calor alto");
    if (state.oxygenPct <= b.oxygen.warningPct) issues.push("oxigênio baixo");
    if (batteryPct(state, cfg) < 20) issues.push("bateria quase vazia");
    cause =
      issues.length === 0
        ? "Módulo habitável e estável na chegada do resgate."
        : `Módulo habitável no resgate, mas no limite: ${issues.join(", ")}.`;
  } else if (state.outcome.cause === "heat") {
    cause = `Superaquecimento: o calor ficou acima de ${b.heat.criticalC} °C por ${graceS(state, cfg)} s, faltando ${formatClock(
      remainingS(state, cfg),
    )} para o resgate.`;
  } else {
    cause = `Hipóxia: o oxigênio ficou abaixo de ${b.oxygen.criticalPct}% por ${graceS(state, cfg)} s, faltando ${formatClock(
      remainingS(state, cfg),
    )} para o resgate.`;
  }

  const decisions = state.failures.map((f) => {
    const def = failureDef(f.id, cfg);
    if (f.status === "resolved" && f.resolution) {
      const opt = def.options[f.resolution];
      return `${def.title}: ${opt.label} (${formatClock(f.resolvedAt ?? 0)}) — ${opt.effectText}`;
    }
    if (f.status === "active" || f.status === "repairing") return `${def.title}: não resolvida.`;
    return `${def.title}: não chegou a ocorrer.`;
  });

  return {
    result: state.outcome.result,
    title: won ? "Resgate concluído" : "Módulo perdido",
    cause,
    lines: [
      { label: "Tempo de missão", value: formatClock(state.t) },
      { label: "Calor final / máximo", value: `${dec(state.heatC, 1)} °C / ${dec(state.stats.peakHeatC, 1)} °C` },
      { label: "Oxigênio final / mínimo", value: `${dec(state.oxygenPct, 1)}% / ${dec(state.stats.minOxygenPct, 1)}%` },
      { label: "Bateria final / mínima", value: `${dec(batteryPct(state, cfg), 0)}% / ${dec(state.stats.minBatteryPct, 0)}%` },
      { label: "Tempo com bateria cobrindo déficit", value: formatClock(state.stats.batteryCoverSeconds) },
      { label: "Tempo em nível crítico", value: formatClock(state.stats.criticalSeconds) },
    ],
    decisions,
  };
}
