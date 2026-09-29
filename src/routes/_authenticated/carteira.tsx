import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BotaoExcluir } from "@/components/botao-excluir";
import { LinkImportar } from "@/components/link-importar";
import { CampoNum, CampoTxt, Ind, selectCls } from "@/components/patrimonio-ui";
import { formatarBRL, formatarNumero } from "@/lib/format";
import { useAtualizarPat, useExcluirPat, useInserirPat, useListaPat } from "@/lib/patrimonio";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/carteira")({
  head: () => ({
    meta: [
      { title: "Carteira pessoal · Fluxo Escritório & Casa" },
      { name: "description", content: "Controle de investimentos pessoais por classe e subcategoria, com comparativos de rentabilidade." },
      { property: "og:title", content: "Carteira pessoal · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Controle de investimentos pessoais por classe e subcategoria, com comparativos de rentabilidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Carteira,
});

type Ativo = Tables<"carteira">;
const CLASSES = ["Renda fixa", "Renda variável"];
const SUBS: Record<string, string[]> = {
  "Renda fixa": ["CDB", "LCI", "LCA", "Tesouro Direto", "Poupança", "Debênture", "CRI/CRA", "Fundo RF", "Outro"],
  "Renda variável": ["Ações", "FII", "ETF", "Cripto", "BDR", "Fundo multimercado", "Outro"],
};
const CORES = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];
const pct = (n: number) => `${formatarNumero(n, 2)}%`;
const rent = (inv: number, at: number) => (inv > 0 ? ((at - inv) / inv) * 100 : 0);
const tip = { contentStyle: { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 } };

function agrupar(lista: Ativo[], chave: (a: Ativo) => string) {
  const m = new Map<string, { nome: string; investido: number; atual: number }>();
  for (const a of lista) {
    const k = chave(a);
    const g = m.get(k) ?? { nome: k, investido: 0, atual: 0 };
    g.investido += Number(a.valor_investido); g.atual += Number(a.valor_atual);
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, lucro: g.atual - g.investido, rent: rent(g.investido, g.atual) })).sort((a, b) => b.atual - a.atual);
}

function Carteira() {
  const q = useListaPat("carteira");
  const inserir = useInserirPat("carteira");
  const atualizar = useAtualizarPat("carteira");
  const excluir = useExcluirPat("carteira");
  const [filtro, setFiltro] = useState("todas");
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => (q.data ?? []).filter((a) => (filtro === "todas" || a.classe === filtro) && `${a.nome} ${a.subcategoria} ${a.instituicao ?? ""}`.toLowerCase().includes(busca.toLowerCase())), [q.data, filtro, busca]);
  const tot = useMemo(() => {
    const inv = lista.reduce((s, a) => s + Number(a.valor_investido), 0);
    const at = lista.reduce((s, a) => s + Number(a.valor_atual), 0);
    return { inv, at, lucro: at - inv, rent: rent(inv, at) };
  }, [lista]);
  const porClasse = useMemo(() => agrupar(lista, (a) => a.classe), [lista]);
  const porSub = useMemo(() => agrupar(lista, (a) => a.subcategoria), [lista]);
  const porAtivo = useMemo(() => lista.map((a) => ({ nome: a.nome, rent: rent(Number(a.valor_investido), Number(a.valor_atual)) })).sort((a, b) => b.rent - a.rent), [lista]);

  if (!q.data) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Carteira de investimentos pessoal</h1>
        <div className="ml-auto flex gap-2">
          <select className={selectCls} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todas">Todas as classes</option>{CLASSES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <Input className="h-8 w-48" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <LinkImportar tipo="carteira" rotulo="Importar carteira" />
        </div>
      </div>

      <div className="surface-card grid grid-cols-2 gap-4 rounded-lg border bg-card px-5 py-4 md:grid-cols-4">
        <Ind rotulo="Valor investido" v={tot.inv} />
        <Ind rotulo="Valor atual" v={tot.at} forte />
        <Ind rotulo="Ganho / perda" v={tot.lucro} />
        <div><div className="text-xs text-muted-foreground">Rentabilidade da carteira</div><div className={`num text-2xl font-semibold ${tot.rent < 0 ? "text-negative" : "text-positive"}`}>{pct(tot.rent)}</div></div>
      </div>

      {lista.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Painel titulo="Rentabilidade por subcategoria">
            <ResponsiveContainer width="100%" height={Math.max(200, porSub.length * 34)}>
              <BarChart data={porSub} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid horizontal={false} strokeOpacity={0.15} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} fontSize={11} />
                <YAxis type="category" dataKey="nome" width={110} fontSize={11} />
                <Tooltip {...tip} formatter={(v: number) => pct(v)} />
                <Bar dataKey="rent" name="Rentabilidade">{porSub.map((d) => <Cell key={d.nome} fill={d.rent < 0 ? "var(--color-negative)" : "var(--color-primary)"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Painel>
          <Painel titulo="Distribuição por subcategoria (valor atual)">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={porSub} dataKey="atual" nameKey="nome" innerRadius={55} outerRadius={95} label={(d: { nome: string; percent: number }) => `${d.nome} ${Math.round(d.percent * 100)}%`} fontSize={11}>
                  {porSub.map((d, i) => <Cell key={d.nome} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip {...tip} formatter={(v: number) => formatarBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Painel>
          <Painel titulo="Investido × Atual por classe">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={porClasse}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="nome" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip {...tip} formatter={(v: number) => formatarBRL(v)} />
                <Bar dataKey="investido" name="Investido" fill="var(--color-chart-2)" />
                <Bar dataKey="atual" name="Atual" fill="var(--color-primary)" />
              </BarChart>
            </ResponsiveContainer>
          </Painel>
          <Painel titulo="Ranking de rentabilidade por ativo">
            <ResponsiveContainer width="100%" height={Math.max(200, Math.min(porAtivo.length, 12) * 30)}>
              <BarChart data={porAtivo.slice(0, 12)} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid horizontal={false} strokeOpacity={0.15} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} fontSize={11} />
                <YAxis type="category" dataKey="nome" width={120} fontSize={11} />
                <Tooltip {...tip} formatter={(v: number) => pct(v)} />
                <Bar dataKey="rent" name="Rentabilidade">{porAtivo.slice(0, 12).map((d) => <Cell key={d.nome} fill={d.rent < 0 ? "var(--color-negative)" : "var(--color-primary)"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Painel>
        </div>
      )}

      {lista.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Comparativo por classe e subcategoria</h2>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Grupo</th><th className="p-2 text-right">Investido</th><th className="p-2 text-right">Atual</th><th className="p-2 text-right">Ganho</th><th className="p-2 text-right">Rentab.</th><th className="p-2 text-right">% da carteira</th></tr></thead>
              <tbody>
                {porClasse.map((c) => (
                  <Fragment key={c.nome}>
                    <tr className="border-t bg-muted/30 font-semibold"><LinhaComp g={c} total={tot.at} /></tr>
                    {agrupar(lista.filter((a) => a.classe === c.nome), (a) => a.subcategoria).map((s) => (
                      <tr key={c.nome + s.nome} className="border-t"><LinhaComp g={s} total={tot.at} recuo /></tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ativos</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Ativo</th><th className="p-2">Classe</th><th className="p-2">Subcategoria</th><th className="p-2">Instituição</th><th className="p-2 text-right">Quantidade</th><th className="p-2">Unidade</th><th className="p-2 text-right">Valor investido</th><th className="p-2 text-right">Valor atual</th><th className="p-2 text-right">Rentab.</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                const up = (v: Partial<Ativo>) => atualizar.mutate({ id: a.id, v });
                const r = rent(Number(a.valor_investido), Number(a.valor_atual));
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-2"><CampoTxt valor={a.nome} onSalvar={(s) => s && up({ nome: s })} className="min-w-36" /></td>
                    <td className="p-2"><select className={selectCls} value={a.classe} onChange={(e) => up({ classe: e.target.value, subcategoria: SUBS[e.target.value]![0] })}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select></td>
                    <td className="p-2"><select className={selectCls} value={a.subcategoria} onChange={(e) => up({ subcategoria: e.target.value })}>{[...new Set([...(SUBS[a.classe] ?? []), a.subcategoria])].map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td className="p-2"><CampoTxt valor={a.instituicao} onSalvar={(s) => up({ instituicao: s })} className="w-28" /></td>
                    <td className="p-2"><CampoNum valor={Number(a.quantidade)} casas={6} onSalvar={(n) => up({ quantidade: n })} className="w-28" /></td>
                    <td className="p-2"><CampoTxt valor={a.unidade} placeholder="cotas" onSalvar={(s) => up({ unidade: s })} className="w-20" /></td>
                    <td className="p-2"><CampoNum valor={Number(a.valor_investido)} onSalvar={(n) => up({ valor_investido: n })} className="w-32" /></td>
                    <td className="p-2"><CampoNum valor={Number(a.valor_atual)} onSalvar={(n) => up({ valor_atual: n })} className="w-32" /></td>
                    <td className={`num p-2 text-right font-medium ${r < 0 ? "text-negative" : "text-positive"}`}>{pct(r)}</td>
                    <td className="p-2"><BotaoExcluir onConfirmar={() => excluir.mutate(a.id)} /></td>
                  </tr>
                );
              })}
              {!lista.length && <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">Nenhum ativo cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="outline" onClick={() => inserir.mutate({ nome: "Novo ativo", classe: filtro === "Renda variável" ? "Renda variável" : "Renda fixa", subcategoria: filtro === "Renda variável" ? "Ações" : "CDB" })}><Plus className="size-4" />Adicionar ativo</Button>
      </section>
    </div>
  );
}

function Painel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="rounded-lg border bg-card p-4"><h3 className="mb-3 text-sm font-semibold">{titulo}</h3>{children}</div>;
}

function LinhaComp({ g, total, recuo }: { g: ReturnType<typeof agrupar>[number]; total: number; recuo?: boolean }) {
  return (
    <>
      <td className={`p-2 ${recuo ? "pl-6 text-muted-foreground" : ""}`}>{g.nome}</td>
      <td className="num p-2 text-right">{formatarBRL(g.investido)}</td>
      <td className="num p-2 text-right">{formatarBRL(g.atual)}</td>
      <td className={`num p-2 text-right ${g.lucro < 0 ? "text-negative" : ""}`}>{formatarBRL(g.lucro)}</td>
      <td className={`num p-2 text-right ${g.rent < 0 ? "text-negative" : "text-positive"}`}>{pct(g.rent)}</td>
      <td className="num p-2 text-right">{pct(total > 0 ? (g.atual / total) * 100 : 0)}</td>
    </>
  );
}
