import { describe, expect, it } from "vitest";
import { BALANCE, SCENARIO } from "@/sim/config";
import {
  abortRepair,
  advance,
  batteryPct,
  beginMission,
  computeFlows,
  computeModifiers,
  createInitialState,
  DEFAULT_CONFIG,
  previewRepair,
  setAllocation,
  startRepair,
  step,
  type SimConfig,
} from "@/sim/engine";
import type { SimState } from "@/sim/types";

const start = () => beginMission(createInitialState());

function withState(patch: Partial<SimState>): SimState {
  return { ...start(), ...patch };
}

/** Avança até o reparo atual terminar (com limite de segurança). */
function finishRepair(s: SimState): SimState {
  let out = s;
  for (let i = 0; i < 400 && out.repair; i++) out = step(out);
  expect(out.repair).toBeNull();
  return out;
}

/** Potência generosa e calor sob controle, para isolar o efeito de um reparo. */
function healthy(s: SimState): SimState {
  return { ...s, heatC: 30, batteryKj: BALANCE.battery.capacityKj, allocation: { cooling: 4, life: 4, repair: 0 } };
}

/** Avança até a falha indicada estar ativa. */
function untilFailure(s: SimState, id: string): SimState {
  const at = SCENARIO.failures.find((f) => f.id === id)!.at;
  return advance(s, at - s.t);
}

describe("início da missão", () => {
  it("começa na abertura, sem correr o relógio", () => {
    const s = createInitialState();
    expect(s.phase).toBe("intro");
    expect(step(s)).toBe(s);
    expect(s.allocation).toEqual(BALANCE.allocation.initial);
  });

  it("é reproduzível: duas execuções iguais produzem o mesmo estado", () => {
    const a = advance(setAllocation(start(), "cooling", 4), 900);
    const b = advance(setAllocation(start(), "cooling", 4), 900);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("dispara aviso e falha nos instantes programados", () => {
    const def = SCENARIO.failures[0];
    let s = advance(start(), def.warnAt - 1);
    expect(s.failures[0].status).toBe("pending");
    s = advance(s, 1);
    expect(s.failures[0].status).toBe("warned");
    s = advance(s, def.at - def.warnAt);
    expect(s.failures[0].status).toBe("active");
    expect(s.failures[0].startedAt).toBe(def.at);
  });
});

describe("alocação de potência", () => {
  it("limita valores e arredonda para o passo", () => {
    let s = setAllocation(start(), "cooling", 99);
    expect(s.allocation.cooling).toBe(BALANCE.allocation.maxPerSystemKw);
    s = setAllocation(s, "life", -3);
    expect(s.allocation.life).toBe(0);
    s = setAllocation(s, "life", 2.4);
    expect(s.allocation.life).toBe(2);
  });

  it("marca o primeiro ajuste do tutorial ao levar a refrigeração a 4 kW", () => {
    let s = setAllocation(start(), "cooling", 3);
    expect(s.tutorial.firstAdjustDone).toBe(false);
    s = setAllocation(s, "cooling", 4);
    expect(s.tutorial.firstAdjustDone).toBe(true);
  });

  it("agrupa ajustes seguidos em uma única linha do registro", () => {
    let s = start();
    const before = s.log.length;
    s = setAllocation(s, "cooling", 3);
    s = setAllocation(s, "cooling", 4);
    s = setAllocation(s, "life", 5);
    const allocLines = s.log.slice(before).filter((l) => l.tag === "allocation");
    expect(allocLines).toHaveLength(1);
    expect(allocLines[0].text).toContain("Refrig. 4 kW");
    expect(allocLines[0].text).toContain("Vida 5 kW");
  });

  it("com excedente, a bateria recarrega até o limite de carga", () => {
    const s = start();
    const f = computeFlows(s);
    expect(f.generatorKw).toBeCloseTo(12);
    expect(f.demandKw).toBe(6);
    expect(f.batteryKw).toBeCloseTo(BALANCE.battery.maxChargeKw);
    const next = step(s);
    expect(next.batteryKj).toBeCloseTo(s.batteryKj + BALANCE.battery.maxChargeKw);
  });

  it("reparo sem equipe trabalhando não consome potência", () => {
    const s = setAllocation(start(), "repair", 5);
    expect(computeFlows(s).demand.repair).toBe(0);
  });

  it("com déficit, a bateria cobre a diferença e os sistemas recebem 100%", () => {
    let s = setAllocation(start(), "cooling", 8);
    s = setAllocation(s, "life", 7);
    const f = computeFlows(s);
    expect(f.demandKw).toBe(15);
    expect(f.batteryCovering).toBe(true);
    expect(f.batteryKw).toBeCloseTo(-3);
    expect(f.supplyRatio).toBeCloseTo(1);
    expect(step(s).batteryKj).toBeCloseTo(s.batteryKj - 3);
  });

  it("a descarga é limitada; acima do limite os sistemas são racionados", () => {
    let s = withState({ heatC: 30 });
    s = setAllocation(s, "cooling", 8);
    s = setAllocation(s, "life", 8);
    s = { ...s, failures: s.failures.map((f) => (f.id === "generator" ? { ...f, status: "active" as const } : f)) };
    const f = computeFlows(s);
    // gerador a 55% = 6,6 kW, demanda 16 kW, bateria entrega no máximo 6 kW
    expect(f.generatorKw).toBeCloseTo(6.6);
    expect(f.batteryKw).toBeCloseTo(-BALANCE.battery.maxDischargeKw);
    expect(f.supplyRatio).toBeCloseTo(12.6 / 16);
    expect(f.unmetKw).toBeCloseTo(3.4);
  });

  it("esgota a bateria e passa a racionar quando não há mais reserva", () => {
    let s = setAllocation(start(), "cooling", 8);
    s = setAllocation(s, "life", 8);
    // déficit de 4 kW: 495 kJ duram ~124 s
    s = advance(s, 130);
    expect(s.batteryKj).toBe(0);
    const f = computeFlows(s);
    expect(f.batteryCovering).toBe(false);
    expect(f.supplyRatio).toBeLessThan(1);
    expect(f.unmetKw).toBeGreaterThan(0);
    expect(s.log.some((l) => l.text.startsWith("Bateria esgotada"))).toBe(true);
    expect(s.stats.minBatteryPct).toBe(0);
  });

  it("proteção térmica bloqueia a recarga com calor alto", () => {
    const s = withState({ heatC: BALANCE.battery.chargeBlockedAboveC + 1, batteryKj: 100 });
    const f = computeFlows(s);
    expect(f.chargeBlocked).toBe(true);
    expect(f.batteryKw).toBe(0);
    expect(f.spareKw).toBeGreaterThan(0);
  });

  it("calor acima do limiar reduz a eficiência do gerador", () => {
    const cool = computeFlows(withState({ heatC: 50 }));
    const hot = computeFlows(withState({ heatC: 75 }));
    expect(cool.generatorHeatEfficiency).toBe(1);
    expect(hot.generatorHeatEfficiency).toBeLessThan(1);
    expect(hot.generatorKw).toBeLessThan(cool.generatorKw);
  });

  it("explica as tendências com termos que somam a taxa", () => {
    const f = computeFlows(start());
    const sumHeat = f.heatTerms.reduce((a, t) => a + t.value, 0);
    const sumO2 = f.oxygenTerms.reduce((a, t) => a + t.value, 0);
    expect(sumHeat).toBeCloseTo(f.heatRate);
    expect(sumO2).toBeCloseTo(f.oxygenRate);
    expect(f.heatTerms.some((t) => t.label.startsWith("Refrigeração"))).toBe(true);
  });
});

describe("reparos", () => {
  it("só um reparo por vez e só para falhas ativas", () => {
    let s = start();
    expect(startRepair(s, "generator", "quick")).toBe(s); // falha ainda não ocorreu
    s = untilFailure(s, "cooling");
    s = startRepair(s, "generator", "full");
    expect(s.repair?.failureId).toBe("generator");
    const blocked = startRepair(s, "cooling", "quick");
    expect(blocked).toBe(s);
  });

  it("reserva a potência do reparo ao confirmar e libera ao concluir", () => {
    let s = untilFailure(start(), "generator");
    s = startRepair(s, "generator", "quick");
    expect(s.allocation.repair).toBe(2);
    s = advance(s, 30);
    expect(s.repair).toBeNull();
    expect(s.allocation.repair).toBe(0);
    expect(s.failures[0]).toMatchObject({ status: "resolved", resolution: "quick" });
  });

  it("desvio rápido do gerador deixa 85% da capacidade e calor extra permanente", () => {
    let s = untilFailure(start(), "generator");
    s = advance(startRepair(s, "generator", "quick"), 30);
    const m = computeModifiers(s);
    expect(m.generatorFactor).toBeCloseTo(0.85);
    expect(m.extraHeatPerS).toBeCloseTo(0.03);
    const later = advance(s, 600);
    expect(computeModifiers(later).generatorFactor).toBeCloseTo(0.85);
  });

  it("recalibração completa restaura 100% do gerador", () => {
    let s = setAllocation(start(), "cooling", 4);
    s = untilFailure(s, "generator");
    expect(computeModifiers(s).generatorFactor).toBeCloseTo(0.55);
    s = advance(startRepair(s, "generator", "full"), 90);
    expect(s.failures[0].resolution).toBe("full");
    const m = computeModifiers(s);
    expect(m.generatorFactor).toBe(1);
    expect(m.extraHeatPerS).toBe(0);
  });

  it("troca da bomba reduz a refrigeração enquanto acontece e restaura depois", () => {
    let s = untilFailure(healthy(start()), "cooling");
    expect(s.phase).toBe("active");
    s = healthy(s);
    expect(computeModifiers(s).coolingFactor).toBeCloseTo(0.4);
    s = startRepair(s, "cooling", "full");
    expect(computeModifiers(s).coolingFactor).toBeCloseTo(0.2);
    s = finishRepair(s);
    expect(s.failures[1]).toMatchObject({ status: "resolved", resolution: "full" });
    expect(computeModifiers(s).coolingFactor).toBe(1);
    // as outras falhas seguem sem solução
    expect(computeModifiers(s).generatorFactor).toBeCloseTo(0.55);
  });

  it("vedação rápida deixa perda residual; vedação completa elimina o vazamento", () => {
    const s0 = healthy(start());
    const base = { ...s0, failures: s0.failures.map((f) => (f.id === "leak" ? { ...f, status: "active" as const } : f)) };
    expect(computeModifiers(base).leakPerS).toBeCloseTo(0.15);
    const quick = finishRepair(startRepair(base, "leak", "quick"));
    expect(computeModifiers(quick).leakPerS).toBeCloseTo(0.04);
    expect(computeFlows(quick).oxygenTerms.some((t) => t.label.includes("residual"))).toBe(true);
    const full = finishRepair(startRepair(base, "leak", "full"));
    expect(computeModifiers(full).leakPerS).toBe(0);
  });

  it("reparo com menos potência que o necessário fica mais lento", () => {
    let s = untilFailure(start(), "generator");
    s = startRepair(s, "generator", "quick");
    s = setAllocation(s, "repair", 1); // metade da potência pedida
    s = advance(s, 30);
    expect(s.repair).not.toBeNull();
    expect(s.repair!.progressS).toBeCloseTo(15, 0);
  });

  it("interromper um reparo devolve a falha e perde o progresso", () => {
    let s = untilFailure(start(), "generator");
    s = advance(startRepair(s, "generator", "full"), 40);
    s = abortRepair(s);
    expect(s.repair).toBeNull();
    expect(s.failures[0].status).toBe("active");
    expect(s.allocation.repair).toBe(0);
  });

  it("a prévia mostra custo, duração e efeito sem alterar o estado", () => {
    const s = untilFailure(setAllocation(start(), "cooling", 4), "generator");
    const snapshot = JSON.stringify(s);
    const p = previewRepair(s, "generator", "full");
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(p.option.powerKw).toBe(4);
    expect(p.option.durationS).toBe(90);
    expect(p.demandKw).toBe(12);
    expect(p.generatorKw).toBeCloseTo(6.6);
    expect(p.batteryAutonomyS).not.toBeNull();
    expect(p.etaS).toBeCloseTo(90);
  });
});

describe("níveis críticos, vitória e derrota", () => {
  it("calor crítico por tempo suficiente causa derrota, com contagem visível", () => {
    let s = withState({ heatC: 95 });
    s = setAllocation(s, "cooling", 0);
    s = advance(s, 10);
    expect(s.critical.heat).toBe(10);
    expect(s.phase).toBe("active");
    s = advance(s, BALANCE.critical.graceS);
    expect(s.outcome).toMatchObject({ result: "lost", cause: "heat" });
    expect(s.phase).toBe("ended");
  });

  it("sair do nível crítico devolve a margem aos poucos", () => {
    let s = withState({ heatC: BALANCE.heat.criticalC + 0.5 });
    s = setAllocation(s, "cooling", 8);
    s = advance(s, 1);
    expect(s.critical.heat).toBe(1);
    s = advance(s, 20);
    expect(s.heatC).toBeLessThan(BALANCE.heat.criticalC);
    expect(s.critical.heat).toBe(0);
  });

  it("oxigênio crítico por tempo suficiente causa derrota", () => {
    let s = withState({ oxygenPct: 18, heatC: 30 });
    s = setAllocation(s, "cooling", 4);
    s = setAllocation(s, "life", 0);
    s = advance(s, BALANCE.critical.graceS + 1);
    expect(s.outcome).toMatchObject({ result: "lost", cause: "oxygen" });
  });

  it("chegar ao resgate com o módulo habitável é vitória", () => {
    const cfg: SimConfig = {
      ...DEFAULT_CONFIG,
      scenario: { ...SCENARIO, failures: SCENARIO.failures.map((f) => ({ ...f, warnAt: 1e6, at: 1e6 })) },
    };
    let s = beginMission(createInitialState(cfg), cfg);
    s = setAllocation(s, "cooling", 4, cfg);
    s = advance(s, BALANCE.missionDurationS + 50, cfg);
    expect(s.outcome).toMatchObject({ result: "won", at: BALANCE.missionDurationS });
    expect(s.t).toBe(BALANCE.missionDurationS);
    expect(step(s, cfg)).toBe(s);
  });

  it("depois do fim, ações do jogador não mudam nada", () => {
    const s = { ...withState({}), phase: "ended" as const, outcome: { result: "won" as const, at: 1200 } };
    expect(setAllocation(s, "cooling", 6)).toBe(s);
    expect(batteryPct(s)).toBeCloseTo(BALANCE.battery.initialPct);
  });
});
