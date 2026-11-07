"use client";

import { useState } from "react";
import { failureDef, formatClock, repairOption } from "@/sim/engine";
import { repairRemainingS } from "@/sim/insights";
import type { FailureId, Flows, SimState, SystemId } from "@/sim/types";
import { FailureIcon } from "./FailureIcon";
import { num } from "./format";
import { IconCheck, IconInfo, IconWrench } from "./Icons";
import { Pips, Stepper } from "./SystemCards";

interface Props {
  state: SimState;
  flows: Flows;
  disabled: boolean;
  onSet: (system: SystemId, kw: number) => void;
  onDecide: (id: FailureId) => void;
  onAbort: () => void;
  onCancelQueue: () => void;
}

/** Equipe de reparo: trabalho atual, fila, potência e histórico das falhas. */
export function RepairsPanel({ state, flows, disabled, onSet, onDecide, onAbort, onCancelQueue }: Props) {
  const [confirmAbort, setConfirmAbort] = useState(false);
  const job = state.repair;
  const jobOpt = job ? repairOption(job.failureId, job.option) : null;
  const queued = state.queue ? repairOption(state.queue.failureId, state.queue.option) : null;
  const left = repairRemainingS(state, flows);
  const waiting = state.failures.filter((f) => f.status === "active" && state.queue?.failureId !== f.id);
  const warned = state.failures.filter((f) => f.status === "warned");
  const resolved = state.failures.filter((f) => f.status === "resolved");

  let powerStatus: string;
  if (!jobOpt) powerStatus = state.allocation.repair > 0 ? "sem reparo: nada é consumido" : "sem reparo em andamento";
  else if (state.allocation.repair < jobOpt.powerKw) powerStatus = `o reparo pede ${jobOpt.powerKw} kW · ritmo ${num(flows.repairSpeed * 100, 0)}%`;
  else powerStatus = `recebendo ${num(flows.supplied.repair, 1)} kW · ritmo ${num(flows.repairSpeed * 100, 0)}%`;

  return (
    <section className="panel repairs" aria-labelledby="repairs-title">
      <h2 id="repairs-title" className="panel-title">
        <IconWrench /> Reparos <span className="panel-note">1 equipe · 1 vaga na fila</span>
      </h2>

      {job && jobOpt ? (
        <div className="repair-current" role="status">
          <p className="repair-current-title">
            <FailureIcon id={job.failureId} /> Em andamento: <strong>{jobOpt.label}</strong>
          </p>
          <div className="bar" role="progressbar" aria-label="Progresso do reparo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((job.progressS / jobOpt.durationS) * 100)}>
            <div className="bar-fill fill-repair" style={{ width: `${Math.min(100, (job.progressS / jobOpt.durationS) * 100)}%` }} />
          </div>
          <p className="repair-meta mono">
            {num((job.progressS / jobOpt.durationS) * 100, 0)}% · {Number.isFinite(left) ? `faltam ${formatClock(left)}` : "parado: sem potência"}
          </p>
          {confirmAbort ? (
            <div className="inline-confirm">
              <span>Interromper perde todo o progresso{queued ? " e começa o reparo da fila" : ""}.</span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmAbort(false);
                  onAbort();
                }}
              >
                Interromper
              </button>
              <button type="button" className="btn" onClick={() => setConfirmAbort(false)}>
                Continuar reparo
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => setConfirmAbort(true)}>
              Interromper reparo
            </button>
          )}
        </div>
      ) : (
        <p className="empty">
          <IconInfo /> Equipe livre.
        </p>
      )}

      {state.queue && queued ? (
        <div className="repair-queue">
          <span>
            <FailureIcon id={state.queue.failureId} /> Na fila: <strong>{queued.label}</strong>
            <span className="mono muted"> · começa em {Number.isFinite(left) ? `${Math.ceil(left)} s` : "—"}</span>
          </span>
          <button type="button" className="btn btn-ghost" disabled={disabled} onClick={onCancelQueue}>
            Tirar da fila
          </button>
        </div>
      ) : null}

      <div className="card-control repair-power">
        <div className="control-info">
          <span className="control-name">
            <IconWrench /> Potência de reparo
          </span>
          <span className="control-status mono">{powerStatus}</span>
        </div>
        <Stepper system="repair" name="Reparos" value={state.allocation.repair} disabled={disabled} onSet={onSet} />
        <Pips value={state.allocation.repair} supplied={flows.supplied.repair} />
      </div>

      {waiting.length || warned.length || resolved.length ? (
        <ul className="failure-list">
          {waiting.map((f) => (
            <li key={f.id} className="failure-card is-active">
              <p className="failure-title">
                <FailureIcon id={f.id} /> <span className="tag tag-crit">{f.ack === "new" ? "DECISÃO" : "SEM REPARO"}</span> {failureDef(f.id).title}
                {f.escalation > 0.005 ? <span className="escalation"> +{Math.round(f.escalation * 100)}%</span> : null}
                <button type="button" className="alert-btn is-danger" disabled={disabled} onClick={() => onDecide(f.id)}>
                  Decidir
                </button>
              </p>
            </li>
          ))}
          {warned.map((f) => (
            <li key={f.id} className="failure-card is-warned">
              <p className="failure-title">
                <FailureIcon id={f.id} /> <span className="tag tag-info">AVISO</span> {failureDef(f.id).title} em{" "}
                <span className="mono">{Math.max(0, Math.ceil(f.at - state.t))} s</span>
              </p>
            </li>
          ))}
          {resolved.map((f) => {
            const opt = failureDef(f.id).options[f.resolution!];
            return (
              <li key={f.id} className="failure-card is-resolved">
                <p className="failure-title">
                  <FailureIcon id={f.id} /> <span className="tag tag-ok">RESOLVIDA</span> {failureDef(f.id).title} <IconCheck />
                </p>
                <p className="failure-text">
                  {opt.label} em {formatClock(f.resolvedAt ?? 0)}. <strong>Sequela:</strong> {opt.effectText}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
