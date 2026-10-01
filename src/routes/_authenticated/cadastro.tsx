import { createFileRoute } from "@tanstack/react-router";
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
import { daArea, useArea, usePeriodo } from "@/components/app-shell";
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
  const area = useArea();
  return (
    <div key={area} className="px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-semibold">Cadastro</h1>
      <p className="mt-1 text-sm text-muted-foreground">Cadastre na tela ou importe por planilha. Reimportar substitui só o que veio de planilha.</p>
      <Tabs defaultValue="saidas" className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="saidas">Saídas</TabsTrigger>
            {area === "ESCRITORIO" ? <TabsTrigger value="entradas">Entradas</TabsTrigger> : <TabsTrigger value="pessoais">Entradas pessoais</TabsTrigger>}
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
  const vazio = { descricao: "", categoria: "", banco: "", dia: "", destino: useArea() as string, valor: "", ri: k1, rf: "" };
  const [f, setF] = useState(vazio);
  const categorias = useMemo(() => opcoesDe(data, (s) => s.categoria), [data]);
  const area = useArea();
  const listaBase = data.filter((s) => daArea(s.destino, area) && (!semDestino || !s.destino) && (!cat || chaveFiltro(s.categoria) === cat) && contem(busca, s.descricao, s.categoria, s.banco, s.pgto));
  const lista = ordenar(listaBase, ordem, (s) => s.descricao, (s) => valorSaidaNoMes(s, k1), (s) => s.dia);

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
        if (!f.descricao.trim() || valor == null) return;
        inserir.mutate({ descricao: f.descricao.trim(), categoria: f.categoria.trim().toUpperCase() || null, banco: f.banco ? normalizarBanco(f.banco) : null, dia: Number(f.dia) || null, destino: (f.destino || null) as Saida["destino"], valor_fixo: valor, ri: f.ri || k1, rf: f.rf || null, origem: "manual" });
        setF(vazio);
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
            <CabecalhoFiltro titulo="Descrição" ordem={ordem} ordens={["az", "za"]} onOrdem={setOrdem} />
            <CabecalhoFiltro titulo="Categoria" filtro={cat} opcoes={categorias} onFiltro={setCat} />
            <th className={th}>Pagamento</th><th className={th}>Banco</th>
            <CabecalhoFiltro titulo="Dia" ordem={ordem} ordens={["dia"]} onOrdem={setOrdem} />
            <th className={th}>Destino</th>
            <CabecalhoFiltro titulo={`Valor ${mesDeChave(k1)}`} ordem={ordem} ordens={["maior", "menor"]} onOrdem={setOrdem} />
            <th className={th}>Vigência</th><th className={th}></th>
          </tr></thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id} className="border-b border-border/60">
                <td className={td}>{s.descricao}</td>
                <td className={td}>{s.categoria}</td>
                <td className={td}>{s.pgto}</td>
                <td className={td}>{s.banco}</td>
                <td className={`${td} num`}>{s.dia}</td>
                <td className={td}><SelDestino value={s.destino ?? ""} onChange={(v) => atualizar.mutate({ id: s.id, v: { destino: (v || null) as Saida["destino"] } })} /></td>
                <td className={td}><CampoValor valor={valorSaidaNoMes(s, k1)} onSalvar={(n) => editarValor(s, n)} /></td>
                <td className={`${td} text-muted-foreground`}>{s.rf ? `até ${mesDeChave(s.rf)}` : "contínua"}</td>
                <td className={td}><BotaoExcluir onConfirmar={() => excluir.mutate(s.id)} /></td>
              </tr>
            ))}
            {!lista.length ? <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhuma saída.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
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
  const vazio = { codigo: "", empresa: "", carteira: "", grupo: "", regime: "", dia: "", valor: "", inicio: "", fim: "" };
  const [f, setF] = useState(vazio);
  const [ordem, setOrdem] = useState<Ordenacao>("az");
  const [grupo, setGrupo] = useState("");
  const [carteira, setCarteira] = useState("");
  const grupos = useMemo(() => opcoesDe(data, (e) => e.grupo), [data]);
  const carteiras = useMemo(() => opcoesDe(data, (e) => e.carteira), [data]);
  const listaBase = data.filter((e) => (!grupo || chaveFiltro(e.grupo) === grupo) && (!carteira || chaveFiltro(e.carteira) === carteira) && contem(busca, e.codigo, e.empresa, e.carteira, e.grupo, e.regime));
  const lista = ordenar(listaBase, ordem, (e) => e.empresa, (e) => Number(e.valor), (e) => e.dia);
  const ativos = lista.filter((e) => e.ativo);

  return (
    <>
      <Barra total={`${lista.length} contratos · ${formatarBRL(ativos.reduce((t, e) => t + Number(e.valor), 0))}/mês (ativos)`}>
        <Importar tipo="entradas" rotulo="entradas" />
      </Barra>
      <Form onSubmit={() => {
        const valor = paraNumero(f.valor);
        if (!f.empresa.trim() || valor == null) return;
        inserir.mutate({ codigo: f.codigo || null, empresa: f.empresa.trim(), carteira: f.carteira || null, grupo: f.grupo || null, regime: f.regime || null, dia: Number(f.dia) || null, valor, inicio: f.inicio || null, fim: f.fim || null, origem: "manual" });
        setF(vazio);
      }}>
        <F l="Código"><Input className="h-8 w-20" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} /></F>
        <F l="Empresa"><Input className="h-8 w-56" value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })} /></F>
        <F l="Carteira"><Input className="h-8 w-32" value={f.carteira} onChange={(e) => setF({ ...f, carteira: e.target.value })} /></F>
        <F l="Grupo"><Input className="h-8 w-32" value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })} /></F>
        <F l="Regime"><Input className="h-8 w-36" value={f.regime} onChange={(e) => setF({ ...f, regime: e.target.value })} /></F>
        <F l="Dia"><Input className="h-8 w-16" type="number" min={1} max={31} value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} /></F>
        <F l="Valor/mês"><Input className="num h-8 w-28" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" /></F>
        <F l="Início (opcional)"><Input className="h-8 w-36" type="month" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></F>
        <F l="Fim (opcional)"><Input className="h-8 w-36" type="month" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></F>
      </Form>
      <div className="surface-card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <th className={th}>Código</th>
            <CabecalhoFiltro titulo="Empresa" ordem={ordem} ordens={["az", "za"]} onOrdem={setOrdem} />
            <CabecalhoFiltro titulo="Carteira" filtro={carteira} opcoes={carteiras} onFiltro={setCarteira} />
            <CabecalhoFiltro titulo="Grupo" filtro={grupo} opcoes={grupos} onFiltro={setGrupo} />
            <th className={th}>Regime</th>
            <CabecalhoFiltro titulo="Dia" ordem={ordem} ordens={["dia"]} onOrdem={setOrdem} />
            <th className={th}>Ativo</th>
            <CabecalhoFiltro titulo="Valor/mês" ordem={ordem} ordens={["maior", "menor"]} onOrdem={setOrdem} />
            <th className={th}>Início</th><th className={th}>Fim</th><th className={th}></th>
          </tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} className={`border-b border-border/60 ${e.ativo ? "" : "opacity-50"}`}>
                <td className={`${td} num`}>{e.codigo}</td>
                <td className={td}>{e.empresa}</td>
                <td className={td}>{e.carteira}</td>
                <td className={td}>{e.grupo}</td>
                <td className={td}>{e.regime}</td>
                <td className={`${td} num`}>{e.dia}</td>
                <td className={td}><Checkbox checked={e.ativo} onCheckedChange={(v) => atualizar.mutate({ id: e.id, v: { ativo: !!v } })} /></td>
                <td className={td}><CampoValor valor={Number(e.valor)} onSalvar={(n) => atualizar.mutate({ id: e.id, v: { valor: n } })} /></td>
                <td className={td}><Input className="num h-7 w-32" type="month" defaultValue={e.inicio ?? ""} title="Vazio = desde sempre" onBlur={(ev) => { const v = ev.target.value || null; if (v !== e.inicio) atualizar.mutate({ id: e.id, v: { inicio: v } }); }} /></td>
                <td className={td}><Input className="num h-7 w-32" type="month" defaultValue={e.fim ?? ""} title="Vazio = contínua" onBlur={(ev) => { const v = ev.target.value || null; if (v !== e.fim) atualizar.mutate({ id: e.id, v: { fim: v } }); }} /></td>
                <td className={td}><BotaoExcluir onConfirmar={() => excluir.mutate(e.id)} /></td>
              </tr>
            ))}
            {!lista.length ? <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Nenhuma entrada.</td></tr> : null}
          </tbody>
        </table>
      </div>
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

  return (
    <>
      <Barra total={`${lista.length} entradas pessoais · ${formatarBRL(lista.reduce((t, e) => t + Number(e.valor), 0))}/mês`}>
        <Importar tipo="entradas_pessoais" rotulo="entradas pessoais" />
      </Barra>
      <Form onSubmit={() => {
        const valor = paraNumero(f.valor);
        if (!f.descricao.trim() || valor == null) return;
        inserir.mutate({ descricao: f.descricao.trim(), dia: Number(f.dia) || null, banco: f.banco ? normalizarBanco(f.banco) : null, inicio: f.inicio || k1 || null, fim: f.fim || null, valor, origem: "manual" });
        setF(vazio);
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
                <td className={td}>{e.descricao}</td>
                <td className={`${td} num`}>{e.dia}</td>
                <td className={td}>{e.banco}</td>
                <td className={`${td} num`}>{mesDeChave(e.inicio)}</td>
                <td className={`${td} num`}>{e.fim ? mesDeChave(e.fim) : "contínua"}</td>
                <td className={td}><CampoValor valor={Number(e.valor)} onSalvar={(n) => atualizar.mutate({ id: e.id, v: { valor: n } })} /></td>
                <td className={td}><BotaoExcluir onConfirmar={() => excluir.mutate(e.id)} /></td>
              </tr>
            ))}
            {!lista.length ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma entrada pessoal.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

