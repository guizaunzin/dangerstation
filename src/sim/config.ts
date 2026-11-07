import type { Allocation, DifficultyDef, DifficultyId, FailureDef, FailureId, ScheduledFailure } from "./types";

/**
 * Todos os parâmetros de balanceamento ficam aqui.
 * Unidades: potência em kW, energia em kJ (kW·s), calor em °C, oxigênio em %, tempo em s de jogo.
 * Depois de mexer, rode `npm run balance` e `npm test` para conferir as taxas de vitória.
 */
export const BALANCE = {
  /** Passo fixo da simulação (s de jogo). */
  tickS: 1,
  /** Tempo de jogo ativo até o resgate (s). */
  missionDurationS: 10 * 60,

  generator: {
    /** Acima desta temperatura o gerador perde eficiência. */
    derateStartC: 55,
    /** Na temperatura crítica a eficiência chega ao mínimo. */
    derateEndC: 85,
    minEfficiency: 0.55,
  },

  battery: {
    capacityKj: 900,
    initialPct: 60,
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
    /** Quanto o contador crítico recua por segundo fora do nível crítico. */
    recoveryPerS: 1,
  },

  schedule: {
    /** Primeira falha nunca antes deste instante (s). */
    firstAtS: 45,
    /** Última falha no máximo neste tempo antes do resgate (s). */
    lastBeforeEndS: 70,
    /** Variação aleatória da intensidade de cada falha (± fração). */
    severityJitter: 0.15,
  },

  escalation: {
    /** Quanto uma falha sem reparo piora por segundo (fração da intensidade original). */
    perS: 0.2 / 60,
    /** Agravamento máximo. */
    max: 0.6,
  },

  /** Quantidade de entradas guardadas no registro. */
  logLimit: 80,
};

export type Balance = typeof BALANCE;

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  cadet: {
    id: "cadet",
    label: "Cadete",
    description: "5 falhas, gerador de 12,5 kW, avisos com 25 s e 60 s de tolerância no nível crítico.",
    failureCount: 5,
    severity: 1,
    generatorKw: 12.5,
    graceS: 60,
    warningLeadS: 25,
    scoreMultiplier: 0.8,
    decisionPauses: true,
    medals: { gold: 900, silver: 840 },
  },
  engineer: {
    id: "engineer",
    label: "Engenheiro",
    description: "7 falhas mais fortes, gerador de 11,5 kW, avisos com 20 s e 45 s de tolerância.",
    failureCount: 7,
    severity: 1.3,
    generatorKw: 11.5,
    graceS: 45,
    warningLeadS: 20,
    scoreMultiplier: 1,
    decisionPauses: false,
    medals: { gold: 750, silver: 690 },
  },
  commander: {
    id: "commander",
    label: "Comandante",
    description: "Todas as 8 falhas, bem mais fortes, gerador de 11 kW, avisos com 15 s e só 30 s de tolerância.",
    failureCount: 8,
    severity: 1.5,
    generatorKw: 11,
    graceS: 30,
    warningLeadS: 15,
    scoreMultiplier: 1.35,
    decisionPauses: false,
    medals: { gold: 680, silver: 620 },
  },
};

/** Catálogo de falhas. As sementes sorteiam quais aparecem, quando e com que intensidade. */
export const FAILURES: Record<FailureId, FailureDef> = {
  generator: {
    id: "generator",
    title: "Queda de geração",
    part: "generator",
    warnText: "Oscilação no núcleo do gerador.",
    alertText: "O núcleo do gerador perdeu potência.",
    active: { generatorFactor: 0.55 },
    options: {
      quick: {
        id: "quick",
        label: "Desvio para barramento auxiliar",
        powerKw: 2,
        durationS: 20,
        heatPerS: 0.02,
        after: { generatorFactor: 0.85, extraHeatPerS: 0.03 },
        costText: "Rápido e barato: 2 kW por 20 s.",
        effectText: "Gerador volta a 85% e o barramento aquecido soma +0,03 °C/s até o resgate.",
      },
      full: {
        id: "full",
        label: "Recalibrar núcleo do gerador",
        powerKw: 4,
        durationS: 60,
        heatPerS: 0.08,
        after: {},
        costText: "Demorado: 4 kW por 60 s e o trabalho esquenta o módulo (+0,08 °C/s).",
        effectText: "Gerador volta a 100%, sem efeito residual.",
      },
    },
  },
  cooling: {
    id: "cooling",
    title: "Refrigeração degradada",
    part: "radiator",
    warnText: "Pressão do refrigerante caindo.",
    alertText: "O circuito de refrigeração perdeu eficiência.",
    active: { coolingFactor: 0.4 },
    options: {
      quick: {
        id: "quick",
        label: "Purga do circuito",
        powerKw: 2,
        durationS: 15,
        heatPerS: 0.02,
        after: { coolingFactor: 0.75 },
        costText: "Rápido: 2 kW por 15 s.",
        effectText: "Refrigeração volta a 75% da eficiência até o resgate.",
      },
      full: {
        id: "full",
        label: "Trocar bomba de refrigerante",
        powerKw: 3,
        durationS: 60,
        heatPerS: 0.04,
        during: { coolingFactor: 0.5 },
        after: {},
        costText: "Demorado: 3 kW por 60 s; durante a troca o circuito rende só metade.",
        effectText: "Refrigeração volta a 100%, sem efeito residual.",
      },
    },
  },
  leak: {
    id: "leak",
    title: "Vazamento de oxigênio",
    part: "hull",
    warnText: "Microfissura na antepara.",
    alertText: "Oxigênio escapando pela antepara.",
    active: { leakPerS: 0.15 },
    options: {
      quick: {
        id: "quick",
        label: "Vedação rápida",
        powerKw: 1,
        durationS: 12,
        heatPerS: 0.01,
        after: { leakPerS: 0.04 },
        costText: "Rápido e barato: 1 kW por 12 s.",
        effectText: "Perda residual de 0,04 %/s até o resgate.",
      },
      full: {
        id: "full",
        label: "Vedação completa",
        powerKw: 4,
        durationS: 50,
        heatPerS: 0.06,
        after: {},
        costText: "Demorado: 4 kW por 50 s, ocupando a equipe e esquentando o módulo.",
        effectText: "Vazamento eliminado.",
      },
    },
  },
  solar: {
    id: "solar",
    title: "Tempestade solar",
    part: "wiring",
    warnText: "Explosão solar detectada. Partículas chegam em instantes.",
    alertText: "Correntes induzidas aquecem a fiação e perturbam o gerador.",
    active: { extraHeatPerS: 0.12, generatorFactor: 0.85 },
    options: {
      quick: {
        id: "quick",
        label: "Escudo magnético improvisado",
        powerKw: 2,
        durationS: 15,
        heatPerS: 0.02,
        after: { extraHeatPerS: 0.04 },
        costText: "Rápido: 2 kW por 15 s.",
        effectText: "Gerador normal, mas a fiação segue aquecendo +0,04 °C/s até o resgate.",
      },
      full: {
        id: "full",
        label: "Isolar barramentos",
        powerKw: 3,
        durationS: 45,
        heatPerS: 0.03,
        after: {},
        costText: "Demorado: 3 kW por 45 s.",
        effectText: "Fiação protegida, sem efeito residual.",
      },
    },
  },
  fire: {
    id: "fire",
    title: "Incêndio elétrico",
    part: "wiring",
    warnText: "Fumaça no painel de distribuição.",
    alertText: "Fogo no painel: muito calor e oxigênio sendo queimado.",
    active: { extraHeatPerS: 0.22, leakPerS: 0.06 },
    options: {
      quick: {
        id: "quick",
        label: "Ventilar para o vácuo",
        powerKw: 1,
        durationS: 8,
        heatPerS: 0,
        after: { leakPerS: 0.03 },
        costText: "Imediato: 1 kW por 8 s.",
        effectText: "Fogo apagado, mas a válvula emperra: perda de 0,03 %/s de oxigênio até o resgate.",
      },
      full: {
        id: "full",
        label: "Extintor e troca da fiação",
        powerKw: 3,
        durationS: 35,
        heatPerS: 0.02,
        after: {},
        costText: "3 kW por 35 s, com o fogo queimando enquanto a equipe trabalha.",
        effectText: "Fogo apagado e fiação nova, sem efeito residual.",
      },
    },
  },
  scrubber: {
    id: "scrubber",
    title: "Pane do reciclador de CO₂",
    part: "scrubber",
    warnText: "Filtro do reciclador saturando.",
    alertText: "O suporte de vida perdeu rendimento.",
    active: { lifeFactor: 0.5 },
    options: {
      quick: {
        id: "quick",
        label: "Cartuchos de reserva",
        powerKw: 1,
        durationS: 12,
        heatPerS: 0.01,
        after: { lifeFactor: 0.8 },
        costText: "Rápido e barato: 1 kW por 12 s.",
        effectText: "Suporte de vida volta a 80% do rendimento até o resgate.",
      },
      full: {
        id: "full",
        label: "Reconstruir o reciclador",
        powerKw: 3,
        durationS: 50,
        heatPerS: 0.04,
        after: {},
        costText: "Demorado: 3 kW por 50 s.",
        effectText: "Suporte de vida volta a 100%, sem efeito residual.",
      },
    },
  },
  battery: {
    id: "battery",
    title: "Curto na bateria",
    part: "battery",
    warnText: "Temperatura irregular em uma célula da bateria.",
    alertText: "Células em curto limitam a descarga da bateria.",
    active: { dischargeFactor: 0.35, batteryCapacityFactor: 0.75 },
    options: {
      quick: {
        id: "quick",
        label: "Isolar células danificadas",
        powerKw: 1,
        durationS: 12,
        heatPerS: 0.01,
        after: { batteryCapacityFactor: 0.6 },
        costText: "Rápido: 1 kW por 12 s.",
        effectText: "Descarga normal, mas só 60% da capacidade da bateria até o resgate.",
      },
      full: {
        id: "full",
        label: "Reconstruir banco de células",
        powerKw: 4,
        durationS: 55,
        heatPerS: 0.05,
        after: {},
        costText: "Demorado: 4 kW por 55 s, justo quando a bateria está fraca.",
        effectText: "Bateria volta a 100%, sem efeito residual.",
      },
    },
  },
  meteor: {
    id: "meteor",
    title: "Impacto de micrometeorito",
    part: "radiator",
    warnText: "Nuvem de detritos na órbita.",
    alertText: "Um fragmento furou o casco e atingiu o radiador.",
    active: { leakPerS: 0.08, coolingFactor: 0.75 },
    options: {
      quick: {
        id: "quick",
        label: "Remendo de casco",
        powerKw: 1,
        durationS: 12,
        heatPerS: 0.01,
        after: { leakPerS: 0.02, coolingFactor: 0.9 },
        costText: "Rápido e barato: 1 kW por 12 s.",
        effectText: "Perda residual de 0,02 %/s e radiador a 90% até o resgate.",
      },
      full: {
        id: "full",
        label: "Remendo estrutural",
        powerKw: 3,
        durationS: 45,
        heatPerS: 0.04,
        after: {},
        costText: "Demorado: 3 kW por 45 s.",
        effectText: "Casco e radiador restaurados, sem efeito residual.",
      },
    },
  },
};

export const FAILURE_IDS = Object.keys(FAILURES) as FailureId[];

/** Treinamento: sequência fixa e reproduzível, para aprender e para os testes. */
export const TRAINING = {
  seed: "TREINO",
  difficulty: "cadet" as DifficultyId,
  schedule: [
    { id: "generator", at: 60 },
    { id: "cooling", at: 160 },
    { id: "leak", at: 260 },
    { id: "scrubber", at: 370 },
    { id: "solar", at: 470 },
  ] satisfies { id: FailureId; at: number }[],
};

export function trainingSchedule(): ScheduledFailure[] {
  const lead = DIFFICULTIES[TRAINING.difficulty].warningLeadS;
  const severity = DIFFICULTIES[TRAINING.difficulty].severity;
  return TRAINING.schedule.map((s) => ({ id: s.id, at: s.at, warnAt: s.at - lead, severity }));
}

export const SAVE_VERSION = 3;
export const SAVE_KEY = "dangerstation:save:v3";
export const RECORDS_KEY = "dangerstation:records:v1";
export const PREFS_KEY = "dangerstation:prefs:v1";
export const MODULE_NAME = "Módulo Kestrel";
