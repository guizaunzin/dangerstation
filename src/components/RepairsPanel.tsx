"use client";

import { useState } from "react";
import { activeEffect, describeEffect, failureDef, formatClock, previewRepair, repairOption } from "@/sim/engine";
import type { FailureId, Flows, RepairOptionId, SimState } from "@/sim/types";
import { num, signed } from "./format";
import { FailureIcon } from "./FailureIcon";
import { IconCheck, IconClock, IconInfo, IconWrench } from "./Icons";

interface Props {
  state: SimState;
  flows: Flows;
  disabled: boolean;
  onChoose: (failure: FailureId, option: RepairOptionId) => void;
  onAbort: () => void;
}

export function RepairsPanel({ state, flows, disabled, onChoose, onAbort }: Props) {
  const [confirmAbort, setConfirmAbort] = useState(false);
  const ORDER = { active: 0, repairing: 1, warned: 2, resolved: 3, pending: 4 } as const;
  const visible = state.failures
    .filter((f) => f.status !== "pending")
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.at - b.at);
  const job = state.repair;

  return (
    <section className="panel repairs" aria-labelledby="repairs-title">
      <h2 id="repairs-title" className="panel-title">
        <IconWrench /> Reparos <span className="panel-note">1 equipe · 1 reparo por vez</span>
      </h2>

      {job ? (
        (() => {
          const opt = repairOption(job.failureId, job.option);
          const pct = Math.min(100, (job.progressS / opt.durationS) * 100);
          const remaining = flows.repairSpeed > 0.001 ? (opt.durationS - job.progressS) / flows.repairSpeed : Infinity;
          return (
            <div className="repair-current" role="status">
              <p className="repair-current-title">
                <IconWrench /> Em andamento: <strong>{opt.label}</strong>
              </p>
              <div
                className="bar"
                role="progressbar"
                aria-label="Progresso do reparo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <div className="bar-fill fill-repair" style={{ width: `${pct}%` }} />
              </div>
              <p className="repair-meta mono">
                {num(pct, 0)}% · {Number.isFinite(remaining) ? `faltam ${formatClock(remaining)}` : "parado: sem potência"} · ritmo{" "}
                {num(flows.repairSpeed * 100, 0)}%
              </p>
              {confirmAbort ? (
                <div className="inline-confirm">
                  <span>Interromper perde todo o progresso.</span>
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
          );
        })()
      ) : null}

      {visible.length === 0 ? (
        <p className="empty">
          <IconInfo /> Nenhuma falha detectada. Os sensores avisam com antecedência.
        </p>
      ) : (
        <ul className="failure-list">
          {visible.map((f) => {
            const def = failureDef(f.id);
            if (f.status === "warned") {
              return (
                <li key={f.id} className="failure-card is-warned">
                  <p className="failure-title">
                    <FailureIcon id={f.id} /> <span className="tag tag-info">AVISO</span> {def.title} em{" "}
                    <span className="mono">{Math.max(0, Math.ceil(f.at - state.t))} s</span>
                  </p>
                  <p className="failure-text">{def.warnText}</p>
                </li>
              );
            }
            if (f.status === "resolved" && f.resolution) {
              const opt = def.options[f.resolution];
              return (
                <li key={f.id} className="failure-card is-resolved">
                  <p className="failure-title">
                    <FailureIcon id={f.id} /> <span className="tag tag-ok">RESOLVIDA</span> {def.title} <IconCheck />
                  </p>
                  <p className="failure-text">
                    {opt.label} em {formatClock(f.resolvedAt ?? 0)}. <strong>Consequência:</strong> {opt.effectText}
                  </p>
                </li>
              );
            }
            const repairing = f.status === "repairing";
            return (
              <li key={f.id} className={`failure-card ${repairing ? "is-repairing" : "is-active"}`}>
                <p className="failure-title">
                  <FailureIcon id={f.id} />{" "}
                  <span className={`tag ${repairing ? "tag-warn" : "tag-crit"}`}>{repairing ? "EM REPARO" : "FALHA ATIVA"}</span>{" "}
                  {def.title}
                </p>
                <p className="failure-text">
                  {def.alertText} <strong>Agora:</strong> {describeEffect(activeEffect(f))}.
                  {f.escalation > 0.005 && !repairing ? (
                    <span className="escalation"> Piorando: +{Math.round(f.escalation * 100)}% sem reparo.</span>
                  ) : null}
                </p>
                {!repairing ? (
                  <div className="option-grid">
                    {(["quick", "full"] as const).map((o) => {
                      const opt = def.options[o];
                      const p = previewRepair(state, f.id, o);
                      return (
                        <button
                          key={o}
                          type="button"
                          className={`option-btn option-${o}`}
                          disabled={disabled || !!job}
                          onClick={() => onChoose(f.id, o)}
                        >
                          <span className="option-kind">{o === "quick" ? "Resposta rápida" : "Reparo completo"}</span>
                          <span className="option-label">{opt.label}</span>
                          <span className="option-cost mono">
                            <IconClock /> {opt.durationS} s · {opt.powerKw} kW
                          </span>
                          <span className="option-effect">{opt.effectText}</span>
                          {p.batteryAutonomyS !== null ? (
                            <span className="option-warn">Exige bateria: déficit de {num(-p.batteryKw, 1)} kW</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {!repairing && job ? <p className="busy-note">Equipe ocupada: conclua ou interrompa o reparo atual.</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface SheetProps {
  state: SimState;
  /** Relógio pausado automaticamente enquanto o jogador lê os detalhes. */
  paused?: boolean;
  failure: FailureId;
  option: RepairOptionId;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RepairConfirmSheet({ state, failure, option, paused, onConfirm, onCancel }: SheetProps) {
  const def = failureDef(failure);
  const p = previewRepair(state, failure, option);
  const opt = p.option;
  const canStart = !state.repair && state.failures.find((f) => f.id === failure)?.status === "active";
  const raisesRepair = state.allocation.repair < opt.powerKw;
  const balance = p.generatorKw - p.demandKw;

  return (
    <div className="overlay sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet">
        {paused ? (
          <p className="sheet-paused">
            <IconClock /> Relógio pausado enquanto você lê. Ele volta a correr ao confirmar ou voltar.
          </p>
        ) : null}
        <p className="sheet-kicker">
          {def.title} · {option === "quick" ? "Resposta rápida" : "Reparo completo"}
        </p>
        <h2 id="sheet-title">{opt.label}</h2>
        <dl className="sheet-facts">
          <div>
            <dt>Custo</dt>
            <dd>
              <strong className="mono">{opt.powerKw} kW</strong> enquanto a equipe trabalha
            </dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>
              <strong className="mono">{opt.durationS} s</strong> com potência total
              {Number.isFinite(p.etaS) && Math.abs(p.etaS - opt.durationS) > 1 ? ` (≈ ${Math.round(p.etaS)} s no ritmo atual)` : ""}
            </dd>
          </div>
          <div>
            <dt>Efeito esperado</dt>
            <dd>{opt.effectText}</dd>
          </div>
          <div>
            <dt>Agora</dt>
            <dd>{opt.costText}</dd>
          </div>
        </dl>
        <div className="sheet-projection">
          <p>
            <strong>Durante o reparo:</strong> pedido {num(p.demandKw, 1)} kW · gerador {num(p.generatorKw, 1)} kW ·{" "}
            {balance >= -0.01 ? (
              <>excedente {num(balance, 1)} kW</>
            ) : p.batteryAutonomyS !== null ? (
              <>
                bateria cobre {num(-p.batteryKw, 1)} kW por ≈ {formatClock(p.batteryAutonomyS)}
                {p.supplyRatio < 0.999 ? `, sistemas a ${num(p.supplyRatio * 100, 0)}%` : ""}
              </>
            ) : (
              <>sistemas a {num(p.supplyRatio * 100, 0)}% (bateria vazia)</>
            )}
          </p>
          <p className="mono">
            Calor {signed(p.heatRate, 2)} °C/s · Oxigênio {signed(p.oxygenRate, 2)} %/s
          </p>
          {raisesRepair ? (
            <p className="sheet-note">Ao confirmar, a linha Reparos passa para {opt.powerKw} kW. Volta a 0 kW quando terminar.</p>
          ) : null}
          <p className="sheet-note">A escolha é definitiva: a consequência vale até o resgate.</p>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Voltar
          </button>
          <button type="button" className="btn btn-primary" disabled={!canStart} onClick={onConfirm} autoFocus>
            Confirmar reparo
          </button>
        </div>
      </div>
    </div>
  );
}
