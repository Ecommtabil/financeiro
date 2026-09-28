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

## Convenções do projeto

- Design system em `src/styles.css` (tokens oklch da paleta oficial, utilitários `num`, `surface-card`, `chip-escritorio`, `chip-pessoal`); componentes nunca usam cores fixas, para manter a identidade e o modo escuro consistentes.
- Formatação pt-BR (moeda, mês "Out/26") e normalização de bancos vivem em `src/lib/format.ts`, para haver uma única fonte dessas regras.
- Layout comum (navegação lateral) em `src/components/app-shell.tsx`, renderizado uma vez no `__root`; rotas cuidam só do conteúdo.
- Exclusões usam `src/components/botao-excluir.tsx` ("Confirmar" por 3s), atendendo à regra de não apagar sem confirmação.
