/**
 * Tipos da simulação. Nada aqui depende do navegador ou do React.
 */

export type SystemId = "cooling" | "life" | "repair";

export type Allocation = Record<SystemId, number>;

export type FailureId = "generator" | "cooling" | "leak";

export type RepairOptionId = "quick" | "full";

/** Modificadores que falhas e reparos aplicam ao módulo. Fatores multiplicam, taxas somam. */
export interface Modifiers {
  /** Fração da capacidade nominal do gerador. */
  generatorFactor: number;
  /** Eficiência da refrigeração (1 = nominal). */
  coolingFactor: number;
  /** Perda extra de oxigênio em %/s. */
  leakPerS: number;
  /** Calor extra em °C/s. */
  extraHeatPerS: number;
}

export interface RepairOption {
  id: RepairOptionId;
  label: string;
  /** Potência que o reparo consome enquanto a equipe trabalha (kW). */
  powerKw: number;
  /** Duração com potência total (s de jogo). Com menos potência o reparo fica mais lento. */
  durationS: number;
  /** Calor gerado pelo trabalho de reparo (°C/s). */
  heatPerS: number;
  /** Modificadores extras enquanto o reparo acontece (ex.: circuito parcialmente desligado). */
  during?: Partial<Modifiers>;
  /** Modificadores permanentes depois do reparo, no lugar do efeito da falha. */
  after: Partial<Modifiers>;
  /** Texto curto: o que acontece agora. */
  costText: string;
  /** Texto curto: o efeito esperado até o resgate. */
  effectText: string;
}

export interface FailureDef {
  id: FailureId;
  title: string;
  /** Instante (s de jogo) do aviso prévio nos sensores. */
  warnAt: number;
  /** Instante (s de jogo) em que a falha acontece. */
  at: number;
  warnText: string;
  alertText: string;
  /** Efeito enquanto a falha não for resolvida. */
  active: Partial<Modifiers>;
  options: Record<RepairOptionId, RepairOption>;
}

export interface Scenario {
  id: string;
  name: string;
  moduleName: string;
  failures: FailureDef[];
}

export type FailureStatus = "pending" | "warned" | "active" | "repairing" | "resolved";

export interface FailureState {
  id: FailureId;
  status: FailureStatus;
  startedAt?: number;
  resolution?: RepairOptionId;
  resolvedAt?: number;
}

export interface RepairJob {
  failureId: FailureId;
  option: RepairOptionId;
  /** Segundos de trabalho equivalente a potência total já realizados. */
  progressS: number;
  startedAt: number;
}

export type LogKind = "info" | "warn" | "alert" | "decision" | "success";

export interface LogEntry {
  id: number;
  t: number;
  kind: LogKind;
  text: string;
  /** Agrupa ajustes de distribuição seguidos em uma só linha. */
  tag?: "allocation";
}

export type CriticalCause = "heat" | "oxygen";

export interface Outcome {
  result: "won" | "lost";
  cause?: CriticalCause;
  at: number;
}

export interface Stats {
  peakHeatC: number;
  minOxygenPct: number;
  minBatteryPct: number;
  batteryCoverSeconds: number;
  unmetSeconds: number;
  criticalSeconds: number;
}

export type Phase = "intro" | "active" | "ended";

export interface SimState {
  version: number;
  scenarioId: string;
  phase: Phase;
  /** Tempo de jogo ativo decorrido (s). */
  t: number;
  allocation: Allocation;
  /** Energia na bateria (kJ = kW·s). */
  batteryKj: number;
  heatC: number;
  oxygenPct: number;
  failures: FailureState[];
  repair: RepairJob | null;
  /** Tempo acumulado em nível crítico (s). Derrota quando atinge a tolerância. */
  critical: Record<CriticalCause, number>;
  log: LogEntry[];
  nextLogId: number;
  stats: Stats;
  outcome: Outcome | null;
  tutorial: { firstAdjustDone: boolean };
}

export interface Term {
  label: string;
  /** Contribuição por segundo (positiva sobe, negativa desce). */
  value: number;
}

export interface Flows {
  modifiers: Modifiers;
  generatorKw: number;
  /** Eficiência térmica do gerador (1 = sem perda). */
  generatorHeatEfficiency: number;
  /** Consumo pedido por sistema (kW). Reparo só consome com equipe trabalhando. */
  demand: Allocation;
  demandKw: number;
  /** Fração da demanda atendida (1 = tudo atendido). */
  supplyRatio: number;
  supplied: Allocation;
  /** Positivo carrega, negativo descarrega (kW). */
  batteryKw: number;
  batteryCovering: boolean;
  chargeBlocked: boolean;
  /** Potência pedida e não atendida (kW). */
  unmetKw: number;
  /** Excedente que não foi aproveitado (kW). */
  spareKw: number;
  heatRate: number;
  heatTerms: Term[];
  oxygenRate: number;
  oxygenTerms: Term[];
  /** Velocidade do reparo atual (1 = potência total). */
  repairSpeed: number;
}
