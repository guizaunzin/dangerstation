import { describe, expect, it } from "vitest";
import { advance, beginMission, computeFlows, createInitialState, setAllocation } from "@/sim/engine";
import { activeAlerts, batteryStatus, buildReport, mainReasons, trendOf } from "@/sim/insights";
import { ROUTES, runRoute } from "@/sim/strategies";

describe("leituras para o painel", () => {
  it("indica quando a bateria está cobrindo o déficit", () => {
    let s = beginMission(createInitialState());
    s = setAllocation(s, "cooling", 8);
    s = setAllocation(s, "life", 8);
    const f = computeFlows(s);
    expect(batteryStatus(s, f).text).toMatch(/^Cobrindo déficit/);
    expect(activeAlerts(s, f).some((a) => a.id === "battery-cover")).toBe(true);
  });

  it("explica por que o calor sobe no início", () => {
    const s = beginMission(createInitialState());
    const f = computeFlows(s);
    expect(trendOf(f.heatRate)).toBe("up");
    expect(mainReasons(f.heatTerms, f.heatRate)[0].value).toBeGreaterThan(0);
  });

  it("mostra a contagem para a falha crítica", () => {
    let s = beginMission(createInitialState());
    s = { ...s, heatC: 99 };
    s = advance(s, 5);
    const alert = activeAlerts(s).find((a) => a.id === "heat-critical");
    expect(alert?.level).toBe("critical");
    expect(alert?.text).toContain("40 s");
  });

  it("relatório de derrota informa a causa", () => {
    const r = buildReport(runRoute(ROUTES.inaction))!;
    expect(r.result).toBe("lost");
    expect(r.cause).toMatch(/^Superaquecimento/);
    expect(r.decisions.some((d) => d.includes("não resolvida"))).toBe(true);
  });

  it("relatório de vitória descreve o estado do módulo e as decisões", () => {
    const r = buildReport(runRoute(ROUTES.quick))!;
    expect(r.result).toBe("won");
    expect(r.cause).toMatch(/^Módulo habitável/);
    expect(r.decisions).toHaveLength(3);
    expect(r.decisions[2]).toContain("Vedação rápida");
  });

  it("sem desfecho não há relatório", () => {
    expect(buildReport(createInitialState())).toBeNull();
  });
});
