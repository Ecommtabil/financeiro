import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePeriodo } from "@/components/app-shell";
import { ChipDestino } from "@/components/valor";
import { useConfig } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { formatarBRL, formatarMes, normalizarBanco } from "@/lib/format";
import { chaveBaixa, chaveMes, contasDoMes, destinoSaida, mapaBaixas, situacaoConta, type Conta, type SituacaoConta } from "@/lib/calc";
import { useBaixas } from "@/lib/situacao";
import { norm } from "@/lib/importacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: "Contas a pagar e receber · Fluxo Escritório & Casa" },
      { name: "description", content: "Relatório de contas a receber e a pagar por vencimento e por grupo." },
      { property: "og:title", content: "Contas a pagar e receber · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Relatório de contas a receber e a pagar por vencimento e por grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contas,
});

type Linha = Conta & { exibido: number; situacao: SituacaoConta; destino: "ESCRITORIO" | "PESSOAL"; detalhe: string; grupoNome: string };
const rotMes = (k: string) => { const [a, m] = k.split("-").map(Number); return formatarMes(a!, m!); };

function ChipSituacao({ s }: { s: SituacaoConta }) {
  return <span className={cn("chip-base", s === "Baixado" ? "text-positive" : s === "Vencido" ? "text-negative" : "text-muted-foreground")}>{s === "Vencido" ? "Vencida" : s === "Baixado" ? "Baixada" : s}</span>;
}

function Contas() {
  const { horizonte: h, periodo } = usePeriodo();
  const { data: cfg } = useConfig();
  const ent = useLista("entradas"), sai = useLista("saidas"), pes = useLista("entradas_pessoais");
  const baixas = useBaixas();
  const [lado, setLado] = useState<"receber" | "pagar">("receber");
  const [vista, setVista] = useState<"venc" | "grupo">("venc");
  const [de, setDe] = useState(""), [ate, setAte] = useState("");
  const [destino, setDestino] = useState<"todos" | "ESCRITORIO" | "PESSOAL">("todos");
  const [sit, setSit] = useState<"todas" | SituacaoConta>("todas");
  const [busca, setBusca] = useState("");

  const chaves = useMemo(() => (h ? h.meses.map(chaveMes) : []), [h]);
  useEffect(() => {
    if (!chaves.length) return;
    const doAno = periodo === "todos" ? chaves : chaves.filter((k) => k.startsWith(`${periodo}-`));
    setDe(doAno[0]!); setAte(doAno[doAno.length - 1]!);
  }, [periodo, chaves]);

  const linhas = useMemo<Linha[]>(() => {
    if (!h || !cfg || !ent.data || !sai.data || !pes.data || !baixas.data || !de) return [];
    const d = { entradas: ent.data, saidas: sai.data, pessoais: pes.data };
    const mb = mapaBaixas(baixas.data);
    const mE = new Map(ent.data.map((e) => [e.id, e])), mS = new Map(sai.data.map((s) => [s.id, s]));
    const out: Linha[] = [];
    for (const m of h.meses) {
      const k = chaveMes(m);
      if (k < de || k > ate) continue;
      const c = contasDoMes(m, d, cfg, h);
      for (const x of lado === "receber" ? c.receber : c.pagar) {
        const b = mb.get(chaveBaixa(x.tipo, x.id, x.mes));
        let dst: "ESCRITORIO" | "PESSOAL" = "ESCRITORIO", detalhe = "", grupoNome = "";
        if (x.tipo === "entrada") { const e = mE.get(x.id); detalhe = [e?.carteira, e?.grupo].filter(Boolean).join(" · "); grupoNome = e?.grupo?.trim() || "Sem grupo"; }
        else if (x.tipo === "pessoal") { dst = "PESSOAL"; detalhe = "Entrada pessoal"; grupoNome = "Entradas pessoais"; }
        else { const s = mS.get(x.id)!; dst = destinoSaida(s); detalhe = [s.categoria, s.pgto].filter(Boolean).join(" · "); grupoNome = s.categoria?.trim() || "Sem categoria"; }
        out.push({ ...x, banco: x.banco ? normalizarBanco(x.banco) : null, exibido: b ? Number(b.valor) : x.valor, situacao: situacaoConta(x, mb), destino: dst, detalhe, grupoNome });
      }
    }
    const q = norm(busca);
    return out
      .filter((l) => (destino === "todos" || l.destino === destino) && (sit === "todas" || l.situacao === sit))
      .filter((l) => !q || norm(`${l.nome} ${l.detalhe} ${l.grupoNome} ${l.banco ?? ""}`).includes(q))
      .sort((a, b) => a.mes.localeCompare(b.mes) || (a.dia ?? 99) - (b.dia ?? 99) || a.nome.localeCompare(b.nome));
  }, [h, cfg, ent.data, sai.data, pes.data, baixas.data, de, ate, lado, destino, sit, busca]);

  if (!h || !cfg) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;

  const soma = (f: (l: Linha) => boolean) => linhas.filter(f).reduce((t, l) => t + l.exibido, 0);
  const ind = [
    ["Total", soma(() => true)], ["Em aberto", soma((l) => l.situacao === "Em aberto")],
    ["Vencidas", soma((l) => l.situacao === "Vencido")], ["Baixadas", soma((l) => l.situacao === "Baixado")],
  ] as const;
  const vistaEf = lado === "receber" ? vista : "venc";
  const sel = "rounded-md border bg-card px-2 py-1.5 text-sm";
  const toggle = (ativo: boolean) => cn("rounded px-3 py-1.5 text-sm font-medium", ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-5 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border bg-card p-0.5">
          <button className={toggle(lado === "receber")} onClick={() => setLado("receber")}>A receber</button>
          <button className={toggle(lado === "pagar")} onClick={() => setLado("pagar")}>A pagar</button>
        </div>
        {lado === "receber" && (
          <div className="flex rounded-md border bg-card p-0.5">
            <button className={toggle(vista === "venc")} onClick={() => setVista("venc")}>Por vencimento</button>
            <button className={toggle(vista === "grupo")} onClick={() => setVista("grupo")}>Por grupo</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">De<br />
          <select className={sel} value={de} onChange={(e) => setDe(e.target.value)}>{chaves.map((k) => <option key={k} value={k}>{rotMes(k)}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Até<br />
          <select className={sel} value={ate} onChange={(e) => setAte(e.target.value)}>{chaves.filter((k) => k >= de).map((k) => <option key={k} value={k}>{rotMes(k)}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Destino<br />
          <select className={sel} value={destino} onChange={(e) => setDestino(e.target.value as typeof destino)}>
            <option value="todos">Todos</option><option value="ESCRITORIO">Escritório</option><option value="PESSOAL">Pessoal</option></select></label>
        <label className="text-xs text-muted-foreground">Situação<br />
          <select className={sel} value={sit} onChange={(e) => setSit(e.target.value as typeof sit)}>
            <option value="todas">Todas</option><option value="Em aberto">Em aberto</option><option value="Vencido">Vencidas</option><option value="Baixado">Baixadas</option></select></label>
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome, grupo, categoria ou banco" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ind.map(([r, v]) => (
          <div key={r} className="surface-card p-4">
            <div className="label-eyebrow">{r}</div>
            <div className={cn("num mt-1 text-xl font-semibold", r === "Vencidas" && v > 0 && "text-negative", r === "Baixadas" && "text-positive")}>{formatarBRL(v)}</div>
          </div>
        ))}
      </div>

      {linhas.length === 0 ? (
        <div className="surface-card p-8 text-center text-muted-foreground">Nenhuma conta neste período com esses filtros.</div>
      ) : vistaEf === "venc" ? <PorVencimento linhas={linhas} lado={lado} /> : <PorGrupo linhas={linhas} />}
    </div>
  );
}

function PorVencimento({ linhas, lado }: { linhas: Linha[]; lado: "receber" | "pagar" }) {
  const meses = [...new Set(linhas.map((l) => l.mes))];
  const total = linhas.reduce((t, l) => t + l.exibido, 0);
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2">Venc.</th><th className="px-3 py-2">{lado === "receber" ? "Cliente" : "Despesa"}</th>
            <th className="px-3 py-2">{lado === "receber" ? "Carteira · grupo" : "Categoria · pagamento"}</th>
            <th className="px-3 py-2">Banco</th><th className="px-3 py-2">Destino</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((k) => {
            const doMes = linhas.filter((l) => l.mes === k);
            const m = k.split("-")[1];
            let diaAnt: number | null | undefined;
            return (
              <Fragment key={k}>
                <tr className="bg-muted/50"><td colSpan={7} className="px-3 py-2 font-semibold">{rotMes(k)}</td></tr>
                {doMes.map((l) => {
                  const novoDia = l.dia !== diaAnt; diaAnt = l.dia;
                  return (
                    <tr key={`${l.tipo}${l.id}${l.mes}`} className={cn("border-b last:border-0", novoDia && "border-t")}>
                      <td className="num px-3 py-1.5">{novoDia ? (l.dia ? `${String(l.dia).padStart(2, "0")}/${m}` : "—") : ""}</td>
                      <td className="px-3 py-1.5">{l.nome}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{l.detalhe || "—"}</td>
                      <td className="px-3 py-1.5">{l.banco ?? "—"}</td>
                      <td className="px-3 py-1.5"><ChipDestino destino={l.destino} /></td>
                      <td className="px-3 py-1.5"><ChipSituacao s={l.situacao} /></td>
                      <td className="num px-3 py-1.5 text-right">{formatarBRL(l.exibido)}</td>
                    </tr>
                  );
                })}
                <tr className="border-b"><td colSpan={6} className="px-3 py-1.5 text-right text-xs text-muted-foreground">Subtotal {rotMes(k)}</td>
                  <td className="num px-3 py-1.5 text-right font-semibold">{formatarBRL(doMes.reduce((t, l) => t + l.exibido, 0))}</td></tr>
              </Fragment>
            );
          })}
          <tr className="bg-muted"><td colSpan={6} className="px-3 py-2 text-right font-semibold">Total do período</td>
            <td className="num px-3 py-2 text-right font-bold">{formatarBRL(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function PorGrupo({ linhas }: { linhas: Linha[] }) {
  const meses = [...new Set(linhas.map((l) => l.mes))];
  const grupos = [...new Set(linhas.map((l) => l.grupoNome))].sort((a, b) => a.localeCompare(b));
  const cel = (g: string | null, k: string | null) => linhas.filter((l) => (g == null || l.grupoNome === g) && (k == null || l.mes === k)).reduce((t, l) => t + l.exibido, 0);
  const situ = (g: string) => {
    const ls = linhas.filter((l) => l.grupoNome === g);
    if (ls.some((l) => l.situacao === "Vencido")) return "Vencido";
    return ls.every((l) => l.situacao === "Baixado") ? "Baixado" : "Em aberto";
  };
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="sticky left-0 bg-card px-3 py-2 text-left">Grupo</th>
            {meses.map((k) => <th key={k} className="px-3 py-2 text-right">{rotMes(k)}</th>)}
            <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-left">Situação</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g} className="border-b">
              <td className="sticky left-0 bg-card px-3 py-1.5">{g}</td>
              {meses.map((k) => <td key={k} className="num px-3 py-1.5 text-right">{cel(g, k) ? formatarBRL(cel(g, k)) : "—"}</td>)}
              <td className="num px-3 py-1.5 text-right font-semibold">{formatarBRL(cel(g, null))}</td>
              <td className="px-3 py-1.5"><ChipSituacao s={situ(g)} /></td>
            </tr>
          ))}
          <tr className="bg-muted font-semibold">
            <td className="sticky left-0 bg-muted px-3 py-2">Total</td>
            {meses.map((k) => <td key={k} className="num px-3 py-2 text-right">{formatarBRL(cel(null, k))}</td>)}
            <td className="num px-3 py-2 text-right">{formatarBRL(cel(null, null))}</td><td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
