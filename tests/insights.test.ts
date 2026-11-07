import { describe, expect, it } from "vitest";
import { runBot, runIdle } from "@/sim/bot";
import { advance, computeFlows, queueRepair, setAllocation, startRepair } from "@/sim/engine";
import { activeAlerts, batteryStatus, buildReport, mainReasons, trendOf } from "@/sim/insights";
import { trainingMission } from "@/sim/random";
import { activate, healthy, quiet } from "./helpers";

describe("leituras para o painel", () => {
  it("indica quando a bateria está cobrindo o déficit", () => {
    let s = setAllocation(quiet(), "cooling", 8);
    s = setAllocation(s, "life", 8);
    const f = computeFlows(s);
    expect(batteryStatus(s, f).text).toMatch(/^Cobrindo déficit/);
    expect(activeAlerts(s, f).some((a) => a.id === "battery-cover")).toBe(true);
  });

  it("explica por que o calor sobe no início", () => {
    const s = quiet();
    const f = computeFlows(s);
    expect(trendOf(f.heatRate)).toBe("up");
    expect(mainReasons(f.heatTerms, f.heatRate)[0].value).toBeGreaterThan(0);
  });

  it("mostra a contagem para a falha crítica", () => {
    const s = advance({ ...quiet(), heatC: 99 }, 5);
    const alert = activeAlerts(s).find((a) => a.id === "heat-critical");
    expect(alert?.level).toBe("critical");
    expect(alert?.text).toContain("55 s");
  });

  it("avisa quando uma falha está piorando sem reparo", () => {
    const s = advance(activate(quiet(), "scrubber"), 40);
    const alert = activeAlerts(s).find((a) => a.id === "failure-scrubber");
    expect(alert?.text).toMatch(/sem reparo \(\+\d+%\)/);
    expect(alert?.action).toBe("decide");
  });

  it("relatório de derrota informa a causa", () => {
    const r = buildReport(runIdle(trainingMission()))!;
    expect(r.result).toBe("lost");
    expect(r.cause).toMatch(/^Superaquecimento|^Hipóxia/);
  });

  it("relatório de vitória descreve o estado do módulo e as decisões", () => {
    const end = runBot(trainingMission(), { policy: "quick", reactionS: 5 });
    const r = buildReport(end)!;
    expect(r.result).toBe("won");
    expect(r.cause).toMatch(/^Módulo habitável/);
    expect(r.decisions).toHaveLength(end.failures.length);
  });

  it("mostra o reparo em andamento com progresso e a fila com ação", () => {
    let s = activate(activate(healthy(quiet()), "leak"), "scrubber");
    s = startRepair(s, "leak", "full");
    s = queueRepair(s, "scrubber", "quick");
    s = advance(s, 10);
    const alerts = activeAlerts(s);
    const repair = alerts.find((a) => a.kind === "repair")!;
    expect(repair.progress).toBeCloseTo(10 / 50, 2);
    expect(repair.text).toMatch(/faltam 40 s/);
    const queue = alerts.find((a) => a.kind === "queue")!;
    expect(queue).toMatchObject({ action: "cancel-queue", failureId: "scrubber" });
    expect(queue.text).toMatch(/começa em 40 s/);
  });

  it("decisão pendente aparece como crítica, sem botão (a própria decisão está aberta)", () => {
    const s = activate(quiet(), "fire", 1, "new");
    const a = activeAlerts(s).find((x) => x.failureId === "fire")!;
    expect(a.level).toBe("critical");
    expect(a.text).toMatch(/^Decisão pendente/);
    expect(a.action).toBeUndefined();
  });
});
