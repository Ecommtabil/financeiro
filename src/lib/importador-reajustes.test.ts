import { describe, expect, it } from "vitest";
import { defDe, type Ctx } from "./importador";
import { calcularHorizonte } from "./horizonte";
import type { Config } from "./config";
import type { Entrada, EntradaPessoal, Saida } from "./dados";

function contexto(): Ctx {
  const cfg = {
    base_data: "2026-12-31",
    anos_projecao: 5,
    incluir_restante: true,
    reajuste_mes: 1,
    indice_padrao_entradas: 5,
    indice_padrao_saidas: 5.92,
    regras_categoria: {},
    regras_item: {},
    premissas: {},
  } as Config;
  return {
    cfg,
    h: calcularHorizonte(cfg.base_data!, cfg.anos_projecao, cfg.incluir_restante),
    entradas: [{ id: "e1", empresa: "Cliente A", carteira: "Mensal", valor: 1000, valores_base: {} } as Entrada],
    saidas: [{ id: "s1", descricao: "Despesa B", categoria: "Operação", destino: "ESCRITORIO", valor_fixo: 100, valores_mes: {} } as Saida],
    pessoais: [{ id: "p1", descricao: "Entrada pessoal C", valor: 500, valores_base: {} } as EntradaPessoal],
    saldos: [], baixas: [], investimentos: [], bens: [], dividas: [], carteira: [],
  };
}

describe("modelo avulso de reajustes", () => {
  it("exporta somente entradas do escritório e não oferece índice de saídas", () => {
    const modelo = defDe("reajustes").exportar(contexto());
    expect(modelo).toContainEqual(["ENTRADAS", "Mensal", "Cliente A", "SIM", 5]);
    expect(modelo).not.toContainEqual(["ÍNDICE PADRÃO SAÍDAS %", 5.92]);
    expect(JSON.stringify(modelo)).not.toContain("Despesa B");
    expect(JSON.stringify(modelo)).not.toContain("Entrada pessoal C");
  });

  it("ignora saídas enviadas na planilha avulsa e mantém o backup completo", () => {
    const c = contexto();
    const previa = defDe("reajustes").ler([
      ["GRUPO", "CATEGORIA", "NOME", "REAJUSTAR", "ÍNDICE ANUAL %"],
      ["ENTRADAS", "Mensal", "Cliente A", "SIM", 6.05],
      ["SAIDAS ESCRITORIO", "Operação", "Despesa B", "SIM", 2.5],
    ], c);
    expect(previa.resumo).toBe("1 item de reajuste");
    expect(previa.linhas).toHaveLength(1);
    expect(previa.linhas[0]?.[2]).toBe("Cliente A");
    expect(previa.avisos.join(" ")).toContain("Somente entradas são alteradas");

    const backup = defDe("reajustes").exportarBackup?.(c) ?? [];
    expect(JSON.stringify(backup)).toContain("Cliente A");
    expect(JSON.stringify(backup)).toContain("Despesa B");
    expect(JSON.stringify(backup)).toContain("Entrada pessoal C");
  });
});
