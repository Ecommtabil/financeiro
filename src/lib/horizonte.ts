import { formatarMes } from "./format";

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type MesRef = { ano: number; mes: number }; // mes 1-12
export type AnoHorizonte = {
  ano: number;
  parcial: boolean;
  rotulo: string; // "2026*" ou "2027"
  rotuloPeriodo: string; // "2026 (out–dez)" ou "2027"
  meses: MesRef[];
};
export type Horizonte = {
  base: MesRef & { dia: number };
  primeiro: MesRef;
  ultimo: MesRef;
  y0: number;
  meses: MesRef[];
  anos: AnoHorizonte[];
  totalMeses: number;
};

/** Regra única do horizonte de projeção — usada pelo app inteiro. baseISO = "aaaa-mm-dd". */
export function calcularHorizonte(baseISO: string, anosProjecao: number, incluirRestante: boolean): Horizonte {
  const partes = baseISO.split("-").map(Number);
  const by = partes[0] ?? 0, bm = partes[1] ?? 1, bd = partes[2] ?? 1;
  let primeiro: MesRef = bd === 1 ? { ano: by, mes: bm } : bm === 12 ? { ano: by + 1, mes: 1 } : { ano: by, mes: bm + 1 };
  if (!incluirRestante || primeiro.ano > by) primeiro = { ano: by + 1, mes: 1 };
  const ultimo: MesRef = { ano: by + anosProjecao, mes: 12 };

  const meses: MesRef[] = [];
  for (let a = primeiro.ano, m = primeiro.mes; a < ultimo.ano || (a === ultimo.ano && m <= 12); ) {
    meses.push({ ano: a, mes: m });
    if (m === 12) { a++; m = 1; } else m++;
  }

  const anos: AnoHorizonte[] = [];
  for (let a = primeiro.ano; a <= ultimo.ano; a++) {
    const ms = meses.filter((x) => x.ano === a);
    const parcial = ms.length < 12;
    anos.push({
      ano: a,
      parcial,
      rotulo: parcial ? `${a}*` : String(a),
      rotuloPeriodo: parcial ? `${a} (${MESES_CURTOS[(ms[0]?.mes ?? 1) - 1]}–${MESES_CURTOS[(ms[ms.length - 1]?.mes ?? 12) - 1]})` : String(a),
      meses: ms,
    });
  }

  return { base: { ano: by, mes: bm, dia: bd }, primeiro, ultimo, y0: by + 1, meses, anos, totalMeses: meses.length };
}

export function descreverHorizonte(h: Horizonte): string {
  return `Projeção de ${MESES_LONGOS[h.primeiro.mes - 1]} ${h.primeiro.ano} a ${MESES_LONGOS[h.ultimo.mes - 1]} ${h.ultimo.ano} · ${h.totalMeses} meses. Reajustes começam em ${h.y0}.`;
}

export function faixaCurta(h: Horizonte): string {
  return `${formatarMes(h.primeiro.ano, h.primeiro.mes)} a ${formatarMes(h.ultimo.ano, h.ultimo.mes)}`;
}

export function isoParaBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
