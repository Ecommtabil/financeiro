import { describe, expect, it } from "vitest";
import { atualizacoesValorBaseEmLote, atualizacoesValorEmLote, regrasComReajusteEmLote, type ItemValorBase } from "./reajuste-lote";
import type { Entrada, EntradaPessoal, Saida } from "./dados";

describe("reajuste em lote das saídas", () => {
  it("aplica 5,92% somente às saídas escolhidas e ativa o reajuste", () => {
    const resultado = regrasComReajusteEmLote({ outra: { indice: 3, sobe: true } }, ["s1", "s2"], 5.92);
    expect(resultado["s1"]).toEqual({ indice: 5.92, sobe: true });
    expect(resultado["s2"]).toEqual({ indice: 5.92, sobe: true });
    expect(resultado["outra"]).toEqual({ indice: 3, sobe: true });
  });

  it("aplica 2,5% sem apagar uma exceção não selecionada nem mutar a configuração original", () => {
    const atuais = { s1: { indice: 5.92, sobe: true }, s2: { indice: 4, sobe: false } };
    const resultado = regrasComReajusteEmLote(atuais, ["s1"], 2.5);
    expect(resultado["s1"]).toEqual({ indice: 2.5, sobe: true });
    expect(resultado["s2"]).toEqual({ indice: 4, sobe: false });
    expect(atuais.s1).toEqual({ indice: 5.92, sobe: true });
  });
});

describe("valor mensal base em lote", () => {
  it("atualiza somente as saídas escolhidas e preserva meses anteriores e parcelas zeradas", () => {
    const saidas = [
      { id: "s1", valor_fixo: 100, valores_mes: {}, ri: "2027-01", rf: "2027-12" },
      { id: "s2", valor_fixo: null, valores_mes: { "2026-12": 90, "2027-01": 100, "2027-02": 0, "2027-03": 100 } },
      { id: "s3", valor_fixo: 300, valores_mes: {} },
    ] as Saida[];
    const r = atualizacoesValorEmLote(saidas, ["s1", "s2"], 150.75, "2027-01");
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ id: "s1", atualizacao: { valor_fixo: 150.75 } });
    expect(r[1]).toEqual({ id: "s2", atualizacao: { valores_mes: { "2026-12": 90, "2027-01": 150.75, "2027-02": 0, "2027-03": 150.75 } } });
    expect(saidas[2]!.valor_fixo).toBe(300);
  });

  it("atualiza entradas do escritório, pessoais e saídas com a regra correta de cada cadastro", () => {
    const itens: ItemValorBase[] = [
      { tabela: "entradas", id: "e1", registro: { id: "e1" } as Entrada },
      { tabela: "entradas_pessoais", id: "p1", registro: { id: "p1" } as EntradaPessoal },
      { tabela: "saidas", id: "s1", registro: { id: "s1", valor_fixo: 100, valores_mes: {} } as Saida },
      { tabela: "entradas", id: "e2", registro: { id: "e2" } as Entrada },
    ];
    const r = atualizacoesValorBaseEmLote(itens, ["e1", "p1", "s1"], 250.5, "2027-01");
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ tabela: "entradas", id: "e1", atualizacao: { valor: 250.5, valores_base: {} } });
    expect(r[1]).toMatchObject({ tabela: "entradas_pessoais", id: "p1", atualizacao: { valor: 250.5, valores_base: {} } });
    expect(r[2]).toMatchObject({ tabela: "saidas", id: "s1", atualizacao: { valor_fixo: 250.5 } });
  });
});
