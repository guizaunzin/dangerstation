/**
 * Robô jogador para balanceamento: joga como uma pessoa atenta, reagindo a cada poucos segundos.
 * Não é usado pela interface; serve aos testes e a `npm run balance`.
 */
import { BALANCE } from "./config";
import {
  advance,
  batteryPct,
  beginMission,
  computeFlows,
  createInitialState,
  DEFAULT_CONFIG,
  ignoreFailure,
  queueRepair,
  remainingS,
  repairOption,
  setAllocation,
  startRepair,
  step,
  type SimConfig,
} from "./engine";
import type { FailureId, MissionSpec, RepairOptionId, ScheduledFailure, SimState } from "./types";

export type RepairPolicy = "quick" | "full" | "smart";

export interface BotOptions {
  policy: RepairPolicy;
  /** Intervalo entre decisões (s de jogo), simulando tempo de reação. */
  reactionS: number;
}

export const DEFAULT_BOT: BotOptions = { policy: "smart", reactionS: 4 };

/** Ordem de urgência: o que mais rápido leva à perda do módulo vem primeiro. */
const URGENCY: FailureId[] = ["fire", "cooling", "generator", "leak", "meteor", "solar", "scrubber", "battery"];

function chooseOption(s: SimState, id: FailureId, policy: RepairPolicy, cfg: SimConfig): RepairOptionId {
  if (policy !== "smart") return policy;
  const full = repairOption(id, "full", cfg);
  const othersActive = s.failures.some((f) => f.id !== id && f.status === "active");
  const nextSoon = s.failures.some((f) => (f.status === "pending" || f.status === "warned") && f.at - s.t < full.durationS);
  const timeLeft = remainingS(s, cfg);
  // Reparo completo só compensa com tempo de missão pela frente, equipe livre a seguir e reserva de energia.
  if (timeLeft > 200 && !othersActive && !nextSoon && batteryPct(s, cfg) > 45 && s.heatC < 62 && s.oxygenPct > 50) return "full";
  return "quick";
}

/** Uma decisão do robô sobre o estado atual. */
export function botDecide(state: SimState, opts: BotOptions = DEFAULT_BOT, cfg: SimConfig = DEFAULT_CONFIG): SimState {
  let s = state;
  if (s.phase !== "active") return s;

  // Reparos: começa o mais urgente; com a equipe ocupada, põe o próximo na fila; o resto fica para depois.
  const waiting = () =>
    s.failures
      .filter((f) => f.status === "active" && s.queue?.failureId !== f.id)
      .sort((a, b) => URGENCY.indexOf(a.id) - URGENCY.indexOf(b.id));
  if (!s.repair && waiting().length) {
    const target = waiting()[0];
    s = startRepair(s, target.id, chooseOption(s, target.id, opts.policy, cfg), cfg);
  }
  if (s.repair && !s.queue && waiting().length) {
    const target = waiting()[0];
    s = queueRepair(s, target.id, chooseOption(s, target.id, opts.policy, cfg), cfg);
  }
  for (const f of s.failures) if (f.status === "active" && f.ack === "new") s = ignoreFailure(s, f.id, cfg);

  const f = computeFlows(s, cfg);
  const max = cfg.balance.allocation.maxPerSystemKw;
  let { cooling, life } = s.allocation;
  const heat = s.heatC;
  const o2 = s.oxygenPct;

  // Calor: mira em ~45 °C, reagindo à tendência.
  if ((heat > 48 && f.heatRate > -0.02) || heat > 60) cooling = Math.min(max, cooling + 1);
  else if (heat < 40 && f.heatRate < 0.03 && cooling > 1) cooling -= 1;

  // Oxigênio: mira em ~75%.
  if ((o2 < 72 && f.oxygenRate < 0.02) || o2 < 45) life = Math.min(max, life + 1);
  else if (o2 > 88 && f.oxygenRate > -0.02 && life > 1) life -= 1;

  // Energia: com bateria fraca e déficit, corta o que tem mais folga.
  if (f.batteryKw < 0 && batteryPct(s, cfg) < 15) {
    const heatSlack = (cfg.balance.heat.criticalC - heat) / 40;
    const o2Slack = (o2 - cfg.balance.oxygen.criticalPct) / 60;
    if (heatSlack > o2Slack && cooling > 1) cooling -= 1;
    else if (life > 1) life -= 1;
  }

  s = setAllocation(s, "cooling", cooling, cfg);
  s = setAllocation(s, "life", life, cfg);
  return s;
}

/** Joga uma missão inteira com o robô e devolve o estado final. */
export function runBot(
  mission: MissionSpec,
  opts: BotOptions = DEFAULT_BOT,
  cfg: SimConfig = DEFAULT_CONFIG,
  schedule?: ScheduledFailure[],
): SimState {
  let s = beginMission(createInitialState(mission, cfg, schedule), cfg);
  // Primeiro ajuste, como ensina a abertura.
  s = setAllocation(s, "cooling", 4, cfg);
  while (s.phase === "active") {
    s = advance(s, opts.reactionS, cfg);
    s = botDecide(s, opts, cfg);
  }
  return s;
}

/** Joga sem fazer nada: cada decisão de reparo que aparece é adiada ("Ignorar por enquanto"). */
export function runIdle(mission: MissionSpec, cfg: SimConfig = DEFAULT_CONFIG): SimState {
  let s = beginMission(createInitialState(mission, cfg), cfg);
  for (let i = 0; i < BALANCE.missionDurationS * 2 && s.phase === "active"; i++) {
    for (const f of s.failures) if (f.status === "active" && f.ack === "new") s = ignoreFailure(s, f.id, cfg);
    s = step(s, cfg);
  }
  return s;
}
