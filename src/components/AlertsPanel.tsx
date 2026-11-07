"use client";

import { useState } from "react";
import type { Alert, AlertLevel } from "@/sim/insights";
import type { FailureId } from "@/sim/types";
import { FailureIcon } from "./FailureIcon";
import { IconAlert, IconCheck, IconCritical, IconInfo, IconWrench } from "./Icons";

const ICON: Record<AlertLevel, typeof IconInfo> = { critical: IconCritical, warning: IconAlert, info: IconInfo };
const LABEL: Record<AlertLevel, string> = { critical: "CRÍTICO", warning: "ALERTA", info: "AVISO" };

interface Actions {
  onDecide: (id: FailureId) => void;
  onCancelQueue: () => void;
}

function AlertRow({ alert, onDecide, onCancelQueue, compact = false }: { alert: Alert; compact?: boolean } & Actions) {
  const Icon = alert.kind === "repair" ? IconWrench : ICON[alert.level];
  const label = alert.kind === "repair" ? "REPARO" : alert.kind === "queue" ? "FILA" : LABEL[alert.level];
  return (
    <div className={`alert alert-${alert.level}${alert.kind ? ` alert-${alert.kind}` : ""}${compact ? " is-compact" : ""}`}>
      <div className="alert-line">
        {alert.failureId && !alert.kind ? <FailureIcon id={alert.failureId} /> : <Icon />}
        <span className="alert-level">{label}</span>
        <span className="alert-text">{alert.text}</span>
        {alert.action === "decide" && alert.failureId ? (
          <button type="button" className="alert-btn is-danger" onClick={() => onDecide(alert.failureId!)}>
            Decidir
          </button>
        ) : null}
        {alert.action === "cancel-queue" && !compact ? (
          <button type="button" className="alert-btn" onClick={onCancelQueue}>
            Tirar da fila
          </button>
        ) : null}
      </div>
      {alert.kind === "repair" && alert.progress !== undefined && !compact ? (
        <div className="bar thin" role="progressbar" aria-label="Progresso do reparo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(alert.progress * 100)}>
          <div className="bar-fill fill-repair" style={{ width: `${alert.progress * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/** Coluna de alarmes com altura reservada (desktop largo): novos alarmes nunca deslocam os controles. */
export function AlertsPanel({ alerts, ...actions }: { alerts: Alert[] } & Actions) {
  return (
    <section className="panel alerts-panel" aria-label="Alarmes e reparos" aria-live="polite">
      <h2 className="panel-title">Alarmes e reparos</h2>
      <div className="alerts-box">
        {alerts.length === 0 ? (
          <p className="alert alert-ok">
            <IconCheck /> <span className="alert-level">NORMAL</span> Nenhum alarme ativo
          </p>
        ) : (
          alerts.map((a) => <AlertRow key={a.id} alert={a} {...actions} />)
        )}
      </div>
    </section>
  );
}

/** Faixa de uma linha no topo (celular e telas médias), com a lista completa por cima ao tocar no contador. */
export function AlertStrip({ alerts, ...actions }: { alerts: Alert[] } & Actions) {
  const [open, setOpen] = useState(false);
  const first = alerts[0];
  const rest = alerts.length - 1;
  return (
    <div className="alert-strip" aria-live="polite">
      {first ? (
        <AlertRow alert={first} compact {...actions} />
      ) : (
        <p className="alert alert-ok is-compact">
          <IconCheck /> <span className="alert-level">NORMAL</span> <span className="alert-text">Nenhum alarme ativo</span>
        </p>
      )}
      {rest > 0 ? (
        <button type="button" className="strip-count" onClick={() => setOpen(true)} aria-label={`Ver todos os ${alerts.length} alarmes`}>
          +{rest}
        </button>
      ) : null}
      {open ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="alerts-sheet-title" onClick={() => setOpen(false)}>
          <div className="modal alerts-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 id="alerts-sheet-title">Alarmes ativos</h2>
            <div className="alerts-sheet-list">
              {alerts.map((a) => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  onDecide={(id) => {
                    setOpen(false);
                    actions.onDecide(id);
                  }}
                  onCancelQueue={actions.onCancelQueue}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
