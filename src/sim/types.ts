/**
 * Tipos da simulação. Nada aqui depende do navegador ou do React.
 */

export type SystemId = "cooling" | "life" | "repair";

export type Allocation = Record<SystemId, number>;

export type FailureId = "generator" | "cooling" | "leak" | "solar" | "fire" | "scrubber" | "battery" | "meteor";

export type RepairOptionId = "quick" | "full";

export type DifficultyId = "cadet" | "engineer" | "commander";

export type MissionKind = "training" | "random" | "daily";

/** Parte do módulo afetada, usada pela ilustração. */
export type ModulePart = "generator" | "radiator" | "hull" | "wiring" | "scrubber" | "battery";

/** Modificadores que falhas e reparos aplicam ao módulo. Fatores multiplicam, taxas somam. */
export interface Modifiers {
  /** Fração da capacidade nominal do gerador. */
  generatorFactor: number;
  /** Eficiência da refrigeração (1 = nominal). */
  coolingFactor: number;
  /** Eficiência do suporte de vida (1 = nominal). */
  lifeFactor: number;
  /** Perda extra de oxigênio em %/s. */
  leakPerS: number;
  /** Calor extra em °C/s. */
  extraHeatPerS: number;
  /** Fração utilizável da capacidade da bateria. */
  batteryCapacityFactor: number;
  /** Fração da descarga máxima da bateria. */
  dischargeFactor: number;
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
  part: ModulePart;
  warnText: string;
  /** Frase inicial do alarme; o efeito numérico é gerado a partir de `active` e da gravidade. */
  alertText: string;
  /** Efeito enquanto a falha não for resolvida, com gravidade 1. */
  active: Partial<Modifiers>;
  options: Record<RepairOptionId, RepairOption>;
}

export interface DifficultyDef {
  id: DifficultyId;
  label: string;
  description: string;
  failureCount: number;
  /** Multiplica a intensidade das falhas. */
  severity: number;
  generatorKw: number;
  /** Tempo tolerado em nível crítico (s). */
  graceS: number;
  /** Antecedência do aviso dos sensores (s). */
  warningLeadS: number;
  /** Multiplicador da pontuação. */
  scoreMultiplier: number;
  /** Se o relógio para enquanto uma falha nova espera a decisão do jogador. */
  decisionPauses: boolean;
  /** Pontos-base mínimos para ouro e prata (bronze = sobreviver). */
  medals: { gold: number; silver: number };
}

export interface MissionSpec {
  kind: MissionKind;
  seed: string;
  difficulty: DifficultyId;
}

/** Evento programado da missão: qual falha, quando e com que intensidade. */
export interface ScheduledFailure {
  id: FailureId;
  at: number;
  warnAt: number;
  severity: number;
}

export type FailureStatus = "pending" | "warned" | "active" | "repairing" | "resolved";

export type FailureAck = "none" | "new" | "ignored" | "handled";

/** Reparo escolhido que espera a equipe liberar (uma vaga). */
export interface QueuedRepair {
  failureId: FailureId;
  option: RepairOptionId;
}

export interface FailureState extends ScheduledFailure {
  status: FailureStatus;
  /** Agravamento acumulado enquanto a falha fica sem reparo (0 = intensidade original). */
  escalation: number;
  /**
   * Decisão do jogador sobre a falha ativa: "new" espera resposta (abre a decisão),
   * "ignored" ficou para depois, "handled" já tem reparo em andamento ou na fila.
   */
  ack: FailureAck;
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
  mission: MissionSpec;
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
  queue: QueuedRepair | null;
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
  /** Capacidade utilizável da bateria agora (kJ). */
  batteryCapacityKj: number;
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
