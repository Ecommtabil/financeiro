import { createFileRoute } from "@tanstack/react-router";
import { LinkImportar } from "@/components/link-importar";
import { Fragment, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArea, usePeriodo } from "@/components/app-shell";
import { useConfig, useSalvarConfig, type Config } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { formatarBRL, formatarMes, formatarNumero } from "@/lib/format";
import {
  CHAVE_CAT_PESSOAL, chaveCatEntrada, chaveCatSaida, chaveMes, destinoSaida, fator, regraDo, somar, totaisDoMes,
  valorEntrada, valorEntradaPessoal, valorSaida, type Regra, type TotaisMes,
} from "@/lib/calc";
import type { MesRef } from "@/lib/horizonte";
import { acharCabecalho, lerPlanilha, norm, paraNumero } from "@/lib/importacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projecao")({
  head: () => ({
    meta: [
      { title: "Projeção · Fluxo Escritório & Casa" },
      { name: "description", content: "Projeção com reajustes anuais: o que sobe, impacto no ano e resumo por ano." },
      { property: "og:title", content: "Projeção · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Projeção com reajustes anuais: o que sobe, impacto no ano e resumo por ano." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Projecao,
});

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const GRUPOS = [
  { g: "E", nome: "Entradas do escritório", tipo: "E" as const },
  { g: "SE", nome: "Saídas do escritório", tipo: "S" as const },
  { g: "SP", nome: "Saídas pessoais", tipo: "S" as const },
  { g: "EP", nome: "Entradas pessoais", tipo: "E" as const },
];
type Item = { id: string; nome: string; g: string; tipo: "E" | "S"; cat: string; catKey: string; valor: (k: string) => number };
type LinhaItem = Item & { r: Required<Regra>; excecao: boolean; base: number; novo: number; total: number; impactoAno: number; semValorReaj: boolean };

const sinal = (v: number) => (v > 0 ? "+" : "") + formatarNumero(v);

function Projecao() {
  const { horizonte: h } = usePeriodo();
  const { data: cfg } = useConfig();
  const salvar = useSalvarConfig();
  const ent = useLista("entradas"), sai = useLista("saidas"), pes = useLista("entradas_pessoais");
  const [anoSel, setAnoSel] = useState<number | null>(null);
  const [grupoF, setGrupoF] = useState("todos");
  const area = useArea();
  const gruposArea = area === "PESSOAL" ? ["SP", "EP"] : ["E", "SE"];
  const [busca, setBusca] = useState("");

  const dados = useMemo(() => (ent.data && sai.data && pes.data ? { entradas: ent.data, saidas: sai.data, pessoais: pes.data } : null), [ent.data, sai.data, pes.data]);

  const itens = useMemo<Item[]>(() => {
    if (!dados) return [];
    return [
      ...dados.entradas.map((e) => ({ id: e.id, nome: e.empresa, g: "E", tipo: "E" as const, cat: e.carteira?.trim() || "Sem carteira", catKey: chaveCatEntrada(e), valor: (k: string) => valorEntrada(e, k) })),
      ...dados.saidas.map((s) => ({ id: s.id, nome: s.descricao, g: destinoSaida(s) === "PESSOAL" ? "SP" : "SE", tipo: "S" as const, cat: s.categoria?.trim() || "Sem categoria", catKey: chaveCatSaida(s), valor: (k: string) => valorSaida(s, k) })),
      ...dados.pessoais.map((p) => ({ id: p.id, nome: p.descricao, g: "EP", tipo: "E" as const, cat: "Entradas pessoais", catKey: CHAVE_CAT_PESSOAL, valor: (k: string) => valorEntradaPessoal(p, k) })),
    ];
  }, [dados]);

  const anosAnalise = h ? h.anos.filter((a) => a.ano >= h.y0) : [];
  const ano = anoSel && anosAnalise.some((a) => a.ano === anoSel) ? anoSel : anosAnalise[0]?.ano ?? 0;

  const calc = useMemo(() => {
    if (!h || !cfg || !dados || !ano) return null;
    const rm = cfg.reajuste_mes;
    const mesesAno: MesRef[] = Array.from({ length: 12 }, (_, i) => ({ ano, mes: i + 1 }));
    const dezAnt: MesRef = { ano: ano - 1, mes: 12 };
    const itensExt = (cfg.regras_item ?? {}) as Record<string, Regra>;
    const linhas: LinhaItem[] = [];
    for (const it of itens) {
      const r = regraDo(cfg, it.id, it.catKey, it.tipo);
      const fAnt = fator(dezAnt, h.y0, rm, r);
      let total = 0, nivelAnt = 0;
      for (const m of mesesAno) { const v = it.valor(chaveMes(m)); total += v * fator(m, h.y0, rm, r); nivelAnt += v * fAnt; }
      if (!total && !nivelAnt) continue;
      const mr: MesRef = { ano, mes: rm }, vr = it.valor(chaveMes(mr));
      linhas.push({ ...it, r, excecao: it.id in itensExt, base: vr * fAnt, novo: vr * fator(mr, h.y0, rm, r), total, impactoAno: total - nivelAnt, semValorReaj: !vr });
    }
    const semCfg: Config = { ...cfg, regras_item: {}, regras_categoria: {}, indice_padrao_entradas: 0, indice_padrao_saidas: 0 };
    const porMes = new Map(h.meses.map((m) => [chaveMes(m), { com: totaisDoMes(m, dados, cfg, h), sem: totaisDoMes(m, dados, semCfg, h) }]));
    const doAno = (a: number, t: "com" | "sem") => somar(h.meses.filter((m) => m.ano === a).map((m) => porMes.get(chaveMes(m))![t]));
    return { linhas, porMes, doAno, mesesAno };
  }, [h, cfg, dados, itens, ano]);

  if (!h || !cfg || !calc) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;

  const regrasCat = (cfg.regras_categoria ?? {}) as Record<string, Regra>;
  const regrasItem = (cfg.regras_item ?? {}) as Record<string, Regra>;
  const padrao = (tipo: "E" | "S") => Number(tipo === "E" ? cfg.indice_padrao_entradas : cfg.indice_padrao_saidas);
  const ok = { onError: (e: Error) => toast.error(e.message) };

  const mudarCat = (catKey: string, tipo: "E" | "S", nova: Regra) => {
    const atual = regrasCat[catKey] ?? {};
    const r = { indice: atual.indice ?? padrao(tipo), sobe: atual.sobe ?? true, ...nova };
    const ids = new Set(itens.filter((i) => i.catKey === catKey).map((i) => i.id));
    const ri = Object.fromEntries(Object.entries(regrasItem).filter(([id]) => !ids.has(id)));
    salvar.mutate({ regras_categoria: { ...regrasCat, [catKey]: r }, regras_item: ri }, ok);
  };
  const padraoCat = (catKey: string) => { const rc = { ...regrasCat }; delete rc[catKey]; salvar.mutate({ regras_categoria: rc }, ok); };
  const mudarItem = (l: LinhaItem, nova: Regra) => salvar.mutate({ regras_item: { ...regrasItem, [l.id]: { ...l.r, ...nova } } }, ok);
  const usarCat = (id: string) => { const ri = { ...regrasItem }; delete ri[id]; salvar.mutate({ regras_item: ri }, ok); };

  const q = norm(busca);
  const visiveis = calc.linhas.filter((l) => gruposArea.includes(l.g) && (grupoF === "todos" || l.g === grupoF) && (!q || norm(`${l.nome} ${l.cat}`).includes(q)));
  const com = calc.doAno(ano, "com"), sem = calc.doAno(ano, "sem");
  const ultimo = h.anos[h.anos.length - 1]!.ano;
  const sel = "rounded-md border bg-card px-2 py-1.5 text-sm";

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Projeção {h.y0}–{ultimo}</h1>
        <BotaoImportar itens={itens} cfg={cfg} salvar={(v) => salvar.mutateAsync(v)} />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs text-muted-foreground">Ano em análise<br />
          <select className={sel} value={ano} onChange={(e) => setAnoSel(Number(e.target.value))}>{anosAnalise.map((a) => <option key={a.ano} value={a.ano}>{a.ano}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Reajuste a partir de<br />
          <select className={sel} value={cfg.reajuste_mes} onChange={(e) => salvar.mutate({ reajuste_mes: Number(e.target.value) }, ok)}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Índice padrão entradas (%)<br />
          <CampoIndice valor={Number(cfg.indice_padrao_entradas)} salvar={(v) => salvar.mutate({ indice_padrao_entradas: v }, ok)} className="w-24" /></label>
        <label className="text-xs text-muted-foreground">Índice padrão saídas (%)<br />
          <CampoIndice valor={Number(cfg.indice_padrao_saidas)} salvar={(v) => salvar.mutate({ indice_padrao_saidas: v }, ok)} className="w-24" /></label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([["Entradas do ano", com.E, sem.E], ["Saídas escritório", com.SE, sem.SE], ["Lucro", com.L, sem.L],
          ["Saídas pessoais líquidas", com.SP - com.EP, sem.SP - sem.EP], ["Reserva", com.R, sem.R]] as const).map(([r, c, s]) => (
          <div key={r} className="surface-card p-4">
            <div className="label-eyebrow">{r}</div>
            <div className="num mt-1 text-lg font-semibold">{formatarBRL(c)}</div>
            <div className="num text-xs text-muted-foreground">{sinal(c - s)} vs sem reajuste</div>
          </div>
        ))}
      </div>

      <TabelaLinhas titulo="Resumo por ano" colunas={anosAnalise.map((a) => ({ rotulo: String(a.ano), t: calc.doAno(a.ano, "com") }))} acumulada />
      <TabelaLinhas titulo={`Mês a mês · ${ano}`} colunas={calc.mesesAno.map((m) => ({ rotulo: formatarMes(m.ano, m.mes), t: calc.porMes.get(chaveMes(m))!.com }))} total />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sem nenhum reajuste × Com reajustes acumulados · {ano}</h2>
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b text-right"><th className="px-3 py-2 text-left" /><th className="px-3 py-2">Sem nenhum reajuste</th><th className="px-3 py-2">Com reajustes acumulados</th><th className="px-3 py-2">Diferença</th></tr></thead>
            <tbody>{LINHAS.map(([r, f]) => (
              <tr key={r} className="border-b last:border-0"><td className="px-3 py-1.5">{r}</td>
                <td className="num px-3 py-1.5 text-right">{formatarBRL(f(sem))}</td><td className="num px-3 py-1.5 text-right">{formatarBRL(f(com))}</td>
                <td className="num px-3 py-1.5 text-right font-semibold">{sinal(f(com) - f(sem))}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">O que sobe</h2>
          <select className={sel} value={grupoF} onChange={(e) => setGrupoF(e.target.value)}>
            <option value="todos">Todos os grupos</option>{GRUPOS.filter((g) => gruposArea.includes(g.g)).map((g) => <option key={g.g} value={g.g}>{g.nome}</option>)}</select>
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar item ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b text-right">
                <th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Sobe</th><th className="px-3 py-2 text-left">Índice %</th>
                <th className="px-3 py-2">Base/mês</th><th className="px-3 py-2">Novo/mês</th><th className="px-3 py-2">Impacto/mês</th>
                <th className="px-3 py-2">Total do ano</th><th className="px-3 py-2">Impacto no ano</th>
              </tr>
            </thead>
            <tbody>
              {GRUPOS.filter((G) => gruposArea.includes(G.g)).map((G) => {
                const doG = visiveis.filter((l) => l.g === G.g);
                if (!doG.length) return null;
                const cats = [...new Set(doG.map((l) => l.catKey))];
                return (
                  <Fragment key={G.g}>
                    <tr className="bg-muted"><td colSpan={8} className="px-3 py-2 font-bold">{G.nome}</td></tr>
                    {cats.map((ck) => {
                      const ls = doG.filter((l) => l.catKey === ck).sort((a, b) => a.nome.localeCompare(b.nome));
                      const rc = regrasCat[ck], rcEf = { indice: rc?.indice ?? padrao(G.tipo), sobe: rc?.sobe ?? true };
                      const s = (f: (l: LinhaItem) => number) => ls.reduce((t, l) => t + f(l), 0);
                      return (
                        <Fragment key={ck}>
                          <tr className="border-b bg-muted/40 font-semibold">
                            <td className="px-3 py-1.5">{ls[0]!.cat}</td>
                            <td className="px-3 py-1.5"><label className="flex items-center gap-1.5 text-xs font-normal"><input type="checkbox" checked={rcEf.sobe} onChange={(e) => mudarCat(ck, G.tipo, { sobe: e.target.checked })} />Todos sobem</label></td>
                            <td className="px-3 py-1.5"><div className="flex items-center gap-1.5">
                              <CampoIndice valor={rcEf.indice} salvar={(v) => mudarCat(ck, G.tipo, { indice: v })} className="w-20" />
                              {rc && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => padraoCat(ck)}>Padrão</Button>}
                            </div></td>
                            <td className="num px-3 py-1.5 text-right">{formatarBRL(s((l) => l.base))}</td>
                            <td className="num px-3 py-1.5 text-right">{formatarBRL(s((l) => l.novo))}</td>
                            <td className="num px-3 py-1.5 text-right">{sinal(s((l) => l.novo - l.base))}</td>
                            <td className="num px-3 py-1.5 text-right">{formatarBRL(s((l) => l.total))}</td>
                            <td className="num px-3 py-1.5 text-right">{sinal(s((l) => l.impactoAno))}</td>
                          </tr>
                          {ls.map((l) => (
                            <tr key={l.id} className={cn("border-b", l.excecao && "border-l-4 border-l-[var(--warning,oklch(0.6_0.12_75))]")}>
                              <td className="px-3 py-1.5 pl-6">{l.nome}{l.semValorReaj && <span className="chip-base ml-2 text-muted-foreground">termina antes de {MESES[cfg.reajuste_mes - 1]!.slice(0, 3).toLowerCase()}</span>}</td>
                              <td className="px-3 py-1.5"><input type="checkbox" checked={l.r.sobe} onChange={(e) => mudarItem(l, { sobe: e.target.checked })} /></td>
                              <td className="px-3 py-1.5"><div className="flex items-center gap-1.5">
                                <CampoIndice valor={l.r.indice} salvar={(v) => mudarItem(l, { indice: v })} className="w-20" />
                                {l.excecao && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => usarCat(l.id)}>Usar categoria</Button>}
                              </div></td>
                              <td className="num px-3 py-1.5 text-right">{formatarNumero(l.base)}</td>
                              <td className="num px-3 py-1.5 text-right">{formatarNumero(l.novo)}</td>
                              <td className={cn("num px-3 py-1.5 text-right font-semibold", l.novo - l.base !== 0 && "text-primary")}>{sinal(l.novo - l.base)}</td>
                              <td className="num px-3 py-1.5 text-right">{formatarNumero(l.total)}</td>
                              <td className="num px-3 py-1.5 text-right">{sinal(l.impactoAno)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
              {!visiveis.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum item com valor em {ano}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const LINHAS: [string, (t: TotaisMes) => number][] = [
  ["Entradas", (t) => t.E], ["− Saídas escritório", (t) => t.SE], ["= Lucro", (t) => t.L],
  ["+ Entradas pessoais", (t) => t.EP], ["− Saídas pessoais", (t) => t.SP], ["= Reserva", (t) => t.R],
];

function TabelaLinhas({ titulo, colunas, acumulada, total }: { titulo: string; colunas: { rotulo: string; t: TotaisMes }[]; acumulada?: boolean; total?: boolean }) {
  let ac = 0;
  const acum = colunas.map((c) => (ac += c.t.R));
  const tot = somar(colunas.map((c) => c.t));
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="border-b text-right"><th className="sticky left-0 bg-card px-3 py-2" />
            {colunas.map((c) => <th key={c.rotulo} className="px-3 py-2">{c.rotulo}</th>)}{total && <th className="px-3 py-2">Total</th>}</tr></thead>
          <tbody>
            {LINHAS.map(([r, f]) => (
              <tr key={r} className={cn("border-b", r.startsWith("=") && "font-semibold")}>
                <td className="sticky left-0 whitespace-nowrap bg-card px-3 py-1.5">{r}</td>
                {colunas.map((c) => <td key={c.rotulo} className={cn("num whitespace-nowrap px-3 py-1.5 text-right", r.startsWith("=") && f(c.t) < 0 && "text-negative")}>{formatarNumero(f(c.t))}</td>)}
                {total && <td className="num whitespace-nowrap px-3 py-1.5 text-right font-semibold">{formatarNumero(f(tot))}</td>}
              </tr>
            ))}
            {acumulada && (
              <tr className="bg-muted font-semibold"><td className="sticky left-0 bg-muted px-3 py-1.5">Reserva acumulada</td>
                {acum.map((v, i) => <td key={i} className={cn("num whitespace-nowrap px-3 py-1.5 text-right", v < 0 && "text-negative")}>{formatarNumero(v)}</td>)}</tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CampoIndice({ valor, salvar, className }: { valor: number; salvar: (v: number) => void; className?: string }) {
  return (
    <Input key={valor} type="number" step="0.01" defaultValue={valor} className={cn("num h-8", className)}
      onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v) && v !== valor) salvar(v); }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
  );
}

// ---------- importar reajustes ----------
const GRUPO_POR_NOME: Record<string, string> = { "ENTRADAS ESCRITORIO": "E", "SAIDAS ESCRITORIO": "SE", "SAIDAS PESSOAIS": "SP", "ENTRADAS PESSOAIS": "EP" };

function BotaoImportar(_: { itens: Item[]; cfg: Config; salvar: (v: Partial<Config>) => unknown }) {
  return <LinkImportar tipo="reajustes" rotulo="Importar reajustes" />;
}
