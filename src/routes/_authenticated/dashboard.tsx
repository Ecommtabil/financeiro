import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Building2, CalendarDays, House, Landmark, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useArea, usePeriodo } from "@/components/app-shell";
import { useConfig } from "@/lib/config";
import { useLista, type Saida } from "@/lib/dados";
import { useBaixas, useSaldos } from "@/lib/situacao";
import {
  chaveBaixa, chaveCatSaida, chaveMes, contasDoMes, destinoSaida, fator, mapaBaixas,
  regraDo, saldosAtuais, situacaoConta, totaisHorizonte, valorSaida,
  type Conta, type Dados, type SituacaoConta,
} from "@/lib/calc";
import { formatarBRL, formatarMes } from "@/lib/format";
import type { MesRef } from "@/lib/horizonte";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Fluxo Escritório & Casa" },
      { name: "description", content: "Indicadores e gráficos do escritório e das finanças pessoais." },
      { property: "og:title", content: "Dashboard · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Indicadores e gráficos do escritório e das finanças pessoais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

const norm = (v?: string | null) => (v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();
const pct = (v: number, base: number) => base ? `${(v / base * 100).toFixed(1).replace(".", ",")}%` : "—";
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const top = (r: Record<string, number>, limite?: number) => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, limite);
const brlCurto = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);

type Faixas = { baixado: number; aberto: number; vencido: number };
type Serie = { nome: string; valor: number; acumulado?: number };

function DashboardPage() {
  const { horizonte, periodo } = usePeriodo();
  const { data: cfg } = useConfig();
  const entradas = useLista("entradas");
  const saidas = useLista("saidas");
  const pessoais = useLista("entradas_pessoais");
  const saldos = useSaldos();
  const baixas = useBaixas();
  const visao = useArea() === "PESSOAL" ? "pessoal" : "escritorio";
  const mesesDisponiveis = useMemo(() => {
    if (!horizonte) return [];
    return periodo === "todos" ? horizonte.meses : horizonte.meses.filter((m) => m.ano === periodo);
  }, [horizonte, periodo]);
  const [mesKey, setMesKey] = useState("");

  useEffect(() => {
    if (!mesesDisponiveis.length) return;
    if (!mesesDisponiveis.some((m) => chaveMes(m) === mesKey)) {
      const hoje = new Date();
      const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      const escolhido = mesesDisponiveis.find((m) => chaveMes(m) === atual) ?? mesesDisponiveis[0];
      if (escolhido) setMesKey(chaveMes(escolhido));
    }
  }, [mesesDisponiveis, mesKey]);

  if (!horizonte || !cfg) return <EstadoVazio texto="Configure a base zero para abrir o Dashboard." />;
  if (entradas.isLoading || saidas.isLoading || pessoais.isLoading || saldos.isLoading || baixas.isLoading) return <EstadoVazio texto="Carregando Dashboard…" />;

  const mes = mesesDisponiveis.find((m) => chaveMes(m) === mesKey) ?? mesesDisponiveis[0];
  if (!mes) return <EstadoVazio texto="Não há meses neste período." />;
  const dados: Dados = { entradas: entradas.data ?? [], saidas: saidas.data ?? [], pessoais: pessoais.data ?? [] };
  const todasBaixas = baixas.data ?? [];
  const totais = totaisHorizonte(dados, cfg, horizonte);
  const atual = totais.get(chaveMes(mes));
  if (!atual) return <EstadoVazio texto="Não há dados neste mês." />;
  const mesesAno = horizonte.meses.filter((m) => m.ano === mes.ano);
  const mapa = mapaBaixas(todasBaixas);
  const contas = contasDoMes(mes, dados, cfg, horizonte);
  const receberEsc = contas.receber.filter((c) => c.tipo === "entrada");
  const receberPes = contas.receber.filter((c) => c.tipo === "pessoal");
  const destinos = new Map(dados.saidas.map((s) => [s.id, destinoSaida(s)]));
  const pagarEsc = contas.pagar.filter((c) => destinos.get(c.id) !== "PESSOAL");
  const pagarPes = contas.pagar.filter((c) => destinos.get(c.id) === "PESSOAL");
  const saldoBancos = soma([...saldosAtuais(saldos.data ?? [], todasBaixas).values()].map((x) => x.atual));

  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow">Leitura mensal</p>
          <h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={chaveMes(mes)} onValueChange={setMesKey}>
            <SelectTrigger className="w-36 bg-card"><CalendarDays className="size-4" /><SelectValue /></SelectTrigger>
            <SelectContent>{mesesDisponiveis.map((m) => <SelectItem key={chaveMes(m)} value={chaveMes(m)}>{formatarMes(m.ano, m.mes)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {visao === "escritorio" ? (
        <Escritorio dados={dados} cfg={cfg} horizonte={horizonte} mes={mes} mesesAno={mesesAno} atual={atual} totais={totais} receber={receberEsc} pagar={pagarEsc} mapa={mapa} />
      ) : (
        <Pessoal dados={dados} cfg={cfg} horizonte={horizonte} mes={mes} mesesAno={mesesAno} atual={atual} totais={totais} receber={receberPes} pagar={pagarPes} mapa={mapa} saldoBancos={saldoBancos} />
      )}
    </main>
  );
}

type PainelProps = {
  dados: Dados; cfg: NonNullable<ReturnType<typeof useConfig>["data"]>; horizonte: NonNullable<ReturnType<typeof usePeriodo>["horizonte"]>;
  mes: MesRef; mesesAno: MesRef[]; atual: ReturnType<typeof totaisHorizonte> extends Map<string, infer T> ? T : never;
  totais: ReturnType<typeof totaisHorizonte>; receber: Conta[]; pagar: Conta[]; mapa: ReturnType<typeof mapaBaixas>;
};

function Escritorio(p: PainelProps) {
  const { dados, cfg, horizonte, mes, mesesAno, atual, totais, receber, pagar, mapa } = p;
  const grupos: Record<string, number> = {}, setores: Record<string, number> = {};
  for (const e of dados.entradas) {
    const c = contasDoMes(mes, { entradas: [e], saidas: [], pessoais: [] }, cfg, horizonte).receber[0];
    if (!c) continue;
    const grupo = e.grupo?.trim() || e.empresa;
    const chaveGrupo = norm(grupo);
    const existente = Object.keys(grupos).find((x) => norm(x) === chaveGrupo) ?? grupo;
    grupos[existente] = (grupos[existente] ?? 0) + c.valor;
    const setor = e.setor?.trim() || "Sem setor";
    setores[setor] = (setores[setor] ?? 0) + c.valor;
  }
  const maior = top(grupos, 1)[0];
  const folha = Object.entries(atual.porCatEscritorio).filter(([c]) => /FUNCIONARIO|SOCIO|TERCE?IRISTA/.test(norm(c))).reduce((t, [, v]) => t + v, 0);
  const serieLucro = mesesAno.map((m) => ({ nome: formatarMes(m.ano, m.mes), valor: totais.get(chaveMes(m))?.L ?? 0 }));
  const setoresTop = topComOutros(setores, 10);
  const medReceber = faixas(receber, mapa), medPagar = faixas(pagar, mapa);
  const vencimentos = porDia(receber, pagar);
  const terminam = despesasQueTerminam(dados.saidas.filter((s) => destinoSaida(s) === "ESCRITORIO"), cfg, horizonte);

  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Indicador titulo="Receita" valor={formatarBRL(atual.E)} detalhe={`${atual.contratos} contratos ativos`} icone={<Landmark />} />
      <Indicador titulo="Custos" valor={formatarBRL(atual.SE)} detalhe={`${pct(atual.SE, atual.E)} da receita`} />
      <Indicador titulo="Lucro" valor={formatarBRL(atual.L)} detalhe={`${pct(atual.L, atual.E)} de margem`} destaque={atual.L < 0 ? "negativo" : "positivo"} />
      <Indicador titulo="Ticket médio" valor={formatarBRL(atual.contratos ? atual.E / atual.contratos : 0)} detalhe="por contrato" />
      <Indicador titulo="Folha e sócio" valor={formatarBRL(folha)} detalhe={`${pct(folha, atual.E)} da receita`} icone={<Users />} />
      <Indicador titulo="Maior cliente/grupo" valor={maior?.[0] ?? "—"} detalhe={maior ? `${formatarBRL(maior[1])} · ${pct(maior[1], atual.E)}` : "Sem receita"} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2"><Medidor titulo="A receber dos clientes" dados={medReceber} /><Medidor titulo="A pagar do escritório" dados={medPagar} /></div>
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <Secao titulo="Vencimentos por dia"><TabelaDias linhas={vencimentos} /></Secao>
      <Secao titulo={`Lucro do escritório · ${mes.ano}`}><GraficoVertical dados={serieLucro} /></Secao>
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      <Secao titulo="10 maiores grupos de clientes"><GraficoHorizontal dados={top(grupos, 10).map(([nome, valor]) => ({ nome, valor }))} /></Secao>
      <Secao titulo="Receita por setor"><GraficoHorizontal dados={setoresTop} /></Secao>
      <Secao titulo="Custos por categoria"><GraficoHorizontal dados={top(atual.porCatEscritorio).map(([nome, valor]) => ({ nome, valor }))} /></Secao>
    </div>
    <Secao titulo="Custos do escritório que terminam"><ListaTerminos itens={terminam} vazio="Nenhum custo parcelado termina dentro do horizonte." /></Secao>
  </>;
}

function Pessoal(p: PainelProps & { saldoBancos: number }) {
  const { dados, cfg, horizonte, mes, mesesAno, atual, totais, receber, pagar, mapa, saldoBancos } = p;
  const ateMes = horizonte.meses.filter((m) => chaveMes(m) <= chaveMes(mes));
  const acumulada = soma(ateMes.map((m) => totais.get(chaveMes(m))?.R ?? 0));
  let rodando = soma(horizonte.meses.filter((m) => chaveMes(m) < `${mes.ano}-01`).map((m) => totais.get(chaveMes(m))?.R ?? 0));
  const serie = mesesAno.map((m) => { const valor = totais.get(chaveMes(m))?.R ?? 0; rodando += valor; return { nome: formatarMes(m.ano, m.mes), valor, acumulado: rodando }; });
  const medPagar = faixas(pagar, mapa), medReceber = faixas(receber, mapa);
  const despesas: Record<string, number> = {};
  for (const s of dados.saidas.filter((x) => destinoSaida(x) === "PESSOAL")) {
    const c = contasDoMes(mes, { entradas: [], saidas: [s], pessoais: [] }, cfg, horizonte).pagar[0];
    if (c) despesas[s.descricao] = c.valor;
  }
  const terminam = despesasQueTerminam(dados.saidas.filter((s) => destinoSaida(s) === "PESSOAL"), cfg, horizonte);
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Indicador titulo="Lucro do escritório" valor={formatarBRL(atual.L)} destaque={atual.L < 0 ? "negativo" : undefined} />
      <Indicador titulo="Entradas pessoais" valor={formatarBRL(atual.EP)} />
      <Indicador titulo="Saídas pessoais" valor={formatarBRL(atual.SP)} detalhe={`${pct(atual.SP, atual.L + atual.EP)} do que entra`} />
      <Indicador titulo="Reserva do mês" valor={formatarBRL(atual.R)} destaque={atual.R < 0 ? "negativo" : "positivo"} />
      <Indicador titulo="Reserva acumulada" valor={formatarBRL(acumulada)} detalhe="desde o início do horizonte" destaque={acumulada < 0 ? "negativo" : undefined} />
      <Indicador titulo="Saldo em bancos" valor={formatarBRL(saldoBancos)} detalhe="saldo atual" />
    </div>
    <div className="grid gap-4 xl:grid-cols-2"><Medidor titulo="Pagamentos pessoais" dados={medPagar} /><Medidor titulo="Entradas pessoais" dados={medReceber} /></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Secao titulo={`Reserva mês a mês · ${mes.ano}`}><GraficoVertical dados={serie} /></Secao>
      <Secao titulo={`Reserva acumulada · ${mes.ano}`}><GraficoLinha dados={serie} /></Secao>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Secao titulo="Saídas pessoais por categoria"><GraficoHorizontal dados={top(atual.porCatPessoal).map(([nome, valor]) => ({ nome, valor }))} /></Secao>
      <Secao titulo="10 maiores despesas pessoais"><GraficoHorizontal dados={top(despesas, 10).map(([nome, valor]) => ({ nome, valor }))} /></Secao>
    </div>
    <Secao titulo="Despesas pessoais que terminam"><ListaTerminos itens={terminam} vazio="Nenhuma despesa parcelada termina dentro do horizonte." /></Secao>
  </>;
}

function Indicador({ titulo, valor, detalhe, destaque, icone }: { titulo: string; valor: string; detalhe?: string; destaque?: "positivo" | "negativo" | undefined; icone?: ReactNode }) {
  return <div className="surface-card min-h-32 p-4"><div className="flex items-center justify-between gap-2"><p className="label-eyebrow">{titulo}</p>{icone ? <span className="text-muted-foreground [&>svg]:size-4">{icone}</span> : null}</div><p className={`num mt-5 break-words text-xl font-semibold ${destaque === "negativo" ? "text-negative" : destaque === "positivo" ? "text-positive" : ""}`}>{valor}</p>{detalhe ? <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p> : null}</div>;
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) { return <section className="surface-card min-w-0 p-5"><h2 className="mb-4 text-sm font-semibold">{titulo}</h2>{children}</section>; }
function EstadoVazio({ texto }: { texto: string }) { return <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8"><div className="surface-card p-10 text-center text-sm text-muted-foreground">{texto}</div></main>; }

function faixas(contas: Conta[], mapa: ReturnType<typeof mapaBaixas>): Faixas {
  return contas.reduce<Faixas>((r, c) => {
    const baixa = mapa.get(chaveBaixa(c.tipo, c.id, c.mes));
    const sit = situacaoConta(c, mapa);
    if (baixa) r.baixado += Number(baixa.valor); else if (sit === "Vencido") r.vencido += c.valor; else r.aberto += c.valor;
    return r;
  }, { baixado: 0, aberto: 0, vencido: 0 });
}

function Medidor({ titulo, dados }: { titulo: string; dados: Faixas }) {
  const total = dados.baixado + dados.aberto + dados.vencido;
  const partes: Array<[keyof Faixas, string, string]> = [["baixado", "Baixado", "bg-positive"], ["aberto", "Em aberto", "bg-muted-foreground/35"], ["vencido", "Vencido", "bg-negative"]];
  return <section className="surface-card p-5"><div className="flex justify-between gap-4"><h2 className="text-sm font-semibold">{titulo}</h2><strong className="num text-sm">{formatarBRL(total)}</strong></div><div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">{partes.map(([k,, cor]) => <div key={k} className={cor} style={{ width: `${total ? dados[k] / total * 100 : 0}%` }} />)}</div><div className="mt-4 grid grid-cols-3 gap-3">{partes.map(([k, nome, cor]) => <div key={k}><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-2 rounded-sm ${cor}`} />{nome}</div><p className="num mt-1 text-sm font-semibold">{formatarBRL(dados[k])}</p></div>)}</div></section>;
}

function porDia(receber: Conta[], pagar: Conta[]) {
  const dias = new Set([...receber, ...pagar].map((c) => c.dia ?? 0));
  return [...dias].sort((a, b) => a - b).map((dia) => ({ dia, receber: soma(receber.filter((c) => (c.dia ?? 0) === dia).map((c) => c.valor)), pagar: soma(pagar.filter((c) => (c.dia ?? 0) === dia).map((c) => c.valor)) }));
}
function TabelaDias({ linhas }: { linhas: ReturnType<typeof porDia> }) {
  if (!linhas.length) return <Vazio />;
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="pb-2 font-medium">Dia</th><th className="pb-2 text-right font-medium">A receber</th><th className="pb-2 text-right font-medium">A pagar</th><th className="pb-2 text-right font-medium">Saldo</th></tr></thead><tbody>{linhas.map((x) => <tr key={x.dia} className="border-b last:border-0"><td className="py-2.5">{x.dia || "Sem dia"}</td><td className="num py-2.5 text-right">{formatarBRL(x.receber)}</td><td className="num py-2.5 text-right">{formatarBRL(x.pagar)}</td><td className={`num py-2.5 text-right font-semibold ${x.receber - x.pagar < 0 ? "text-negative" : ""}`}>{formatarBRL(x.receber - x.pagar)}</td></tr>)}</tbody></table></div>;
}

const tooltipBrl = (v: number | string | Array<number | string>) => formatarBRL(Number(Array.isArray(v) ? v[0] : v));
function GraficoVertical({ dados }: { dados: Serie[] }) {
  if (!dados.some((x) => x.valor)) return <Vazio />;
  return <div className="h-72 w-full"><ResponsiveContainer><BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--color-border)" /><XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickFormatter={brlCurto} tickLine={false} axisLine={false} width={72} fontSize={11} /><Tooltip formatter={tooltipBrl} cursor={{ fill: "var(--color-muted)" }} contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6 }} /><ReferenceLine y={0} stroke="var(--color-border)" /><Bar dataKey="valor" name="Valor" radius={[3,3,0,0]}>{dados.map((x) => <Cell key={x.nome} fill={x.valor < 0 ? "var(--color-negative)" : "var(--color-primary)"} />)}</Bar></BarChart></ResponsiveContainer></div>;
}
function GraficoLinha({ dados }: { dados: Serie[] }) {
  if (!dados.some((x) => x.acumulado)) return <Vazio />;
  return <div className="h-72 w-full"><ResponsiveContainer><LineChart data={dados} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--color-border)" /><XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickFormatter={brlCurto} tickLine={false} axisLine={false} width={72} fontSize={11} /><Tooltip formatter={tooltipBrl} contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6 }} /><ReferenceLine y={0} stroke="var(--color-border)" /><Line type="monotone" dataKey="acumulado" name="Reserva acumulada" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ fill: "var(--color-primary)", r: 3 }} /></LineChart></ResponsiveContainer></div>;
}
function GraficoHorizontal({ dados }: { dados: Serie[] }) {
  if (!dados.some((x) => x.valor)) return <Vazio />;
  const altura = Math.max(220, dados.length * 35);
  return <div className="w-full" style={{ height: altura }}><ResponsiveContainer><BarChart data={dados} layout="vertical" margin={{ top: 2, right: 18, left: 4, bottom: 0 }}><CartesianGrid horizontal={false} stroke="var(--color-border)" /><XAxis type="number" tickFormatter={brlCurto} tickLine={false} axisLine={false} fontSize={10} /><YAxis dataKey="nome" type="category" width={115} tickLine={false} axisLine={false} fontSize={10} tickFormatter={(v) => String(v).length > 18 ? `${String(v).slice(0, 17)}…` : String(v)} /><Tooltip formatter={tooltipBrl} cursor={{ fill: "var(--color-muted)" }} contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6 }} /><Bar dataKey="valor" name="Valor" fill="var(--color-primary)" radius={[0,3,3,0]} /></BarChart></ResponsiveContainer></div>;
}
function Vazio() { return <div className="grid h-40 place-items-center text-sm text-muted-foreground">Sem valores neste período.</div>; }

function topComOutros(r: Record<string, number>, limite: number): Serie[] {
  const todos = top(r);
  if (todos.length <= limite) return todos.map(([nome, valor]) => ({ nome, valor }));
  const principais = todos.slice(0, limite);
  return [...principais.map(([nome, valor]) => ({ nome, valor })), { nome: "Outros", valor: soma(todos.slice(limite).map(([, v]) => v)) }];
}

function despesasQueTerminam(saidas: Saida[], cfg: PainelProps["cfg"], h: PainelProps["horizonte"]) {
  return saidas.flatMap((s) => {
    if (s.valor_fixo != null || !s.rf) return [];
    const vm = (s.valores_mes ?? {}) as Record<string, number>;
    const mesesComValor = Object.entries(vm).filter(([, v]) => Number(v) !== 0).map(([k]) => k).sort();
    const fim = mesesComValor.at(-1);
    if (!fim || fim >= s.rf || fim < chaveMes(h.primeiro) || fim > chaveMes(h.ultimo)) return [];
    const [ano, mes] = fim.split("-").map(Number);
    if (!ano || !mes) return [];
    const ref = { ano, mes };
    const libera = valorSaida(s, fim) * fator(ref, h.y0, cfg.reajuste_mes, regraDo(cfg, s.id, chaveCatSaida(s), "S"));
    return [{ id: s.id, descricao: s.descricao, fim: formatarMes(ano, mes), libera }];
  }).sort((a, b) => a.fim.localeCompare(b.fim));
}
function ListaTerminos({ itens, vazio }: { itens: ReturnType<typeof despesasQueTerminam>; vazio: string }) {
  if (!itens.length) return <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p>;
  return <div className="divide-y">{itens.map((x) => <div key={x.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{x.descricao}</p><p className="mt-0.5 text-xs text-muted-foreground">Última parcela em {x.fim}</p></div><div className="text-right"><p className="num text-sm font-semibold text-positive">+ {formatarBRL(x.libera)}</p><p className="text-xs text-muted-foreground">liberados por mês</p></div></div>)}</div>;
}