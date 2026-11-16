import { describe, expect, it } from "vitest";
import { atualizacaoValorEntrada, atualizacaoValorSaida, exibirMesNumerico, lerMesNumerico } from "./edicao-demonstrativo";
import type { Saida } from "./dados";

const saida = (v: Partial<Saida>): Saida => ({ id: "s1", valores_mes: {}, valor_fixo: null, ...v }) as Saida;

describe("edição pelos demonstrativos", () => {
  it("atualiza o valor/mês da entrada e limpa os meses-base", () => {
    expect(atualizacaoValorEntrada(3780)).toEqual({ valor: 3780, valores_base: {} });
  });

  it("atualiza uma saída fixa sem apagar sua vigência", () => {
    expect(atualizacaoValorSaida(saida({ valor_fixo: 100, ri: "2026-10", rf: "2027-01" }), 120, "2026-10"))
      .toEqual({ valor_fixo: 120 });
  });

  it("mantém meses anteriores e parcelas zeradas ao atualizar uma saída", () => {
    const r = atualizacaoValorSaida(saida({ valores_mes: { "2026-09": 90, "2026-10": 100, "2026-11": 0, "2026-12": 100 } }), 120, "2026-10");
    expect(r.valores_mes).toEqual({ "2026-09": 90, "2026-10": 120, "2026-11": 0, "2026-12": 120 });
  });

  it("valida datas numéricas em mm/aaaa", () => {
    expect(lerMesNumerico("03/2027")).toBe("2027-03");
    expect(lerMesNumerico("3 / 2027")).toBe("2027-03");
    expect(lerMesNumerico("13/2027")).toBeUndefined();
    expect(lerMesNumerico("")).toBeNull();
    expect(exibirMesNumerico("2027-03")).toBe("03/2027");
  });
});
