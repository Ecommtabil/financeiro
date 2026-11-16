import { describe, expect, it } from "vitest";
import { valorSaida, type Saida } from "./calc";
import { extrairLancamentosFatura, gerarSaidasFatura, somarMeses } from "./fatura-cartao";

function item(tipo: "PONTUAL" | "PARCELA" | "ASSINATURA") {
  return {
    id: tipo, data: "10/11", descricao: tipo === "PARCELA" ? "LOJA 02/04" : tipo,
    valor: 100, tipo, parcelaAtual: tipo === "PARCELA" ? 2 : null,
    parcelasTotal: tipo === "PARCELA" ? 4 : null, categoria: "CARTÃO",
    destino: "PESSOAL" as const, incluir: true,
  };
}

const op = { cartao: "Final 1234", competencia: "11/2026", dia: 10 };
const valor = (tipo: "PONTUAL" | "PARCELA" | "ASSINATURA", mes: string) =>
  valorSaida(gerarSaidasFatura([item(tipo)], op)[0]!.saida as Saida, mes);

describe("importação de fatura de cartão", () => {
  it("lê data, descrição, valor, parcela e assinatura", () => {
    const r = extrairLancamentosFatura([
      "VENCIMENTO 20/11/2026",
      "01/11 LOJA EXEMPLO 02/04 100,00",
      "03/11 NETFLIX.COM 39,90",
      "04/11 PAGAMENTO RECEBIDO -500,00",
    ]);
    expect(r.competencia).toBe("11/2026");
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0]).toMatchObject({ tipo: "PARCELA", parcelaAtual: 2, parcelasTotal: 4, valor: 100 });
    expect(r.itens[1]).toMatchObject({ tipo: "ASSINATURA", categoria: "ASSINATURAS" });
    expect(r.ignorados).toBe(1);
  });

  it("gasto pontual aparece só no mês da fatura", () => {
    expect(valor("PONTUAL", "2026-11")).toBe(100);
    expect(valor("PONTUAL", "2026-12")).toBe(0);
    expect(valor("PONTUAL", "2027-01")).toBe(0);
  });

  it("parcela 2/4 projeta três meses e zera depois da última", () => {
    expect(valor("PARCELA", "2026-11")).toBe(100);
    expect(valor("PARCELA", "2026-12")).toBe(100);
    expect(valor("PARCELA", "2027-01")).toBe(100);
    expect(valor("PARCELA", "2027-02")).toBe(0);
  });

  it("assinatura continua nos meses seguintes", () => {
    expect(valor("ASSINATURA", "2026-11")).toBe(100);
    expect(valor("ASSINATURA", "2026-12")).toBe(100);
    expect(valor("ASSINATURA", "2027-01")).toBe(100);
  });

  it("avança meses na virada do ano", () => {
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-11", 3)).toBe("2027-02");
  });
});
