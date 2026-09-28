import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { EmBreve } from "@/components/em-breve";
import { formatarMes } from "@/lib/format";

export const Route = createFileRoute("/projecao")({
  head: () => ({
    meta: [
      { title: "Projeção · Fluxo Escritório & Casa" },
      {
        name: "description",
        content: "Lucro e reserva projetados mês a mês por no mínimo 5 anos-calendário.",
      },
      { property: "og:title", content: "Projeção · Fluxo Escritório & Casa" },
      {
        property: "og:description",
        content: "Lucro e reserva projetados mês a mês por no mínimo 5 anos-calendário.",
      },
    ],
  }),
  component: Projecao,
});

function Projecao() {
  const anoAtual = new Date().getFullYear();

  return (
    <>
      <PageHeader
        eyebrow="Horizonte"
        title="Projeção"
        description={`Mês a mês a partir da base zero — por exemplo ${formatarMes(anoAtual, 10)} até ${formatarMes(anoAtual + 5, 12)}.`}
      />
      <div className="px-6 py-8 lg:px-10">
        <EmBreve
          itens={[
            "Tabela mensal de lucro e reserva",
            "Gráficos de evolução",
            "Opção de incluir os meses restantes do ano da base zero",
          ]}
        />
      </div>
    </>
  );
}
