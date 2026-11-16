import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, FilePlus2, FileText, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { SelDia, SelLista } from "@/components/listas-cadastro";
import { supabase } from "@/integrations/supabase/client";
import { useConfig, useSalvarConfig } from "@/lib/config";
import { chaveMes, norm, paraNumero } from "@/lib/importacao";
import { formatarBRL, formatarMes, formatarNumero } from "@/lib/format";
import { usePeriodo } from "@/components/app-shell";
import { valorSaida, type Regra } from "@/lib/calc";
import type { Saida } from "@/lib/dados";
import {
  chaveAssinaturaFatura, chaveDaCompetencia, chaveParcelaFatura, extrairLancamentosFatura,
  gerarSaidasFatura, mesFaturaValido, origemFatura, somarMeses,
  type LancamentoFatura, type TipoFatura,
} from "@/lib/fatura-cartao";

const seletor = "h-8 rounded-md border border-input bg-background px-2 text-sm";
const tipos: { id: TipoFatura; rotulo: string }[] = [
  { id: "PONTUAL", rotulo: "Gasto pontual" },
  { id: "PARCELA", rotulo: "Parcela" },
  { id: "ASSINATURA", rotulo: "Assinatura" },
];

async function linhasDoPdf(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const conteudo = await page.getTextContent();
    const partes = conteudo.items.flatMap((i) => {
      const x = i as { str?: string; transform?: number[]; width?: number };
      return x.str?.trim() ? [{ texto: x.str, x: x.transform?.[4] ?? 0, y: x.transform?.[5] ?? 0, w: x.width ?? 0 }] : [];
    }).sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos: { y: number; partes: typeof partes }[] = [];
    for (const parte of partes) {
      let grupo = grupos.find((g) => Math.abs(g.y - parte.y) <= 3);
      if (!grupo) { grupo = { y: parte.y, partes: [] }; grupos.push(grupo); }
      grupo.partes.push(parte);
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) {
      g.partes.sort((a, b) => a.x - b.x);
      let linha = "", anterior: (typeof partes)[number] | null = null;
      for (const parte of g.partes) {
        const espaco = anterior && parte.x - (anterior.x + anterior.w) > 1.5 ? " " : "";
        linha += espaco + parte.texto;
        anterior = parte;
      }
      if (linha.trim()) linhas.push(linha.trim());
    }
  }
  return linhas;
}

function CampoValorFatura({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  return <Input className="num h-8 w-28 text-right" value={texto ?? formatarNumero(valor)}
    onFocus={() => setTexto(formatarNumero(valor))} onChange={(e) => setTexto(e.target.value)}
    onBlur={() => { const n = paraNumero(texto); setTexto(null); if (n != null && n >= 0) onChange(n); }}
    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}

export function FaturaCartao({ busca }: { busca: string }) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { horizonte } = usePeriodo();
  const { data: cfg } = useConfig();
  const salvarConfig = useSalvarConfig();
  const [itens, setItens] = useState<LancamentoFatura[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [cartao, setCartao] = useState("Cartão");
  const [competencia, setCompetencia] = useState("");
  const [dia, setDia] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<"TODOS" | TipoFatura>("TODOS");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [resultado, setResultado] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const visiveis = useMemo(() => itens.filter((i) =>
    (filtro === "TODOS" || i.tipo === filtro) && (!norm(busca) || norm(`${i.descricao} ${i.categoria}`).includes(norm(busca))),
  ), [itens, filtro, busca]);
  const selecionados = itens.filter((i) => i.incluir && i.valor > 0);
  const total = (tipo?: TipoFatura) => selecionados.filter((i) => !tipo || i.tipo === tipo).reduce((s, i) => s + i.valor, 0);

  const projecao = useMemo(() => {
    if (!selecionados.length || !mesFaturaValido(competencia) || !cartao.trim()) return [];
    try {
      const geradas = gerarSaidasFatura(selecionados, { cartao, competencia, dia });
      const primeira = chaveDaCompetencia(competencia);
      return Array.from({ length: 12 }, (_, n) => {
        const k = somarMeses(primeira, n);
        const valores = { PONTUAL: 0, PARCELA: 0, ASSINATURA: 0 } as Record<TipoFatura, number>;
        for (const g of geradas) valores[g.item.tipo] += valorSaida(g.saida as Saida, k);
        return { k, ...valores, total: valores.PONTUAL + valores.PARCELA + valores.ASSINATURA };
      });
    } catch { return []; }
  }, [selecionados, competencia, cartao, dia]);

  function editar(id: string, v: Partial<LancamentoFatura>) {
    setResultado(null);
    setItens((atual) => atual.map((i) => i.id === id ? { ...i, ...v } : i));
  }

  async function ler(file?: File) {
    if (!file) return;
    setErro(null); setResultado(null); setAvisos([]); setItens([]); setOcupado(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("O PDF deve ter no máximo 20 MB.");
      const r = extrairLancamentosFatura(await linhasDoPdf(file));
      if (!r.itens.length) throw new Error("Não encontrei lançamentos com data, descrição e valor. Se o PDF for digitalizado ou uma imagem, converta para um PDF com texto pesquisável.");
      setArquivo(file.name); setItens(r.itens); setFiltro("TODOS");
      const padrao = horizonte ? `${String(horizonte.primeiro.mes).padStart(2, "0")}/${horizonte.primeiro.ano}` : "";
      setCompetencia(r.competencia ?? padrao);
      setAvisos([
        `${r.itens.length} lançamentos encontrados. Revise a classificação antes de importar.`,
        ...(r.ignorados ? [`${r.ignorados} ${r.ignorados === 1 ? "crédito ou pagamento foi deixado" : "créditos ou pagamentos foram deixados"} de fora.`] : []),
        ...(!r.competencia ? ["Não identifiquei o vencimento: informe a competência da fatura."] : []),
      ]);
    } catch (e) {
      const msg = (e as Error).message;
      setErro(/password|senha/i.test(msg) ? "Esta fatura está protegida por senha. Salve uma cópia sem senha e tente de novo." : msg || "Não consegui ler este PDF.");
    } finally { setOcupado(false); }
  }

  function adicionar() {
    setItens((atual) => [...atual, {
      id: `manual-${Date.now()}`, data: "", descricao: "", valor: 0, tipo: "PONTUAL",
      parcelaAtual: null, parcelasTotal: null, categoria: "CARTÃO", destino: "PESSOAL", incluir: true,
    }]);
  }

  async function importar() {
    setErro(null); setResultado(null);
    if (!selecionados.length) return setErro("Selecione ao menos um lançamento com valor maior que zero.");
    if (!cartao.trim()) return setErro("Informe um nome para identificar o cartão.");
    if (!mesFaturaValido(competencia)) return setErro("Informe a competência no formato mm/aaaa.");
    if (selecionados.some((i) => !i.descricao.trim())) return setErro("Preencha a descrição de todos os lançamentos selecionados.");
    if (selecionados.some((i) => i.tipo === "PARCELA" && (!i.parcelaAtual || !i.parcelasTotal || i.parcelaAtual > i.parcelasTotal))) return setErro("Confira os números das parcelas selecionadas.");
    const k = chaveDaCompetencia(competencia);
    if (horizonte) {
      const ini = chaveMes(horizonte.primeiro.ano, horizonte.primeiro.mes), fim = chaveMes(horizonte.ultimo.ano, horizonte.ultimo.mes);
      if (k < ini || k > fim) return setErro(`A competência ${competencia} está fora do horizonte atual (${formatarMes(horizonte.primeiro.ano, horizonte.primeiro.mes)} a ${formatarMes(horizonte.ultimo.ano, horizonte.ultimo.mes)}).`);
    }
    setOcupado(true);
    try {
      const origem = origemFatura(cartao, competencia);
      const { data: existentes, error: erroBusca } = await supabase.from("saidas").select("*").like("origem", "fatura:%");
      if (erroBusca) throw erroBusca;
      const antigos = (existentes ?? []).filter((s) => s.origem === origem);
      const outrasFaturas = (existentes ?? []).filter((s) => s.origem !== origem);
      const geradas = gerarSaidasFatura(selecionados, { cartao, competencia, dia });
      let jaControlados = 0;
      const novas = geradas.filter((g) => {
        const duplicado = g.item.tipo === "PARCELA"
          ? outrasFaturas.some((s) => chaveParcelaFatura(s) === chaveParcelaFatura(g.saida))
          : g.item.tipo === "ASSINATURA" && outrasFaturas.some((s) => chaveAssinaturaFatura(s) === chaveAssinaturaFatura(g.saida));
        if (duplicado) jaControlados++;
        return !duplicado;
      });

      // Só a mesma fatura é substituída; lançamentos manuais e de outras faturas são preservados.
      if (antigos.length) {
        const { error } = await supabase.from("saidas").delete().eq("origem", origem);
        if (error) throw error;
      }
      const inseridos: { id: string }[] = [];
      for (let i = 0; i < novas.length; i += 200) {
        const lote = novas.slice(i, i + 200);
        const { data, error } = await supabase.from("saidas").insert(lote.map((g) => g.saida)).select("id");
        if (error) throw error;
        inseridos.push(...(data ?? []));
      }
      const regras = { ...((cfg?.regras_item ?? {}) as Record<string, Regra>) };
      for (const a of antigos) delete regras[a.id];
      novas.forEach((g, i) => {
        const id = inseridos[i]?.id;
        if (id && g.item.tipo === "PARCELA") regras[id] = { ...regras[id], sobe: false };
      });
      if (antigos.length || novas.some((g) => g.item.tipo === "PARCELA")) {
        await salvarConfig.mutateAsync({ regras_item: regras as never });
      }
      await qc.invalidateQueries({ queryKey: ["saidas"] });
      const msg = `${novas.length} ${novas.length === 1 ? "lançamento importado" : "lançamentos importados"}${jaControlados ? ` · ${jaControlados} já ${jaControlados === 1 ? "controlado não foi duplicado" : "controlados não foram duplicados"}` : ""}.`;
      setResultado(msg); toast.success(msg);
    } catch (e) { setErro(`Não foi possível importar: ${(e as Error).message}`); }
    finally { setOcupado(false); }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="mr-auto">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><CreditCard className="size-5 text-primary" />Importar fatura de cartão</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">O PDF é lido somente neste navegador. Revise os dados antes de criar as saídas.</p>
          </div>
          {itens.length ? <Button variant="outline" size="sm" onClick={() => { setItens([]); setArquivo(""); setResultado(null); setErro(null); }}><FilePlus2 className="size-4" />Nova fatura</Button> : null}
        </div>
        <button type="button" disabled={ocupado} onClick={() => arquivoRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); void ler(e.dataTransfer.files?.[0]); }}
          className={`mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/60 px-6 py-8 text-center transition-colors ${arrastando ? "border-primary bg-accent" : ""}`}>
          {arquivo ? <FileText className="size-8 text-primary" /> : <Upload className="size-8 text-muted-foreground" />}
          <span className="font-medium">{ocupado ? "Lendo a fatura…" : arquivo || "Arraste o PDF aqui ou clique para escolher"}</span>
          <span className="text-xs text-muted-foreground">PDF com texto pesquisável · até 20 MB</span>
        </button>
        <input ref={arquivoRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { void ler(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {erro ? <p role="alert" className="rounded-lg border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">{erro}</p> : null}
      {avisos.map((a) => <p key={a} className="rounded-lg bg-warning/15 px-4 py-2 text-sm">{a}</p>)}
      {resultado ? <p className="rounded-lg border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">{resultado} As saídas já alimentam os demais demonstrativos.</p> : null}

      {itens.length ? <>
        <div className="surface-card flex flex-wrap items-end gap-3 p-4">
          <label className="grid gap-1 text-xs text-muted-foreground">Identificação do cartão
            <Input className="h-8 w-56" value={cartao} onChange={(e) => setCartao(e.target.value)} placeholder="Ex.: Nubank final 1234" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Competência (mm/aaaa)
            <Input className="num h-8 w-32" value={competencia} onChange={(e) => setCompetencia(e.target.value)} placeholder="11/2026" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Dia do vencimento<SelDia value={dia} onChange={setDia} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Área para todos
            <select className={seletor} defaultValue="PESSOAL" onChange={(e) => setItens((atual) => atual.map((i) => ({ ...i, destino: e.target.value as "PESSOAL" | "ESCRITORIO" })))}>
              <option value="PESSOAL">Pessoal</option><option value="ESCRITORIO">Escritório</option>
            </select>
          </label>
          <Button className="ml-auto" variant="outline" size="sm" onClick={adicionar}><Plus className="size-4" />Adicionar lançamento</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([undefined, "PONTUAL", "PARCELA", "ASSINATURA"] as const).map((t) => <div key={t ?? "TOTAL"} className="surface-card p-4">
            <p className="label-eyebrow">{t === "PONTUAL" ? "Gastos pontuais" : t === "PARCELA" ? "Parcelas" : t === "ASSINATURA" ? "Assinaturas" : "Total desta fatura"}</p>
            <p className="num mt-2 text-xl font-semibold">{formatarBRL(total(t))}</p>
            <p className="mt-1 text-xs text-muted-foreground">{selecionados.filter((i) => !t || i.tipo === t).length} {selecionados.filter((i) => !t || i.tipo === t).length === 1 ? "lançamento" : "lançamentos"}</p>
          </div>)}
        </div>

        <div className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={visiveis.length > 0 && visiveis.every((i) => i.incluir)} onCheckedChange={(v) => {
              const ids = new Set(visiveis.map((i) => i.id)); setItens((atual) => atual.map((i) => ids.has(i.id) ? { ...i, incluir: !!v } : i));
            }} />Selecionar visíveis</label>
            <select className={`${seletor} ml-auto`} value={filtro} onChange={(e) => setFiltro(e.target.value as "TODOS" | TipoFatura)}>
              <option value="TODOS">Todos os tipos</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
            </select>
            <span className="num text-sm text-muted-foreground">{selecionados.length} de {itens.length} selecionados</span>
            <BotaoConfirmar disabled={ocupado} onConfirmar={() => void importar()}>{ocupado ? "Importando…" : "Importar fatura"}</BotaoConfirmar>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2"></th><th className="px-2 py-2">Data</th><th className="px-2 py-2">Descrição</th>
                <th className="px-2 py-2">Tipo</th><th className="px-2 py-2">Parcela</th><th className="px-2 py-2">Categoria</th>
                <th className="px-2 py-2">Área</th><th className="px-2 py-2 text-right">Valor</th>
              </tr></thead>
              <tbody>{visiveis.map((i) => <tr key={i.id} className={`border-b border-border/60 ${i.incluir ? "" : "opacity-45"}`}>
                <td className="px-3 py-2"><Checkbox checked={i.incluir} onCheckedChange={(v) => editar(i.id, { incluir: !!v })} /></td>
                <td className="num px-2 py-2 whitespace-nowrap">{i.data || "—"}</td>
                <td className="min-w-64 px-2 py-2"><Input className="h-8 w-full min-w-56" value={i.descricao} onChange={(e) => editar(i.id, { descricao: e.target.value })} /></td>
                <td className="px-2 py-2"><select className={seletor} value={i.tipo} onChange={(e) => {
                  const tipo = e.target.value as TipoFatura;
                  editar(i.id, { tipo, parcelaAtual: tipo === "PARCELA" ? i.parcelaAtual ?? 1 : null, parcelasTotal: tipo === "PARCELA" ? i.parcelasTotal ?? 2 : null,
                    categoria: tipo === "ASSINATURA" ? "ASSINATURAS" : tipo === "PARCELA" ? "PARCELAMENTOS" : i.categoria });
                }}>{tipos.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</select></td>
                <td className="px-2 py-2 whitespace-nowrap">{i.tipo === "PARCELA" ? <div className="flex items-center gap-1">
                  <Input type="number" min={1} max={360} className="num h-8 w-16" value={i.parcelaAtual ?? ""} onChange={(e) => editar(i.id, { parcelaAtual: Number(e.target.value) || null })} />
                  <span>/</span><Input type="number" min={2} max={360} className="num h-8 w-16" value={i.parcelasTotal ?? ""} onChange={(e) => editar(i.id, { parcelasTotal: Number(e.target.value) || null })} />
                </div> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 py-2"><SelLista lista="cad_categorias" value={i.categoria} onChange={(v) => editar(i.id, { categoria: v ?? "" })} /></td>
                <td className="px-2 py-2"><select className={seletor} value={i.destino} onChange={(e) => editar(i.id, { destino: e.target.value as "PESSOAL" | "ESCRITORIO" })}><option value="PESSOAL">Pessoal</option><option value="ESCRITORIO">Escritório</option></select></td>
                <td className="px-2 py-2"><CampoValorFatura valor={i.valor} onChange={(n) => editar(i.id, { valor: n })} /></td>
              </tr>)}</tbody>
            </table>
            {!visiveis.length ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum lançamento neste filtro.</p> : null}
          </div>
        </div>

        <details className="surface-card p-4">
          <summary className="cursor-pointer font-medium">Ver projeção desta fatura mês a mês</summary>
          <p className="mt-1 text-xs text-muted-foreground">Valores da fatura, sem reajustes anuais. Parcelas e assinaturas já controladas em outra fatura não serão duplicadas na importação.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Mês</th><th className="py-2 text-right">Pontuais</th><th className="py-2 text-right">Parcelas</th><th className="py-2 text-right">Assinaturas</th><th className="py-2 text-right">Total</th></tr></thead>
            <tbody>{projecao.map((p) => { const [a, m] = p.k.split("-").map(Number); return <tr key={p.k} className="border-b border-border/60"><td className="py-2">{formatarMes(a!, m!)}</td><td className="num py-2 text-right">{formatarBRL(p.PONTUAL)}</td><td className="num py-2 text-right">{formatarBRL(p.PARCELA)}</td><td className="num py-2 text-right">{formatarBRL(p.ASSINATURA)}</td><td className="num py-2 text-right font-semibold">{formatarBRL(p.total)}</td></tr>; })}</tbody>
          </table></div>
        </details>
      </> : null}
    </div>
  );
}
