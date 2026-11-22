import { describe, expect, it } from "vitest";
import { regrasComReajusteEmLote } from "./reajuste-lote";

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
