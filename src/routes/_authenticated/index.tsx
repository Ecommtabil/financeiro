import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArea, usePeriodo } from "@/components/app-shell";
import { useConfig } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { caixaProjetado, chaveMes, destinoSaida, somar, totaisHorizonte, valorSaidaProjetado, type TotaisMes } from "@/lib/calc";
import { useBaixas, useSaldos } from "@/lib/situacao";
import { formatarBRL, formatarNumero } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Panorama · Fluxo Escritório & Casa" },
      { name: "description", content: "Visão geral de entradas, saídas, lucro e reserva no período." },
      { property: "og:title", content: "Panorama · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Visão geral de entradas, saídas, lucro e reserva no período." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Panorama,
});

type Linha = { rotulo: string; valor: (t: TotaisMes, acum: number, caixa: number | null) => number | null; tipo?: "grupo" | "sub" | "destaque" | "pct"; cat?: string };

function Panorama() {
  const { horizonte: h, colunas } = usePeriodo();
  const { data: cfg } = useConfig();
  const ent = useLista("entradas"), sai = useLista("saidas"), pes = useLista("entradas_pessoais");
  const saldos = useSaldos(), baixas = useBaixas();
  const visao: "E" | "P" = useArea() === "PESSOAL" ? "P" : "E";
  const [sel, setSel] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const porMes = useMemo(() => {
    if (!h || !cfg || !ent.data || !sai.data || !pes.data) return null;
    return totaisHorizonte({ entradas: ent.data, saidas: sai.data, pessoais: pes.data }, cfg, h);
  }, [h, cfg, ent.data, sai.data, pes.data]);
  const caixa = useMemo(() => {
    if (!h || !cfg || !ent.data || !sai.data || !pes.data || !saldos.data || !baixas.data) return null;
    return caixaProjetado({ entradas: ent.data, saidas: sai.data, pessoais: pes.data }, cfg, h, saldos.data, baixas.data);
  }, [h, cfg, ent.data, sai.data, pes.data, saldos.data, baixas.data]);

  if (!h || !porMes) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;

  // acumulado da reserva desde o início do horizonte
  const acumAte = new Map<string, number>();
  let a = 0;
  for (const m of h.meses) { a += porMes.get(chaveMes(m))!.R; acumAte.set(chaveMes(m), a); }

  const cols = colunas.map((c) => {
    const t = somar(c.meses.map((m) => porMes.get(chaveMes(m))!));
    const ult = c.meses[c.meses.length - 1];
    return { ...c, t, acum: ult ? acumAte.get(chaveMes(ult)) ?? 0 : 0, caixa: ult && caixa ? caixa.get(chaveMes(ult)) ?? null : null };
  });
  const total = { t: somar(cols.map((c) => c.t)), acum: cols[cols.length - 1]?.acum ?? 0, caixa: cols[cols.length - 1]?.caixa ?? null };

  // gastos dentro de cada categoria pessoal (por coluna do período)
  const itensPorCat = new Map<string, { nome: string; porCol: number[]; tot: number }[]>();
  if (visao === "P" && cfg) {
    for (const s of (sai.data ?? []).filter((x) => destinoSaida(x) === "PESSOAL")) {
      const cat = s.categoria?.trim() || "Sem categoria";
      const porCol = cols.map((c) => c.meses.reduce((acc, m) => acc + valorSaidaProjetado(s, m, cfg, h), 0));
      const tot = porCol.reduce((a, b) => a + b, 0);
      if (!tot) continue;
      const lista = itensPorCat.get(cat) ?? [];
      lista.push({ nome: s.descricao, porCol, tot });
      itensPorCat.set(cat, lista);
    }
    for (const lista of itensPorCat.values()) lista.sort((a, b) => b.tot - a.tot);
  }
  const atual = cols.find((c) => c.chave === sel) ?? cols[0];
  const semDestino = (sai.data ?? []).filter((s) => !s.destino).length;

  const cats = (f: (t: TotaisMes) => Record<string, number>) =>
    Object.keys(f(total.t)).sort((x, y) => f(total.t)[y]! - f(total.t)[x]!);

  const linhas: Linha[] = visao === "E"
    ? [
        { rotulo: "Entradas", valor: (t) => t.E, tipo: "grupo" },
        ...cats((t) => t.porCarteira).map((k): Linha => ({ rotulo: k, valor: (t) => t.porCarteira[k] ?? 0, tipo: "sub" })),
        { rotulo: "− Saídas escritório", valor: (t) => t.SE, tipo: "grupo" },
        ...cats((t) => t.porCatEscritorio).map((k): Linha => ({ rotulo: k, valor: (t) => t.porCatEscritorio[k] ?? 0, tipo: "sub" })),
        { rotulo: "= Lucro", valor: (t) => t.L, tipo: "destaque" },
        { rotulo: "Margem", valor: (t) => (t.E ? (t.L / t.E) * 100 : null), tipo: "pct" },
      ]
    : [
        { rotulo: "Lucro do escritório", valor: (t) => t.L, tipo: "grupo" },
        { rotulo: "+ Entradas pessoais", valor: (t) => t.EP, tipo: "grupo" },
        ...cats((t) => t.porOrigemPessoal).map((k): Linha => ({ rotulo: k, valor: (t) => t.porOrigemPessoal[k] ?? 0, tipo: "sub" })),
        { rotulo: "− Saídas pessoais", valor: (t) => t.SP, tipo: "grupo" },
        ...cats((t) => t.porCatPessoal).map((k): Linha => ({ rotulo: k, valor: (t) => t.porCatPessoal[k] ?? 0, tipo: "sub", cat: k })),
        { rotulo: "= Reserva", valor: (t) => t.R, tipo: "destaque" },
        { rotulo: "Reserva acumulada", valor: (_t, ac) => ac },
        { rotulo: "Caixa projetado", valor: (_t, _a, cx) => cx },
      ];

  const fmt = (v: number | null, l: Linha) => (v == null ? "—" : l.tipo === "pct" ? `${formatarNumero(v, 1)}%` : formatarNumero(v));
  const cor = (v: number) => (v < 0 ? "text-negative" : "");

  return (
    <div className="space-y-5 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <select value={atual?.chave} onChange={(e) => setSel(e.target.value)}
          className="rounded-md border bg-card px-3 py-1.5 text-base font-semibold">
          {cols.map((c) => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
        </select>
      </div>

      {semDestino > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          <span>{semDestino} {semDestino === 1 ? "saída está" : "saídas estão"} sem destino e {semDestino === 1 ? "conta" : "contam"} como Escritório.</span>
          <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/cadastro">Revisar no cadastro</Link></Button>
        </div>
      )}

      {atual && (
        <div className="surface-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-5 py-4">
          {visao === "E" ? (
            <>
              <Ind rotulo="Entradas" v={atual.t.E} /><Op>−</Op>
              <Ind rotulo="Saídas escritório" v={atual.t.SE} /><Op>=</Op>
              <Ind rotulo="Lucro" v={atual.t.L} forte />
              <span className="mx-2 h-8 w-px bg-border" />
              <Ind rotulo="Margem" texto={atual.t.E ? `${formatarNumero((atual.t.L / atual.t.E) * 100, 1)}%` : "—"} />
              <Ind rotulo="Contratos" texto={String(atual.t.contratos)} />
            </>
          ) : (
            <>
              <Ind rotulo="Lucro do escritório" v={atual.t.L} /><Op>+</Op>
              <Ind rotulo="Entradas pessoais" v={atual.t.EP} /><Op>−</Op>
              <Ind rotulo="Saídas pessoais" v={atual.t.SP} /><Op>=</Op>
              <Ind rotulo="Reserva" v={atual.t.R} forte />
              <span className="mx-2 h-8 w-px bg-border" />
              <Ind rotulo="Acumulado desde o início" v={atual.acum} />
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="sticky left-0 bg-card px-3 py-2 text-left font-medium">{visao === "E" ? "Escritório" : "Pessoal"}</th>
              {cols.map((c) => <th key={c.chave} className={`px-3 py-2 text-right font-medium ${c.chave === atual?.chave ? "text-foreground" : ""}`}>{c.rotulo}</th>)}
              <th className="px-3 py-2 text-right font-semibold text-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const cls = l.tipo === "destaque" ? "bg-primary/10 font-semibold" : l.tipo === "grupo" ? "font-medium border-t" : l.tipo === "sub" ? "text-muted-foreground" : "";
              const tv = l.valor(total.t, total.acum, total.caixa);
              return (
                <tr key={i} className={cls}>
                  <td className={`sticky left-0 bg-card px-3 py-1.5 ${l.tipo === "sub" ? "pl-7" : ""}`}>{l.rotulo}</td>
                  {cols.map((c) => { const v = l.valor(c.t, c.acum, c.caixa); return <td key={c.chave} className={`num px-3 py-1.5 text-right ${v != null ? cor(v) : ""}`}>{fmt(v, l)}</td>; })}
                  <td className={`num px-3 py-1.5 text-right font-medium ${tv != null ? cor(tv) : ""}`}>{fmt(tv, l)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visao === "P" && <p className="text-xs text-muted-foreground">Caixa projetado = saldo atual dos bancos + tudo o que está em aberto a receber menos a pagar até o fim do período. Na coluna Total, é o caixa no último mês.</p>}
    </div>
  );
}

function Op({ children }: { children: string }) {
  return <span className="num text-2xl text-muted-foreground">{children}</span>;
}
function Ind({ rotulo, v, texto, forte }: { rotulo: string; v?: number; texto?: string; forte?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={`num ${forte ? "text-xl font-semibold" : "text-lg"} ${v != null && v < 0 ? "text-negative" : forte ? "text-primary" : ""}`}>
        {texto ?? formatarBRL(v ?? 0)}
      </div>
    </div>
  );
}
