import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePeriodo } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  chaveCatEntrada, chaveCatSaida, chaveMes, fator, regraDo,
  valorEntrada, valorSaida, type Regra,
} from "@/lib/calc";
import { useConfig, useSalvarConfig } from "@/lib/config";
import { useLista, type Entrada, type Saida } from "@/lib/dados";
import { formatarBRL, formatarNumero } from "@/lib/format";
import { norm, paraNumero } from "@/lib/importacao";
import { atualizacoesValorBaseEmLote, regrasComReajusteEmLote, regrasComReajustesDiferentes, type ItemValorBase } from "@/lib/reajuste-lote";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reajustes")({
  head: () => ({
    meta: [
      { title: "Reajustes de entradas e saídas · Fluxo Escritório & Casa" },
      { name: "description", content: "Revise percentuais e valores base de entradas e saídas e aplique reajustes em lote." },
      { property: "og:title", content: "Reajustes de entradas e saídas · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Revise percentuais e valores base de entradas e saídas e aplique reajustes em lote." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reajustes,
});

const ATALHOS = [2.5, 5, 5.92, 10];
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

type Linha = ItemValorBase & {
  nome: string;
  tipo: "E" | "S";
  categoria: string;
  regra: ReturnType<typeof regraDo>;
  excecao: boolean;
  base: number;
  projetado: number;
};

function Reajustes() {
  const { horizonte: h } = usePeriodo();
  const { data: cfg } = useConfig();
  const entradasQuery = useLista("entradas");
  const saidasQuery = useLista("saidas");
  const entradas = entradasQuery.data ?? [];
  const saidas = saidasQuery.data ?? [];
  const salvar = useSalvarConfig();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [tipoF, setTipoF] = useState<"TODOS" | "E" | "S">("TODOS");
  const [categoriaF, setCategoriaF] = useState("TODAS");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"percentual" | "porItem" | "valor">("percentual");
  const [indiceLote, setIndiceLote] = useState("5");
  const [indicesPorItem, setIndicesPorItem] = useState<Record<string, string>>({});
  const [valorLote, setValorLote] = useState("");

  const salvarValores = useMutation({
    mutationFn: async ({ itens, ids, valor, primeiroMes }: { itens: ItemValorBase[]; ids: string[]; valor: number; primeiroMes: string }) => {
      const atualizacoes = atualizacoesValorBaseEmLote(itens, ids, valor, primeiroMes);
      const resultados = await Promise.all(atualizacoes.map((item) =>
        supabase.from(item.tabela as "saidas").update(item.atualizacao as never).eq("id", item.id),
      ));
      const erro = resultados.find((r) => r.error)?.error;
      if (erro) throw erro;
      return atualizacoes.length;
    },
    onSuccess: async (quantidade, variaveis) => {
      await Promise.all(["entradas", "saidas"].map((tabela) => qc.invalidateQueries({ queryKey: [tabela] })));
      toast.success(`Valor base de ${formatarBRL(variaveis.valor)} salvo em ${quantidade} ${quantidade === 1 ? "item" : "itens"}.`);
    },
    onError: (e) => toast.error(`Não foi possível salvar o valor base: ${e.message}`),
  });

  const regrasItem = (cfg?.regras_item ?? {}) as Record<string, Regra>;
  const linhas = useMemo<Linha[]>(() => {
    if (!h || !cfg) return [];
    const mes = { ano: h.y0, mes: cfg.reajuste_mes };
    const chave = chaveMes(mes);
    const comum = (id: string, regra: ReturnType<typeof regraDo>, base: number) => ({
      regra,
      excecao: id in regrasItem,
      base,
      projetado: base * fator(mes, h, cfg.reajuste_mes, regra),
    });
    const deEntradas: Linha[] = entradas.map((registro: Entrada) => {
      const regra = regraDo(cfg, registro.id, chaveCatEntrada(registro), "E");
      const base = valorEntrada(registro, chave);
      return {
        tabela: "entradas", id: registro.id, registro, nome: registro.empresa, tipo: "E",
        categoria: registro.carteira?.trim() || "Sem carteira", ...comum(registro.id, regra, base),
      };
    });
    const deSaidas: Linha[] = saidas.filter((registro) => registro.destino !== "PESSOAL").map((registro: Saida) => {
      const regra = regraDo(cfg, registro.id, chaveCatSaida(registro), "S");
      const base = valorSaida(registro, chave);
      return {
        tabela: "saidas", id: registro.id, registro, nome: registro.descricao, tipo: "S",
        categoria: registro.categoria?.trim() || "Sem categoria", ...comum(registro.id, regra, base),
      };
    });
    return [...deEntradas, ...deSaidas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [h, cfg, entradas, saidas, regrasItem]);

  const categorias = useMemo(() => [...new Set(linhas.filter((l) =>
    tipoF === "TODOS" || l.tipo === tipoF,
  ).map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR")), [linhas, tipoF]);
  const q = norm(busca);
  const visiveis = linhas.filter((l) =>
    (tipoF === "TODOS" || l.tipo === tipoF) &&
    (categoriaF === "TODAS" || l.categoria === categoriaF) &&
    (!q || norm(`${l.nome} ${l.categoria}`).includes(q)),
  );
  const escolhidas = linhas.filter((l) => selecionadas.has(l.id));
  const todasVisiveis = visiveis.length > 0 && visiveis.every((l) => selecionadas.has(l.id));
  const totalEntradas = visiveis.filter((l) => l.tipo === "E").length;
  const totalSaidas = visiveis.length - totalEntradas;
  const baseFiltrada = visiveis.reduce((total, l) => total + l.base, 0);
  const impactoFiltrado = visiveis.reduce((total, l) => total + l.projetado - l.base, 0);
  const indiceNumero = paraNumero(indiceLote);
  const valorNumero = paraNumero(valorLote);
  const erroSalvar = { onError: (e: Error) => toast.error(e.message) };

  if (!h || !cfg || entradasQuery.isLoading || saidasQuery.isLoading) {
    return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;
  }

  const alternar = (id: string) => setSelecionadas((atuais) => {
    const novas = new Set(atuais);
    if (novas.has(id)) novas.delete(id); else novas.add(id);
    return novas;
  });
  const marcarVisiveis = (marcar: boolean) => setSelecionadas((atuais) => {
    const novas = new Set(atuais);
    for (const l of visiveis) if (marcar) novas.add(l.id); else novas.delete(l.id);
    return novas;
  });
  const salvarRegra = (l: Linha, nova: Regra) => salvar.mutate({
    regras_item: { ...regrasItem, [l.id]: { indice: l.regra.indice, sobe: l.regra.sobe, ...nova } },
  }, erroSalvar);
  const usarCategoria = (id: string) => {
    const regras = { ...regrasItem };
    delete regras[id];
    salvar.mutate({ regras_item: regras }, erroSalvar);
  };
  const aplicarPercentual = (atalho?: number) => {
    const indice = atalho ?? indiceNumero;
    if (!escolhidas.length || indice == null || indice < 0) return;
    if (atalho != null) setIndiceLote(String(atalho).replace(".", ","));
    salvar.mutate({ regras_item: regrasComReajusteEmLote(regrasItem, escolhidas.map((l) => l.id), indice) }, {
      ...erroSalvar,
      onSuccess: () => toast.success(`${formatarNumero(indice)}% aplicado a ${escolhidas.length} ${escolhidas.length === 1 ? "item" : "itens"}.`),
    });
  };
  const aplicarDiferentes = () => {
    if (!escolhidas.length) return;
    const ajustes: Record<string, number> = {};
    for (const l of escolhidas) {
      const texto = indicesPorItem[l.id];
      const indice = texto == null ? l.regra.indice : paraNumero(texto);
      if (indice == null || indice < 0) {
        toast.error(`Informe um percentual válido para ${l.nome}.`);
        return;
      }
      ajustes[l.id] = indice;
    }
    salvar.mutate({ regras_item: regrasComReajustesDiferentes(regrasItem, ajustes) }, {
      ...erroSalvar,
      onSuccess: () => {
        setIndicesPorItem({});
        toast.success(`Percentuais diferentes aplicados a ${escolhidas.length} ${escolhidas.length === 1 ? "item" : "itens"}.`);
      },
    });
  };
  const aplicarValor = () => {
    if (!escolhidas.length || valorNumero == null || valorNumero < 0) return;
    salvarValores.mutate({ itens: escolhidas, ids: escolhidas.map((l) => l.id), valor: valorNumero, primeiroMes: chaveMes(h.primeiro) });
  };
  const salvarBase = (l: Linha, valor: number) => salvarValores.mutate({ itens: [l], ids: [l.id], valor, primeiroMes: chaveMes(h.primeiro) });

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-bold">Reajustes de entradas e saídas</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Entradas e saídas do escritório em um só lugar. Edite cada percentual ou valor base, ou selecione vários itens para ajustar de uma vez. O percentual vale para o primeiro reajuste, em {h.y0}; os anos seguintes continuam usando as premissas da Projeção.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo rotulo="Itens cadastrados" valor={String(linhas.length)} />
        <Resumo rotulo="Entradas / saídas no filtro" valor={`${totalEntradas} / ${totalSaidas}`} />
        <Resumo rotulo="Valor base mensal" valor={formatarBRL(baseFiltrada)} />
        <Resumo rotulo={`Variação mensal em ${h.y0}`} valor={`${impactoFiltrado > 0 ? "+" : ""}${formatarBRL(impactoFiltrado)}`} destaque />
      </div>

      <section className="surface-card sticky top-3 z-20 space-y-3 p-4 shadow-lg" aria-label="Ajuste em lote">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-48">
            <h2 className="text-sm font-semibold">Ajuste em lote</h2>
            <p className="text-xs text-muted-foreground">{escolhidas.length} {escolhidas.length === 1 ? "item selecionado" : "itens selecionados"} · a seleção fica ativa para ajustes consecutivos</p>
          </div>
          <div className="inline-flex rounded-md border bg-background p-0.5" aria-label="Modo de ajuste em lote">
            <Button type="button" size="sm" variant={modo === "percentual" ? "default" : "ghost"} onClick={() => setModo("percentual")}>Mesmo %</Button>
            <Button type="button" size="sm" variant={modo === "porItem" ? "default" : "ghost"} onClick={() => setModo("porItem")}>% por item</Button>
            <Button type="button" size="sm" variant={modo === "valor" ? "default" : "ghost"} onClick={() => setModo("valor")}>Valor base</Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => marcarVisiveis(true)}>Visíveis</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSelecionadas(new Set(linhas.map((l) => l.id)))}>Todos</Button>
          <Button type="button" variant="ghost" size="sm" disabled={!escolhidas.length} onClick={() => setSelecionadas(new Set())}>Nenhum</Button>
        </div>
        {modo === "percentual" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Atalhos:</span>
            {ATALHOS.map((v) => <Button key={v} type="button" variant="secondary" size="sm" className="num" disabled={!escolhidas.length || salvar.isPending} onClick={() => aplicarPercentual(v)}>{formatarNumero(v)}%</Button>)}
            <Input aria-label="Percentual para aplicar em lote" inputMode="decimal" className="num ml-2 h-8 w-24" placeholder="Outro %" value={indiceLote} onChange={(e) => setIndiceLote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aplicarPercentual()} />
            <Button type="button" size="sm" disabled={!escolhidas.length || indiceNumero == null || indiceNumero < 0 || salvar.isPending} onClick={() => aplicarPercentual()}>Aplicar percentual</Button>
          </div>
        ) : modo === "porItem" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-muted-foreground">Defina um percentual para cada selecionado e salve tudo de uma vez.</span>
              <Button type="button" size="sm" disabled={!escolhidas.length || salvar.isPending} onClick={aplicarDiferentes}>Aplicar percentuais</Button>
            </div>
            {escolhidas.length ? (
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                {escolhidas.map((l) => (
                  <label key={l.id} className="flex min-w-0 items-center gap-2 rounded-md border bg-background p-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium" title={l.nome}>{l.nome}</span>
                    <Input
                      aria-label={`Percentual individual de ${l.nome}`}
                      inputMode="decimal"
                      className="num h-8 w-24 text-right"
                      value={indicesPorItem[l.id] ?? formatarNumero(l.regra.indice)}
                      onChange={(e) => setIndicesPorItem((atuais) => ({ ...atuais, [l.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && aplicarDiferentes()}
                    />
                  </label>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">Selecione itens na tabela para definir percentuais diferentes.</p>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Novo valor base em lote" inputMode="decimal" className="num h-8 w-36" placeholder="Ex.: 1.234,56" value={valorLote} onChange={(e) => setValorLote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aplicarValor()} />
            <Button type="button" size="sm" disabled={!escolhidas.length || valorNumero == null || valorNumero < 0 || salvarValores.isPending} onClick={aplicarValor}>Definir valor base</Button>
            <span className="text-xs text-muted-foreground">Preserva vigências, parcelas zeradas e percentuais individuais.</span>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filtrar por tipo" className={sel} value={tipoF} onChange={(e) => { setTipoF(e.target.value as "TODOS" | "E" | "S"); setCategoriaF("TODAS"); }}>
            <option value="TODOS">Entradas e saídas</option>
            <option value="E">Somente entradas</option>
            <option value="S">Somente saídas</option>
          </select>
          <select aria-label="Filtrar por categoria" className={sel} value={categoriaF} onChange={(e) => setCategoriaF(e.target.value)}>
            <option value="TODAS">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Buscar item" className="pl-8" placeholder="Buscar item ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b text-right">
                <th className="w-10 px-3 py-3 text-left"><Checkbox aria-label="Selecionar todos os itens visíveis" checked={todasVisiveis} onCheckedChange={(v) => marcarVisiveis(v === true)} /></th>
                <th className="px-3 py-3 text-left">Item</th>
                <th className="px-3 py-3 text-left">Tipo</th>
                <th className="px-3 py-3 text-left">Categoria / carteira</th>
                <th className="px-3 py-3 text-left">Reajustar</th>
                <th className="px-3 py-3 text-left">Percentual</th>
                <th className="px-3 py-3">Valor base/mês</th>
                <th className="px-3 py-3">Em {h.y0}/mês</th>
                <th className="px-3 py-3">Diferença/mês</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const diferenca = l.projetado - l.base;
                const favoravel = l.tipo === "E" ? diferenca > 0 : diferenca < 0;
                return (
                  <tr key={`${l.tabela}-${l.id}`} className={cn("border-b last:border-0 transition-colors", selecionadas.has(l.id) && "bg-primary/5")}>
                    <td className="px-3 py-2"><Checkbox aria-label={`Selecionar ${l.nome}`} checked={selecionadas.has(l.id)} onCheckedChange={() => alternar(l.id)} /></td>
                    <td className="px-3 py-2 font-medium">{l.nome}{l.excecao && <span className="chip-base ml-2 bg-secondary text-secondary-foreground">individual</span>}</td>
                    <td className="px-3 py-2"><span className="chip-base bg-secondary text-secondary-foreground">{l.tipo === "E" ? "Entrada" : "Saída"}</span></td>
                    <td className="px-3 py-2">{l.categoria}</td>
                    <td className="px-3 py-2"><Checkbox aria-label={`Reajustar ${l.nome}`} checked={l.regra.sobe} onCheckedChange={(v) => salvarRegra(l, { sobe: v === true })} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <CampoNumero ariaLabel={`Percentual de ${l.nome}`} valor={l.regra.indice} onSalvar={(v) => salvarRegra(l, { indice: v })} className="w-24" />
                        {l.excecao && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => usarCategoria(l.id)}>Usar categoria</Button>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right"><CampoNumero ariaLabel={`Valor base de ${l.nome}`} valor={l.base} onSalvar={(v) => salvarBase(l, v)} className="w-32 text-right" /></td>
                    <td className="num px-3 py-2 text-right font-semibold">{formatarBRL(l.projetado)}</td>
                    <td className={cn("num px-3 py-2 text-right", diferenca !== 0 && (favoravel ? "text-positive" : "text-negative"))}>{diferenca > 0 ? "+" : ""}{formatarBRL(diferenca)}</td>
                  </tr>
                );
              })}
              {!visiveis.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Nenhum item encontrado com estes filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">O valor base é o valor mensal anterior ao primeiro reajuste. Itens sem valor nesse mês continuam listados; entradas inativas ou fora da vigência devem ser reativadas no Cadastro.</p>
      </section>
    </div>
  );
}

function Resumo({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return <div className="surface-card p-4"><div className="label-eyebrow">{rotulo}</div><div className={cn("num mt-1 text-lg font-semibold", destaque && "text-primary")}>{valor}</div></div>;
}

function CampoNumero({ valor, onSalvar, ariaLabel, className }: { valor: number; onSalvar: (valor: number) => void; ariaLabel: string; className?: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <Input
      aria-label={ariaLabel}
      inputMode="decimal"
      className={cn("num h-8", className)}
      value={texto ?? formatarNumero(valor)}
      onFocus={() => setTexto(formatarNumero(valor))}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const n = paraNumero(texto);
        setTexto(null);
        if (n == null || n < 0) {
          if (texto?.trim()) toast.error("Informe um número maior ou igual a zero.");
          return;
        }
        if (n !== valor) onSalvar(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
