import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LinkImportar } from "@/components/link-importar";
import { usePeriodo } from "@/components/app-shell";
import { chaveCatEntrada, chaveMes, fator, regraDo, valorEntrada } from "@/lib/calc";
import { useConfig } from "@/lib/config";
import { useLista, type Entrada } from "@/lib/dados";
import { formatarBRL, formatarNumero } from "@/lib/format";
import { norm } from "@/lib/importacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reajustes")({
  head: () => ({
    meta: [
      { title: "Reajustes das entradas · Fluxo Escritório & Casa" },
      { name: "description", content: "Consulte os reajustes das entradas do escritório e altere os percentuais exclusivamente por planilha." },
      { property: "og:title", content: "Reajustes das entradas · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Consulte os reajustes das entradas do escritório e altere os percentuais exclusivamente por planilha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reajustes,
});

const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

type Linha = {
  id: string;
  nome: string;
  categoria: string;
  regra: ReturnType<typeof regraDo>;
  excecao: boolean;
  base: number;
  projetado: number;
};

function Reajustes() {
  const { horizonte: h } = usePeriodo();
  const { data: cfg } = useConfig();
  const entradasQuery = useLista("entradas");
  const entradas = entradasQuery.data ?? [];
  const [busca, setBusca] = useState("");
  const [categoriaF, setCategoriaF] = useState("TODAS");

  const linhas = useMemo<Linha[]>(() => {
    if (!h || !cfg) return [];
    const mes = { ano: h.y0, mes: cfg.reajuste_mes };
    const chave = chaveMes(mes);
    const regrasItem = (cfg.regras_item ?? {}) as Record<string, unknown>;
    return entradas.map((registro: Entrada) => {
      const regra = regraDo(cfg, registro.id, chaveCatEntrada(registro), "E");
      const base = valorEntrada(registro, chave);
      return {
        id: registro.id,
        nome: registro.empresa,
        categoria: registro.carteira?.trim() || "Sem carteira",
        regra,
        excecao: registro.id in regrasItem,
        base,
        projetado: base * fator(mes, h, cfg.reajuste_mes, regra),
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [h, cfg, entradas]);

  const categorias = useMemo(() => [...new Set(linhas.map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR")), [linhas]);
  const q = norm(busca);
  const visiveis = linhas.filter((l) =>
    (categoriaF === "TODAS" || l.categoria === categoriaF) &&
    (!q || norm(`${l.nome} ${l.categoria}`).includes(q)),
  );
  const baseFiltrada = visiveis.reduce((total, l) => total + l.base, 0);
  const impactoFiltrado = visiveis.reduce((total, l) => total + l.projetado - l.base, 0);

  if (!h || !cfg || entradasQuery.isLoading) {
    return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;
  }

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reajustes das entradas</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Somente entradas do escritório. Os percentuais são alterados exclusivamente pela importação da planilha; esta tela é apenas para consulta.</p>
        </div>
        <LinkImportar tipo="reajustes" rotulo="Importar reajustes por planilha" variant="default" />
      </div>

      <section className="surface-card border-primary/20 bg-primary/5 p-4">
        <h2 className="text-sm font-semibold">Como reajustar</h2>
        <p className="mt-1 text-sm text-muted-foreground">Abra a importação, baixe o modelo preenchido, edite as colunas <span className="num font-medium">REAJUSTAR</span> e <span className="num font-medium">ÍNDICE ANUAL %</span> das entradas e envie o arquivo. Não há edição manual nem ajuste em lote nesta tela.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo rotulo="Entradas cadastradas" valor={String(linhas.length)} />
        <Resumo rotulo="Entradas no filtro" valor={String(visiveis.length)} />
        <Resumo rotulo="Valor base mensal" valor={formatarBRL(baseFiltrada)} />
        <Resumo rotulo={`Variação mensal em ${h.y0}`} valor={`${impactoFiltrado > 0 ? "+" : ""}${formatarBRL(impactoFiltrado)}`} destaque />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filtrar por carteira" className={sel} value={categoriaF} onChange={(e) => setCategoriaF(e.target.value)}>
            <option value="TODAS">Todas as carteiras</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Buscar entrada" className="pl-8" placeholder="Buscar entrada ou carteira" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b text-right">
                <th className="px-3 py-3 text-left">Entrada</th>
                <th className="px-3 py-3 text-left">Carteira</th>
                <th className="px-3 py-3 text-left">Reajustar</th>
                <th className="px-3 py-3">Índice anual</th>
                <th className="px-3 py-3">Valor base/mês</th>
                <th className="px-3 py-3">Em {h.y0}/mês</th>
                <th className="px-3 py-3">Diferença/mês</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const diferenca = l.projetado - l.base;
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{l.nome}{l.excecao && <span className="chip-base ml-2 bg-secondary text-secondary-foreground">individual</span>}</td>
                    <td className="px-3 py-2">{l.categoria}</td>
                    <td className="px-3 py-2"><span className="chip-base bg-secondary text-secondary-foreground">{l.regra.sobe === false ? "Não" : "Sim"}</span></td>
                    <td className="num px-3 py-2 text-right">{formatarNumero(l.regra.indice)}%</td>
                    <td className="num px-3 py-2 text-right">{formatarBRL(l.base)}</td>
                    <td className="num px-3 py-2 text-right font-semibold">{formatarBRL(l.projetado)}</td>
                    <td className={cn("num px-3 py-2 text-right", diferenca > 0 && "text-positive", diferenca < 0 && "text-negative")}>{diferenca > 0 ? "+" : ""}{formatarBRL(diferenca)}</td>
                  </tr>
                );
              })}
              {!visiveis.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhuma entrada encontrada com estes filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Consulta dos valores atuais. Para mudar percentuais, use somente a planilha; para corrigir vigências ou valores cadastrados, use o Cadastro.</p>
      </section>
    </div>
  );
}

function Resumo({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return <div className="surface-card p-4"><div className="label-eyebrow">{rotulo}</div><div className={cn("num mt-1 text-lg font-semibold", destaque && "text-primary")}>{valor}</div></div>;
}
