import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "@/sim/config";
import {
  abortRepair,
  advance,
  awaitingDecision,
  beginMission,
  cancelQueue,
  createInitialState,
  ignoreFailure,
  isWaitingDecision,
  queueRepair,
  reopenDecision,
  startRepair,
  step,
  switchRepair,
} from "@/sim/engine";
import { loadGame, memoryStorage, saveGame } from "@/sim/persistence";
import type { SimState } from "@/sim/types";
import { activate, finishRepair, healthy, quiet } from "./helpers";

const engineer = (): SimState =>
  healthy(beginMission(createInitialState({ kind: "random", seed: "DECIDE", difficulty: "engineer" }, undefined, [{ id: "generator", at: 1e6, warnAt: 1e6, severity: 1 }])));

describe("decisão de reparo", () => {
  it("falha nova abre uma decisão", () => {
    let s = healthy(start5());
    s = advance(s, 60); // treinamento: queda de geração aos 60 s
    expect(s.failures[0]).toMatchObject({ status: "active", ack: "new" });
    expect(awaitingDecision(s).map((f) => f.id)).toEqual(["generator"]);
  });

  it("no Treinamento e no Cadete o relógio espera a decisão", () => {
    expect(DIFFICULTIES.cadet.decisionPauses).toBe(true);
    const s = activate(healthy(quiet()), "leak", 1, "new");
    expect(isWaitingDecision(s)).toBe(true);
    expect(step(s)).toBe(s);
    const later = advance(ignoreFailure(s, "leak"), 5);
    expect(later.t).toBe(s.t + 5);
  });

  it("no Engenheiro e no Comandante o relógio continua", () => {
    expect(DIFFICULTIES.engineer.decisionPauses).toBe(false);
    expect(DIFFICULTIES.commander.decisionPauses).toBe(false);
    const s = activate(engineer(), "leak", 1, "new");
    expect(isWaitingDecision(s)).toBe(false);
    expect(advance(s, 5).t).toBe(s.t + 5);
  });

  it("ignorar adia; a falha segue piorando e pode ser reaberta", () => {
    let s = activate(engineer(), "scrubber", 1, "new");
    s = ignoreFailure(s, "scrubber");
    expect(s.failures.find((f) => f.id === "scrubber")!.ack).toBe("ignored");
    expect(awaitingDecision(s)).toHaveLength(0);
    s = advance(s, 30);
    expect(s.failures.find((f) => f.id === "scrubber")!.escalation).toBeGreaterThan(0);
    s = reopenDecision(s, "scrubber");
    expect(awaitingDecision(s).map((f) => f.id)).toEqual(["scrubber"]);
  });

  it("começar um reparo resolve a decisão", () => {
    const s = startRepair(activate(engineer(), "leak", 1, "new"), "leak", "quick");
    expect(s.failures.find((f) => f.id === "leak")).toMatchObject({ status: "repairing", ack: "handled" });
    expect(awaitingDecision(s)).toHaveLength(0);
  });
});

describe("fila de reparos", () => {
  const twoFailures = () => activate(activate(engineer(), "leak", 1, "new"), "scrubber", 1, "new");

  it("com a equipe ocupada, o reparo vai para a fila e começa sozinho ao terminar o atual", () => {
    let s = startRepair(twoFailures(), "leak", "quick");
    s = queueRepair(s, "scrubber", "full");
    expect(s.queue).toEqual({ failureId: "scrubber", option: "full" });
    expect(s.failures.find((f) => f.id === "scrubber")!.ack).toBe("handled");
    s = advance(s, 12); // vedação rápida dura 12 s
    expect(s.failures.find((f) => f.id === "leak")!.status).toBe("resolved");
    expect(s.repair).toMatchObject({ failureId: "scrubber", option: "full", progressS: 0 });
    expect(s.queue).toBeNull();
    expect(s.allocation.repair).toBe(3);
    expect(s.log.some((l) => l.text.startsWith("Fila: Reconstruir o reciclador"))).toBe(true);
  });

  it("a falha na fila continua piorando até a equipe chegar", () => {
    let s = queueRepair(startRepair(twoFailures(), "leak", "full"), "scrubber", "quick");
    s = advance(s, 20);
    expect(s.failures.find((f) => f.id === "scrubber")!.escalation).toBeGreaterThan(0);
  });

  it("só exige fila quando a equipe está ocupada", () => {
    const s = twoFailures();
    expect(queueRepair(s, "leak", "quick")).toBe(s);
  });

  it("uma nova escolha substitui a fila; a anterior volta a ficar sem reparo", () => {
    let s = activate(twoFailures(), "fire", 1, "new");
    s = startRepair(s, "leak", "full");
    s = queueRepair(s, "scrubber", "quick");
    s = queueRepair(s, "fire", "quick");
    expect(s.queue?.failureId).toBe("fire");
    expect(s.failures.find((f) => f.id === "scrubber")!.ack).toBe("ignored");
  });

  it("tirar da fila devolve a falha para decidir depois", () => {
    let s = queueRepair(startRepair(twoFailures(), "leak", "full"), "scrubber", "quick");
    s = cancelQueue(s);
    expect(s.queue).toBeNull();
    expect(s.failures.find((f) => f.id === "scrubber")!.ack).toBe("ignored");
  });

  it("trocar agora interrompe o reparo atual e começa o novo", () => {
    let s = advance(startRepair(twoFailures(), "leak", "full"), 10);
    s = switchRepair(s, "scrubber", "quick");
    expect(s.repair).toMatchObject({ failureId: "scrubber", option: "quick", progressS: 0 });
    expect(s.failures.find((f) => f.id === "leak")).toMatchObject({ status: "active", ack: "ignored" });
  });

  it("interromper o reparo atual começa o da fila", () => {
    let s = queueRepair(startRepair(twoFailures(), "leak", "full"), "scrubber", "quick");
    s = abortRepair(s);
    expect(s.repair?.failureId).toBe("scrubber");
    expect(s.queue).toBeNull();
  });

  it("decisões e fila sobrevivem a um recarregamento", () => {
    const storage = memoryStorage();
    let s = activate(twoFailures(), "fire", 1, "new");
    s = queueRepair(startRepair(s, "leak", "full"), "scrubber", "quick");
    saveGame(storage, s);
    const loaded = loadGame(storage)!;
    expect(loaded.queue).toEqual(s.queue);
    expect(awaitingDecision(loaded).map((f) => f.id)).toEqual(["fire"]);
    expect(JSON.stringify(finishRepair(loaded))).toBe(JSON.stringify(finishRepair(s)));
  });
});

function start5() {
  return beginMission(createInitialState());
}
