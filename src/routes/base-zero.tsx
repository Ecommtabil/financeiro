import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/base-zero")({
  head: () => ({
    meta: [
      { title: "Base zero · Fluxo Escritório & Casa" },
      {
        name: "description",
        content: "Data-foto com saldos bancários, investimentos e dívidas do momento atual.",
      },
      { property: "og:title", content: "Base zero · Fluxo Escritório & Casa" },
      {
        property: "og:description",
        content: "Data-foto com saldos bancários, investimentos e dívidas do momento atual.",
      },
    ],
  }),
  component: BaseZero,
});

function BaseZero() {
  return (
    <>
      <PageHeader
        eyebrow="Ponto de partida"
        title="Base zero"
        description="A data que fotografa a situação atual: saldos bancários, investimentos e dívidas valem para essa data."
      />
      <div className="px-6 py-8 lg:px-10">
        <EmBreve
          itens={[
            "Data da base zero e período de projeção (mínimo 5 anos completos)",
            "Saldos por banco, com nomes normalizados",
            "Investimentos e dívidas na data da foto",
            "Cadastro na tela ou importação por planilha",
          ]}
        />
      </div>
    </>
  );
}
