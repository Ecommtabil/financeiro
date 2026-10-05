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
- Área Escritório | Pessoal escolhida no topo vem só de `useArea()`/`daArea()` em `app-shell.tsx` (destino vazio = Escritório), para todas as abas filtrarem igual.
- Configuração do usuário (tabela `config`, 1 linha por usuário) é lida/salva por `useConfig`/`useSalvarConfig` em `src/lib/config.ts`.
- Todo valor do mês, reajuste e total (E, SE, SP, EP, L, R) vem de `src/lib/calc.ts`, para as telas nunca divergirem nos números.
- Baixas (tabela `baixas`, 1 por conta+mês) e saldos (tabela `saldos`, 1 por banco) moram em `src/lib/situacao.ts`; saldo atual, situação da conta e caixa projetado vêm só de `src/lib/calc.ts` (`saldosAtuais`, `situacaoConta`, `caixaProjetado`), para Situação, Panorama e Balanço baterem.
- Sugestão de linha da DRE por IA roda só no servidor (`src/lib/dre-ia.functions.ts` + `dre-ia.server.ts`, login obrigatório), para a chave da IA nunca ir ao navegador.
- Investimentos, bens e dívidas (tabelas `investimentos`, `bens`, `dividas`) são lidos/gravados/importados por `src/lib/patrimonio.ts`; evolução do investimento e saldo devedor vêm só de `src/lib/calc.ts` (`evolucaoInvestimento`, `evolucaoDivida`), para Investimentos e Balanço baterem.
- Toda importação/exportação por planilha (10 tipos, modelo preenchido, backup completo) mora em `src/lib/importador.ts` e na tela `/importar?tipo=…`; os botões das abas só apontam para lá, para o que o modelo exporta voltar igual pela importação.
- A base cromática de `src/styles.css` segue os tokens claros/escuros do SAGA Finance Insights; papéis positivos, negativos e alertas financeiros continuam semânticos para manter a leitura dos valores.
- Carteira pessoal (tabela carteira, aba /carteira só na área Pessoal, importável tipo "carteira") é lida/gravada por useListaPat em src/lib/patrimonio.ts.
- Valores do mês partem de 12 meses-base após a base zero (`horizonte.mesesBase`/`fimBase`; entradas e pessoais em `valores_base`, saídas em `valores_mes`); `fator` em `src/lib/calc.ts` só conta reajustes depois de `fimBase`, para toda tela aplicar a mesma regra.
