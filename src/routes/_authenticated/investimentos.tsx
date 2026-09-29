import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotaoExcluir } from "@/components/botao-excluir";
import { daArea, useArea, usePeriodo } from "@/components/app-shell";
import { BotaoImportarPat, CampoNum, CampoTxt, Ind, Op, selectCls } from "@/components/patrimonio-ui";
import { useConfig } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { formatarBRL } from "@/lib/format";
import { chaveMes, evolucaoInvestimento, saidaDeInvestimento, tipoInvestimentoSugerido, type Investimento, type MesInvest } from "@/lib/calc";
import { useAtualizarPat, useExcluirPat, useInserirPat, useListaPat } from "@/lib/patrimonio";

export const Route = createFileRoute("/_authenticated/investimentos")({
  head: () => ({
    meta: [
      { title: "Investimentos · Fluxo Escritório & Casa" },
      { name: "description", content: "Carteira de investimentos e evolução mês a mês ao longo do horizonte." },
      { property: "og:title", content: "Investimentos · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Carteira de investimentos e evolução mês a mês ao longo do horizonte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Investimentos,
});

const TIPOS = ["Aplicação", "Consórcio", "Previdência", "Imóvel", "Ações", "Outro"];

function Investimentos() {
  const { horizonte: h, colunas, periodo } = usePeriodo();
  const { data: cfg } = useConfig();
  const sai = useLista("saidas");
  const area = useArea();
  const inv0 = useListaPat("investimentos");
  const inv = useMemo(() => ({ data: inv0.data?.filter((x) => daArea(x.destino, area)) }), [inv0.data, area]);
  const inserir = useInserirPat("investimentos");
  const atualizar = useAtualizarPat("investimentos");
  const excluir = useExcluirPat("investimentos");

  const calc = useMemo(() => {
    if (!h || !cfg || !sai.data || !inv.data || !colunas.length) return null;
    const evo = new Map(inv.data.map((i) => [i.id, evolucaoInvestimento(i, sai.data, cfg, h)]));
    const chavesH = h.meses.map(chaveMes);
    const ultimaDe = (c: (typeof colunas)[number]) => chaveMes(c.meses[c.meses.length - 1]!);
    const primeira = chaveMes(colunas[0]!.meses[0]!);
    const idx = chavesH.indexOf(primeira);
    const anterior = idx > 0 ? chavesH[idx - 1]! : null;
    const saldoEm = (i: Investimento, k: string | null) => (k ? evo.get(i.id)!.get(k)?.saldo ?? 0 : Number(i.saldo_inicial));
    const somaCol = (i: Investimento, c: (typeof colunas)[number], campo: keyof MesInvest) => c.meses.reduce((t, m) => t + (evo.get(i.id)!.get(chaveMes(m))?.[campo] ?? 0), 0);
    const inicio = inv.data.reduce((t, i) => t + saldoEm(i, anterior), 0);
    const fimK = ultimaDe(colunas[colunas.length - 1]!);
    const fim = inv.data.reduce((t, i) => t + saldoEm(i, fimK), 0);
    const aportes = inv.data.reduce((t, i) => t + colunas.reduce((s, c) => s + somaCol(i, c, "aporte"), 0), 0);
    const rend = inv.data.reduce((t, i) => t + colunas.reduce((s, c) => s + somaCol(i, c, "rendimento"), 0), 0);
    const ligadas = new Set(inv.data.map((i) => i.saida_id).filter(Boolean));
    const ligTodas = new Set((inv0.data ?? []).map((i) => i.saida_id).filter(Boolean));
    const semCadastro = sai.data.filter((s) => saidaDeInvestimento(s) && daArea(s.destino, area) && !ligTodas.has(s.id));
    return { saldoEm, somaCol, ultimaDe, inicio, fim, fimK, aportes, rend, semCadastro };
  }, [h, cfg, sai.data, inv.data, inv0.data, area, colunas]);

  if (!h || !calc || !inv.data || !sai.data) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;
  const saidasOrd = [...sai.data].sort((a, b) => a.descricao.localeCompare(b.descricao));
  const lista = inv.data;

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Investimentos</h1>
        <div className="ml-auto"><BotaoImportarPat tabela="investimentos" rotulo="Importar investimentos" saidas={sai.data} /></div>
      </div>

      {calc.semCadastro.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          <span>Encontrei {calc.semCadastro.length} saídas da categoria Investimento sem cadastro aqui: {calc.semCadastro.slice(0, 4).map((s) => s.descricao).join(", ")}{calc.semCadastro.length > 4 ? "…" : ""}</span>
          <Button size="sm" className="ml-auto" disabled={inserir.isPending} onClick={() => inserir.mutate(calc.semCadastro.map((s) => ({
            nome: s.descricao, tipo: tipoInvestimentoSugerido(`${s.descricao} ${s.categoria ?? ""}`), instituicao: s.banco, destino: s.destino, saida_id: s.id,
          })))}>Criar a partir delas</Button>
        </div>
      )}

      <div className="surface-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-5 py-4">
        <Ind rotulo="Saldo no início" v={calc.inicio} /><Op>+</Op>
        <Ind rotulo="Aportes" v={calc.aportes} /><Op>+</Op>
        <Ind rotulo="Rendimento" v={calc.rend} /><Op>=</Op>
        <Ind rotulo={`Saldo no fim do período${periodo === "todos" ? "" : ` (${periodo})`}`} v={calc.fim} forte />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Carteira</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Nome</th><th className="p-2">Tipo</th><th className="p-2">Instituição</th><th className="p-2">Destino</th><th className="p-2 text-right">Saldo base zero</th><th className="p-2 text-right">Taxa % a.m.</th><th className="p-2">Aporte</th><th className="p-2 text-right">Saldo fim do período</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const up = (v: Partial<Investimento>) => atualizar.mutate({ id: i.id, v });
                return (
                  <tr key={i.id} className="border-t">
                    <td className="p-2"><CampoTxt valor={i.nome} onSalvar={(s) => s && up({ nome: s })} className="min-w-40" /></td>
                    <td className="p-2"><select className={selectCls} value={i.tipo} onChange={(e) => up({ tipo: e.target.value })}>{[...new Set([...TIPOS, i.tipo])].map((t) => <option key={t}>{t}</option>)}</select></td>
                    <td className="p-2"><CampoTxt valor={i.instituicao} onSalvar={(s) => up({ instituicao: s })} className="w-32" /></td>
                    <td className="p-2"><select className={selectCls} value={i.destino ?? ""} onChange={(e) => up({ destino: e.target.value || null })}><option value="">—</option><option value="ESCRITORIO">Escritório</option><option value="PESSOAL">Pessoal</option></select></td>
                    <td className="p-2"><CampoNum valor={Number(i.saldo_inicial)} onSalvar={(n) => up({ saldo_inicial: n })} className="w-32" /></td>
                    <td className="p-2"><CampoNum valor={Number(i.taxa)} casas={3} onSalvar={(n) => up({ taxa: n })} className="w-20" /></td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <select className={`${selectCls} max-w-52`} value={i.saida_id ?? ""} onChange={(e) => up({ saida_id: e.target.value || null })}>
                          <option value="">Valor fixo</option>
                          {saidasOrd.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
                        </select>
                        {!i.saida_id && <CampoNum valor={Number(i.aporte_fixo)} onSalvar={(n) => up({ aporte_fixo: n })} className="w-28" />}
                      </div>
                    </td>
                    <td className="num p-2 text-right font-medium">{formatarBRL(calc.saldoEm(i, calc.fimK))}</td>
                    <td className="p-2"><BotaoExcluir onConfirmar={() => excluir.mutate(i.id)} /></td>
                  </tr>
                );
              })}
              {!lista.length && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Nenhum investimento cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="outline" onClick={() => inserir.mutate({ nome: "Novo investimento" })}><Plus className="size-4" />Adicionar investimento</Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Evolução</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="sticky left-0 bg-muted p-2 text-left">Investimento</th>{colunas.map((c) => <th key={c.chave} className="p-2 text-right">{c.rotulo}</th>)}</tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="sticky left-0 bg-card p-2">{i.nome}</td>
                  {colunas.map((c) => <td key={c.chave} className="num p-2 text-right">{formatarBRL(calc.saldoEm(i, calc.ultimaDe(c)))}</td>)}
                </tr>
              ))}
              <tr className="border-t bg-muted/40 font-semibold">
                <td className="sticky left-0 bg-muted p-2">Saldo total</td>
                {colunas.map((c) => <td key={c.chave} className="num p-2 text-right">{formatarBRL(lista.reduce((t, i) => t + calc.saldoEm(i, calc.ultimaDe(c)), 0))}</td>)}
              </tr>
              <tr className="border-t">
                <td className="sticky left-0 bg-card p-2 text-muted-foreground">Aportes</td>
                {colunas.map((c) => <td key={c.chave} className="num p-2 text-right">{formatarBRL(lista.reduce((t, i) => t + calc.somaCol(i, c, "aporte"), 0))}</td>)}
              </tr>
              <tr className="border-t">
                <td className="sticky left-0 bg-card p-2 text-muted-foreground">Rendimento</td>
                {colunas.map((c) => <td key={c.chave} className="num p-2 text-right">{formatarBRL(lista.reduce((t, i) => t + calc.somaCol(i, c, "rendimento"), 0))}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
