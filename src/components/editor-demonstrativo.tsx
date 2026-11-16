import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelDia, SelLista } from "@/components/listas-cadastro";
import { supabase } from "@/integrations/supabase/client";
import { useConfig } from "@/lib/config";
import { useLista, type Entrada, type EntradaPessoal, type Saida, type Tabela } from "@/lib/dados";
import {
  CHAVE_CAT_PESSOAL,
  chaveCatEntrada,
  chaveCatSaida,
  chaveMes,
  destinoSaida,
  fator,
  regraDo,
  valorEntrada,
  valorEntradaPessoal,
  valorSaida,
} from "@/lib/calc";
import {
  atualizacaoValorEntrada,
  atualizacaoValorSaida,
  exibirMesNumerico,
  lerMesNumerico,
} from "@/lib/edicao-demonstrativo";
import { formatarBRL, formatarMes } from "@/lib/format";
import { norm, paraNumero } from "@/lib/importacao";
import type { Horizonte, MesRef } from "@/lib/horizonte";
import { cn } from "@/lib/utils";

export type FiltroEditor = { id?: string; tabela?: Tabela; busca?: string };
type EditorCtx = { abrirEditor: (filtro?: FiltroEditor) => void };
const Ctx = createContext<EditorCtx>({ abrirEditor: () => undefined });
export const useEditorDemonstrativo = () => useContext(Ctx);

export function BotaoEditorDemonstrativo() {
  const { abrirEditor } = useEditorDemonstrativo();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="shrink-0"
      onClick={() => abrirEditor()}
      title="Expandir e editar entradas e saídas"
    >
      <Pencil className="size-4" />
      Editar lançamentos
    </Button>
  );
}

export function EditorDemonstrativoProvider({
  children,
  area,
  horizonte,
  mesesPeriodo,
}: {
  children: ReactNode;
  area: "ESCRITORIO" | "PESSOAL";
  horizonte: Horizonte | null;
  mesesPeriodo: MesRef[];
}) {
  const [estado, setEstado] = useState<{ aberto: boolean; filtro: FiltroEditor }>({
    aberto: false,
    filtro: {},
  });
  const abrirEditor = (filtro: FiltroEditor = {}) => setEstado({ aberto: true, filtro });
  return (
    <Ctx.Provider value={{ abrirEditor }}>
      {children}
      {estado.aberto && horizonte ? (
        <EditorDemonstrativo
          area={area}
          horizonte={horizonte}
          mesesPeriodo={mesesPeriodo}
          inicial={estado.filtro}
          aoFechar={() => setEstado((e) => ({ ...e, aberto: false }))}
        />
      ) : null}
    </Ctx.Provider>
  );
}

type Registro = Entrada | Saida | EntradaPessoal;
type Item = {
  id: string;
  tabela: Tabela;
  nome: string;
  categoria: string;
  grupo: string;
  valor: number;
  registro: Registro;
};
type Grupo = {
  chave: string;
  nome: string;
  tabela: Tabela;
  itens: Item[];
  todosIds: string[];
  total: number;
};

function EditorDemonstrativo({
  area,
  horizonte: h,
  mesesPeriodo,
  inicial,
  aoFechar,
}: {
  area: "ESCRITORIO" | "PESSOAL";
  horizonte: Horizonte;
  mesesPeriodo: MesRef[];
  inicial: FiltroEditor;
  aoFechar: () => void;
}) {
  const { data: cfg } = useConfig();
  const ent = useLista("entradas"),
    sai = useLista("saidas"),
    pes = useLista("entradas_pessoais");
  const [busca, setBusca] = useState(inicial.busca ?? "");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [itemAberto, setItemAberto] = useState<string | null>(inicial.id ?? null);
  const meses = mesesPeriodo.length ? mesesPeriodo : h.meses;

  const grupos = useMemo<Grupo[]>(() => {
    if (!cfg || !ent.data || !sai.data || !pes.data) return [];
    const itens: Item[] = [];
    const projetado = (tabela: Tabela, r: Registro, catKey: string) =>
      meses.reduce((total, m) => {
        const k = chaveMes(m);
        const base =
          tabela === "entradas"
            ? valorEntrada(r as Entrada, k)
            : tabela === "saidas"
              ? valorSaida(r as Saida, k)
              : valorEntradaPessoal(r as EntradaPessoal, k);
        if (!base) return total;
        const tipo = tabela === "saidas" ? "S" : "E";
        return total + base * fator(m, h, cfg.reajuste_mes, regraDo(cfg, r.id, catKey, tipo));
      }, 0);
    if (area === "ESCRITORIO")
      for (const e of ent.data) {
        const categoria = e.carteira?.trim() || "Sem carteira";
        itens.push({
          id: e.id,
          tabela: "entradas",
          nome: e.empresa,
          categoria,
          grupo: `entradas|${categoria}`,
          valor: projetado("entradas", e, chaveCatEntrada(e)),
          registro: e,
        });
      }
    for (const s of sai.data) {
      if (destinoSaida(s) !== area) continue;
      const categoria = s.categoria?.trim() || "Sem categoria";
      itens.push({
        id: s.id,
        tabela: "saidas",
        nome: s.descricao,
        categoria,
        grupo: `saidas|${categoria}`,
        valor: projetado("saidas", s, chaveCatSaida(s)),
        registro: s,
      });
    }
    if (area === "PESSOAL")
      for (const p of pes.data) {
        itens.push({
          id: p.id,
          tabela: "entradas_pessoais",
          nome: p.descricao,
          categoria: "Entradas pessoais",
          grupo: "entradas_pessoais|Entradas pessoais",
          valor: projetado("entradas_pessoais", p, CHAVE_CAT_PESSOAL),
          registro: p,
        });
      }
    const idsPorGrupo = new Map<string, string[]>();
    for (const i of itens) idsPorGrupo.set(i.grupo, [...(idsPorGrupo.get(i.grupo) ?? []), i.id]);
    const q = norm(busca);
    const filtrados = itens.filter(
      (i) =>
        !q ||
        norm(
          `${i.nome} ${i.categoria} ${i.tabela === "entradas" ? `${(i.registro as Entrada).grupo ?? ""} ${(i.registro as Entrada).setor ?? ""}` : ""}`,
        ).includes(q),
    );
    const mapa = new Map<string, Item[]>();
    for (const i of filtrados) mapa.set(i.grupo, [...(mapa.get(i.grupo) ?? []), i]);
    return [...mapa.entries()]
      .map(([chave, lista]) => ({
        chave,
        nome: lista[0]!.categoria,
        tabela: lista[0]!.tabela,
        todosIds: idsPorGrupo.get(chave) ?? [],
        itens: lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        total: lista.reduce((t, i) => t + i.valor, 0),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.tabela.localeCompare(b.tabela));
  }, [cfg, ent.data, sai.data, pes.data, area, meses, h, busca]);

  const alternar = (id: string) =>
    setAbertos((atual) => {
      const n = new Set(atual);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const efetivamenteAberto = (g: Grupo) =>
    abertos.has(g.chave) || g.itens.some((i) => i.id === inicial.id) || !!busca;
  const rotPeriodo = meses.length
    ? `${formatarMes(meses[0]!.ano, meses[0]!.mes)} a ${formatarMes(meses[meses.length - 1]!.ano, meses[meses.length - 1]!.mes)}`
    : "período atual";

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar();
      }}
    >
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-6 py-5 pr-14">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              Editar demonstrativo · {area === "ESCRITORIO" ? "Escritório" : "Pessoal"}
            </DialogTitle>
            <DialogDescription>
              Expanda uma categoria e depois um lançamento para alterar categoria, valor/mês e
              vigência. Período: {rotPeriodo}.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-6 py-3">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar lançamento, categoria, grupo ou setor"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAbertos(new Set(grupos.map((g) => g.chave)))}
          >
            Expandir categorias
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAbertos(new Set());
              setItemAberto(null);
            }}
          >
            Recolher
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {!cfg || ent.isLoading || sai.isLoading || pes.isLoading ? (
            <p className="py-12 text-center text-muted-foreground">Carregando lançamentos…</p>
          ) : null}
          {cfg && !grupos.length ? (
            <p className="py-12 text-center text-muted-foreground">Nenhum lançamento encontrado.</p>
          ) : null}
          <div className="space-y-3">
            {grupos.map((g) => (
              <section key={g.chave} className="overflow-hidden rounded-lg border bg-card">
                <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-4 py-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => alternar(g.chave)}
                    aria-label={`${efetivamenteAberto(g) ? "Recolher" : "Expandir"} ${g.nome}`}
                  >
                    {efetivamenteAberto(g) ? (
                      <ChevronDown className="size-4 shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" />
                    )}
                    <span className="font-semibold">{g.nome}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {g.itens.length}
                    </span>
                    <span className="chip-base text-muted-foreground">
                      {g.tabela === "entradas"
                        ? "Entradas"
                        : g.tabela === "saidas"
                          ? "Saídas"
                          : "Entradas pessoais"}
                    </span>
                  </button>
                  <span className="num text-sm font-semibold">{formatarBRL(g.total)}</span>
                  {g.tabela !== "entradas_pessoais" ? <RenomearGrupo grupo={g} /> : null}
                </div>
                {efetivamenteAberto(g) ? (
                  <div className="divide-y">
                    {g.itens.map((i) => (
                      <ItemEditor
                        key={`${i.tabela}|${i.id}`}
                        item={i}
                        horizonte={h}
                        aberto={itemAberto === i.id}
                        alternar={() => setItemAberto(itemAberto === i.id ? null : i.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
        <div className="border-t bg-muted/20 px-6 py-3 text-xs text-muted-foreground">
          O valor/mês atualiza a base do lançamento; os reajustes e as premissas da Projeção
          continuam aplicados. Todas as telas são recalculadas após salvar.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenomearGrupo({ grupo }: { grupo: Grupo }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(
    grupo.nome === "Sem categoria" || grupo.nome === "Sem carteira" ? "" : grupo.nome,
  );
  const qc = useQueryClient();
  const salvar = useMutation({
    mutationFn: async () => {
      const limpo = nome.trim().replace(/\s+/g, " ");
      if (!limpo) throw new Error("Informe o novo nome da categoria.");
      const campo = grupo.tabela === "entradas" ? "carteira" : "categoria";
      const valor = campo === "categoria" ? limpo.toUpperCase() : limpo;
      const { error } = await supabase
        .from(grupo.tabela)
        .update({ [campo]: valor } as never)
        .in("id", grupo.todosIds);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [grupo.tabela] });
      toast.success(
        `Categoria atualizada em ${grupo.todosIds.length} ${grupo.todosIds.length === 1 ? "lançamento" : "lançamentos"}.`,
      );
      setEditando(false);
    },
    onError: (e) => toast.error(e.message),
  });
  if (!editando)
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(true)}>
        <Pencil className="size-3.5" />
        Renomear categoria
      </Button>
    );
  return (
    <div className="flex w-full items-center gap-2 pt-1">
      <Input
        className="h-8 max-w-72"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder={grupo.tabela === "entradas" ? "Nova carteira" : "Nova categoria"}
      />
      <Button type="button" size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
        Aplicar a {grupo.todosIds.length}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
    </div>
  );
}

function ItemEditor({
  item,
  horizonte: h,
  aberto,
  alternar,
}: {
  item: Item;
  horizonte: Horizonte;
  aberto: boolean;
  alternar: () => void;
}) {
  const r = item.registro;
  const nomeInicial = item.nome;
  const categoriaInicial =
    item.tabela === "entradas"
      ? (r as Entrada).carteira
      : item.tabela === "saidas"
        ? (r as Saida).categoria
        : null;
  const k1 = chaveMes(h.primeiro);
  const valorInicial =
    item.tabela === "saidas"
      ? (r as Saida).valor_fixo != null
        ? Number((r as Saida).valor_fixo)
        : valorSaida(r as Saida, k1)
      : Number((r as Entrada | EntradaPessoal).valor);
  const [nome, setNome] = useState(nomeInicial);
  const [categoria, setCategoria] = useState<string | null>(categoriaInicial ?? null);
  const [dia, setDia] = useState<number | null>(r.dia);
  const [valor, setValor] = useState(String(valorInicial).replace(".", ","));
  const [inicio, setInicio] = useState(
    exibirMesNumerico(
      item.tabela === "saidas" ? (r as Saida).ri : (r as Entrada | EntradaPessoal).inicio,
    ),
  );
  const [fim, setFim] = useState(
    exibirMesNumerico(
      item.tabela === "saidas" ? (r as Saida).rf : (r as Entrada | EntradaPessoal).fim,
    ),
  );
  const [destino, setDestino] = useState(
    item.tabela === "saidas" ? ((r as Saida).destino ?? "") : "",
  );
  const [ativo, setAtivo] = useState(item.tabela === "entradas" ? (r as Entrada).ativo : true);
  const qc = useQueryClient();
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aberto) raiz.current?.scrollIntoView({ block: "nearest" });
  }, [aberto]);
  const salvar = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Preencha a descrição.");
      const n = paraNumero(valor);
      if (n == null) throw new Error("Informe o valor (ex.: 1.234,56).");
      const ini = lerMesNumerico(inicio),
        f = lerMesNumerico(fim);
      if (ini === undefined || f === undefined)
        throw new Error("Use datas no formato mm/aaaa (ex.: 03/2027).");
      if (ini && f && ini > f)
        throw new Error("A data final deve ser igual ou posterior à inicial.");
      const v: Record<string, unknown> = { dia };
      if (item.tabela === "entradas") {
        Object.assign(v, { empresa: nome.trim(), carteira: categoria, inicio: ini, fim: f, ativo });
        if (n !== valorInicial) Object.assign(v, atualizacaoValorEntrada(n));
      } else if (item.tabela === "entradas_pessoais") {
        Object.assign(v, { descricao: nome.trim(), inicio: ini, fim: f });
        if (n !== valorInicial) Object.assign(v, atualizacaoValorEntrada(n));
      } else {
        Object.assign(v, {
          descricao: nome.trim(),
          categoria: categoria?.trim().toUpperCase() || null,
          destino: destino || null,
          ri: ini,
          rf: f,
        });
        if (n !== valorInicial) Object.assign(v, atualizacaoValorSaida(r as Saida, n, k1));
      }
      const { error } = await supabase
        .from(item.tabela)
        .update(v as never)
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [item.tabela] });
      toast.success("Alterações salvas. Os demonstrativos foram atualizados.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div ref={raiz} className="px-4 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={alternar}
          aria-label={`${aberto ? "Recolher" : "Editar"} ${item.nome}`}
        >
          {aberto ? (
            <ChevronDown className="size-4 shrink-0 text-primary" />
          ) : (
            <ChevronRight className="size-4 shrink-0" />
          )}
          <span className={cn("truncate", aberto && "font-medium text-primary")}>{item.nome}</span>
          {item.tabela === "entradas" && !(r as Entrada).ativo ? (
            <span className="chip-base text-muted-foreground">inativa</span>
          ) : null}
        </button>
        <span className="num text-sm">{formatarBRL(item.valor)}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={alternar}
          aria-label={`Editar ${item.nome}`}
        >
          <Pencil className="size-4" />
        </Button>
      </div>
      {aberto ? (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo
              rotulo={
                item.tabela === "entradas"
                  ? "Empresa"
                  : item.tabela === "saidas"
                    ? "Descrição"
                    : "Origem"
              }
            >
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            {item.tabela === "entradas" ? (
              <Campo rotulo="Carteira / categoria">
                <SelLista lista="cad_carteiras" value={categoria} onChange={setCategoria} />
              </Campo>
            ) : null}
            {item.tabela === "saidas" ? (
              <Campo rotulo="Categoria">
                <SelLista lista="cad_categorias" value={categoria} onChange={setCategoria} />
              </Campo>
            ) : null}
            <Campo rotulo="Dia">
              <SelDia value={dia} onChange={setDia} />
            </Campo>
            <Campo rotulo="Valor/mês base">
              <Input
                className="num"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </Campo>
            <Campo rotulo="Início (mm/aaaa)">
              <Input
                className="num"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                placeholder="mm/aaaa"
              />
            </Campo>
            <Campo rotulo="Fim (opcional)">
              <Input
                className="num"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                placeholder="mm/aaaa"
              />
            </Campo>
            {item.tabela === "saidas" ? (
              <Campo rotulo="Destino">
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                >
                  <option value="">Sem destino</option>
                  <option value="ESCRITORIO">Escritório</option>
                  <option value="PESSOAL">Pessoal</option>
                </select>
              </Campo>
            ) : null}
            {item.tabela === "entradas" ? (
              <Campo rotulo="Situação">
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={ativo ? "sim" : "nao"}
                  onChange={(e) => setAtivo(e.target.value === "sim")}
                >
                  <option value="sim">Ativa</option>
                  <option value="nao">Inativa</option>
                </select>
              </Campo>
            ) : null}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              <Save className="size-4" />
              {salvar.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Deixe o fim vazio para manter o lançamento contínuo.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {rotulo}
      <span className="text-foreground [&_input]:h-9 [&_select]:h-9 [&_select]:max-w-full [&_select]:bg-background">
        {children}
      </span>
    </label>
  );
}
