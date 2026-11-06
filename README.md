# Estação Espacial em Perigo

Jogo solo de gestão de crises em um único módulo orbital. Você tem **20 minutos de jogo ativo** até o resgate e precisa decidir o tempo todo **qual sistema recebe energia agora e qual pode esperar**.

V1: uma missão, um módulo e três sistemas (energia, calor, oxigênio). Roda inteira no navegador, sem conta, sem banco de dados e sem serviços pagos. O progresso fica salvo no `localStorage`.

## Como rodar

Requisitos: Node.js 20.9 ou mais novo, npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Produção local:

```bash
npm run build
npm start
```

| Comando | O que faz |
| --- | --- |
| `npm run lint` | ESLint (config do Next.js + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Testes da simulação (Vitest), com o relógio acelerado |
| `npm run balance` | Relatório de balanceamento das rotas roteirizadas (`-- --trace` mostra a evolução minuto a minuto) |
| `npm run e2e -- <URL> [pasta]` | Verificação no navegador com Playwright (desktop e celular). Precisa do pacote `playwright` com Chromium disponível; ele não é dependência do projeto |

### Relógio acelerado

Adicione `?velocidade=N` (ou `?speed=N`) à URL para multiplicar o relógio do jogo, de 1 a 120. Exemplo: `http://localhost:3000/?velocidade=40` faz a missão inteira levar 30 s. Um selo "Relógio acelerado ×N" aparece no topo.

## Como jogar

1. **Abertura**: quatro telas curtas explicam a missão e ensinam o primeiro ajuste. Ao iniciar, uma dica aponta a linha Refrigeração: suba de 2 para 4 kW para o calor parar de subir.
2. **Energia**: o gerador tem 12 kW. Você divide a potência entre Refrigeração, Suporte de vida e Reparos com os botões − e +. Se o pedido passar da geração, a **bateria cobre o déficit** (até 6 kW) enquanto durar, e o painel avisa. Com excedente ela recarrega, mas a recarga é bloqueada acima de 65 °C (proteção térmica).
3. **Calor**: equipamentos, carga elétrica e reparos esquentam o módulo; a refrigeração e o casco dissipam. Acima de 55 °C o gerador perde eficiência, o que pode virar uma cascata: menos energia, menos refrigeração, mais calor.
4. **Oxigênio**: a tripulação consome 0,10 %/s. O suporte de vida repõe 0,025 %/s por kW. Vazamentos aceleram a perda.
5. **Falhas** (sequência fixa e reproduzível na Missão 1; os sensores avisam 20 s antes):

   | Instante | Falha | Resposta rápida | Reparo completo |
   | --- | --- | --- | --- |
   | 02:30 | Queda de geração (gerador a 55%) | Desvio para barramento auxiliar: 2 kW por 30 s. Gerador fica em 85% e soma +0,03 °C/s até o resgate | Recalibrar núcleo: 4 kW por 90 s, esquenta durante o trabalho. Gerador volta a 100% |
   | 08:00 | Refrigeração degradada (40% de eficiência) | Purga do circuito: 2 kW por 25 s. Refrigeração fica em 75% | Trocar bomba: 3 kW por 100 s, com o circuito rendendo metade durante a troca. Volta a 100% |
   | 13:00 | Vazamento de oxigênio (0,15 %/s) | Vedação rápida: 1 kW por 20 s. Perda residual de 0,04 %/s | Vedação completa: 4 kW por 80 s. Vazamento eliminado |

   Uma equipe, um reparo por vez. Antes de confirmar, a tela mostra custo, duração, efeito esperado e a projeção de energia, calor e oxigênio durante o reparo. A escolha vale até o fim da missão. Um reparo com menos potência que o pedido anda mais devagar; interromper perde o progresso.
6. **Derrota**: calor acima de 85 °C ou oxigênio abaixo de 20% por 45 s. Um contador mostra o tempo até a falha crítica; fora do nível crítico a margem se recupera 1 s por segundo.
7. **Vitória**: chegar a 00:00 com o módulo habitável. O relatório final mostra a causa da derrota ou o estado do módulo no resgate, os valores extremos e as decisões tomadas.

**Pausa**: botão Pausar ou as teclas Espaço/P. O relógio só conta tempo de jogo ativo. A missão também pausa sozinha quando a aba fica em segundo plano. **Recarregar a página** retoma do estado salvo, sempre em pausa, com reparos e consequências preservados. **Reiniciar** fica no menu de pausa e no relatório final, e apaga o salvamento.

### Rotas verificadas

Os testes de balanceamento (`tests/balance.test.ts`) garantem que:

- **Inação** (distribuição inicial fixa, sem reparos) perde por superaquecimento por volta de 10:34.
- Fazer só os reparos sem rever a distribuição também perde, tanto com respostas rápidas quanto com reparos completos.
- **Remendos rápidos**, **Reparos completos** e uma **rota mista** vencem sem tocar no nível crítico. As duas primeiras toleram 15 s de tempo de reação.

As rotas estão em `src/sim/strategies.ts`.

## Arquitetura

```
src/sim/            simulação pura, sem React e sem navegador
  config.ts         TODOS os parâmetros de balanceamento e o cenário da Missão 1
  engine.ts         estado inicial, passo determinístico, ações do jogador, prévia de reparo
  clock.ts          tempo real → passos fixos; pausa e relógio acelerado
  persistence.ts    serialização versionada e validação do salvamento local
  insights.ts       alertas, tendências, motivos e relatório final para a interface
  strategies.ts     rotas roteirizadas usadas nos testes e em `npm run balance`
src/components/     interface (React, client components)
  gameStore.ts      liga simulação, relógio, laço de quadros e localStorage (useSyncExternalStore)
src/app/            Next.js App Router (página única, CSS em globals.css)
tests/              Vitest
scripts/            balance.ts e browser-check.mjs
```

- O tempo avança em passos fixos de 1 s de jogo (`BALANCE.tickS`). `step(state)` é uma função pura; `advance(state, segundos)` roda vários passos, então os testes cobrem 20 minutos de jogo em milissegundos.
- A interface converte o tempo real em passos com um acumulador (`tickClock`). Em pausa nenhum passo é gerado, e quadros longos são limitados a 250 ms para não pular tempo ao voltar para a aba.
- O estado inteiro é JSON e é salvo a cada mudança. O salvamento é descartado se estiver corrompido ou se a versão (`SAVE_VERSION`) mudar.

## Ajustar o balanceamento

1. Edite `src/sim/config.ts`. `BALANCE` reúne gerador, bateria, calor, oxigênio, tolerância crítica e duração da missão. `SCENARIO` define as falhas: instantes, efeito ativo e as duas respostas (`powerKw`, `durationS`, `heatPerS`, `during`, `after` e os textos exibidos).
2. Rode `npm run balance -- --trace` para ver cada rota minuto a minuto.
3. Rode `npm test`. Os testes de balanceamento falham se a inação deixar de perder ou se alguma rota vencedora deixar de vencer.
4. Se mudar o formato do estado, incremente `SAVE_VERSION` para invalidar salvamentos antigos.

## Publicar na Vercel

O projeto é um app Next.js padrão, sem variáveis de ambiente.

**Pelo painel (recomendado)**

1. Em <https://vercel.com/new>, importe o repositório `guizaunzin/dangerstation`. A Vercel pede para instalar o app do GitHub se ainda não tiver acesso.
2. Framework: Next.js (detectado sozinho). Build `npm run build`, saída padrão, sem variáveis de ambiente.
3. Clique em Deploy. Depois disso, cada push numa branch gera um preview e cada merge na `main` publica em produção.

**Pela CLI**

```bash
npm i -g vercel
vercel login
vercel link          # associa a pasta ao projeto
vercel               # deploy de preview
vercel --prod        # produção
```

Para conferir um deploy: abra a URL, avance a abertura e veja o relógio "Resgate em" começar a descer depois de **Iniciar missão**. Com `?velocidade=40` a missão inteira leva 30 s.
