import type { Allocation, Scenario } from "./types";

/**
 * Todos os parâmetros de balanceamento ficam aqui.
 * Unidades: potência em kW, energia em kJ (kW·s), calor em °C, oxigênio em %, tempo em s de jogo.
 * Depois de mexer, rode `npm run balance` e `npm test` para conferir as rotas de vitória e a derrota por inação.
 */
export const BALANCE = {
  /** Passo fixo da simulação (s de jogo). */
  tickS: 1,
  /** Tempo de jogo ativo até o resgate (s). */
  missionDurationS: 20 * 60,

  generator: {
    nominalKw: 12,
    /** Acima desta temperatura o gerador perde eficiência. */
    derateStartC: 55,
    /** Na temperatura crítica a eficiência chega ao mínimo. */
    derateEndC: 85,
    minEfficiency: 0.55,
  },

  battery: {
    capacityKj: 900,
    initialPct: 55,
    maxDischargeKw: 6,
    maxChargeKw: 3,
    /** Proteção térmica: a bateria não recarrega acima desta temperatura. */
    chargeBlockedAboveC: 65,
  },

  allocation: {
    maxPerSystemKw: 8,
    stepKw: 1,
    initial: { cooling: 2, life: 4, repair: 0 } satisfies Allocation,
  },

  heat: {
    initialC: 46,
    ambientC: 20,
    /** Calor de base dos equipamentos do módulo (°C/s). */
    baseGainPerS: 0.12,
    /** Calor por kW entregue aos sistemas (°C/s por kW). */
    gainPerKw: 0.02,
    /** Calor removido por kW entregue à refrigeração (°C/s por kW). */
    coolingPerKw: 0.06,
    /** Dissipação passiva pelo casco, proporcional a (T − ambiente). */
    passiveLossRate: 0.0015,
    warningC: 65,
    criticalC: 85,
    maxC: 130,
  },

  oxygen: {
    initialPct: 80,
    /** Consumo da tripulação (%/s). */
    crewUsePerS: 0.1,
    /** Recuperação por kW entregue ao suporte de vida (%/s por kW). */
    recoveryPerKw: 0.025,
    warningPct: 35,
    criticalPct: 20,
  },

  critical: {
    /** Tempo tolerado em nível crítico antes da perda do módulo (s). */
    graceS: 45,
    /** Quanto o contador crítico recua por segundo fora do nível crítico. */
    recoveryPerS: 1,
  },

  /** Quantidade de entradas guardadas no registro. */
  logLimit: 60,
};

export type Balance = typeof BALANCE;

/**
 * Missão 1: sequência fixa e reproduzível de falhas.
 */
export const SCENARIO: Scenario = {
  id: "missao-1",
  name: "Missão 1 — Resgate do módulo Kestrel",
  moduleName: "Módulo Kestrel",
  failures: [
    {
      id: "generator",
      title: "Queda de geração",
      warnAt: 130,
      at: 150,
      warnText: "Sensores: oscilação no núcleo do gerador. Possível queda de geração em 20 s.",
      alertText: "Falha: o gerador perdeu 45% da capacidade.",
      active: { generatorFactor: 0.55 },
      options: {
        quick: {
          id: "quick",
          label: "Desvio para barramento auxiliar",
          powerKw: 2,
          durationS: 30,
          heatPerS: 0.02,
          after: { generatorFactor: 0.85, extraHeatPerS: 0.03 },
          costText: "Rápido e barato: 2 kW por 30 s.",
          effectText: "Gerador volta a 85% e o barramento aquecido soma +0,03 °C/s até o resgate.",
        },
        full: {
          id: "full",
          label: "Recalibrar núcleo do gerador",
          powerKw: 4,
          durationS: 90,
          heatPerS: 0.08,
          after: {},
          costText: "Demorado: 4 kW por 90 s e o trabalho esquenta o módulo (+0,08 °C/s).",
          effectText: "Gerador volta a 100%, sem efeito residual.",
        },
      },
    },
    {
      id: "cooling",
      title: "Refrigeração degradada",
      warnAt: 460,
      at: 480,
      warnText: "Sensores: pressão do refrigerante caindo. Degradação da refrigeração em 20 s.",
      alertText: "Falha: a refrigeração opera a 40% da eficiência.",
      active: { coolingFactor: 0.4 },
      options: {
        quick: {
          id: "quick",
          label: "Purga do circuito",
          powerKw: 2,
          durationS: 25,
          heatPerS: 0.02,
          after: { coolingFactor: 0.75 },
          costText: "Rápido: 2 kW por 25 s.",
          effectText: "Refrigeração volta a 75% da eficiência até o resgate.",
        },
        full: {
          id: "full",
          label: "Trocar bomba de refrigerante",
          powerKw: 3,
          durationS: 100,
          heatPerS: 0.04,
          during: { coolingFactor: 0.5 },
          after: {},
          costText: "Demorado: 3 kW por 100 s; durante a troca o circuito rende só metade.",
          effectText: "Refrigeração volta a 100%, sem efeito residual.",
        },
      },
    },
    {
      id: "leak",
      title: "Vazamento de oxigênio",
      warnAt: 760,
      at: 780,
      warnText: "Sensores: microfissura na antepara. Vazamento de oxigênio em 20 s.",
      alertText: "Falha: vazamento de oxigênio de 0,15 %/s.",
      active: { leakPerS: 0.15 },
      options: {
        quick: {
          id: "quick",
          label: "Vedação rápida",
          powerKw: 1,
          durationS: 20,
          heatPerS: 0.01,
          after: { leakPerS: 0.04 },
          costText: "Rápido e barato: 1 kW por 20 s.",
          effectText: "Perda residual de 0,04 %/s até o resgate.",
        },
        full: {
          id: "full",
          label: "Vedação completa",
          powerKw: 4,
          durationS: 80,
          heatPerS: 0.06,
          after: {},
          costText: "Demorado: 4 kW por 80 s, ocupando a equipe e esquentando o módulo.",
          effectText: "Vazamento eliminado.",
        },
      },
    },
  ],
};

export const SAVE_VERSION = 1;
export const SAVE_KEY = "dangerstation:save:v1";
