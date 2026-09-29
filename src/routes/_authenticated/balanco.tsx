import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotaoExcluir } from "@/components/botao-excluir";
import { daArea, useArea, usePeriodo } from "@/components/app-shell";
import { BotaoImportarPat, CampoNum, CampoTxt, Ind, Op, selectCls } from "@/components/patrimonio-ui";
import { useConfig } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { formatarBRL, formatarMes } from "@/lib/format";
import { caixaProjetado, chaveMes, evolucaoDivida, evolucaoInvestimento, pareceDivida, saldosAtuais, type Bem, type Divida } from "@/lib/calc";
import { useBaixas, useSaldos } from "@/lib/situacao";
import { useAtualizarPat, useExcluirPat, useInserirPat, useListaPat } from "@/lib/patrimonio";

export const Route = createFileRoute("/_authenticated/balanco")({
  head: () => ({
    meta: [
      { title: "Balanço · Fluxo Escritório & Casa" },
      { name: "description", content: "Ativo, passivo e patrimônio líquido da base zero até o fim da projeção." },
      { property: "og:title", content: "Balanço · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Ativo, passivo e patrimônio líquido da base zero até o fim da projeção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Balanco,
});

type Linha = { rotulo: string; vals: number[]; nivel: 0 | 1 | 2; forte?: boolean; neg?: boolean };

function Balanco() {
  const { horizonte: h, colunas } = usePeriodo();
  const { data: cfg } = useConfig();
  const ent = useLista("entradas"), sai = useLista("saidas"), pes = useLista("entradas_pessoais");
  const saldos = useSaldos(), baixas = useBaixas();
  const area = useArea();
  const inv = useListaPat("investimentos"), bens = useListaPat("bens"), div = useListaPat("dividas");

  const calc = useMemo(() => {
    if (!h || !cfg || !ent.data || !sai.data || !pes.data || !saldos.data || !baixas.data || !inv.data || !bens.data || !div.data || !colunas.length) return null;
    const invD = inv.data.filter((x) => daArea(x.destino, area)), bensD = bens.data.filter((x) => daArea(x.destino, area)), divD = div.data.filter((x) => daArea(x.destino, area));
    const d = { entradas: ent.data, saidas: sai.data, pessoais: pes.data };
    const caixa = caixaProjetado(d, cfg, h, saldos.data, baixas.data);
    const caixa0 = [...saldosAtuais(saldos.data, baixas.data).values()].reduce((t, x) => t + x.atual, 0);
    const fins = colunas.map((c) => chaveMes(c.meses[c.meses.length - 1]!));
    const rotulos = ["Base zero", ...colunas.map((c) => (c.meses.length === 1 ? `Fim ${c.rotulo}` : `Fim ${c.rotulo}`))];

    const tipos = [...new Set(invD.map((i) => i.tipo))].sort();
    const evoI = invD.map((i) => ({ i, e: evolucaoInvestimento(i, sai.data, cfg, h) }));
    const invTipo = tipos.map((t) => {
      const l = evoI.filter((x) => x.i.tipo === t);
      return { rotulo: t, vals: [l.reduce((s, x) => s + Number(x.i.saldo_inicial), 0), ...fins.map((k) => l.reduce((s, x) => s + (x.e.get(k)?.saldo ?? 0), 0))] };
    });
    const bensV = bensD.reduce((t, b) => t + Number(b.valor), 0);
    const dividas = divD.map((x) => { const e = evolucaoDivida(x, sai.data, cfg, h); return { rotulo: x.nome, vals: [Number(x.saldo), ...fins.map((k) => e.get(k) ?? 0)] }; });

    const n = fins.length + 1;
    const soma = (ls: { vals: number[] }[]) => Array.from({ length: n }, (_, j) => ls.reduce((t, l) => t + l.vals[j]!, 0));
    const caixaV = [caixa0, ...fins.map((k) => caixa.get(k) ?? 0)];
    const invTot = soma(invTipo);
    const bensVals = Array(n).fill(bensV) as number[];
    const naoCirc = invTot.map((v, j) => v + bensVals[j]!);
    const ativo = caixaV.map((v, j) => v + naoCirc[j]!);
    const passivo = soma(dividas);
    const pl = ativo.map((v, j) => v - passivo[j]!);
    const variacao = pl.map((v, j) => (j === 0 ? 0 : v - pl[j - 1]!));

    const linhas: Linha[] = [
      { rotulo: "ATIVO", vals: ativo, nivel: 0, forte: true },
      { rotulo: "Ativo circulante", vals: caixaV, nivel: 1, forte: true },
      { rotulo: "Caixa e bancos", vals: caixaV, nivel: 2 },
      { rotulo: "Ativo não circulante", vals: naoCirc, nivel: 1, forte: true },
      ...invTipo.map((t) => ({ rotulo: `Investimentos · ${t.rotulo}`, vals: t.vals, nivel: 2 as const })),
      { rotulo: "Bens", vals: bensVals, nivel: 2 },
      { rotulo: "PASSIVO", vals: passivo, nivel: 0, forte: true, neg: true },
      ...dividas.map((x) => ({ rotulo: x.rotulo, vals: x.vals, nivel: 2 as const, neg: true })),
    ];
    const ligadas = new Set(divD.map((x) => x.saida_id).filter(Boolean));
    const parcelas = sai.data.filter((s) => pareceDivida(s) && !ligadas.has(s.id));
    return { rotulos, linhas, pl, variacao, ativo, passivo, parcelas, semSaldo: saldos.data.length === 0 };
  }, [h, cfg, ent.data, sai.data, pes.data, saldos.data, baixas.data, inv.data, bens.data, div.data, colunas, area]);

  if (!h || !calc || !sai.data) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;
  const ult = calc.pl.length - 1;
  const difPL = calc.pl[ult]! - calc.pl[0]!;

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Balanço</h1>
        <span className="text-sm text-muted-foreground">Base zero {String(h.base.dia).padStart(2, "0")}/{formatarMes(h.base.ano, h.base.mes)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <BotaoImportarPat tabela="bens" rotulo="Importar bens" saidas={sai.data} />
          <BotaoImportarPat tabela="dividas" rotulo="Importar dívidas" saidas={sai.data} />
        </div>
      </div>

      {calc.semSaldo && <Aviso>Nenhum saldo bancário foi informado: o caixa parte de zero. Informe os saldos na aba Situação atual.</Aviso>}

      <div className="surface-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-5 py-4">
        <Ind rotulo="Ativo na base zero" v={calc.ativo[0]!} /><Op>−</Op>
        <Ind rotulo="Passivo na base zero" v={calc.passivo[0]!} /><Op>=</Op>
        <Ind rotulo="PL na base zero" v={calc.pl[0]!} forte />
        <span className="mx-2 h-8 w-px bg-border" />
        <Ind rotulo="PL no fim do período" v={calc.pl[ult]!} forte extra={`${difPL >= 0 ? "+" : "−"}${formatarBRL(Math.abs(difPL))} contra a base zero`} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr><th className="sticky left-0 bg-muted p-2 text-left">Conta</th>{calc.rotulos.map((r) => <th key={r} className="whitespace-nowrap p-2 text-right">{r}</th>)}</tr>
          </thead>
          <tbody>
            {calc.linhas.map((l, i) => (
              <tr key={i} className={`border-t ${l.nivel === 0 ? "bg-muted/30" : ""}`}>
                <td className={`sticky left-0 bg-card p-2 ${l.forte ? "font-semibold" : ""}`} style={{ paddingLeft: 8 + l.nivel * 16 }}>{l.rotulo}</td>
                {l.vals.map((v, j) => <td key={j} className={`num p-2 text-right ${l.forte ? "font-semibold" : ""} ${l.neg && v ? "text-negative" : ""}`}>{formatarBRL(l.neg ? -v : v)}</td>)}
              </tr>
            ))}
            <tr className="border-t-2 bg-primary/10 text-base font-bold">
              <td className="sticky left-0 bg-card p-2">= PATRIMÔNIO LÍQUIDO</td>
              {calc.pl.map((v, j) => <td key={j} className={`num p-2 text-right ${v < 0 ? "text-negative" : ""}`}>{formatarBRL(v)}</td>)}
            </tr>
            <tr className="border-t text-muted-foreground">
              <td className="sticky left-0 bg-card p-2">Variação do PL</td>
              {calc.variacao.map((v, j) => <td key={j} className={`num p-2 text-right ${v < 0 ? "text-negative" : ""}`}>{j === 0 ? "—" : `${v >= 0 ? "+" : ""}${formatarBRL(v)}`}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TabelaBens />
        <TabelaDividas parcelas={calc.parcelas} />
      </div>
    </div>
  );
}

function Aviso({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <AlertTriangle className="size-4 text-warning" /><span>{children}</span>{acao && <div className="ml-auto">{acao}</div>}
    </div>
  );
}

function TabelaBens() {
  const bens0 = useListaPat("bens"), ins = useInserirPat("bens"), up = useAtualizarPat("bens"), del = useExcluirPat("bens");
  const area = useArea();
  const bens = { data: bens0.data?.filter((x) => daArea(x.destino, area)) };
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bens</h2>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Nome</th><th className="p-2">Tipo</th><th className="p-2 text-right">Valor</th><th /></tr></thead>
          <tbody>
            {(bens.data ?? []).map((b: Bem) => (
              <tr key={b.id} className="border-t">
                <td className="p-2"><CampoTxt valor={b.nome} onSalvar={(s) => s && up.mutate({ id: b.id, v: { nome: s } })} /></td>
                <td className="p-2"><CampoTxt valor={b.tipo} placeholder="Veículo, imóvel…" onSalvar={(s) => up.mutate({ id: b.id, v: { tipo: s } })} className="w-32" /></td>
                <td className="p-2"><CampoNum valor={Number(b.valor)} onSalvar={(n) => up.mutate({ id: b.id, v: { valor: n } })} className="w-32" /></td>
                <td className="p-2"><BotaoExcluir onConfirmar={() => del.mutate(b.id)} /></td>
              </tr>
            ))}
            {!bens.data?.length && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhum bem cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="outline" onClick={() => ins.mutate({ nome: "Novo bem", destino: area })}><Plus className="size-4" />Adicionar bem</Button>
    </section>
  );
}

function TabelaDividas({ parcelas }: { parcelas: { id: string; descricao: string; banco: string | null }[] }) {
  const div0 = useListaPat("dividas"), ins = useInserirPat("dividas"), up = useAtualizarPat("dividas"), del = useExcluirPat("dividas");
  const area = useArea();
  const div = { data: div0.data?.filter((x) => daArea(x.destino, area)) };
  const sai = useLista("saidas");
  const saidasOrd = [...(sai.data ?? [])].sort((a, b) => a.descricao.localeCompare(b.descricao));
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dívidas</h2>
      {parcelas.length > 0 && (
        <Aviso acao={<Button size="sm" disabled={ins.isPending} onClick={() => ins.mutate(parcelas.map((s) => ({ nome: s.descricao, credor: s.banco, saida_id: s.id, destino: area })))}>Criar dívidas a partir delas</Button>}>
          {parcelas.length} saídas parecem parcelas de empréstimo: {parcelas.slice(0, 3).map((s) => s.descricao).join(", ")}{parcelas.length > 3 ? "…" : ""}
        </Aviso>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Nome</th><th className="p-2">Credor</th><th className="p-2 text-right">Saldo base zero</th><th className="p-2 text-right">Juros % a.m.</th><th className="p-2">Parcela</th><th /></tr></thead>
          <tbody>
            {(div.data ?? []).map((x: Divida) => {
              const u = (v: Partial<Divida>) => up.mutate({ id: x.id, v });
              return (
                <tr key={x.id} className="border-t">
                  <td className="p-2"><CampoTxt valor={x.nome} onSalvar={(s) => s && u({ nome: s })} className="min-w-32" /></td>
                  <td className="p-2"><CampoTxt valor={x.credor} onSalvar={(s) => u({ credor: s })} className="w-28" /></td>
                  <td className="p-2"><CampoNum valor={Number(x.saldo)} onSalvar={(n) => u({ saldo: n })} className="w-28" /></td>
                  <td className="p-2"><CampoNum valor={Number(x.juros)} casas={3} onSalvar={(n) => u({ juros: n })} className="w-20" /></td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <select className={`${selectCls} max-w-44`} value={x.saida_id ?? ""} onChange={(e) => u({ saida_id: e.target.value || null })}>
                        <option value="">Parcela fixa</option>
                        {saidasOrd.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
                      </select>
                      {!x.saida_id && <CampoNum valor={Number(x.parcela_fixa)} onSalvar={(n) => u({ parcela_fixa: n })} className="w-24" />}
                    </div>
                  </td>
                  <td className="p-2"><BotaoExcluir onConfirmar={() => del.mutate(x.id)} /></td>
                </tr>
              );
            })}
            {!div.data?.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhuma dívida cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="outline" onClick={() => ins.mutate({ nome: "Nova dívida" })}><Plus className="size-4" />Adicionar dívida</Button>
    </section>
  );
}
