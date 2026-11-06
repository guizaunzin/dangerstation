import { describe, expect, it } from "vitest";
import { BALANCE } from "@/sim/config";
import { ROUTES, runRoute, type Route } from "@/sim/strategies";

/** Atrasa as decisões de reparo para simular o tempo de reação de uma pessoa. */
function withReaction(route: Route, delayS: number): Route {
  return {
    ...route,
    actions: route.actions.map((a) => (a.at > 0 ? { ...a, at: a.at + delayS } : a)),
  };
}

describe("balanceamento da missão 1 (relógio acelerado)", () => {
  it("inação: manter a distribuição inicial leva à derrota", () => {
    const end = runRoute(ROUTES.inaction);
    expect(end.outcome?.result).toBe("lost");
    expect(end.t).toBeLessThan(BALANCE.missionDurationS);
  });

  it.each(["repairsOnlyQuick", "repairsOnlyFull"])("reparar sem rever a distribuição (%s) também perde", (id) => {
    expect(runRoute(ROUTES[id]).outcome?.result).toBe("lost");
  });

  it.each(["quick", "full", "mixed"])("rota %s vence o resgate", (id) => {
    const end = runRoute(ROUTES[id]);
    expect(end.outcome).toMatchObject({ result: "won", at: BALANCE.missionDurationS });
    expect(end.stats.criticalSeconds).toBe(0);
  });

  it("as rotas vencedoras tomam decisões diferentes e deixam consequências diferentes", () => {
    const quick = runRoute(ROUTES.quick);
    const full = runRoute(ROUTES.full);
    expect(quick.failures.map((f) => f.resolution)).toEqual(["quick", "quick", "quick"]);
    expect(full.failures.map((f) => f.resolution)).toEqual(["full", "full", "full"]);
    expect(quick.oxygenPct).toBeLessThan(full.oxygenPct); // perda residual da vedação rápida
  });

  it.each(["quick", "full"])("rota %s tolera 15 s de tempo de reação", (id) => {
    expect(runRoute(withReaction(ROUTES[id], 15)).outcome?.result).toBe("won");
  });
});
