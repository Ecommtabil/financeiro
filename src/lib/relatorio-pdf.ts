import type { Horizonte, MesRef } from "./horizonte";
import { contasDoMes, destinoSaida, mapaBaixas, situacaoConta, type Baixa } from "./calc";
import type { Entrada, Saida, EntradaPessoal } from "./dados";
import type { Tables } from "@/integrations/supabase/types";
import { formatarMes, formatarNumero } from "./format";

/** PDF de conferência do Escritório: entradas e saídas do período, com situação e totais. */
export async function gerarRelatorioEscritorio(p: {
  rotulo: string;
  meses: MesRef[];
  entradas: Entrada[];
  saidas: Saida[];
  pessoais: EntradaPessoal[];
  baixas: Baixa[];
  cfg: Tables<"config">;
  h: Horizonte;
  area?: "ESCRITORIO" | "PESSOAL";
}) {
  const pes = p.area === "PESSOAL";
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const bx = mapaBaixas(p.baixas);
  const catDe = new Map(p.saidas.map((s) => [s.id, s]));
  const cartDe = new Map(p.entradas.map((e) => [e.id, e]));
  const azul: [number, number, number] = [30, 41, 82];

  doc.setFontSize(16);
  doc.text(`Relatório analítico de entradas e saídas · ${pes ? "Pessoal" : "Escritório"}`, 40, 46);
  doc.setFontSize(10);
  doc.text(`Período: ${p.rotulo}   ·   Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 64);

  let totE = 0, totS = 0;
  const resumo: string[][] = [];
  let y = 80;

  for (const m of p.meses) {
    const { receber, pagar } = contasDoMes(m, { entradas: p.entradas, saidas: p.saidas, pessoais: p.pessoais }, p.cfg, p.h);
    const rec = receber.filter((c) => c.tipo === (pes ? "pessoal" : "entrada")).sort((a, b) => (a.dia ?? 0) - (b.dia ?? 0) || a.nome.localeCompare(b.nome));
    const pag = pagar.filter((c) => (destinoSaida(catDe.get(c.id)!) === "PESSOAL") === pes).sort((a, b) => (a.dia ?? 0) - (b.dia ?? 0) || a.nome.localeCompare(b.nome));
    const val = (c: (typeof rec)[number]) => { const b = bx.get(`${c.tipo}|${c.id}|${c.mes}`); return b ? Number(b.valor) : c.valor; };
    const se = rec.reduce((a, c) => a + val(c), 0), ss = pag.reduce((a, c) => a + val(c), 0);
    totE += se; totS += ss;
    const mes = formatarMes(m.ano, m.mes);
    resumo.push([mes, String(rec.length), formatarNumero(se), String(pag.length), formatarNumero(ss), formatarNumero(se - ss)]);

    const tabela = (titulo: string, linhas: typeof rec, extra: (c: (typeof rec)[number]) => string, total: number) => {
      autoTable(doc, {
        startY: y,
        head: [[{ content: `${titulo} · ${mes}`, colSpan: 6, styles: { halign: "left", fillColor: azul } }], ["Dia", "Nome", titulo === "Entradas" ? "Carteira · grupo" : "Categoria", "Banco", "Situação", "Valor"]],
        body: linhas.map((c) => [c.dia ? String(c.dia).padStart(2, "0") : "—", c.nome, extra(c), c.banco ?? "—", situacaoConta(c, bx), formatarNumero(val(c))]),
        foot: [[{ content: `Total (${linhas.length})`, colSpan: 5 }, formatarNumero(total)]],
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [70, 90, 140] },
        footStyles: { fillColor: [230, 233, 240], textColor: 20 },
        columnStyles: { 0: { cellWidth: 28 }, 5: { halign: "right", cellWidth: 70 } },
        margin: { left: 40, right: 40 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    };
    tabela("Entradas", rec, (c) => { const e = cartDe.get(c.id); return [e?.carteira, e?.grupo].filter(Boolean).join(" · ") || "—"; }, se);
    tabela("Saídas", pag, (c) => catDe.get(c.id)?.categoria ?? "—", ss);
  }

  doc.addPage();
  doc.setFontSize(13);
  doc.text("Resumo do período", 40, 46);
  autoTable(doc, {
    startY: 60,
    head: [["Mês", "Nº entradas", "Entradas", "Nº saídas", "Saídas", pes ? "Resultado" : "Lucro"]],
    body: resumo,
    foot: [["Total", "", formatarNumero(totE), "", formatarNumero(totS), formatarNumero(totE - totS)]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: azul },
    footStyles: { fillColor: [230, 233, 240], textColor: 20 },
    columnStyles: { 2: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Fluxo Escritório & Casa · página ${i} de ${n}`, 40, doc.internal.pageSize.getHeight() - 20);
  }
  doc.save(`analitico-${pes ? "pessoal" : "escritorio"}-${p.rotulo.replace(/[^\w]+/g, "-")}.pdf`);
}

export type LinhaPdf = { rotulo: string; nivel: number; forte?: boolean; valores: number[] };
/** PDF de uma tabela com níveis (ex.: DRE exatamente como está expandida na tela). */
export async function gerarPdfTabela(p: { titulo: string; subtitulo: string; colunas: string[]; linhas: LinhaPdf[]; arquivo: string }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: p.colunas.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const azul: [number, number, number] = [30, 41, 82];
  doc.setFontSize(16); doc.text(p.titulo, 40, 46);
  doc.setFontSize(10); doc.text(`${p.subtitulo}   ·   Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 64);
  const col: Record<number, { halign: "right" }> = {};
  p.colunas.forEach((_, i) => { col[i + 1] = { halign: "right" }; });
  autoTable(doc, {
    startY: 80,
    head: [["Conta", ...p.colunas]],
    body: p.linhas.map((l) => [
      { content: "    ".repeat(l.nivel) + l.rotulo, styles: { fontStyle: l.forte ? "bold" : "normal", fillColor: l.forte ? [230, 233, 240] : undefined } },
      ...l.valores.map((v) => ({ content: formatarNumero(v), styles: { fontStyle: l.forte ? "bold" : "normal", textColor: v < 0 ? [190, 30, 45] : 20, fillColor: l.forte ? [230, 233, 240] : undefined } })),
    ]) as never,
    styles: { fontSize: p.colunas.length > 10 ? 6.5 : 8, cellPadding: 2.5 },
    headStyles: { fillColor: azul },
    columnStyles: col,
    margin: { left: 30, right: 30 },
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(`Fluxo Escritório & Casa · página ${i} de ${n}`, 40, doc.internal.pageSize.getHeight() - 20); }
  doc.save(p.arquivo);
}
