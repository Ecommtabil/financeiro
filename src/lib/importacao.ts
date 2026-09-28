import * as XLSX from "xlsx";
import { normalizarBanco } from "./format";
import type { TablesInsert } from "@/integrations/supabase/types";

export type TipoImport = "entradas" | "saidas" | "entradas_pessoais";

const MESES = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const NOME_ABA: Record<TipoImport, string> = { entradas: "ENTRADAS", saidas: "SAIDAS", entradas_pessoais: "ENTRADAS PESSOAIS" };

export const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();

export const chaveMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Aceita número ou texto pt-BR ("1.234,56", "R$ 10"). */
export function paraNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

export async function lerPlanilha(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  try {
    return XLSX.read(buf, { type: "array", cellDates: true });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (msg.includes("password") || msg.includes("encrypt") || msg.includes("cfb"))
      throw new Error("Salve uma cópia sem senha e importe a cópia");
    throw new Error("Não consegui ler esta planilha. Confira se é um arquivo .xlsx.");
  }
}

function linhas(wb: XLSX.WorkBook, tipo: TipoImport): unknown[][] {
  const alvo = NOME_ABA[tipo];
  const nomes = wb.SheetNames.filter((n) => norm(n) !== "COMO PREENCHER");
  const nome =
    wb.SheetNames.find((n) => norm(n) === alvo) ??
    (tipo === "entradas" ? undefined : wb.SheetNames.find((n) => norm(n).includes(alvo))) ??
    nomes[0];
  if (!nome) throw new Error("A planilha não tem abas com dados.");
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, { header: 1, raw: true, defval: null });
}

export function acharCabecalho(rows: unknown[][], chaves: string[]): number {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const cels = (rows[i] ?? []).map(norm);
    if (chaves.every((k) => cels.some((c) => c.includes(k)))) return i;
  }
  throw new Error(`Não achei o cabeçalho (procurei ${chaves.join(" e ")} nas 30 primeiras linhas).`);
}

const coluna = (cab: string[], ...ks: string[]) => cab.findIndex((c) => ks.some((k) => c.includes(k)));
const texto = (v: unknown) => (v == null ? null : String(v).trim() || null);
function dia(v: unknown): number | null {
  if (v instanceof Date) return v.getDate();
  const n = paraNumero(v);
  return n && n >= 1 && n <= 31 ? Math.round(n) : null;
}

/** Cabeçalho de mês: "OUTUBRO", "OUT/26", "10/2026", "OUTUBRO 2026" ou data do Excel. */
export function lerMes(v: unknown): { mes: number; ano: number | null } | null {
  if (v instanceof Date) return { mes: v.getMonth() + 1, ano: v.getFullYear() };
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return { mes: d.m, ano: d.y };
  }
  const s = norm(v);
  const ano = (a?: string) => (a ? (a.length === 2 ? 2000 + Number(a) : Number(a)) : null);
  let m = s.match(/^([A-Z]{3,})[\s/\-.]*(\d{2}|\d{4})?$/);
  if (m) {
    const i = MESES.findIndex((n) => n.startsWith(m![1]!.slice(0, 3)) && n.startsWith(m![1]!));
    if (i >= 0) return { mes: i + 1, ano: ano(m[2]) };
  }
  m = s.match(/^(\d{1,2})[/\-](\d{2}|\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { mes: Number(m[1]), ano: ano(m[2]) };
  return null;
}

export type Previa =
  | { tipo: "entradas"; itens: TablesInsert<"entradas">[]; resumo: string }
  | { tipo: "saidas"; itens: TablesInsert<"saidas">[]; resumo: string }
  | { tipo: "entradas_pessoais"; itens: TablesInsert<"entradas_pessoais">[]; resumo: string };

export async function lerImportacao(
  file: File,
  tipo: TipoImport,
  anoBase: number,
  fmt: { brl: (n: number) => string; mes: (k: string) => string },
): Promise<Previa> {
  const rows = linhas(await lerPlanilha(file), tipo);

  if (tipo === "entradas") {
    const h = acharCabecalho(rows, ["EMPRESA", "VALOR"]);
    const cab = (rows[h] ?? []).map(norm);
    const c = {
      cod: coluna(cab, "CODIGO"), emp: coluna(cab, "EMPRESA"), cart: coluna(cab, "CARTEIRA"),
      dia: coluna(cab, "VENCIMENTO", "DIA"), banco: coluna(cab, "RECEBIMENTO", "BANCO"), sit: coluna(cab, "SITUA"),
      reg: coluna(cab, "REGIME"), grupo: coluna(cab, "GRUPO"), setor: coluna(cab, "SETOR"), valor: coluna(cab, "VALOR"),
    };
    const itens: TablesInsert<"entradas">[] = [];
    for (const r of rows.slice(h + 1)) {
      const empresa = texto(r[c.emp]);
      const valor = paraNumero(r[c.valor]);
      if (!empresa || valor == null || valor === 0) continue;
      const banco = texto(r[c.banco]);
      itens.push({
        codigo: texto(r[c.cod]), empresa, carteira: texto(r[c.cart]), dia: dia(r[c.dia]),
        banco: banco ? normalizarBanco(banco) : null, ativo: !norm(r[c.sit]).startsWith("INATIV"),
        regime: texto(r[c.reg]), grupo: texto(r[c.grupo]), setor: texto(r[c.setor]), valor: r6(valor), origem: "import",
      });
    }
    const total = itens.reduce((s, i) => s + (i.valor ?? 0), 0);
    return { tipo, itens, resumo: `${itens.length} contratos · ${fmt.brl(total)}/mês` };
  }

  if (tipo === "entradas_pessoais") {
    const h = acharCabecalho(rows, ["ORIGEM", "VALOR"]);
    const cab = (rows[h] ?? []).map(norm);
    const c = { ori: coluna(cab, "ORIGEM"), dia: coluna(cab, "DIA"), banco: coluna(cab, "BANCO"), ini: coluna(cab, "INICIO"), fim: coluna(cab, "FIM"), valor: coluna(cab, "VALOR") };
    const mesDe = (v: unknown) => { const m = lerMes(v); return m ? chaveMes(m.ano ?? anoBase, m.mes) : null; };
    const itens: TablesInsert<"entradas_pessoais">[] = [];
    for (const r of rows.slice(h + 1)) {
      const descricao = texto(r[c.ori]);
      const valor = paraNumero(r[c.valor]);
      if (!descricao || !valor) continue;
      const banco = texto(r[c.banco]);
      itens.push({ descricao, dia: dia(r[c.dia]), banco: banco ? normalizarBanco(banco) : null, inicio: mesDe(r[c.ini]), fim: mesDe(r[c.fim]), valor: r6(valor), origem: "import" });
    }
    const total = itens.reduce((s, i) => s + (i.valor ?? 0), 0);
    return { tipo, itens, resumo: `${itens.length} entradas pessoais · ${fmt.brl(total)}/mês` };
  }

  const h = acharCabecalho(rows, ["DESCRI"]);
  const bruto = rows[h] ?? [];
  const cab = bruto.map(norm);
  const c = { desc: coluna(cab, "DESCRI"), cat: coluna(cab, "CATEGORIA"), pgto: coluna(cab, "PGTO", "PAGAMENTO"), banco: coluna(cab, "BANCO"), vcto: coluna(cab, "VCTO", "VENC"), dest: coluna(cab, "DESTINO") };
  const fixas = new Set(Object.values(c));
  const meses: { idx: number; chave: string }[] = [];
  let ano = anoBase, ant = 0;
  bruto.forEach((v, idx) => {
    if (fixas.has(idx)) return;
    const m = lerMes(v);
    if (!m) return;
    if (m.ano != null) ano = m.ano;
    else if (ant && m.mes < ant) ano++;
    ant = m.mes;
    meses.push({ idx, chave: chaveMes(ano, m.mes) });
  });
  if (!meses.length) throw new Error("Não achei as colunas de mês (ex.: OUTUBRO, OUT/26, 10/2026).");
  const ri = meses[0]!.chave, rf = meses[meses.length - 1]!.chave;

  const itens: TablesInsert<"saidas">[] = [];
  for (const r of rows.slice(h + 1)) {
    const descricao = texto(r[c.desc]);
    if (!descricao) continue;
    const valores_mes: Record<string, number> = {};
    for (const m of meses) {
      const n = paraNumero(r[m.idx]);
      if (n) valores_mes[m.chave] = r6(n);
    }
    let categoria = texto(r[c.cat]);
    let pgto = texto(r[c.pgto]);
    if (categoria && /^(FISICO|VIRTUAL) ?\(\d{4}\)$/.test(norm(categoria))) {
      pgto = `CARTÃO ${categoria}`;
      categoria = "ASSINATURAS";
    }
    const d = norm(r[c.dest]);
    const banco = texto(r[c.banco]);
    itens.push({
      descricao, categoria, pgto, banco: banco ? normalizarBanco(banco) : null, dia: dia(r[c.vcto]),
      destino: d.includes("ESCRIT") ? "ESCRITORIO" : d.includes("PESSOA") || d.includes("CASA") ? "PESSOAL" : null,
      valores_mes, ri, rf, origem: "import",
    });
  }
  return { tipo, itens, resumo: `${itens.length} despesas · ${fmt.mes(ri)} a ${fmt.mes(rf)}` };
}

/** Modelo preenchido + aba "COMO PREENCHER". */
export function baixarModelo(tipo: TipoImport) {
  const wb = XLSX.utils.book_new();
  const dados: Record<TipoImport, unknown[][]> = {
    entradas: [
      ["CODIGOS", "EMPRESAS", "CARTEIRA", "Dia do vencimento", "Recebimento", "Situação", "Regime Tributário", "Grupo", "Setor", "Valor"],
      [101, "Loja Exemplo Ltda", "Carteira A", 10, "SICREDI", "Ativo", "Simples Nacional", "Varejo", "Comércio", 1250],
      [102, "Serviços Modelo ME", "Carteira B", 15, "INTER", "Ativo", "Lucro Presumido", "Serviços", "Serviços", 890.5],
    ],
    saidas: [
      ["DESCRIÇÃO", "CATEGORIA", "PGTO", "BANCO", "VCTO", "DESTINO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO", "JANEIRO"],
      ["Aluguel sala", "ALUGUEL", "BOLETO", "SICREDI", 5, "ESCRITÓRIO", 2500, 2500, 2500, 2500],
      ["Streaming", "Virtual (2024)", "", "", 12, "CASA", 39.9, 39.9, 39.9, 39.9],
    ],
    entradas_pessoais: [
      ["ORIGEM", "DIA", "BANCO", "INICIO", "FIM", "VALOR"],
      ["Aluguel de imóvel", 10, "BANCO DO BRASIL", "10/2026", "", 1800],
    ],
  };
  const ajuda: Record<TipoImport, string[]> = {
    entradas: ["Uma linha por contrato. EMPRESAS e Valor são obrigatórios.", "Valor pode ser fórmula (ex.: =2500/7).", "Situação: Ativo ou Inativo."],
    saidas: ["Uma linha por despesa. DESCRIÇÃO é obrigatória.", "Uma coluna por mês: OUTUBRO, OUT/26, 10/2026 ou OUTUBRO 2026.", "Sem ano, o primeiro mês usa o ano da base zero e o ano sobe na virada de dezembro.", "DESTINO: ESCRITÓRIO, PESSOAL ou CASA (pode ficar vazio)."],
    entradas_pessoais: ["Uma linha por entrada pessoal. ORIGEM e VALOR são obrigatórios.", "INICIO e FIM no formato 10/2026 (FIM pode ficar vazio)."],
  };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados[tipo]), NOME_ABA[tipo]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["COMO PREENCHER"], ...ajuda[tipo].map((t) => [t]), ["A reimportação substitui só o que veio de planilha; o que foi cadastrado na tela é mantido."]]), "COMO PREENCHER");
  XLSX.writeFile(wb, `modelo-${tipo.replace("_", "-")}.xlsx`);
}
