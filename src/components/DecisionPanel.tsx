"use client";

import { useEffect, useState } from "react";
import { BALANCE } from "@/sim/config";
import { activeEffect, describeEffect, failureDef, formatClock, previewRepair, repairOption } from "@/sim/engine";
import { repairRemainingS } from "@/sim/insights";
import type { FailureState, Flows, RepairOptionId, SimState } from "@/sim/types";
import { FailureIcon } from "./FailureIcon";
import { num, signed } from "./format";
import { IconClock, IconPause } from "./Icons";

export type DecisionMode = "start" | "queue" | "switch";

/** Tempo em que os botões ignoram toques logo depois de a decisão aparecer. */
export const DECISION_GUARD_MS = 400;

interface Props {
  state: SimState;
  flows: Flows;
  failure: FailureState;
  /** Relógio parado esperando a decisão (Treinamento e Cadete). */
  pausing: boolean;
  /** Outras decisões esperando depois desta. */
  moreWaiting: number;
  onChoose: (option: RepairOptionId, mode: DecisionMode) => void;
  onIgnore: () => void;
}

export function DecisionPanel({ state, flows, failure, pausing, moreWaiting, onChoose, onIgnore }: Props) {
  const [armed, setArmed] = useState(false);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), DECISION_GUARD_MS);
    return () => clearTimeout(t);
  }, []);

  const def = failureDef(failure.id);
  const busy = !!state.repair;
  const mode: DecisionMode = !busy ? "start" : switching ? "switch" : "queue";
  const current = state.repair ? repairOption(state.repair.failureId, state.repair.option) : null;
  const freeIn = busy ? repairRemainingS(state, flows) : 0;
  const queuedOther = state.queue && state.queue.failureId !== failure.id ? failureDef(state.queue.failureId).title : null;

  const panel = (
    <section className={`decision ${pausing ? "is-modal" : "is-dock"}`} role="dialog" aria-modal={pausing} aria-labelledby="decision-title">
      <div className="decision-head">
        <h2 id="decision-title">
          <FailureIcon id={failure.id} /> {def.title}
        </h2>
        {pausing ? (
          <span className="clock-chip is-paused">
            <IconPause /> relógio parado até você decidir
          </span>
        ) : (
          <span className="clock-chip is-running">
            <IconClock /> relógio correndo
          </span>
        )}
      </div>
      <p className="decision-text">
        {def.alertText} <strong>Agora:</strong> {describeEffect(activeEffect(failure))}. Sem reparo, piora {Math.round(BALANCE.escalation.perS * 6000)}% por minuto.
        {failure.escalation > 0.005 ? <strong className="escalation"> Já piorou +{Math.round(failure.escalation * 100)}%.</strong> : null}
      </p>
      {busy && current ? (
        <p className="decision-busy">
          Equipe ocupada com <strong>{current.label}</strong>
          {Number.isFinite(freeIn) ? ` (faltam ${Math.ceil(freeIn)} s)` : " (parado sem potência)"}.
          {queuedOther ? ` ${queuedOther} sai da fila se você escolher este.` : ""}
        </p>
      ) : null}
      <div className="decision-options">
        {(["quick", "full"] as RepairOptionId[]).map((o) => {
          const opt = def.options[o];
          const p = previewRepair(state, failure.id, o);
          const verb = mode === "queue" ? "Na fila" : mode === "switch" ? "Trocar agora" : o === "quick" ? "Resposta rápida" : "Reparo completo";
          return (
            <button
              key={o}
              type="button"
              className={`option-btn option-${o}`}
              disabled={!armed}
              onClick={() => onChoose(o, mode)}
              aria-label={`${verb}: ${opt.label}`}
            >
              <span className="option-kind">
                {verb}
                {mode !== "start" ? ` · ${o === "quick" ? "rápida" : "completa"}` : ""}
              </span>
              <span className="option-label">{opt.label}</span>
              <span className="option-cost mono">
                <IconClock /> {opt.durationS} s · {opt.powerKw} kW
              </span>
              <span className="option-effect">{opt.effectText}</span>
              {mode === "queue" ? (
                <span className="option-warn">{Number.isFinite(freeIn) ? `Começa em ${Math.ceil(freeIn)} s` : "Começa quando a equipe liberar"}</span>
              ) : p.batteryAutonomyS !== null ? (
                <span className="option-warn">
                  Déficit de {num(-p.batteryKw, 1)} kW · bateria por ≈ {formatClock(p.batteryAutonomyS)}
                </span>
              ) : (
                <span className="option-ok">Cabe no gerador · calor {signed(p.heatRate, 2)} °C/s</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="decision-actions">
        {busy ? (
          <button type="button" className="btn btn-ghost" onClick={() => setSwitching((v) => !v)} disabled={!armed}>
            {switching ? "Esperar a equipe (pôr na fila)" : "Trocar agora (interrompe o reparo atual)"}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onIgnore} disabled={!armed}>
          Ignorar por enquanto
        </button>
      </div>
      {moreWaiting > 0 ? <p className="decision-more mono">+{moreWaiting} decisão(ões) esperando depois desta</p> : null}
    </section>
  );

  return pausing ? <div className="overlay decision-overlay">{panel}</div> : panel;
}
