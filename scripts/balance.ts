/**
 * Relatório de balanceamento: roda cada rota roteirizada com o relógio acelerado
 * e imprime a evolução dos recursos. Uso: npm run balance [-- --trace]
 */
import { batteryPct, computeFlows } from "../src/sim/engine";
import { ROUTES, runRoute } from "../src/sim/strategies";

const trace = process.argv.includes("--trace");

for (const route of Object.values(ROUTES)) {
  const end = runRoute(route);
  const o = end.outcome;
  console.log(
    `\n== ${route.name}: ${o?.result === "won" ? "VITÓRIA" : `DERROTA (${o?.cause}) em ${o?.at}s`} ` +
      `| calor máx ${end.stats.peakHeatC.toFixed(1)}°C | O2 mín ${end.stats.minOxygenPct.toFixed(1)}% ` +
      `| bateria mín ${end.stats.minBatteryPct.toFixed(1)}% | crítico ${end.stats.criticalSeconds}s`,
  );
  if (trace) {
    for (let t = 0; t <= 1200; t += 60) {
      const s = runRoute(route, undefined, t);
      const f = computeFlows(s);
      console.log(
        `t=${String(s.t).padStart(4)} calor ${s.heatC.toFixed(1).padStart(5)} (${f.heatRate >= 0 ? "+" : ""}${f.heatRate.toFixed(3)}) ` +
          `O2 ${s.oxygenPct.toFixed(1).padStart(5)} (${f.oxygenRate >= 0 ? "+" : ""}${f.oxygenRate.toFixed(3)}) ` +
          `bat ${batteryPct(s).toFixed(0).padStart(3)}% ger ${f.generatorKw.toFixed(1)} dem ${f.demandKw.toFixed(1)} ` +
          `aloc ${s.allocation.cooling}/${s.allocation.life}/${s.allocation.repair} ${s.phase}`,
      );
      if (s.phase === "ended") break;
    }
  }
}
