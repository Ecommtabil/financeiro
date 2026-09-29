import { createFileRoute } from "@tanstack/react-router";
import { LinkImportar } from "@/components/link-importar";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { daArea, useArea, usePeriodo } from "@/components/app-shell";
import { useConfig } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { formatarBRL, formatarMes, formatarNumero, normalizarBanco } from "@/lib/format";
import { chaveBaixa, chaveMes, contasDoMes, mapaBaixas, saldosAtuais, situacaoConta, type Baixa, type Conta, type SituacaoConta } from "@/lib/calc";
import { baixarModeloSituacao, importarBaixas, importarSaldos, useBaixar, useBaixas, useEditarBaixa, useEstornar, useSaldos, useSalvarSaldo } from "@/lib/situacao";
import { norm, paraNumero } from "@/lib/importacao";

export const Route = createFileRoute("/_authenticated/situacao")({
  head: () => ({
    meta: [
      { title: "Situação atual · Fluxo Escritório & Casa" },
      { name: "description", content: "Saldos bancários, contas a receber e a pagar do mês e baixas." },
      { property: "og:title", content: "Situação atual · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Saldos bancários, contas a receber e a pagar do mês e baixas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Situacao,
});

function Situacao() {
  const { horizonte: h } = usePeriodo();
  const { data: cfg } = useConfig();
  const ent = useLista("entradas"), sai = useLista("saidas"), pes = useLista("entradas_pessoais");
  const saldos = useSaldos(), baixas = useBaixas();
  const hoje = new Date();
  const kHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [mesSel, setMesSel] = useState<string | null>(null);
  const area = useArea();

  const dados = useMemo(() => (ent.data && sai.data && pes.data ? { entradas: ent.data, saidas: sai.data, pessoais: pes.data } : null), [ent.data, sai.data, pes.data]);
  const mb = useMemo(() => mapaBaixas(baixas.data ?? []), [baixas.data]);

  const calc = useMemo(() => {
    if (!h || !cfg || !dados || !saldos.data || !baixas.data) return null;
    const chaves = h.meses.map(chaveMes);
    const mes = mesSel && chaves.includes(mesSel) ? mesSel : chaves.includes(kHoje) ? kHoje : chaves[0]!;
    const destS = new Map(dados.saidas.map((s) => [s.id, s.destino]));
    let abertoR = 0, abertoP = 0;
    let doMes = { receber: [] as Conta[], pagar: [] as Conta[] };
    for (const m of h.meses) {
      const k = chaveMes(m);
      if (k > mes) break;
      const c0 = contasDoMes(m, dados, cfg, h);
      const c = {
        receber: c0.receber.filter((x) => (x.tipo === "pessoal") === (area === "PESSOAL")),
        pagar: c0.pagar.filter((x) => daArea(destS.get(x.id), area)),
      };
      if (k === mes) doMes = c;
      for (const x of c.receber) if (!mb.has(chaveBaixa(x.tipo, x.id, x.mes))) abertoR += x.valor;
      for (const x of c.pagar) if (!mb.has(chaveBaixa(x.tipo, x.id, x.mes))) abertoP += x.valor;
    }
    const sa = saldosAtuais(saldos.data, baixas.data);
    const bancos = new Set<string>(sa.keys());
    for (const b of [...dados.entradas, ...dados.saidas, ...dados.pessoais].map((x) => x.banco)) if (b?.trim()) bancos.add(normalizarBanco(b));
    const saldoTotal = [...sa.values()].reduce((t, x) => t + x.atual, 0);
    const pago = (l: Conta[]) => l.reduce((t, c) => t + Number(mb.get(chaveBaixa(c.tipo, c.id, c.mes))?.valor ?? 0), 0);
    return { mes, chaves, doMes, abertoR, abertoP, sa, bancos: [...bancos].sort(), saldoTotal, recebido: pago(doMes.receber), pagoMes: pago(doMes.pagar) };
  }, [h, cfg, dados, saldos.data, baixas.data, mb, mesSel, kHoje, area]);

  if (!h || !calc || !dados) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;
  const [ano, mm] = calc.mes.split("-").map(Number);

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <select value={calc.mes} onChange={(e) => setMesSel(e.target.value)} className="rounded-md border bg-card px-3 py-1.5 text-base font-semibold">
          {calc.chaves.map((k) => { const [a, m] = k.split("-").map(Number); return <option key={k} value={k}>{formatarMes(a!, m!)}{k === kHoje ? " (atual)" : ""}</option>; })}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <BotaoImportar rotulo="Importar saldos" tipo="saldos" acao={importarSaldos} />
          <BotaoImportar rotulo="Importar baixas" tipo="baixas" acao={(f) => importarBaixas(f, h.base.ano, dados)} />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Saldos bancários</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {calc.bancos.map((b) => <CartaoBanco key={b} banco={b} info={calc.sa.get(b)} />)}
          <NovoBanco />
        </div>
      </section>

      <div className="surface-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-5 py-4">
        <Ind rotulo="Saldo em bancos" v={calc.saldoTotal} /><Op>+</Op>
        <Ind rotulo="A receber em aberto" v={calc.abertoR} /><Op>−</Op>
        <Ind rotulo="A pagar em aberto" v={calc.abertoP} /><Op>=</Op>
        <Ind rotulo={`Posição ao fim de ${formatarMes(ano!, mm!)}`} v={calc.saldoTotal + calc.abertoR - calc.abertoP} forte />
        <span className="mx-2 h-8 w-px bg-border" />
        <Ind rotulo="Já recebido" v={calc.recebido} />
        <Ind rotulo="Já pago" v={calc.pagoMes} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Em aberto inclui este mês e os meses anteriores ainda não baixados desde o início da projeção.</p>

      <div className="grid gap-5 xl:grid-cols-2">
        <ListaContas titulo="A receber" verbo="Receber" contas={calc.doMes.receber} mb={mb} hoje={hoje} comGrupo />
        <ListaContas titulo="A pagar" verbo="Pagar" contas={calc.doMes.pagar} mb={mb} hoje={hoje} />
      </div>
    </div>
  );
}

/* ---------------- saldos ---------------- */
function CartaoBanco({ banco, info }: { banco: string; info: { informado: number; atual: number; saldo?: { atualizado_em: string } } | undefined }) {
  const salvar = useSalvarSaldo();
  return (
    <div className="surface-card rounded-lg border bg-card p-4">
      <div className="text-sm font-semibold">{banco}</div>
      <div className="mt-2 text-xs text-muted-foreground">Saldo informado{info?.saldo ? ` em ${new Date(info.saldo.atualizado_em).toLocaleDateString("pt-BR")}` : ""}</div>
      <CampoNum valor={info?.informado ?? null} onSalvar={(n) => salvar.mutate({ banco, saldo: n })} className="mt-1 w-full" />
      <div className={`num mt-2 text-sm ${info && info.atual < 0 ? "text-negative" : ""}`}>Atual: {info ? formatarBRL(info.atual) : "—"}</div>
    </div>
  );
}

function NovoBanco() {
  const [nome, setNome] = useState(""), [valor, setValor] = useState("");
  const salvar = useSalvarSaldo();
  return (
    <form className="rounded-lg border border-dashed p-4" onSubmit={(e) => {
      e.preventDefault();
      if (!nome.trim()) return;
      salvar.mutate({ banco: nome, saldo: paraNumero(valor) ?? 0 });
      setNome(""); setValor("");
    }}>
      <div className="text-sm font-semibold text-muted-foreground">Adicionar banco</div>
      <Input className="mt-2 h-8" placeholder="Nome do banco" value={nome} onChange={(e) => setNome(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <Input className="num h-8" placeholder="Saldo 0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
        <Button size="sm" type="submit"><Plus className="size-4" /></Button>
      </div>
    </form>
  );
}

/* ---------------- listas ---------------- */
const chipSit: Record<SituacaoConta | "Parcial", string> = {
  Baixado: "bg-positive/15 text-positive",
  Parcial: "bg-warning/15 text-warning",
  Vencido: "bg-negative/15 text-negative",
  "Em aberto": "bg-muted text-muted-foreground",
};
function Chip({ s }: { s: SituacaoConta | "Parcial" }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${chipSit[s]}`}>{s}</span>;
}

type Grupo = { chave: string; nome: string; contas: Conta[] };
function agrupar(contas: Conta[]): Grupo[] {
  const m = new Map<string, Conta[]>();
  for (const c of contas) {
    const k = c.grupo?.trim() ? `G|${norm(c.grupo).replace(/\s/g, "")}` : `I|${c.id}`;
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return [...m.entries()].map(([chave, cs]) => {
    if (chave.startsWith("I|")) return { chave, nome: cs[0]!.nome, contas: cs };
    const cont = new Map<string, number>();
    for (const c of cs) cont.set(c.grupo!.trim(), (cont.get(c.grupo!.trim()) ?? 0) + 1);
    return { chave, nome: [...cont.entries()].sort((a, b) => b[1] - a[1])[0]![0], contas: cs };
  });
}

function ListaContas({ titulo, verbo, contas, mb, hoje, comGrupo }: { titulo: string; verbo: string; contas: Conta[]; mb: Map<string, Baixa>; hoje: Date; comGrupo?: boolean }) {
  const [filtro, setFiltro] = useState<"aberto" | "todos">("aberto");
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"cliente" | "grupo">("cliente");
  const baixar = useBaixar(), estornar = useEstornar();
  const sit = (c: Conta) => situacaoConta(c, mb, hoje);
  const b = norm(busca);
  const visiveis = contas.filter((c) => (!b || norm(c.nome).includes(b) || norm(c.grupo).includes(b)) && (filtro === "todos" || sit(c) !== "Baixado"));
  const abertas = contas.filter((c) => sit(c) !== "Baixado");
  const total = visiveis.reduce((t, c) => t + c.valor, 0);

  const porDia = new Map<number, Conta[]>();
  for (const c of [...visiveis].sort((x, y) => (x.dia ?? 99) - (y.dia ?? 99) || x.nome.localeCompare(y.nome))) porDia.set(c.dia ?? 0, [...(porDia.get(c.dia ?? 0) ?? []), c]);

  return (
    <section className="surface-card flex flex-col rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 className="text-base font-semibold">{titulo}</h2>
        <span className="num text-sm text-muted-foreground">{formatarBRL(total)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {comGrupo && <Alterna valor={modo} opcoes={[["cliente", "Por cliente"], ["grupo", "Por grupo"]]} onChange={setModo} />}
          <Alterna valor={filtro} opcoes={[["aberto", "Em aberto"], ["todos", "Todos"]]} onChange={setFiltro} />
          <BotaoConfirmar disabled={!abertas.length} onConfirmar={() => baixar.mutate(abertas)}>{verbo} todos</BotaoConfirmar>
        </div>
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {!visiveis.length && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conta.</p>}
        {modo === "grupo" && comGrupo
          ? agrupar(visiveis).sort((x, y) => x.nome.localeCompare(y.nome)).map((g) => <LinhaGrupo key={g.chave} g={g} mb={mb} sit={sit} verbo={verbo} />)
          : [...porDia.entries()].map(([dia, cs]) => (
              <div key={dia}>
                <div className="flex justify-between bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  <span>{dia ? `Dia ${dia}` : "Sem dia"}</span>
                  <span className="num">{formatarNumero(cs.reduce((t, c) => t + c.valor, 0))}</span>
                </div>
                {cs.map((c) => <LinhaConta key={c.tipo + c.id} c={c} mb={mb} s={sit(c)} verbo={verbo} />)}
              </div>
            ))}
      </div>
      {(baixar.isError || estornar.isError) && <p className="px-4 py-2 text-sm text-negative">Não consegui gravar. Tente de novo.</p>}
    </section>
  );
}

function LinhaConta({ c, mb, s, verbo, recuo }: { c: Conta; mb: Map<string, Baixa>; s: SituacaoConta; verbo: string; recuo?: boolean }) {
  const baixar = useBaixar(), estornar = useEstornar(), editar = useEditarBaixa();
  const bx = mb.get(chaveBaixa(c.tipo, c.id, c.mes));
  return (
    <div className={`flex items-center gap-3 border-b border-border/60 px-4 py-2 text-sm ${recuo ? "pl-10" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate">{c.nome} {c.tipo === "pessoal" && <span className="chip-pessoal ml-1">pessoal</span>}</div>
        <div className="text-xs text-muted-foreground">{c.banco ?? "Sem banco"}{c.dia && recuo ? ` · dia ${c.dia}` : ""}</div>
      </div>
      <Chip s={s} />
      {bx
        ? <CampoNum valor={Number(bx.valor)} onSalvar={(n) => editar.mutate({ id: bx.id, valor: n })} className="w-28" />
        : <span className="num w-28 text-right">{formatarNumero(c.valor)}</span>}
      {bx
        ? <Button size="sm" variant="ghost" onClick={() => estornar.mutate([bx.id])}>Estornar</Button>
        : <Button size="sm" variant="outline" onClick={() => baixar.mutate([c])}>{verbo}</Button>}
    </div>
  );
}

function LinhaGrupo({ g, mb, sit, verbo }: { g: Grupo; mb: Map<string, Baixa>; sit: (c: Conta) => SituacaoConta; verbo: string }) {
  const [aberto, setAberto] = useState(false);
  const baixar = useBaixar(), estornar = useEstornar();
  if (g.contas.length === 1 && g.chave.startsWith("I|")) return <LinhaConta c={g.contas[0]!} mb={mb} s={sit(g.contas[0]!)} verbo={verbo} />;
  const ss = g.contas.map(sit);
  const nb = ss.filter((s) => s === "Baixado").length;
  const s: SituacaoConta | "Parcial" = nb === ss.length ? "Baixado" : nb > 0 ? "Parcial" : ss.includes("Vencido") ? "Vencido" : "Em aberto";
  const emAberto = g.contas.filter((c) => sit(c) !== "Baixado");
  const dias = [...new Set(g.contas.map((c) => c.dia).filter(Boolean))].sort((a, b) => a! - b!);
  const ids = g.contas.map((c) => mb.get(chaveBaixa(c.tipo, c.id, c.mes))?.id).filter(Boolean) as string[];
  return (
    <div className="border-b border-border/60">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <button className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => setAberto(!aberto)}>
          {aberto ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <div className="min-w-0">
            <div className="truncate font-medium">{g.nome}</div>
            <div className="text-xs text-muted-foreground">{g.contas.length} empresas · {dias.length ? `dia ${dias.join(", ")}` : "sem dia"}</div>
          </div>
        </button>
        <Chip s={s} />
        <span className="num w-28 text-right">{formatarNumero(emAberto.reduce((t, c) => t + c.valor, 0))}</span>
        {emAberto.length
          ? <Button size="sm" variant="outline" onClick={() => baixar.mutate(emAberto)}>{verbo} grupo</Button>
          : <Button size="sm" variant="ghost" onClick={() => estornar.mutate(ids)}>Estornar grupo</Button>}
      </div>
      {aberto && g.contas.map((c) => <LinhaConta key={c.id} c={c} mb={mb} s={sit(c)} verbo={verbo} recuo />)}
    </div>
  );
}

/* ---------------- pequenos ---------------- */
function Alterna<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {opcoes.map(([v, r]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`rounded px-2 py-1 text-xs font-medium ${valor === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{r}</button>
      ))}
    </div>
  );
}

function CampoNum({ valor, onSalvar, className = "" }: { valor: number | null; onSalvar: (n: number) => void; className?: string }) {
  return (
    <Input key={valor ?? "x"} className={`num h-8 text-right ${className}`} defaultValue={valor == null ? "" : formatarNumero(valor)} placeholder="0,00"
      onBlur={(e) => { const n = paraNumero(e.target.value); if (n != null && n !== valor) onSalvar(n); }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

function BotaoImportar({ rotulo, tipo }: { rotulo: string; tipo: "saldos" | "baixas"; acao?: (f: File) => unknown }) {
  return <LinkImportar tipo={tipo} rotulo={rotulo} />;
}

function Op({ children }: { children: string }) {
  return <span className="num text-2xl text-muted-foreground">{children}</span>;
}
function Ind({ rotulo, v, forte }: { rotulo: string; v: number; forte?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={`num ${forte ? "text-2xl font-semibold" : "text-lg"} ${v < 0 ? "text-negative" : ""}`}>{formatarBRL(v)}</div>
    </div>
  );
}
