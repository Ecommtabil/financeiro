import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/saidas")({
  head: () => ({
    meta: [
      { title: "Saídas · Fluxo Escritório & Casa" },
      {
        name: "description",
        content: "Despesas com destino escritório ou pessoal, com aviso quando o destino falta.",
      },
      { property: "og:title", content: "Saídas · Fluxo Escritório & Casa" },
      {
        property: "og:description",
        content: "Despesas com destino escritório ou pessoal, com aviso quando o destino falta.",
      },
    ],
  }),
  component: Saidas,
});

function Saidas() {
  return (
    <>
      <PageHeader
        eyebrow="Pagamentos"
        title="Saídas"
        description="Cada saída tem destino ESCRITÓRIO ou PESSOAL. Sem destino, conta como escritório e fica marcada para revisão."
      />
      <div className="space-y-6 px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip-escritorio">Escritório</span>
          <span className="chip-pessoal">Pessoal</span>
          <span className="text-xs text-warning">Sem destino → revisar</span>
        </div>
        <EmBreve
          itens={[
            "Lançamento por mês, com recorrência",
            "Destino obrigatório na revisão",
            "Cadastro na tela ou importação por planilha",
          ]}
        />
      </div>
    </>
  );
}
