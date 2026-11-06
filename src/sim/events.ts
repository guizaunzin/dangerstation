/**
 * Eventos de apresentação (sons, destaques) derivados da transição entre dois estados.
 */
import type { FailureId, SimState } from "./types";

export type CueKind = "warning" | "failure" | "resolved" | "critical" | "won" | "lost";

export interface Cue {
  kind: CueKind;
  failureId?: FailureId;
}

export function cuesBetween(prev: SimState, next: SimState): Cue[] {
  const cues: Cue[] = [];
  for (const f of next.failures) {
    const before = prev.failures.find((x) => x.id === f.id)?.status;
    if (before === f.status) continue;
    if (f.status === "warned") cues.push({ kind: "warning", failureId: f.id });
    if (f.status === "active" && (before === "pending" || before === "warned")) cues.push({ kind: "failure", failureId: f.id });
    if (f.status === "resolved") cues.push({ kind: "resolved", failureId: f.id });
  }
  const critical = (s: SimState) => s.critical.heat + s.critical.oxygen;
  // Bipe a cada 2 s enquanto o contador crítico sobe.
  if (critical(next) > critical(prev) && Math.floor(next.t) % 2 === 0) cues.push({ kind: "critical" });
  if (!prev.outcome && next.outcome) cues.push({ kind: next.outcome.result === "won" ? "won" : "lost" });
  return cues;
}
