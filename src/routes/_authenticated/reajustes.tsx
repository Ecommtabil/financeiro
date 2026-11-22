import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePeriodo, type Area } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { chaveCatSaida, chaveMes, destinoSaida, fator, regraDo, valorSaida, type Regra } from "@/lib/calc";
import { useConfig, useSalvarConfig } from "@/lib/config";
import { useLista, type Saida } from "@/lib/dados";
import { formatarBRL, formatarNumero } from "@/lib/format";
import { norm, paraNumero } from "@/lib/importacao";
import { atualizacoesValorEmLote, regrasComReajusteEmLote } from "@/lib/reajuste-lote";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reajustes")({
  head: () => ({
    meta: [
      { title: "Reajustes de saídas · Fluxo Escritório & Casa" },
      { name: "description", content: "Revise percentuais e valores base de todas as saídas e aplique reajustes em lote." },
      { property: "og:title", content: "Reajustes de saídas · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Revise percentuais e valores base de todas as saídas e aplique reajustes em lote." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reajustes,
});

const ATALHOS = [2.5, 5, 5.92, 10];
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

type Linha = {
  saida: Saida;
  area: Area;
  categoria: string;
  regra: ReturnType<typeof regraDo>;
  excecao: boolean;
  base: number;
  projetado: number;
};

function Reajustes() {
  const { horizonte: h } = usePeriodo();
  const { data: cfg } = useConfig();
  const { data: saidas = [], isLoading } = useLista("saidas");
  const salvar = useSalvarConfig();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [areaF, setAreaF] = useState<"TODAS" | Area>("TODAS");
  const [categoriaF, setCategoriaF] = useState("TODAS");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"percentual" | "valor">("percentual");
  const [indiceLote, setIndiceLote] = useState("5");
  const [valorLote, setValorLote] = useState("");

  const salvarValores = useMutation({
    mutationFn: async ({ ids, valor, primeiroMes }: { ids: string[]; valor: number; primeiroMes: string }) => {
      const atualizacoes = atualizacoesValorEmLote(saidas, ids, valor, primeiroMes);
      const resultados = await Promise.all(atualizacoes.map(({ id, atualizacao }) => supabase.from("saidas").update(atualizacao).eq("id", id)));
      const erro = resultados.find((r) => r.error)?.error;
      if (erro) throw erro;
      return atualizacoes.length;
    },
    onSuccess: async (quantidade, variaveis) => {
      await qc.invalidateQueries({ queryKey: ["saidas"] });
      toast.success(`Valor base de ${formatarBRL(variaveis.valor)} salvo em ${quantidade} ${quantidade === 1 ? "saída" : "saídas"}.`);
    },
    onError: (e) => toast.error(`Não foi possível salvar o valor base: ${e.message}`),
  });

  const regrasItem = (cfg?.regras_item ?? {}) as Record<string, Regra>;
  const linhas = useMemo<Linha[]>(() => {
    if (!h || !cfg) return [];
    const mes = { ano: h.y0, mes: cfg.reajuste_mes };
    const chave = chaveMes(mes);
    return saidas.map((saida) => {
      const area = destinoSaida(saida);
      const categoria = saida.categoria?.trim() || "Sem categoria";
      const regra = regraDo(cfg, saida.id, chaveCatSaida(saida), "S");
      const base = valorSaida(saida, chave);
      return {
        saida,
        area,
        categoria,
        regra,
        excecao: saida.id in regrasItem,
        base,
        projetado: base * fator(mes, h, cfg.reajuste_mes, regra),
      };
    }).sort((a, b) => a.saida.descricao.localeCompare(b.saida.descricao, "pt-BR"));
  }, [h, cfg, saidas, regrasItem]);

  const categorias = useMemo(() => [...new Set(linhas.filter((l) => areaF === "TODAS" || l.area === areaF).map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR")), [linhas, areaF]);
  const q = norm(busca);
  const visiveis = linhas.filter((l) =>
    (areaF === "TODAS" || l.area === areaF) &&
    (categoriaF === "TODAS" || l.categoria === categoriaF) &&
    (!q || norm(`${l.saida.descricao} ${l.categoria}`).includes(q)),
  );
  const escolhidas = linhas.filter((l) => selecionadas.has(l.saida.id));
  const todasVisiveis = visiveis.length > 0 && visiveis.every((l) => selecionadas.has(l.saida.id));
  const baseFiltrada = visiveis.reduce((total, l) => total + l.base, 0);
  const impactoFiltrado = visiveis.reduce((total, l) => total + l.projetado - l.base, 0);
  const indiceNumero = paraNumero(indiceLote);
  const valorNumero = paraNumero(valorLote);
  const erroSalvar = { onError: (e: Error) => toast.error(e.message) };

  if (!h || !cfg || isLoading) return <div className="px-6 py-8 text-muted-foreground lg:px-10">Carregando…</div>;

  const alternar = (id: string) => setSelecionadas((atuais) => {
    const novas = new Set(atuais);
    if (novas.has(id)) novas.delete(id); else novas.add(id);
    return novas;
  });
  const marcarVisiveis = (marcar: boolean) => setSelecionadas((atuais) => {
    const novas = new Set(atuais);
    for (const l of visiveis) if (marcar) novas.add(l.saida.id); else novas.delete(l.saida.id);
    return novas;
  });
  const salvarRegra = (l: Linha, nova: Regra) => salvar.mutate({
    regras_item: { ...regrasItem, [l.saida.id]: { indice: l.regra.indice, sobe: l.regra.sobe, ...nova } },
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
    salvar.mutate({ regras_item: regrasComReajusteEmLote(regrasItem, escolhidas.map((l) => l.saida.id), indice) }, {
      ...erroSalvar,
      onSuccess: () => toast.success(`${formatarNumero(indice)}% aplicado a ${escolhidas.length} ${escolhidas.length === 1 ? "saída" : "saídas"}.`),
    });
  };
  const aplicarValor = () => {
    if (!escolhidas.length || valorNumero == null || valorNumero < 0) return;
    salvarValores.mutate({ ids: escolhidas.map((l) => l.saida.id), valor: valorNumero, primeiroMes: chaveMes(h.primeiro) });
  };
  const salvarBase = (l: Linha, valor: number) => salvarValores.mutate({ ids: [l.saida.id], valor, primeiroMes: chaveMes(h.primeiro) });

  return (
    <div className="space-y-6 px-6 py-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-bold">Reajustes de saídas</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Todas as saídas em um só lugar. Edite cada percentual ou valor base, ou selecione várias para ajustar de uma vez. O percentual vale para o primeiro reajuste, em {h.y0}; os anos seguintes continuam usando as premissas da Projeção.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo rotulo="Saídas cadastradas" valor={String(linhas.length)} />
        <Resumo rotulo="Saídas no filtro" valor={String(visiveis.length)} />
        <Resumo rotulo="Valor base mensal" valor={formatarBRL(baseFiltrada)} />
        <Resumo rotulo={`Acréscimo mensal em ${h.y0}`} valor={`${impactoFiltrado > 0 ? "+" : ""}${formatarBRL(impactoFiltrado)}`} destaque />
      </div>

      <section className="surface-card sticky top-3 z-20 space-y-3 p-4 shadow-lg" aria-label="Ajuste em lote">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-48">
            <h2 className="text-sm font-semibold">Ajuste em lote</h2>
            <p className="text-xs text-muted-foreground">{escolhidas.length} {escolhidas.length === 1 ? "saída selecionada" : "saídas selecionadas"} · a seleção fica ativa para ajustes consecutivos</p>
          </div>
          <div className="inline-flex rounded-md border bg-background p-0.5" aria-label="Modo de ajuste em lote">
            <Button type="button" size="sm" variant={modo === "percentual" ? "default" : "ghost"} onClick={() => setModo("percentual")}>Percentual</Button>
            <Button type="button" size="sm" variant={modo === "valor" ? "default" : "ghost"} onClick={() => setModo("valor")}>Valor base</Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => marcarVisiveis(true)}>Visíveis</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSelecionadas(new Set(linhas.map((l) => l.saida.id)))}>Todas</Button>
          <Button type="button" variant="ghost" size="sm" disabled={!escolhidas.length} onClick={() => setSelecionadas(new Set())}>Nenhuma</Button>
        </div>
        {modo === "percentual" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Atalhos:</span>
            {ATALHOS.map((v) => <Button key={v} type="button" variant="secondary" size="sm" className="num" disabled={!escolhidas.length || salvar.isPending} onClick={() => aplicarPercentual(v)}>{formatarNumero(v)}%</Button>)}
            <Input aria-label="Percentual para aplicar em lote" inputMode="decimal" className="num ml-2 h-8 w-24" placeholder="Outro %" value={indiceLote} onChange={(e) => setIndiceLote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aplicarPercentual()} />
            <Button type="button" size="sm" disabled={!escolhidas.length || indiceNumero == null || indiceNumero < 0 || salvar.isPending} onClick={() => aplicarPercentual()}>Aplicar percentual</Button>
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
          <select aria-label="Filtrar por área" className={sel} value={areaF} onChange={(e) => { setAreaF(e.target.value as "TODAS" | Area); setCategoriaF("TODAS"); }}>
            <option value="TODAS">Todas as áreas</option>
            <option value="ESCRITORIO">Escritório</option>
            <option value="PESSOAL">Pessoal</option>
          </select>
          <select aria-label="Filtrar por categoria" className={sel} value={categoriaF} onChange={(e) => setCategoriaF(e.target.value)}>
            <option value="TODAS">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Buscar saída" className="pl-8" placeholder="Buscar saída ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b text-right">
                <th className="w-10 px-3 py-3 text-left"><Checkbox aria-label="Selecionar todas as saídas visíveis" checked={todasVisiveis} onCheckedChange={(v) => marcarVisiveis(v === true)} /></th>
                <th className="px-3 py-3 text-left">Saída</th>
                <th className="px-3 py-3 text-left">Área</th>
                <th className="px-3 py-3 text-left">Categoria</th>
                <th className="px-3 py-3 text-left">Reajustar</th>
                <th className="px-3 py-3 text-left">Percentual</th>
                <th className="px-3 py-3">Valor base/mês</th>
                <th className="px-3 py-3">Em {h.y0}/mês</th>
                <th className="px-3 py-3">Diferença/mês</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const id = l.saida.id;
                const diferenca = l.projetado - l.base;
                return (
                  <tr key={id} className={cn("border-b last:border-0 transition-colors", selecionadas.has(id) && "bg-primary/5")}>
                    <td className="px-3 py-2"><Checkbox aria-label={`Selecionar ${l.saida.descricao}`} checked={selecionadas.has(id)} onCheckedChange={() => alternar(id)} /></td>
                    <td className="px-3 py-2 font-medium">{l.saida.descricao}{l.excecao && <span className="chip-base ml-2 bg-secondary text-secondary-foreground">individual</span>}</td>
                    <td className="px-3 py-2"><span className={l.area === "PESSOAL" ? "chip-pessoal" : "chip-escritorio"}>{l.area === "PESSOAL" ? "Pessoal" : "Escritório"}</span></td>
                    <td className="px-3 py-2">{l.categoria}</td>
                    <td className="px-3 py-2"><Checkbox aria-label={`Reajustar ${l.saida.descricao}`} checked={l.regra.sobe} onCheckedChange={(v) => salvarRegra(l, { sobe: v === true })} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <CampoNumero ariaLabel={`Percentual de ${l.saida.descricao}`} valor={l.regra.indice} onSalvar={(v) => salvarRegra(l, { indice: v })} className="w-24" />
                        {l.excecao && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => usarCategoria(id)}>Usar categoria</Button>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right"><CampoNumero ariaLabel={`Valor base de ${l.saida.descricao}`} valor={l.base} onSalvar={(v) => salvarBase(l, v)} className="w-32 text-right" /></td>
                    <td className="num px-3 py-2 text-right font-semibold">{formatarBRL(l.projetado)}</td>
                    <td className={cn("num px-3 py-2 text-right", diferenca > 0 && "text-negative", diferenca < 0 && "text-positive")}>{diferenca > 0 ? "+" : ""}{formatarBRL(diferenca)}</td>
                  </tr>
                );
              })}
              {!visiveis.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Nenhuma saída encontrada com estes filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">O valor base é o valor mensal anterior ao primeiro reajuste. Saídas sem valor nesse mês continuam listadas para você cadastrar um valor quando necessário.</p>
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
