<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Decisões técnicas

- Cabeçalho + abas (`src/components/app-shell.tsx`) é renderizado pelo layout `_authenticated`, não pelo `__root`, para a tela de login ficar sem o layout do app.
- Horizonte da projeção vem só de `calcularHorizonte` em `src/lib/horizonte.ts`, para toda tela usar a mesma regra de meses/anos/Y0.
- Período escolhido no cabeçalho é lido via `usePeriodo()` (colunas mês a mês ou por ano), para as abas não reimplementarem o seletor.
- Configuração do usuário (tabela `config`, 1 linha por usuário) é lida/salva por `useConfig`/`useSalvarConfig` em `src/lib/config.ts`.
- Todo valor do mês, reajuste e total (E, SE, SP, EP, L, R) vem de `src/lib/calc.ts`, para as telas nunca divergirem nos números.
- Baixas (tabela `baixas`, 1 por conta+mês) e saldos (tabela `saldos`, 1 por banco) moram em `src/lib/situacao.ts`; saldo atual, situação da conta e caixa projetado vêm só de `src/lib/calc.ts` (`saldosAtuais`, `situacaoConta`, `caixaProjetado`), para Situação, Panorama e Balanço baterem.
