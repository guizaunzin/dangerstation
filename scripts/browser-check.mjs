/**
 * Verificação de ponta a ponta no navegador (Playwright), usando o relógio acelerado.
 *
 *   node scripts/browser-check.mjs [URL] [pasta-de-capturas]
 *
 * Requer o pacote `playwright` com Chromium disponível (não é dependência do projeto).
 * Cobre: menu; treinamento com abertura, primeiro ajuste, decisão que pausa, botões que não
 * se movem com alarmes chegando, pausa/retomada, recarregar no meio de um reparo, vitória,
 * pontuação e recorde; missão sorteada no celular com decisão ancorada, ignorar/reabrir e fila;
 * desafio do dia com derrota por inação.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// `require` resolve o Playwright instalado globalmente (NODE_PATH) ou no projeto.
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = process.argv[3] ?? "screenshots";
const SPEED = 20;
const SAVE_KEY = "dangerstation:save:v3";
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function readSave(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw).state : null;
  }, SAVE_KEY);
}

const waitSave = (page, fnSrc, timeout = 60000) =>
  page.waitForFunction(([k, src]) => new Function("s", `return (${src})(s)`)(JSON.parse(localStorage.getItem(k) ?? "null")?.state ?? null), [SAVE_KEY, fnSrc], { timeout });

const NAMES = { cooling: "Refrigeração", life: "Suporte de vida", repair: "Reparos" };

async function setAlloc(page, system, kw) {
  for (let guard = 0; guard < 12; guard++) {
    const s = await readSave(page);
    if (!s || s.phase !== "active") return;
    const cur = s.allocation[system];
    if (cur === kw) return;
    const btn = page.getByRole("button", { name: `${cur < kw ? "Aumentar" : "Diminuir"} ${NAMES[system]}` });
    if (await btn.isDisabled()) return;
    await btn.click();
  }
}

async function pauseGame(page) {
  await page.getByRole("button", { name: "Pausar missão" }).click();
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
}

async function resumeGame(page) {
  await page.getByRole("dialog", { name: "Missão em pausa" }).getByRole("button", { name: "Retomar" }).click();
}

/** Responde à decisão aberta, se houver. `kind`: quick | full. Usa a fila quando a equipe está ocupada. */
async function answerDecision(page, kind) {
  const panel = page.locator(".decision");
  if (!(await panel.count())) return null;
  const name = new RegExp(`^(Resposta rápida|Reparo completo|Na fila|Trocar agora): `);
  const buttons = panel.getByRole("button", { name });
  const idx = kind === "full" ? 1 : 0;
  const label = await buttons.nth(idx).getAttribute("aria-label");
  await buttons.nth(idx).click();
  return label;
}

/**
 * Joga pela interface reagindo como uma pessoa: responde às decisões e ajusta a distribuição
 * conforme calor e oxigênio. `policy`: quick | smart (completo quando há folga).
 */
async function playAdaptive(page, policy = "quick", seen = {}) {
  for (let guard = 0; guard < 3000; guard++) {
    const s = await readSave(page);
    if (s.phase === "ended") return s;
    if (s.queue) seen.queue = true;
    const calm = s.heatC < 60 && s.oxygenPct > 55 && !s.repair && s.t < 380;
    const label = await answerDecision(page, policy === "smart" && calm ? "full" : "quick");
    if (label?.startsWith("Na fila")) seen.queuedFromUi = true;
    let { cooling, life } = s.allocation;
    if (s.heatC > 50) cooling = Math.min(8, cooling + 1);
    else if (s.heatC < 40 && cooling > 2) cooling -= 1;
    if (s.oxygenPct < 70) life = Math.min(8, life + 1);
    else if (s.oxygenPct > 88 && life > 2) life -= 1;
    if (!(await page.locator(".decision.is-modal").count())) {
      await setAlloc(page, "cooling", cooling);
      await setAlloc(page, "life", life);
    }
    await page.waitForTimeout(120);
  }
  throw new Error("missão não terminou");
}

async function scenario(browser, label, contextOptions, fn) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  try {
    await fn(page);
  } catch (e) {
    check(`${label}: execução sem exceções`, false, String(e).split("\n")[0]);
    await page.screenshot({ path: join(OUT, `${label}-erro.png`), fullPage: true });
  }
  check(`${label}: sem erros no console`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const box = async (page, name) => {
  const b = await page.getByRole("button", { name }).boundingBox();
  return b ? `${Math.round(b.x)},${Math.round(b.y)}` : "sem caixa";
};

const browser = await chromium.launch();
const desktop = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 };
const phone = { ...devices["Pixel 7"] };

// 1) Desktop largo: menu → treinamento completo.
await scenario(browser, "desktop-treino", desktop, async (page) => {
  await page.goto(`${BASE}/?velocidade=${SPEED}`);
  await page.getByRole("heading", { name: "Estação Espacial em Perigo" }).waitFor();
  check("desktop: menu com três modos", (await page.locator(".mission-card").count()) === 3);
  await page.screenshot({ path: join(OUT, "desktop-01-menu.png") });
  await page.getByRole("button", { name: "Treinar" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Próximo" }).click();
  check("desktop: abertura ensina o primeiro ajuste", await page.getByText("Seu primeiro ajuste").isVisible());
  await page.getByRole("button", { name: "Iniciar missão" }).click();
  check("desktop: dica do primeiro ajuste no cartão de calor", await page.locator('[aria-label="Calor"]').getByText("Primeiro ajuste:").isVisible());
  check("desktop: três colunas com alarmes na esquerda", await page.locator(".alerts-panel").isVisible());
  const plusBefore = await box(page, "Aumentar Refrigeração");
  await setAlloc(page, "cooling", 4);
  check("desktop: controle da refrigeração está no cartão de calor", (await page.locator('[aria-label="Calor"]').getByRole("button", { name: "Aumentar Refrigeração" }).count()) === 1);

  // Alarmes chegando não deslocam os botões.
  await waitSave(page, "(s) => s.failures[0].status === 'warned'");
  const plusAfterWarn = await box(page, "Aumentar Refrigeração");
  check("desktop: aviso novo não move o +", plusAfterWarn === plusBefore, `${plusBefore} → ${plusAfterWarn}`);

  await pauseGame(page);
  const t1 = (await readSave(page)).t;
  await page.waitForTimeout(700);
  check("desktop: pausa congela o relógio", (await readSave(page)).t === t1);
  await resumeGame(page);
  await page.keyboard.press("p");
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
  await page.keyboard.press("p");

  // Decisão no treinamento: pop-up que pausa.
  await page.locator(".decision.is-modal").waitFor();
  check("desktop: falha abre a decisão sozinha", await page.getByRole("heading", { name: /Queda de geração/ }).isVisible());
  check("desktop: decisão avisa que o relógio parou", await page.getByText("relógio parado até você decidir").isVisible());
  check("desktop: decisão mostra custo, duração e efeito", await page.locator(".decision").getByText("60 s · 4 kW").isVisible());
  const tDec = (await readSave(page)).t;
  await page.waitForTimeout(700);
  check("desktop: relógio espera a decisão", (await readSave(page)).t === tDec);
  await page.screenshot({ path: join(OUT, "desktop-02-decisao.png") });
  await page.getByRole("button", { name: /^Reparo completo: / }).click();
  await page.waitForTimeout(500);
  const afterDecision = await readSave(page);
  check("desktop: escolher retoma o relógio e começa o reparo", afterDecision.t > tDec && afterDecision.repair?.option === "full");
  check("desktop: reparo aparece junto dos alarmes", await page.locator(".alerts-panel .alert-repair").isVisible());
  const plusAfterFailure = await box(page, "Aumentar Refrigeração");
  check("desktop: falha e reparo não movem o +", plusAfterFailure === plusBefore, `${plusBefore} → ${plusAfterFailure}`);
  const c0 = (await readSave(page)).allocation.cooling;
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Aumentar Refrigeração" }).click();
  check("desktop: três toques no + somam 3 kW", (await readSave(page)).allocation.cooling === Math.min(8, c0 + 3));
  await setAlloc(page, "cooling", 4);
  await page.screenshot({ path: join(OUT, "desktop-03-painel.png") });

  const before = await readSave(page);
  await page.reload();
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
  const after = await readSave(page);
  check("desktop: recarregar retoma em pausa com o reparo preservado", after.repair?.option === "full" && after.repair.progressS >= before.repair.progressS);
  await resumeGame(page);

  const end = await playAdaptive(page, "quick");
  check("desktop: treinamento vence", end.outcome?.result === "won", JSON.stringify(end.outcome));
  await page.getByRole("heading", { name: "Resgate concluído" }).waitFor();
  check("desktop: relatório explica o multiplicador", await page.getByText(/Multiplicador da dificuldade Cadete/).isVisible());
  check("desktop: relatório mostra recorde novo", await page.getByText("Novo recorde!").isVisible());
  await page.screenshot({ path: join(OUT, "desktop-04-relatorio.png") });
  await page.getByRole("button", { name: "Menu" }).click();
  check("desktop: recorde aparece no menu", await page.locator(".mission-card").first().getByText("Recorde").isVisible());
});

// 2) Celular: missão sorteada no Engenheiro — decisão ancorada sem pausa, ignorar/reabrir e fila.
await scenario(browser, "celular-sorteada", phone, async (page) => {
  await page.goto(`${BASE}/?velocidade=${SPEED}`);
  await page.getByRole("radio", { name: "Engenheiro" }).click();
  await page.getByLabel("Semente (opcional)").fill("teste-1");
  check("celular: menu sem rolagem horizontal", await noHorizontalScroll(page));
  await page.getByRole("button", { name: /Jogar semente TESTE-1/ }).click();
  check("celular: briefing avisa que o relógio continua nas decisões", await page.getByText("o relógio continua correndo").isVisible());
  const s0 = await readSave(page);
  await page.getByRole("button", { name: "Iniciar missão" }).click();
  check("celular: faixa de alarmes no topo", await page.locator(".alert-strip").isVisible());
  check("celular: cartões vêm antes de reparos", await page.evaluate(() => {
    const c = document.querySelector(".col-center").getBoundingClientRect().top;
    const r = document.querySelector(".col-right").getBoundingClientRect().top;
    return c < r;
  }));
  await setAlloc(page, "cooling", 4);

  await page.locator(".decision.is-dock").waitFor({ timeout: 60000 });
  const tA = (await readSave(page)).t;
  await page.waitForTimeout(600);
  check("celular: com a decisão aberta o relógio continua", (await readSave(page)).t > tA);
  check("celular: decisão presa embaixo da tela", await page.evaluate(() => {
    const r = document.querySelector(".decision").getBoundingClientRect();
    return Math.abs(r.bottom - window.innerHeight) < 2;
  }));
  await page.screenshot({ path: join(OUT, "celular-01-decisao.png") });
  const firstId = (await readSave(page)).failures.find((f) => f.ack === "new").id;
  await page.getByRole("button", { name: "Ignorar por enquanto" }).click();
  const ign = await readSave(page);
  check("celular: ignorar deixa a falha sem reparo", ign.failures.find((f) => f.id === firstId).ack === "ignored" && !(await page.locator(".decision").count()));
  await page.screenshot({ path: join(OUT, "celular-02-ignorada.png") });
  await page.locator(".repairs").getByRole("button", { name: "Decidir" }).first().click();
  check("celular: Decidir reabre a decisão", await page.locator(".decision").isVisible());
  await answerDecision(page, "quick");

  const seen = {};
  const end = await playAdaptive(page, "smart", seen);
  check("celular: fila de reparos usada pela decisão", !!seen.queuedFromUi || !!seen.queue);
  check("celular: missão sorteada chega ao fim", end.phase === "ended", JSON.stringify(end.outcome));
  await page.locator(".report").waitFor();
  check("celular: relatório sem rolagem horizontal", await noHorizontalScroll(page));
  await page.screenshot({ path: join(OUT, "celular-03-relatorio.png"), fullPage: true });
  await page.getByRole("button", { name: "Repetir esta missão" }).click();
  const again = await readSave(page);
  check(
    "celular: repetir mantém a mesma sequência",
    JSON.stringify(again.failures.map((f) => [f.id, f.at])) === JSON.stringify(s0.failures.map((f) => [f.id, f.at])),
  );
});

// 3) Celular: desafio do dia ignorando tudo → derrota.
await scenario(browser, "celular-desafio-inacao", phone, async (page) => {
  await page.goto(`${BASE}/?velocidade=60`);
  await page.getByRole("button", { name: "Aceitar desafio" }).click();
  await page.getByRole("button", { name: "Iniciar missão" }).click();
  for (let i = 0; i < 400; i++) {
    const s = await readSave(page);
    if (s.phase === "ended") break;
    if (await page.locator(".decision").count()) await page.getByRole("button", { name: "Ignorar por enquanto" }).click();
    if (s.critical.heat > 0 || s.critical.oxygen > 0) {
      if (!(await page.locator(".decision").count())) {
        await page.screenshot({ path: join(OUT, "celular-04-critico.png") });
        break;
      }
    }
    await page.waitForTimeout(100);
  }
  check("celular: contagem para falha crítica visível", await page.getByText("Falha crítica em").first().isVisible());
  for (let i = 0; i < 600; i++) {
    if ((await readSave(page)).phase === "ended") break;
    if (await page.locator(".decision").count()) await page.getByRole("button", { name: "Ignorar por enquanto" }).click();
    await page.waitForTimeout(100);
  }
  await page.getByRole("heading", { name: "Módulo perdido" }).waitFor({ timeout: 30000 });
  const end = await readSave(page);
  check("inação no desafio: derrota", end.outcome?.result === "lost", JSON.stringify(end.outcome));
  check("inação: relatório informa a causa", await page.getByText("Causa da derrota:").isVisible());
  await page.getByRole("button", { name: "Menu" }).click();
  check("volta ao menu", await page.getByRole("heading", { name: "Estação Espacial em Perigo" }).isVisible());
});

// 4) Tela média: cartões lado a lado e faixa de alarmes.
await scenario(browser, "tablet", { viewport: { width: 1024, height: 800 } }, async (page) => {
  await page.goto(`${BASE}/?velocidade=${SPEED}`);
  await page.getByRole("button", { name: "Treinar" }).click();
  await page.getByRole("button", { name: "Pular abertura" }).click();
  check("tablet: faixa de alarmes no topo, coluna oculta", (await page.locator(".alert-strip").isVisible()) && !(await page.locator(".alerts-panel").isVisible()));
  const tops = await page.evaluate(() => ["Calor", "Oxigênio", "Bateria"].map((n) => Math.round(document.querySelector(`[aria-label="${n}"]`).getBoundingClientRect().top)));
  check("tablet: três cartões lado a lado", new Set(tops).size === 1, tops.join(","));
  check("tablet: sem rolagem horizontal", await noHorizontalScroll(page));
  await page.screenshot({ path: join(OUT, "tablet-01.png") });
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
