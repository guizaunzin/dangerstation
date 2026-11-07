import { BALANCE } from "@/sim/config";
import { beginMission, createInitialState, step } from "@/sim/engine";
import { trainingMission } from "@/sim/random";
import type { FailureAck, FailureId, ScheduledFailure, SimState } from "@/sim/types";
import { expect } from "vitest";

export const start = (schedule?: ScheduledFailure[]) => beginMission(createInitialState(trainingMission(), undefined, schedule));

/** Missão sem falhas programadas, para isolar mecânicas. */
export const quiet = () => start([{ id: "generator", at: 1e6, warnAt: 1e6, severity: 1 }]);

/**
 * Ativa uma falha imediatamente, com gravidade 1. Por padrão a decisão já foi adiada ("ignored"),
 * para o relógio não esperar o jogador nos testes de mecânica; passe ack "new" para testar a decisão.
 */
export function activate(s: SimState, id: FailureId, severity = 1, ack: FailureAck = "ignored"): SimState {
  const exists = s.failures.some((f) => f.id === id);
  const failures = exists
    ? s.failures.map((f) => (f.id === id ? { ...f, status: "active" as const, startedAt: s.t, severity, ack } : f))
    : [...s.failures, { id, at: s.t, warnAt: s.t, severity, status: "active" as const, escalation: 0, startedAt: s.t, ack }];
  return { ...s, failures };
}

/** Potência generosa e calor sob controle, para isolar o efeito de um reparo. */
export function healthy(s: SimState): SimState {
  return { ...s, heatC: 30, oxygenPct: 90, batteryKj: BALANCE.battery.capacityKj, allocation: { cooling: 4, life: 4, repair: 0 } };
}

/** Avança até o reparo atual terminar (com limite de segurança). */
export function finishRepair(s: SimState): SimState {
  let out = s;
  for (let i = 0; i < 400 && out.repair; i++) out = step(out);
  expect(out.repair).toBeNull();
  return out;
}
