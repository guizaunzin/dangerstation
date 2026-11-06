/**
 * Relatório de balanceamento: roda o robô jogador em muitas sementes por dificuldade
 * e mostra taxas de vitória. Uso: npm run balance [-- --seeds=300]
 */
import { DIFFICULTIES } from "../src/sim/config";
import { runBot, runIdle, type RepairPolicy } from "../src/sim/bot";
import { trainingMission } from "../src/sim/random";
import { computeScore } from "../src/sim/scoring";
import type { DifficultyId, MissionSpec } from "../src/sim/types";

const arg = process.argv.find((a) => a.startsWith("--seeds="));
const N = arg ? Number(arg.split("=")[1]) : 200;

function pct(n: number, d: number) {
  return `${((n / d) * 100).toFixed(0).padStart(3)}%`;
}

console.log("Treinamento (sequência fixa):");
for (const policy of ["quick", "full", "smart"] as RepairPolicy[]) {
  const end = runBot(trainingMission(), { policy, reactionS: 4 });
  const sc = computeScore(end);
  console.log(
    `  robô ${policy.padEnd(5)}: ${end.outcome?.result} ${end.outcome?.cause ?? ""} em ${end.t}s · calor máx ${end.stats.peakHeatC.toFixed(0)} · O2 mín ${end.stats.minOxygenPct.toFixed(0)} · bateria mín ${end.stats.minBatteryPct.toFixed(0)} · pontos ${sc.total} ${sc.medal ?? "-"}`,
  );
}
const idleT = runIdle(trainingMission());
console.log(`  inação: ${idleT.outcome?.result} ${idleT.outcome?.cause ?? ""} em ${idleT.t}s`);

for (const d of Object.keys(DIFFICULTIES) as DifficultyId[]) {
  const row: string[] = [];
  for (const policy of ["smart", "quick", "full"] as RepairPolicy[]) {
    let wins = 0;
    const medals = { gold: 0, silver: 0, bronze: 0 };
    const causes = { heat: 0, oxygen: 0 };
    for (let i = 0; i < N; i++) {
      const mission: MissionSpec = { kind: "random", seed: `S${i}`, difficulty: d };
      const end = runBot(mission, { policy, reactionS: 4 });
      if (end.outcome?.result === "won") wins++;
      else if (end.outcome?.cause) causes[end.outcome.cause]++;
      const m = computeScore(end).medal;
      if (m) medals[m]++;
    }
    row.push(
      `  ${policy.padEnd(5)} vence ${pct(wins, N)} · ouro ${pct(medals.gold, N)} prata ${pct(medals.silver, N)} · derrotas calor ${causes.heat} O2 ${causes.oxygen}`,
    );
  }
  let idleWins = 0;
  let idleT2 = 0;
  for (let i = 0; i < N; i++) {
    const e = runIdle({ kind: "random", seed: `S${i}`, difficulty: d });
    if (e.outcome?.result === "won") idleWins++;
    idleT2 += e.t;
  }
  console.log(`\n${DIFFICULTIES[d].label} (${N} sementes):\n${row.join("\n")}\n  inação vence ${pct(idleWins, N)} · dura em média ${Math.round(idleT2 / N)} s`);
}
