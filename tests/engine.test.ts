import { describe, expect, it } from "vitest";
import { BALANCE, DIFFICULTIES, TRAINING } from "@/sim/config";
import {
  abortRepair,
  activeEffect,
  advance,
  batteryPct,
  computeFlows,
  computeModifiers,
  createInitialState,
  describeEffect,
  previewRepair,
  scaleModifiers,
  setAllocation,
  startRepair,
  step,
} from "@/sim/engine";
import { trainingMission } from "@/sim/random";
import type { SimState } from "@/sim/types";
import { activate, finishRepair, healthy, quiet, start } from "./helpers";

describe("início da missão", () => {
  it("começa na abertura, sem correr o relógio", () => {
    const s = createInitialState();
    expect(s.phase).toBe("intro");
    expect(step(s)).toBe(s);
    expect(s.allocation).toEqual(BALANCE.allocation.initial);
    expect(s.mission).toEqual(trainingMission());
  });

  it("dura 10 minutos de jogo ativo", () => {
    expect(BALANCE.missionDurationS).toBe(600);
  });

  it("é reproduzível: duas execuções iguais produzem o mesmo estado", () => {
    const a = advance(setAllocation(start(), "cooling", 4), 500);
    const b = advance(setAllocation(start(), "cooling", 4), 500);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("treinamento segue a sequência fixa e avisa antes de cada falha", () => {
    const first = TRAINING.schedule[0];
    const lead = DIFFICULTIES[TRAINING.difficulty].warningLeadS;
    let s = setAllocation(start(), "cooling", 4);
    s = advance(s, first.at - lead - 1);
    expect(s.failures[0].status).toBe("pending");
    s = advance(s, 1);
    expect(s.failures[0].status).toBe("warned");
    s = advance(s, lead);
    expect(s.failures[0]).toMatchObject({ id: first.id, status: "active", startedAt: first.at });
    expect(s.failures.map((f) => f.id)).toEqual(TRAINING.schedule.map((x) => x.id));
  });
});

describe("alocação de potência", () => {
  it("limita valores e arredonda para o passo", () => {
    let s = setAllocation(quiet(), "cooling", 99);
    expect(s.allocation.cooling).toBe(BALANCE.allocation.maxPerSystemKw);
    s = setAllocation(s, "life", -3);
    expect(s.allocation.life).toBe(0);
    s = setAllocation(s, "life", 2.4);
    expect(s.allocation.life).toBe(2);
  });

  it("marca o primeiro ajuste do tutorial ao levar a refrigeração a 4 kW", () => {
    let s = setAllocation(quiet(), "cooling", 3);
    expect(s.tutorial.firstAdjustDone).toBe(false);
    s = setAllocation(s, "cooling", 4);
    expect(s.tutorial.firstAdjustDone).toBe(true);
  });

  it("agrupa ajustes seguidos em uma única linha do registro", () => {
    let s = quiet();
    const before = s.log.length;
    s = setAllocation(s, "cooling", 3);
    s = setAllocation(s, "cooling", 4);
    s = setAllocation(s, "life", 5);
    const lines = s.log.slice(before).filter((l) => l.tag === "allocation");
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain("Refrig. 4 kW");
    expect(lines[0].text).toContain("Vida 5 kW");
  });

  it("com excedente, a bateria recarrega até o limite de carga", () => {
    const s = quiet();
    const f = computeFlows(s);
    expect(f.generatorKw).toBeCloseTo(DIFFICULTIES.cadet.generatorKw);
    expect(f.demandKw).toBe(6);
    expect(f.batteryKw).toBeCloseTo(BALANCE.battery.maxChargeKw);
    expect(step(s).batteryKj).toBeCloseTo(s.batteryKj + BALANCE.battery.maxChargeKw);
  });

  it("reparo sem equipe trabalhando não consome potência", () => {
    expect(computeFlows(setAllocation(quiet(), "repair", 5)).demand.repair).toBe(0);
  });

  it("com déficit, a bateria cobre a diferença e os sistemas recebem 100%", () => {
    let s = setAllocation(quiet(), "cooling", 8);
    s = setAllocation(s, "life", 8);
    const f = computeFlows(s);
    expect(f.demandKw).toBe(16);
    expect(f.batteryCovering).toBe(true);
    expect(f.batteryKw).toBeCloseTo(-(16 - DIFFICULTIES.cadet.generatorKw));
    expect(f.supplyRatio).toBeCloseTo(1);
  });

  it("a descarga é limitada; acima do limite os sistemas são racionados", () => {
    let s = activate({ ...quiet(), heatC: 30 }, "generator");
    s = setAllocation(s, "cooling", 8);
    s = setAllocation(s, "life", 8);
    const f = computeFlows(s);
    const gen = DIFFICULTIES.cadet.generatorKw * 0.55;
    expect(f.generatorKw).toBeCloseTo(gen);
    expect(f.batteryKw).toBeCloseTo(-BALANCE.battery.maxDischargeKw);
    expect(f.supplyRatio).toBeCloseTo((gen + 6) / 16);
  });

  it("esgota a bateria e passa a racionar quando não há mais reserva", () => {
    let s = activate({ ...quiet(), heatC: 30 }, "generator");
    s = setAllocation(s, "cooling", 6);
    s = setAllocation(s, "life", 6);
    s = advance(s, 200);
    expect(s.batteryKj).toBe(0);
    const f = computeFlows(s);
    expect(f.batteryCovering).toBe(false);
    expect(f.supplyRatio).toBeLessThan(1);
    expect(s.log.some((l) => l.text.startsWith("Bateria esgotada"))).toBe(true);
  });

  it("proteção térmica bloqueia a recarga com calor alto", () => {
    const f = computeFlows({ ...quiet(), heatC: BALANCE.battery.chargeBlockedAboveC + 1, batteryKj: 100 });
    expect(f.chargeBlocked).toBe(true);
    expect(f.batteryKw).toBe(0);
  });

  it("calor acima do limiar reduz a eficiência do gerador", () => {
    const cool = computeFlows({ ...quiet(), heatC: 50 });
    const hot = computeFlows({ ...quiet(), heatC: 75 });
    expect(cool.generatorHeatEfficiency).toBe(1);
    expect(hot.generatorKw).toBeLessThan(cool.generatorKw);
  });

  it("explica as tendências com termos que somam a taxa", () => {
    const f = computeFlows(activate(quiet(), "fire"));
    expect(f.heatTerms.reduce((a, t) => a + t.value, 0)).toBeCloseTo(f.heatRate);
    expect(f.oxygenTerms.reduce((a, t) => a + t.value, 0)).toBeCloseTo(f.oxygenRate);
    expect(f.heatTerms.some((t) => t.label === "Incêndio elétrico")).toBe(true);
    expect(f.oxygenTerms.some((t) => t.label === "Incêndio elétrico")).toBe(true);
  });
});

describe("falhas: gravidade, agravamento e catálogo", () => {
  it("a gravidade intensifica fatores e taxas", () => {
    expect(scaleModifiers({ generatorFactor: 0.6, leakPerS: 0.1 }, 1.5)).toEqual({ generatorFactor: 0.4, leakPerS: 0.15 });
    expect(scaleModifiers({ coolingFactor: 0.2 }, 3).coolingFactor).toBe(0.05);
  });

  it("falha sem reparo piora com o tempo até o limite", () => {
    let s = activate(healthy(quiet()), "leak");
    const leak0 = computeModifiers(s).leakPerS;
    s = advance(s, 60);
    expect(s.failures.find((f) => f.id === "leak")!.escalation).toBeCloseTo(0.2, 2);
    expect(computeModifiers(s).leakPerS).toBeGreaterThan(leak0);
    s = advance(s, 600);
    expect(s.failures.find((f) => f.id === "leak")!.escalation).toBeCloseTo(BALANCE.escalation.max);
  });

  it("o agravamento para enquanto a equipe trabalha", () => {
    let s = advance(activate(healthy(quiet()), "scrubber"), 30);
    const esc = s.failures.find((f) => f.id === "scrubber")!.escalation;
    s = advance(startRepair(s, "scrubber", "full"), 20);
    expect(s.failures.find((f) => f.id === "scrubber")!.escalation).toBe(esc);
  });

  it("curto na bateria limita a descarga e encolhe a capacidade", () => {
    let s = activate(healthy(quiet()), "battery");
    s = setAllocation(s, "cooling", 8);
    s = setAllocation(s, "life", 8);
    const f = computeFlows(s);
    expect(-f.batteryKw).toBeCloseTo(BALANCE.battery.maxDischargeKw * 0.35);
    s = step(s);
    expect(s.batteryKj).toBeLessThanOrEqual(BALANCE.battery.capacityKj * 0.75 + 1e-6);
  });

  it("descreve o efeito em números", () => {
    const s = activate(quiet(), "fire", 1);
    expect(describeEffect(activeEffect(s.failures.find((f) => f.id === "fire")!))).toBe(
      "+0,22 °C/s de calor, perda de 0,06 %/s de oxigênio",
    );
  });
});

describe("reparos", () => {
  it("só um reparo por vez e só para falhas ativas", () => {
    let s = quiet();
    expect(startRepair(s, "generator", "quick")).toBe(s);
    s = activate(activate(s, "generator"), "cooling");
    s = startRepair(s, "generator", "full");
    expect(s.repair?.failureId).toBe("generator");
    expect(startRepair(s, "cooling", "quick")).toBe(s);
  });

  it("reserva a potência do reparo ao confirmar e libera ao concluir", () => {
    let s = startRepair(activate(healthy(quiet()), "generator"), "generator", "quick");
    expect(s.allocation.repair).toBe(2);
    s = finishRepair(s);
    expect(s.allocation.repair).toBe(0);
    expect(s.failures.find((f) => f.id === "generator")).toMatchObject({ status: "resolved", resolution: "quick" });
  });

  it("desvio rápido do gerador deixa 85% e calor extra permanente", () => {
    const s = finishRepair(startRepair(activate(healthy(quiet()), "generator"), "generator", "quick"));
    expect(computeModifiers(s).generatorFactor).toBeCloseTo(0.85);
    expect(computeModifiers(s).extraHeatPerS).toBeCloseTo(0.03);
    expect(computeModifiers(advance(s, 300)).generatorFactor).toBeCloseTo(0.85);
  });

  it("recalibração completa restaura 100% do gerador", () => {
    const s = finishRepair(startRepair(activate(healthy(quiet()), "generator"), "generator", "full"));
    expect(computeModifiers(s)).toMatchObject({ generatorFactor: 1, extraHeatPerS: 0 });
  });

  it("troca da bomba reduz a refrigeração enquanto acontece e restaura depois", () => {
    let s = activate(healthy(quiet()), "cooling");
    expect(computeModifiers(s).coolingFactor).toBeCloseTo(0.4);
    s = startRepair(s, "cooling", "full");
    expect(computeModifiers(s).coolingFactor).toBeCloseTo(0.2);
    s = finishRepair(s);
    expect(computeModifiers(s).coolingFactor).toBe(1);
  });

  it("vedação rápida deixa perda residual; vedação completa elimina o vazamento", () => {
    const base = activate(healthy(quiet()), "leak");
    const q = finishRepair(startRepair(base, "leak", "quick"));
    expect(computeModifiers(q).leakPerS).toBeCloseTo(0.04);
    expect(computeFlows(q).oxygenTerms.some((t) => t.label.startsWith("Sequela"))).toBe(true);
    expect(computeModifiers(finishRepair(startRepair(base, "leak", "full"))).leakPerS).toBe(0);
  });

  it("ventilar o incêndio apaga o fogo mas deixa a válvula vazando", () => {
    const s = finishRepair(startRepair(activate(healthy(quiet()), "fire"), "fire", "quick"));
    expect(computeModifiers(s)).toMatchObject({ extraHeatPerS: 0, leakPerS: 0.03 });
  });

  it("reparo com menos potência que o necessário fica mais lento", () => {
    let s = startRepair(activate(healthy(quiet()), "generator"), "generator", "quick");
    s = setAllocation(s, "repair", 1);
    s = advance(s, 10);
    expect(s.repair!.progressS).toBeCloseTo(5, 0);
  });

  it("interromper um reparo devolve a falha e perde o progresso", () => {
    let s = advance(startRepair(activate(healthy(quiet()), "generator"), "generator", "full"), 20);
    s = abortRepair(s);
    expect(s.repair).toBeNull();
    expect(s.failures.find((f) => f.id === "generator")!.status).toBe("active");
  });

  it("a prévia mostra custo, duração e efeito sem alterar o estado", () => {
    const s = activate({ ...setAllocation(quiet(), "cooling", 4), heatC: 40 }, "generator");
    const snapshot = JSON.stringify(s);
    const p = previewRepair(s, "generator", "full");
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(p.option).toMatchObject({ powerKw: 4, durationS: 60 });
    expect(p.demandKw).toBe(12);
    expect(p.batteryAutonomyS).not.toBeNull();
  });
});

describe("níveis críticos, vitória e derrota", () => {
  const grace = DIFFICULTIES.cadet.graceS;

  it("calor crítico pelo tempo de tolerância causa derrota", () => {
    let s: SimState = { ...quiet(), heatC: 99 };
    s = setAllocation(s, "cooling", 0);
    s = advance(s, 10);
    expect(s.critical.heat).toBe(10);
    s = advance(s, grace);
    expect(s.outcome).toMatchObject({ result: "lost", cause: "heat" });
  });

  it("a tolerância depende da dificuldade", () => {
    const hot = (difficulty: "cadet" | "commander") => {
      let s: SimState = { ...createInitialState({ kind: "random", seed: "X", difficulty }), phase: "active", heatC: 110 };
      s = setAllocation(s, "cooling", 0);
      return advance(s, 600).outcome!.at;
    };
    expect(hot("commander")).toBeLessThan(hot("cadet"));
  });

  it("sair do nível crítico devolve a margem aos poucos", () => {
    let s: SimState = { ...quiet(), heatC: BALANCE.heat.criticalC + 0.5 };
    s = setAllocation(s, "cooling", 8);
    s = advance(s, 1);
    expect(s.critical.heat).toBe(1);
    s = advance(s, 20);
    expect(s.critical.heat).toBe(0);
  });

  it("oxigênio crítico pelo tempo de tolerância causa derrota", () => {
    let s: SimState = { ...quiet(), oxygenPct: 18, heatC: 30 };
    s = setAllocation(s, "cooling", 4);
    s = setAllocation(s, "life", 0);
    s = advance(s, grace + 1);
    expect(s.outcome).toMatchObject({ result: "lost", cause: "oxygen" });
  });

  it("chegar ao resgate com o módulo habitável é vitória", () => {
    let s = setAllocation(quiet(), "cooling", 4);
    s = advance(s, BALANCE.missionDurationS + 50);
    expect(s.outcome).toMatchObject({ result: "won", at: BALANCE.missionDurationS });
    expect(step(s)).toBe(s);
  });

  it("depois do fim, ações do jogador não mudam nada", () => {
    const s = { ...quiet(), phase: "ended" as const, outcome: { result: "won" as const, at: 600 } };
    expect(setAllocation(s, "cooling", 6)).toBe(s);
    expect(batteryPct(s)).toBeCloseTo(BALANCE.battery.initialPct);
  });
});
