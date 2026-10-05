import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { LinkImportar } from "@/components/link-importar";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Download, FileSpreadsheet, ListFilter, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BotaoExcluir } from "@/components/botao-excluir";
import { valorBase, valorSaida } from "@/lib/calc";
import { CalendarRange } from "lucide-react";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { usePeriodo } from "@/components/app-shell";
import { useConfig } from "@/lib/config";
import { formatarBRL, formatarMes, formatarNumero, normalizarBanco } from "@/lib/format";
import { baixarModelo, chaveMes, lerImportacao, norm, paraNumero, type Previa, type TipoImport } from "@/lib/importacao";
import { useAtualizar, useExcluir, useImportar, useInserir, useLista, valorSaidaNoMes, type Saida } from "@/lib/dados";

export const Route = createFileRoute("/_authenticated/cadastro")({
  head: () => ({
    meta: [
      { title: "Cadastro · Fluxo Escritório & Casa" },
      { name: "description", content: "Cadastre entradas, saídas e contas na tela ou importe por planilha." },
      { property: "og:title", content: "Cadastro · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Cadastre entradas, saídas e contas na tela ou importe por planilha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Cadastro,
});

const mesDeChave = (k?: string | null) => {
  if (!k) return "";
  const [a, m] = k.split("-").map(Number);
  return formatarMes(a!, m!);
};
const th = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
const td = "px-2 py-1.5 whitespace-nowrap";
const sel = "h-8 rounded-md border border-input bg-background px-2 text-sm";

function Cadastro() {
  const [busca, setBusca] = useState("");
  return (
    <div className="px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-semibold">Cadastro</h1>
      <p className="mt-1 text-sm text-muted-foreground">Módulo comum ao Escritório e ao Pessoal. Cadastre na tela ou importe por planilha. Reimportar substitui só o que veio de planilha.</p>
      <Tabs defaultValue="entradas" className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="entradas">Entradas</TabsTrigger>
            <TabsTrigger value="saidas">Saídas</TabsTrigger>
            <TabsTrigger value="pessoais">Entradas pessoais</TabsTrigger>
          </TabsList>
          <div className="relative ml-auto w-72">
            <Search className="absolute top-2 left-2 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="h-8 pl-8" />
          </div>
        </div>
        <TabsContent value="saidas"><Saidas busca={busca} /></TabsContent>
        <TabsContent value="entradas"><Entradas busca={busca} /></TabsContent>
        <TabsContent value="pessoais"><Pessoais busca={busca} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Importar({ tipo, rotulo }: { tipo: TipoImport; rotulo: string }) {
  return <LinkImportar tipo={tipo === "entradas_pessoais" ? "pessoais" : tipo} rotulo={`Importar ${rotulo}`} variant="default" />;
}

function CampoValor({ valor, onSalvar }: { valor: number; onSalvar: (n: number) => void }) {
  const [t, setT] = useState<string | null>(null);
  return (
    <Input
      className="num h-8 w-28 text-right"
      value={t ?? formatarNumero(valor)}
      onFocus={() => setT(formatarNumero(valor))}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => {
        const n = paraNumero(t);
        setT(null);
        if (n != null && n !== valor) onSalvar(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Edita os 12 meses-base (após a base zero); depois deles o app aplica o reajuste por índice. */
function Botao12Meses({ nome, valorDe, onSalvar }: { nome: string; valorDe: (k: string) => number; onSalvar: (v: Record<string, number>) => Promise<unknown> | void }) {
  const { horizonte } = usePeriodo();
  const [aberto, setAberto] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const ks = (horizonte?.mesesBase ?? []).map((m) => ({ k: chaveMes(m.ano, m.mes), r: formatarMes(m.ano, m.mes) }));
  function abrir() { setVals(Object.fromEntries(ks.map(({ k }) => [k, formatarNumero(valorDe(k))]))); setAberto(true); }
  async function salvar() {
    const rec: Record<string, number> = {};
    for (const { k } of ks) rec[k] = paraNumero(vals[k]) ?? 0;
    try { await onSalvar(rec); toast.success("Meses-base salvos."); setAberto(false); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <>
      <Button size="icon" variant="ghost" className="size-7" title="Editar meses-base" onClick={abrir}><CalendarRange className="size-4" /></Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meses-base · {nome}</DialogTitle>
            <DialogDescription>Valor de cada mês do ano da base zero. Os anos seguintes partem de dezembro com o índice de crescimento (aba Projeção).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {!ks.length ? <p className="col-span-3 text-sm text-muted-foreground">Não há meses do ano da base zero no horizonte.</p> : null}
            {ks.map(({ k, r }) => (
              <label key={k} className="space-y-1 text-xs text-muted-foreground">{r}
                <Input className="num h-8 text-right" value={vals[k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { const v = vals[ks[0]?.k ?? ""] ?? ""; setVals(Object.fromEntries(ks.map(({ k }) => [k, v]))); }}>Repetir o 1º mês</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Barra({ children, total }: { children: ReactNode; total: string }) {
  return <div className="mt-4 flex flex-wrap items-center gap-2"><span className="num text-sm text-muted-foreground">{total}</span><div className="ml-auto flex flex-wrap items-center gap-2">{children}</div></div>;
}

function Form({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) {
  return (
    <form className="surface-card mt-4 flex flex-wrap items-end gap-2 p-4" onSubmit={(e) => (e.preventDefault(), onSubmit())}>
      {children}
      <Button type="submit" size="sm"><Plus className="size-4" />Adicionar</Button>
    </form>
  );
}
const F = ({ l, children }: { l: string; children: ReactNode }) => <label className="grid gap-1 text-xs text-muted-foreground">{l}{children}</label>;

function contem(busca: string, ...campos: (string | null | undefined)[]) {
  const b = norm(busca);
  return !b || campos.some((c) => norm(c).includes(b));
}

/* ---------------- ordenação e filtros ---------------- */
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const chaveFiltro = (s?: string | null) => norm(s).replace(/\s+/g, "");
const cmpTexto = (a: string, b: string) => semAcento(a).localeCompare(semAcento(b), "pt-BR", { sensitivity: "base" });

type Ordenacao = "az" | "za" | "maior" | "menor" | "dia";
const ORDENS: { v: Ordenacao; l: string }[] = [
  { v: "az", l: "A → Z" },
  { v: "za", l: "Z → A" },
  { v: "maior", l: "Maior valor" },
  { v: "menor", l: "Menor valor" },
  { v: "dia", l: "Por dia de vencimento" },
];

function ordenar<T>(lista: T[], ordem: Ordenacao, texto: (i: T) => string, valor: (i: T) => number, dia: (i: T) => number | null) {
  const arr = [...lista];
  const t = (a: T, b: T) => cmpTexto(texto(a), texto(b));
  if (ordem === "az") arr.sort(t);
  else if (ordem === "za") arr.sort((a, b) => t(b, a));
  else if (ordem === "maior") arr.sort((a, b) => valor(b) - valor(a) || t(a, b));
  else if (ordem === "menor") arr.sort((a, b) => valor(a) - valor(b) || t(a, b));
  else arr.sort((a, b) => (dia(a) ?? 99) - (dia(b) ?? 99) || t(a, b));
  return arr;
}

/** Opções de um campo agrupadas pelo nome normalizado ("VilaSul" = "Vila Sul"), com o nome mais usado como rótulo. */
function opcoesDe<T>(itens: T[], pega: (i: T) => string | null | undefined) {
  const mapa = new Map<string, Map<string, number>>();
  for (const it of itens) {
    const bruto = (pega(it) ?? "").trim();
    if (!bruto) continue;
    const k = chaveFiltro(bruto);
    const cont = mapa.get(k) ?? new Map<string, number>();
    cont.set(bruto, (cont.get(bruto) ?? 0) + 1);
    mapa.set(k, cont);
  }
  return [...mapa.entries()]
    .map(([v, cont]) => ({ v, l: [...cont.entries()].sort((a, b) => b[1] - a[1] || cmpTexto(a[0], b[0]))[0]![0] }))
    .sort((a, b) => cmpTexto(a.l, b.l));
}

function CabecalhoFiltro({
  titulo,
  ordem,
  ordens = [],
  onOrdem,
  filtro,
  opcoes = [],
  onFiltro,
}: {
  titulo: string;
  ordem?: Ordenacao;
  ordens?: Ordenacao[];
  onOrdem?: (v: Ordenacao) => void;
  filtro?: string;
  opcoes?: { v: string; l: string }[];
  onFiltro?: (v: string) => void;
}) {
  const ativo = !!filtro || (!!ordem && ordens.includes(ordem) && ordem !== "az");
  return (
    <th className={`${th} p-0`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={`h-8 gap-1 px-2 text-xs font-medium ${ativo ? "text-primary" : "text-muted-foreground"}`}>
            {titulo}
            {ativo ? <ListFilter className="size-3.5" /> : <ChevronDown className="size-3.5 opacity-60" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          {onOrdem && ordens.length ? (
            <>
              <DropdownMenuLabel>Ordenar</DropdownMenuLabel>
              {ORDENS.filter((o) => ordens.includes(o.v)).map((o) => (
                <DropdownMenuItem key={o.v} onSelect={() => onOrdem(o.v)}>
                  <Check className={`size-4 ${ordem === o.v ? "opacity-100" : "opacity-0"}`} />{o.l}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {onFiltro ? (
            <>
              {onOrdem && ordens.length ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel>Filtrar</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={filtro ?? ""} onValueChange={onFiltro}>
                <DropdownMenuRadioItem value="">Todos</DropdownMenuRadioItem>
                {opcoes.map((o) => <DropdownMenuRadioItem key={o.v} value={o.v}>{o.l}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </th>
  );
}

/* ---------------- seleção e edição em lote ---------------- */
type TipoCampo = "texto" | "maiusc" | "banco" | "numero" | "dia" | "mes" | "destino" | "ativo";
type CampoLote = { k: string; l: string; t: TipoCampo };

/** "2026-10" -> "10/2026" */
function exibirMes(v: string | null): string {
  return v ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : "";
}
/** "10/2026" -> "2026-10"; null = vazio; undefined = inválido */
function lerMes(t: string): string | null | undefined {
  const limpo = t.trim();
  if (!limpo) return null;
  const m = limpo.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return undefined;
  return `${m[2]}-${m[1]!.padStart(2, "0")}`;
}

/** Campo de vigência com data numérica (mm/aaaa), sem seletor de calendário. */
function CampoMes({ valor, onSalvar, title }: { valor: string | null; onSalvar: (v: string | null) => void; title?: string }) {
  return (
    <Input key={valor ?? "x"} className="num h-7 w-24" defaultValue={exibirMes(valor)} placeholder="mm/aaaa" title={title}
      onBlur={(ev) => {
        const v = lerMes(ev.target.value);
        if (v === undefined) { toast.error("Use o formato mm/aaaa (ex.: 03/2027)."); ev.target.value = exibirMes(valor); return; }
        if (v !== valor) onSalvar(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

/** Texto editável em linha (descrição, empresa etc.). */
function CampoTexto({ valor, onSalvar, className = "w-56" }: { valor: string; onSalvar: (v: string) => void; className?: string }) {
  return (
    <Input key={valor} className={`h-7 ${className}`} defaultValue={valor}
      onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== valor) onSalvar(v); else if (!v) ev.target.value = valor; }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

function useSelecao(visiveis: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const ids = visiveis.filter((id) => sel.has(id));
  const todos = visiveis.length > 0 && ids.length === visiveis.length;
  return {
    ids,
    tem: (id: string) => sel.has(id),
    alternar: (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }),
    todos,
    alternarTodos: () => setSel(todos ? new Set() : new Set(visiveis)),
    limpar: () => setSel(new Set()),
  };
}

function CaixaTodos({ s }: { s: ReturnType<typeof useSelecao> }) {
  return <th className={`${th} w-8`}><Checkbox aria-label="Selecionar todas" checked={s.todos ? true : s.ids.length ? "indeterminate" : false} onCheckedChange={s.alternarTodos} /></th>;
}
function CaixaLinha({ s, id }: { s: ReturnType<typeof useSelecao>; id: string }) {
  return <td className={`${td} w-8`}><Checkbox aria-label="Selecionar linha" checked={s.tem(id)} onCheckedChange={() => s.alternar(id)} /></td>;
}

function EdicaoLote({ tabela, s, campos }: { tabela: "entradas" | "saidas" | "entradas_pessoais"; s: ReturnType<typeof useSelecao>; campos: CampoLote[] }) {
  const qc = useQueryClient();
  const [campo, setCampo] = useState(campos[0]!.k);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  if (!s.ids.length) return null;
  const c = campos.find((x) => x.k === campo)!;

  function converter(): { ok: true; v: unknown } | { ok: false; msg: string } {
    const t = valor.trim();
    switch (c.t) {
      case "numero": { const n = paraNumero(t); return n == null ? { ok: false, msg: "Informe um valor (ex.: 1.234,56)." } : { ok: true, v: n }; }
      case "dia": { if (!t) return { ok: true, v: null }; const n = Number(t); return n >= 1 && n <= 31 ? { ok: true, v: n } : { ok: false, msg: "Dia entre 1 e 31." }; }
      case "ativo": return { ok: true, v: t !== "nao" };
      case "maiusc": return { ok: true, v: t ? t.toUpperCase() : null };
      case "banco": return { ok: true, v: t ? normalizarBanco(t) : null };
      default: return { ok: true, v: t || null };
    }
  }

  async function aplicar(apagar = false) {
    const r = apagar ? { ok: true as const, v: null } : converter();
    if (!r.ok) return void toast.error(r.msg);
    const v: Record<string, unknown> = { [c.k]: r.v };
    if (tabela === "saidas" && c.k === "valor_fixo") v["valores_mes"] = {};
    setSalvando(true);
    const { error } = await supabase.from(tabela).update(v as never).in("id", s.ids);
    setSalvando(false);
    if (error) return void toast.error(`Não foi possível salvar: ${error.message}`);
    await qc.invalidateQueries({ queryKey: [tabela] });
    toast.success(`${s.ids.length} item(ns) atualizado(s).`);
    setValor("");
  }
  async function excluirTodos() {
    const { error } = await supabase.from(tabela).delete().in("id", s.ids);
    if (error) return void toast.error(`Não foi possível excluir: ${error.message}`);
    await qc.invalidateQueries({ queryKey: [tabela] });
    toast.success(`${s.ids.length} item(ns) excluído(s).`);
    s.limpar();
  }

  const entrada =
    c.t === "destino" ? <SelDestino value={valor} onChange={setValor} /> :
    c.t === "ativo" ? <select className={sel} value={valor || "sim"} onChange={(e) => setValor(e.target.value)}><option value="sim">Ativa</option><option value="nao">Inativa</option></select> :
    c.t === "mes" ? <Input className="num h-8 w-28" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="mm/aaaa" /> :
    <Input className={`h-8 ${c.t === "numero" || c.t === "dia" ? "num w-28" : "w-48"}`} value={valor} onChange={(e) => setValor(e.target.value)} placeholder={c.t === "numero" ? "0,00" : "novo valor"} />;
  const podeApagar = c.t !== "numero" && c.t !== "ativo";

  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-card p-3 shadow-lg">
      <span className="text-sm font-medium">{s.ids.length} selecionada(s)</span>
      <span className="text-sm text-muted-foreground">· Alterar</span>
      <select className={sel} value={campo} onChange={(e) => { setCampo(e.target.value); setValor(""); }}>
        {campos.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
      </select>
      <span className="text-sm text-muted-foreground">para</span>
      {entrada}
      <Button size="sm" disabled={salvando} onClick={() => aplicar()}>Aplicar</Button>
      {podeApagar ? <Button size="sm" variant="ghost" disabled={salvando} onClick={() => aplicar(true)}>Deixar vazio</Button> : null}
      <div className="ml-auto flex items-center gap-2">
        <BotaoConfirmar onConfirmar={excluirTodos}>Excluir selecionadas</BotaoConfirmar>
        <Button size="sm" variant="ghost" onClick={s.limpar}>Limpar seleção</Button>
      </div>
    </div>
  );
}

/* ---------------- Saídas ---------------- */
function Saidas({ busca }: { busca: string }) {
  const { data = [] } = useLista("saidas");
  const { horizonte } = usePeriodo();
  const atualizar = useAtualizar("saidas");
  const excluir = useExcluir("saidas");
  const inserir = useInserir("saidas");
  const [semDestino, setSemDestino] = useState(false);
  const [ordem, setOrdem] = useState<Ordenacao>("az");
  const [cat, setCat] = useState("");
  const p = horizonte?.primeiro;
  const k1 = p ? chaveMes(p.ano, p.mes) : "";
  const vazio = { descricao: "", categoria: "", banco: "", dia: "", destino: "", valor: "", ri: k1, rf: "" };
  const [f, setF] = useState(vazio);
  const categorias = useMemo(() => opcoesDe(data, (s) => s.categoria), [data]);
  const listaBase = data.filter((s) => (!semDestino || !s.destino) && (!cat || chaveFiltro(s.categoria) === cat) && contem(busca, s.descricao, s.categoria, s.banco, s.pgto));
  const lista = ordenar(listaBase, ordem, (s) => s.descricao, (s) => valorSaidaNoMes(s, k1), (s) => s.dia);
  const selS = useSelecao(lista.map((x) => x.id));

  function editarValor(s: Saida, n: number) {
    if (s.valor_fixo != null) atualizar.mutate({ id: s.id, v: { valor_fixo: n } });
    else atualizar.mutate({ id: s.id, v: { valores_mes: { ...(s.valores_mes as Record<string, number>), [k1]: n } } });
  }

  return (
    <>
      <Barra total={`${lista.length} saídas · ${formatarBRL(lista.reduce((t, s) => t + valorSaidaNoMes(s, k1), 0))} em ${mesDeChave(k1)}`}>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={semDestino} onCheckedChange={(v) => setSemDestino(!!v)} />Mostrar só as sem destino</label>
        <Importar tipo="saidas" rotulo="saídas" />
      </Barra>
      <Form onSubmit={() => {
        const valor = paraNumero(f.valor);
        if (!f.descricao.trim()) return void toast.error("Preencha a descrição.");
        if (valor == null) return void toast.error("Preencha o valor (ex.: 1.234,56).");
        inserir.mutate({ descricao: f.descricao.trim(), categoria: f.categoria.trim().toUpperCase() || null, banco: f.banco ? normalizarBanco(f.banco) : null, dia: Number(f.dia) || null, destino: (f.destino || null) as Saida["destino"], valor_fixo: valor, ri: f.ri || k1, rf: f.rf || null, origem: "manual" }, { onSuccess: () => { toast.success("Adicionado."); setF(vazio); }, onError: (e) => toast.error(`Não foi possível adicionar: ${e.message}`) });
      }}>
        <F l="Descrição"><Input className="h-8 w-56" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></F>
        <F l="Categoria"><Input className="h-8 w-40" list="cats" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></F>
        <datalist id="cats">{categorias.map((c) => <option key={c.v} value={c.l} />)}</datalist>
        <F l="Banco"><Input className="h-8 w-32" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} /></F>
        <F l="Dia"><Input className="h-8 w-16" type="number" min={1} max={31} value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} /></F>
        <F l="Destino"><SelDestino value={f.destino} onChange={(v) => setF({ ...f, destino: v })} /></F>
        <F l="Valor/mês"><Input className="num h-8 w-28" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" /></F>
        <F l="Início"><Input className="h-8 w-36" type="month" value={f.ri} onChange={(e) => setF({ ...f, ri: e.target.value })} /></F>
        <F l="Fim (opcional)"><Input className="h-8 w-36" type="month" value={f.rf} onChange={(e) => setF({ ...f, rf: e.target.value })} /></F>
      </Form>
      <div className="surface-card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <CaixaTodos s={selS} />
            <CabecalhoFiltro titulo="Descrição" ordem={ordem} ordens={["az", "za"]} onOrdem={setOrdem} />
            <CabecalhoFiltro titulo="Categoria" filtro={cat} opcoes={categorias} onFiltro={setCat} />
            <th className={th}>Pagamento</th><th className={th}>Banco</th>
            <CabecalhoFiltro titulo="Dia" ordem={ordem} ordens={["dia"]} onOrdem={setOrdem} />
            <th className={th}>Destino</th>
            <CabecalhoFiltro titulo={`Valor ${mesDeChave(k1)}`} ordem={ordem} ordens={["maior", "menor"]} onOrdem={setOrdem} />
            <th className={th}>Início</th><th className={th}>Fim</th><th className={th}></th>
          </tr></thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id} className="border-b border-border/60">
                <CaixaLinha s={selS} id={s.id} />
                <td className={td}><CampoTexto valor={s.descricao} onSalvar={(v) => atualizar.mutate({ id: s.id, v: { descricao: v } })} /></td>
                <td className={td}>{s.categoria}</td>
                <td className={td}>{s.pgto}</td>
                <td className={td}>{s.banco}</td>
                <td className={`${td} num`}>{s.dia}</td>
                <td className={td}><SelDestino value={s.destino ?? ""} onChange={(v) => atualizar.mutate({ id: s.id, v: { destino: (v || null) as Saida["destino"] } })} /></td>
                <td className={td}><CampoValor valor={valorSaidaNoMes(s, k1)} onSalvar={(n) => editarValor(s, n)} /></td>
                <td className={td}><CampoMes valor={s.ri} title="Vazio = desde o início do horizonte" onSalvar={(v) => atualizar.mutate({ id: s.id, v: { ri: v } })} /></td>
                <td className={td}><CampoMes valor={s.rf} title="Vazio = contínua" onSalvar={(v) => atualizar.mutate({ id: s.id, v: { rf: v } })} /></td>
                <td className={`${td} whitespace-nowrap`}><Botao12Meses nome={s.descricao} valorDe={(k) => valorSaida(s, k)} onSalvar={(rec) => atualizar.mutateAsync({ id: s.id, v: mesesSaida(s, rec) })} /><BotaoExcluir onConfirmar={() => excluir.mutate(s.id)} /></td>
              </tr>
            ))}
            {!lista.length ? <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Nenhuma saída.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <EdicaoLote tabela="saidas" s={selS} campos={[
        { k: "destino", l: "Destino", t: "destino" }, { k: "categoria", l: "Categoria", t: "maiusc" }, { k: "pgto", l: "Pagamento", t: "texto" },
        { k: "banco", l: "Banco", t: "banco" }, { k: "dia", l: "Dia", t: "dia" }, { k: "valor_fixo", l: "Valor/mês (fixo)", t: "numero" },
        { k: "ri", l: "Início", t: "mes" }, { k: "rf", l: "Fim", t: "mes" },
      ]} />
    </>
  );
}

/** Grava os 12 meses-base de uma saída em valores_mes, preservando o resto da vigência. */
function mesesSaida(s: Saida, rec: Record<string, number>) {
  const ks = Object.keys(rec).sort(), primeiro = ks[0]!, ultimo = ks[ks.length - 1]!;
  const vm: Record<string, number> = { ...((s.valores_mes ?? {}) as Record<string, number>) };
  if (s.valor_fixo != null && s.rf && s.rf > ultimo) {
    let [a, m] = ultimo.split("-").map(Number) as [number, number];
    for (;;) { m++; if (m > 12) { m = 1; a++; } const k = chaveMes(a, m); if (k > s.rf) break; vm[k] = Number(s.valor_fixo); }
  }
  Object.assign(vm, rec);
  const rf = s.rf && s.rf > ultimo ? s.rf : ultimo;
  const ri = s.ri && s.ri < primeiro ? s.ri : primeiro;
  return { valores_mes: vm, valor_fixo: null, ri, rf };
}

function SelDestino({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">sem destino</option>
      <option value="ESCRITORIO">Escritório</option>
      <option value="PESSOAL">Pessoal</option>
    </select>
  );
}

/* ---------------- Entradas ---------------- */
function Entradas({ busca }: { busca: string }) {
  const { data = [] } = useLista("entradas");
  const atualizar = useAtualizar("entradas");
  const excluir = useExcluir("entradas");
  const inserir = useInserir("entradas");
  const vazio = { codigo: "", empresa: "", carteira: "", grupo: "", setor: "", regime: "", dia: "", valor: "", inicio: "", fim: "" };
  const [f, setF] = useState(vazio);
  const [ordem, setOrdem] = useState<Ordenacao>("az");
  const [grupo, setGrupo] = useState("");
  const [carteira, setCarteira] = useState("");
  const [setor, setSetor] = useState("");
  const grupos = useMemo(() => opcoesDe(data, (e) => e.grupo), [data]);
  const carteiras = useMemo(() => opcoesDe(data, (e) => e.carteira), [data]);
  const setores = useMemo(() => opcoesDe(data, (e) => e.setor), [data]);
  const listaBase = data.filter((e) => (!grupo || chaveFiltro(e.grupo) === grupo) && (!carteira || chaveFiltro(e.carteira) === carteira) && (!setor || chaveFiltro(e.setor) === setor) && contem(busca, e.codigo, e.empresa, e.carteira, e.grupo, e.setor, e.regime));
  const lista = ordenar(listaBase, ordem, (e) => e.empresa, (e) => Number(e.valor), (e) => e.dia);
  const ativos = lista.filter((e) => e.ativo);
  const selE = useSelecao(lista.map((x) => x.id));

  return (
    <>
      <Barra total={`${lista.length} contratos · ${formatarBRL(ativos.reduce((t, e) => t + Number(e.valor), 0))}/mês (ativos)`}>
        <Importar tipo="entradas" rotulo="entradas" />
      </Barra>
      <Form onSubmit={() => {
        const valor = paraNumero(f.valor);
        if (!f.empresa.trim()) return void toast.error("Preencha a empresa.");
        if (valor == null) return void toast.error("Preencha o valor (ex.: 1.234,56).");
        inserir.mutate({ codigo: f.codigo || null, empresa: f.empresa.trim(), carteira: f.carteira || null, grupo: f.grupo || null, setor: f.setor || null, regime: f.regime || null, dia: Number(f.dia) || null, valor, inicio: f.inicio || null, fim: f.fim || null, origem: "manual" }, { onSuccess: () => { toast.success("Adicionado."); setF(vazio); }, onError: (e) => toast.error(`Não foi possível adicionar: ${e.message}`) });
      }}>
        <F l="Código"><Input className="h-8 w-20" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} /></F>
        <F l="Empresa"><Input className="h-8 w-56" value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })} /></F>
        <F l="Carteira"><Input className="h-8 w-32" value={f.carteira} onChange={(e) => setF({ ...f, carteira: e.target.value })} /></F>
        <F l="Grupo"><Input className="h-8 w-32" value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })} /></F>
        <F l="Setor"><Input className="h-8 w-32" value={f.setor} onChange={(e) => setF({ ...f, setor: e.target.value })} /></F>
        <F l="Regime"><Input className="h-8 w-36" value={f.regime} onChange={(e) => setF({ ...f, regime: e.target.value })} /></F>
        <F l="Dia"><Input className="h-8 w-16" type="number" min={1} max={31} value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} /></F>
        <F l="Valor/mês"><Input className="num h-8 w-28" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" /></F>
        <F l="Início (opcional)"><Input className="h-8 w-36" type="month" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></F>
        <F l="Fim (opcional)"><Input className="h-8 w-36" type="month" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></F>
      </Form>
      <div className="surface-card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <CaixaTodos s={selE} />
            <th className={th}>Código</th>
            <CabecalhoFiltro titulo="Empresa" ordem={ordem} ordens={["az", "za"]} onOrdem={setOrdem} />
            <CabecalhoFiltro titulo="Carteira" filtro={carteira} opcoes={carteiras} onFiltro={setCarteira} />
            <CabecalhoFiltro titulo="Grupo" filtro={grupo} opcoes={grupos} onFiltro={setGrupo} />
            <CabecalhoFiltro titulo="Setor" filtro={setor} opcoes={setores} onFiltro={setSetor} />
            <th className={th}>Regime</th>
            <CabecalhoFiltro titulo="Dia" ordem={ordem} ordens={["dia"]} onOrdem={setOrdem} />
            <th className={th}>Ativo</th>
            <CabecalhoFiltro titulo="Valor/mês" ordem={ordem} ordens={["maior", "menor"]} onOrdem={setOrdem} />
            <th className={th}>Início</th><th className={th}>Fim</th><th className={th}></th>
          </tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} className={`border-b border-border/60 ${e.ativo ? "" : "opacity-50"}`}>
                <CaixaLinha s={selE} id={e.id} />
                <td className={`${td} num`}>{e.codigo}</td>
                <td className={td}><CampoTexto valor={e.empresa} onSalvar={(v) => atualizar.mutate({ id: e.id, v: { empresa: v } })} /></td>
                <td className={td}>{e.carteira}</td>
                <td className={td}>{e.grupo}</td>
                <td className={td}><Input className="h-7 w-32" defaultValue={e.setor ?? ""} onBlur={(ev) => { const v = ev.target.value.trim() || null; if (v !== e.setor) atualizar.mutate({ id: e.id, v: { setor: v } }); }} /></td>
                <td className={td}>{e.regime}</td>
                <td className={`${td} num`}>{e.dia}</td>
                <td className={td}><Checkbox checked={e.ativo} onCheckedChange={(v) => atualizar.mutate({ id: e.id, v: { ativo: !!v } })} /></td>
                <td className={td}><CampoValor valor={Number(e.valor)} onSalvar={(n) => atualizar.mutate({ id: e.id, v: { valor: n } })} /></td>
                <td className={td}><CampoMes valor={e.inicio} title="Vazio = desde sempre" onSalvar={(v) => atualizar.mutate({ id: e.id, v: { inicio: v } })} /></td>
                <td className={td}><CampoMes valor={e.fim} title="Vazio = contínua" onSalvar={(v) => atualizar.mutate({ id: e.id, v: { fim: v } })} /></td>
                <td className={`${td} whitespace-nowrap`}><Botao12Meses nome={e.empresa} valorDe={(k) => valorBase(e.valores_base, Number(e.valor), k)} onSalvar={(rec) => atualizar.mutateAsync({ id: e.id, v: { valores_base: rec } })} /><BotaoExcluir onConfirmar={() => excluir.mutate(e.id)} /></td>
              </tr>
            ))}
            {!lista.length ? <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">Nenhuma entrada.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <EdicaoLote tabela="entradas" s={selE} campos={[
        { k: "carteira", l: "Carteira", t: "texto" }, { k: "grupo", l: "Grupo", t: "texto" }, { k: "setor", l: "Setor", t: "texto" },
        { k: "regime", l: "Regime", t: "texto" }, { k: "banco", l: "Banco", t: "banco" }, { k: "dia", l: "Dia", t: "dia" },
        { k: "ativo", l: "Ativo", t: "ativo" }, { k: "valor", l: "Valor/mês", t: "numero" },
        { k: "inicio", l: "Início", t: "mes" }, { k: "fim", l: "Fim", t: "mes" },
      ]} />
    </>
  );
}

/* ---------------- Entradas pessoais ---------------- */
function Pessoais({ busca }: { busca: string }) {
  const { data = [] } = useLista("entradas_pessoais");
  const atualizar = useAtualizar("entradas_pessoais");
  const excluir = useExcluir("entradas_pessoais");
  const inserir = useInserir("entradas_pessoais");
  const { horizonte } = usePeriodo();
  const k1 = horizonte ? chaveMes(horizonte.primeiro.ano, horizonte.primeiro.mes) : "";
  const vazio = { descricao: "", dia: "", banco: "", inicio: k1, fim: "", valor: "" };
  const [f, setF] = useState(vazio);
  const [ordem, setOrdem] = useState<Ordenacao>("az");
  const [banco, setBanco] = useState("");
  const bancos = useMemo(() => opcoesDe(data, (e) => e.banco), [data]);
  const listaBase = data.filter((e) => (!banco || chaveFiltro(e.banco) === banco) && contem(busca, e.descricao, e.banco));
  const lista = ordenar(listaBase, ordem, (e) => e.descricao, (e) => Number(e.valor), (e) => e.dia);
  const selP = useSelecao(lista.map((x) => x.id));

  return (
    <>
      <Barra total={`${lista.length} entradas pessoais · ${formatarBRL(lista.reduce((t, e) => t + Number(e.valor), 0))}/mês`}>
        <Importar tipo="entradas_pessoais" rotulo="entradas pessoais" />
      </Barra>
      <Form onSubmit={() => {
        const valor = paraNumero(f.valor);
        if (!f.descricao.trim()) return void toast.error("Preencha a descrição.");
        if (valor == null) return void toast.error("Preencha o valor (ex.: 1.234,56).");
        inserir.mutate({ descricao: f.descricao.trim(), dia: Number(f.dia) || null, banco: f.banco ? normalizarBanco(f.banco) : null, inicio: f.inicio || k1 || null, fim: f.fim || null, valor, origem: "manual" }, { onSuccess: () => { toast.success("Adicionado."); setF(vazio); }, onError: (e) => toast.error(`Não foi possível adicionar: ${e.message}`) });
      }}>
        <F l="Origem"><Input className="h-8 w-56" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></F>
        <F l="Dia"><Input className="h-8 w-16" type="number" min={1} max={31} value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} /></F>
        <F l="Banco"><Input className="h-8 w-32" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} /></F>
        <F l="Início"><Input className="h-8 w-36" type="month" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></F>
        <F l="Fim (opcional)"><Input className="h-8 w-36" type="month" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></F>
        <F l="Valor/mês"><Input className="num h-8 w-28" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" /></F>
      </Form>
      <div className="surface-card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <CaixaTodos s={selP} />
            <CabecalhoFiltro titulo="Origem" ordem={ordem} ordens={["az", "za"]} onOrdem={setOrdem} />
            <CabecalhoFiltro titulo="Dia" ordem={ordem} ordens={["dia"]} onOrdem={setOrdem} />
            <CabecalhoFiltro titulo="Banco" filtro={banco} opcoes={bancos} onFiltro={setBanco} />
            <th className={th}>Início</th><th className={th}>Fim</th>
            <CabecalhoFiltro titulo="Valor/mês" ordem={ordem} ordens={["maior", "menor"]} onOrdem={setOrdem} />
            <th className={th}></th>
          </tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} className="border-b border-border/60">
                <CaixaLinha s={selP} id={e.id} />
                <td className={td}><CampoTexto valor={e.descricao} onSalvar={(v) => atualizar.mutate({ id: e.id, v: { descricao: v } })} /></td>
                <td className={`${td} num`}>{e.dia}</td>
                <td className={td}>{e.banco}</td>
                <td className={td}><CampoMes valor={e.inicio} title="Vazio = desde sempre" onSalvar={(v) => atualizar.mutate({ id: e.id, v: { inicio: v } })} /></td>
                <td className={td}><CampoMes valor={e.fim} title="Vazio = contínua" onSalvar={(v) => atualizar.mutate({ id: e.id, v: { fim: v } })} /></td>
                <td className={td}><CampoValor valor={Number(e.valor)} onSalvar={(n) => atualizar.mutate({ id: e.id, v: { valor: n } })} /></td>
                <td className={`${td} whitespace-nowrap`}><Botao12Meses nome={e.descricao} valorDe={(k) => valorBase(e.valores_base, Number(e.valor), k)} onSalvar={(rec) => atualizar.mutateAsync({ id: e.id, v: { valores_base: rec } })} /><BotaoExcluir onConfirmar={() => excluir.mutate(e.id)} /></td>
              </tr>
            ))}
            {!lista.length ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhuma entrada pessoal.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <EdicaoLote tabela="entradas_pessoais" s={selP} campos={[
        { k: "banco", l: "Banco", t: "banco" }, { k: "dia", l: "Dia", t: "dia" }, { k: "valor", l: "Valor/mês", t: "numero" },
        { k: "inicio", l: "Início", t: "mes" }, { k: "fim", l: "Fim", t: "mes" },
      ]} />
    </>
  );
}

