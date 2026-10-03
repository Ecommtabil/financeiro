import { createFileRoute } from "@tanstack/react-router";
import { LinkImportar } from "@/components/link-importar";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sugerirDRE } from "@/lib/dre-ia.functions";
import { useArea, usePeriodo } from "@/components/app-shell";
import { useConfig, useSalvarConfig, type Config } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { GRUPOS_DRE, chaveCatDRE, chaveMes, grupoDRE, grupoPadraoDRE, somar, totaisHorizonte, type GrupoDRE, type TotaisMes } from "@/lib/calc";
import { acharCabecalho, lerPlanilha, norm } from "@/lib/importacao";
import { formatarBRL, formatarMes, formatarNumero } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dre")({
  head: () => ({
    meta: [
      { title: "DRE · Fluxo Escritório & Casa" },
      { name: "description", content: "Demonstrativo de resultado do escritório, mês a mês ou por ano." },
      { property: "og:title", content: "DRE · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Demonstrativo de resultado do escritório, mês a mês ou por ano." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DRE,
});

type Res = { RB: number; g: Record<GrupoDRE, number>; RL: number; LB: number; RO: number; RLiq: number; t: TotaisMes };
const rotuloGrupo = (id: GrupoDRE) => GRUPOS_DRE.find((g) => g.id === id)!.rotulo;

function calcular(t: TotaisMes, cfg: Config): Res {
  const g: Record<GrupoDRE, number> = { IMP: 0, PES: 0, DESP: 0, SOC: 0, FIN: 0 };
  for (const [cat, v] of Object.entries(t.porCatEscritorio)) g[grupoDRE(cfg, cat)] += v;
  const RB = t.E, RL = RB - g.IMP, LB = RL - g.PES, RO = LB - g.DESP, RLiq = RO - g.SOC - g.FIN;
  return { RB, g, RL, LB, RO, RLiq, t };
}

type Linha = { id: string; rotulo: string; v: (r: Res) => number; tipo?: "total" | "destaque" | "sub" | "grupo"; abre?: string; pai?: string };

function DRE() {
  const area = useArea();
  const { horizonte: h, colunas, periodo } = usePeriodo();
  const [anoMes, setAnoMes] = useState<number | null>(null);
  const { data: cfg } = useConfig();
  const salvar = useSalvarConfig();
  const ent = useLista("entradas"), sai = useLista("saidas"), pes = useLista("entradas_pessoais");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<"sintetico" | "analitico">("sintetico");
  const [vista, setVista] = useState<"mes" | "ano">("mes");

  const porMes = useMemo(() => {
    if (!h || !cfg || !ent.data || !sai.data || !pes.data) return null;
    return totaisHorizonte({ entradas: ent.data, saidas: sai.data, pessoais: pes.data }, cfg, h);
  }, [h, cfg, ent.data, sai.data, pes.data]);

  if (!h || !cfg || !porMes) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;

  const anoEfetivo = anoMes ?? (typeof periodo === "number" ? periodo : h.anos[0]?.ano);
  const anoObj = h.anos.find((a) => a.ano === anoEfetivo) ?? h.anos[0];
  const base = vista === "ano"
    ? h.anos.map((a) => ({ chave: `A${a.ano}`, rotulo: a.rotulo, meses: a.meses }))
    : (anoObj?.meses ?? []).map((m) => ({ chave: `${m.ano}-${m.mes}`, rotulo: formatarMes(m.ano, m.mes), meses: [m] }));
  void colunas;
  const cols = base.map((c) => ({ ...c, r: calcular(somar(c.meses.map((m) => porMes.get(chaveMes(m))!)), cfg) }));
  const total = calcular(somar(cols.map((c) => c.r.t)), cfg);

  // categorias do escritório (todas do cadastro + as com valor)
  const catsEsc = new Set<string>(Object.keys(total.t.porCatEscritorio));
  for (const s of sai.data ?? []) if (s.destino !== "PESSOAL") catsEsc.add(s.categoria?.trim() || "Sem categoria");
  const ordena = (o: Record<string, number>, ks: string[]) => ks.sort((a, b) => (o[b] ?? 0) - (o[a] ?? 0));
  const catsDoGrupo = (g: GrupoDRE) => ordena(total.t.porCatEscritorio, Object.keys(total.t.porCatEscritorio).filter((c) => grupoDRE(cfg, c) === g));

  const subCats = (g: GrupoDRE): Linha[] => catsDoGrupo(g).map((c) => ({ id: `${g}|${c}`, rotulo: c, v: (r) => -(r.t.porCatEscritorio[c] ?? 0), tipo: "sub", pai: g }));
  const menos = (g: GrupoDRE): Linha[] => [{ id: g, rotulo: `(−) ${rotuloGrupo(g)}`, v: (r) => -r.g[g], tipo: "grupo", abre: g }, ...subCats(g)];

  const escritorio: Linha[] = [
    { id: "RB", rotulo: "Receita bruta de serviços", v: (r) => r.RB, tipo: "grupo", abre: "RB" },
    ...ordena(total.t.porCarteira, Object.keys(total.t.porCarteira)).map((k): Linha => ({ id: `RB|${k}`, rotulo: k, v: (r) => r.t.porCarteira[k] ?? 0, tipo: "sub", pai: "RB" })),
    ...menos("IMP"),
    { id: "RL", rotulo: "= Receita líquida", v: (r) => r.RL, tipo: "total" },
    ...menos("PES"),
    { id: "LB", rotulo: "= Lucro bruto", v: (r) => r.LB, tipo: "total" },
    ...menos("DESP"),
    { id: "RO", rotulo: "= Resultado operacional", v: (r) => r.RO, tipo: "total" },
    ...menos("SOC"),
    ...menos("FIN"),
    { id: "RLIQ", rotulo: "= Resultado líquido do escritório", v: (r) => r.RLiq, tipo: "destaque" },
  ];
  const pessoal: Linha[] = [
    { id: "P0", rotulo: "Resultado do escritório", v: (r) => r.RLiq, tipo: "grupo" },
    { id: "EP", rotulo: "(+) Entradas pessoais", v: (r) => r.t.EP, tipo: "grupo", abre: "EP" },
    ...ordena(total.t.porOrigemPessoal, Object.keys(total.t.porOrigemPessoal)).map((k): Linha => ({ id: `EP|${k}`, rotulo: k, v: (r) => r.t.porOrigemPessoal[k] ?? 0, tipo: "sub", pai: "EP" })),
    { id: "SP", rotulo: "(−) Saídas pessoais", v: (r) => -r.t.SP, tipo: "grupo", abre: "SP" },
    ...ordena(total.t.porCatPessoal, Object.keys(total.t.porCatPessoal)).map((k): Linha => ({ id: `SP|${k}`, rotulo: k, v: (r) => -(r.t.porCatPessoal[k] ?? 0), tipo: "sub", pai: "SP" })),
    { id: "R", rotulo: "= Reserva", v: (r) => r.t.R, tipo: "destaque" },
  ];

  const alterna = (id: string) => setAbertos((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pct = (v: number, base: number) => (base ? `${formatarNumero((v / base) * 100, 1)}%` : "—");

  const tabela = (titulo: string, linhas: Linha[]) => (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="sticky left-0 min-w-64 bg-card px-3 py-2 text-left font-medium text-foreground">{titulo}</th>
            {cols.map((c) => <th key={c.chave} className="px-3 py-2 text-right font-medium">{c.rotulo}</th>)}
            <th className="px-3 py-2 text-right font-semibold text-foreground">Total</th>
            <th className="px-3 py-2 text-right font-medium">AV%</th>
          </tr>
        </thead>
        <tbody>
          {linhas.filter((l) => !l.pai || (detalhe === "analitico" ? true : abertos.has(l.pai))).map((l) => {
            const tem = l.abre && linhas.some((x) => x.pai === l.abre);
            const cls = l.tipo === "destaque" ? "bg-primary/10 font-semibold" : l.tipo === "total" ? "border-t font-semibold" : l.tipo === "grupo" ? "border-t font-medium" : "text-muted-foreground";
            const tv = l.v(total);
            return (
              <tr key={l.id} className={cls}>
                <td className={`sticky left-0 bg-card px-3 py-1.5 ${l.tipo === "sub" ? "pl-9" : ""}`}>
                  {tem ? (
                    <button onClick={() => alterna(l.abre!)} className="inline-flex items-center gap-1 text-left">
                      {abertos.has(l.abre!) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}{l.rotulo}
                    </button>
                  ) : <span className={l.abre ? "pl-[1.125rem]" : ""}>{l.rotulo}</span>}
                </td>
                {cols.map((c) => { const v = l.v(c.r); return <td key={c.chave} className={`num px-3 py-1.5 text-right ${v < 0 ? "text-negative" : ""}`}>{formatarNumero(v)}</td>; })}
                <td className={`num px-3 py-1.5 text-right font-medium ${tv < 0 ? "text-negative" : ""}`}>{formatarNumero(tv)}</td>
                <td className="num px-3 py-1.5 text-right text-muted-foreground">{pct(tv, total.RB)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const mapa = (cfg.dre_map ?? {}) as Record<string, GrupoDRE>;
  const reclassificar = (cat: string, g: GrupoDRE) => {
    const n = { ...mapa };
    if (g === grupoPadraoDRE(cat)) delete n[chaveCatDRE(cat)]; else n[chaveCatDRE(cat)] = g;
    salvar.mutate({ dre_map: n }, { onError: (e) => toast.error(e.message) });
  };

  return (
    <div className="space-y-5 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">DRE</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border">
            {([["sintetico", "Sintético"], ["analitico", "Analítico"]] as const).map(([v, r]) => (
              <button key={v} onClick={() => setDetalhe(v)}
                className={`px-3 py-1.5 text-sm ${detalhe === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{r}</button>
            ))}
          </div>
          <div className="flex rounded-md border">
            {([["mes", "Mês a mês"], ["ano", "Por ano"]] as const).map(([v, r]) => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 text-sm ${vista === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{r}</button>
            ))}
          </div>
          {vista === "mes" ? (
            <select aria-label="Ano" value={anoObj?.ano ?? ""} onChange={(e) => setAnoMes(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-sm">
              {h.anos.map((a) => <option key={a.ano} value={a.ano}>{a.rotulo}</option>)}
            </select>
          ) : null}
          <BotaoImportar cfg={cfg} cats={[...catsEsc]} salvar={(v) => salvar.mutateAsync(v)} />
        </div>
      </div>

      <div className="surface-card grid gap-4 rounded-lg border bg-card px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
        <Ind rotulo="Receita bruta" v={total.RB} />
        <Ind rotulo="Receita líquida" v={total.RL} extra={`${pct(total.RL, total.RB)} da bruta`} />
        <Ind rotulo="Lucro bruto" v={total.LB} extra={`margem ${pct(total.LB, total.RB)}`} />
        <Ind rotulo="Resultado líquido" v={total.RLiq} extra={`margem ${pct(total.RLiq, total.RB)}`} forte />
        <Ind rotulo="Reserva" v={total.t.R} forte />
      </div>

      {area === "ESCRITORIO" ? tabela("Resultado do escritório", escritorio) : tabela("Resultado pessoal", pessoal)}
      <p className="text-xs text-muted-foreground">AV% = valor da linha ÷ receita bruta do período. O resultado líquido do escritório é igual ao Lucro do Panorama.</p>

      {area === "ESCRITORIO" && <>
      <SugestaoIA cats={[...catsEsc]} cfg={cfg} aplicar={reclassificar} />

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Classificação das categorias do escritório</h2>
          <p className="text-xs text-muted-foreground">Escolha em qual linha da DRE cada categoria entra. Fica salvo na hora.</p>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Categoria</th><th className="px-4 py-2 text-left font-medium">Linha da DRE</th><th className="px-4 py-2 text-right font-medium">Total no período</th></tr></thead>
          <tbody>
            {[...catsEsc].sort((a, b) => a.localeCompare(b, "pt-BR")).map((c) => {
              const g = grupoDRE(cfg, c), mudou = chaveCatDRE(c) in mapa;
              return (
                <tr key={c} className="border-b last:border-0">
                  <td className="px-4 py-1.5">{c}{mudou && <span className="ml-2 text-xs text-warning">alterada</span>}</td>
                  <td className="px-4 py-1.5">
                    <select value={g} onChange={(e) => reclassificar(c, e.target.value as GrupoDRE)} className="rounded-md border bg-background px-2 py-1">
                      {GRUPOS_DRE.map((x) => <option key={x.id} value={x.id}>{x.rotulo}{x.id === grupoPadraoDRE(c) ? " (padrão)" : ""}</option>)}
                    </select>
                  </td>
                  <td className="num px-4 py-1.5 text-right text-negative">{formatarNumero(-(total.t.porCatEscritorio[c] ?? 0))}</td>
                </tr>
              );
            })}
            {!catsEsc.size && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Nenhuma categoria de saída do escritório cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}

function SugestaoIA({ cats, cfg, aplicar }: { cats: string[]; cfg: Config; aplicar: (cat: string, g: GrupoDRE) => void }) {
  const chamar = useServerFn(sugerirDRE);
  const [cat, setCat] = useState("");
  const [desc, setDesc] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<{ cat: string; grupo: GrupoDRE; motivo: string } | null>(null);
  const pedir = async () => {
    setOcupado(true); setRes(null);
    try {
      const r = await chamar({ data: { categoria: cat.trim(), descricao: desc.trim() } });
      setRes({ cat: cat.trim(), ...r });
    } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  };
  const existente = cats.find((c) => chaveCatDRE(c) === chaveCatDRE(res?.cat ?? ""));
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" />Sugerir linha da DRE com IA</h2>
        <p className="text-xs text-muted-foreground">Descreva a despesa e a IA indica em qual linha da DRE ela deve entrar. Você decide se aplica.</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-[14rem_1fr_auto] md:items-start">
        <div>
          <input list="dre-cats" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Categoria (ex.: CONTADOR)" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <datalist id="dre-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={1000}
          placeholder="O que é essa despesa? Ex.: mensalidade do sistema de folha de pagamento usado pela equipe" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <Button onClick={pedir} disabled={ocupado || desc.trim().length < 3}>{ocupado ? "Consultando…" : "Sugerir"}</Button>
      </div>
      {res && (
        <div className="flex flex-wrap items-center gap-3 border-t bg-primary/5 px-4 py-3 text-sm">
          <div className="flex-1">
            <div><span className="text-muted-foreground">Sugestão:</span> <b>{rotuloGrupo(res.grupo)}</b>
              {existente && grupoDRE(cfg, existente) === res.grupo && <span className="ml-2 text-xs text-muted-foreground">(já está nessa linha)</span>}</div>
            {res.motivo && <div className="text-xs text-muted-foreground">{res.motivo}</div>}
          </div>
          {existente ? (
            <Button size="sm" variant="outline" disabled={grupoDRE(cfg, existente) === res.grupo}
              onClick={() => { aplicar(existente, res.grupo); toast.success(`${existente} → ${rotuloGrupo(res.grupo)}`); }}>Aplicar a {existente}</Button>
          ) : <span className="text-xs text-muted-foreground">{res.cat ? "Categoria ainda não existe no cadastro — a sugestão será aplicada quando você usar este nome." : ""}</span>}
          {!existente && res.cat && <Button size="sm" variant="outline" onClick={() => { aplicar(res.cat, res.grupo); toast.success("Classificação guardada"); }}>Guardar mesmo assim</Button>}
        </div>
      )}
    </div>
  );
}

function Ind({ rotulo, v, extra, forte }: { rotulo: string; v: number; extra?: string; forte?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={`num ${forte ? "text-xl font-semibold" : "text-lg"} ${v < 0 ? "text-negative" : forte ? "text-primary" : ""}`}>{formatarBRL(v)}</div>
      {extra && <div className="num text-xs text-muted-foreground">{extra}</div>}
    </div>
  );
}

const GRUPO_POR_NOME: Record<string, GrupoDRE> = Object.fromEntries(
  GRUPOS_DRE.flatMap((g) => [[norm(g.rotulo), g.id], [g.id, g.id]]),
);
function acharGrupo(v: unknown): GrupoDRE | null {
  const t = norm(v);
  if (!t) return null;
  if (GRUPO_POR_NOME[t]) return GRUPO_POR_NOME[t]!;
  if (t.includes("IMPOSTO")) return "IMP";
  if (t.includes("PESSOAL")) return "PES";
  if (t.includes("SOCIO")) return "SOC";
  if (t.includes("FINANC") || t.includes("INVEST")) return "FIN";
  if (t.includes("DESPESA") || t.includes("OPERAC")) return "DESP";
  return null;
}

function BotaoImportar(_: { cfg: Config; cats: string[]; salvar: (v: Partial<Config>) => unknown }) {
  return <LinkImportar tipo="dre" rotulo="Importar classificação" />;
}
