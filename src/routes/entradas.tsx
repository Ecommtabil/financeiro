import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/entradas")({
  head: () => ({
    meta: [
      { title: "Entradas · Fluxo Escritório & Casa" },
      {
        name: "description",
        content: "Receitas do escritório e entradas pessoais que alimentam o lucro e a reserva.",
      },
      { property: "og:title", content: "Entradas · Fluxo Escritório & Casa" },
      {
        property: "og:description",
        content: "Receitas do escritório e entradas pessoais que alimentam o lucro e a reserva.",
      },
    ],
  }),
  component: Entradas,
});

function Entradas() {
  return (
    <>
      <PageHeader
        eyebrow="Recebimentos"
        title="Entradas"
        description="Entradas do escritório e entradas pessoais, mês a mês."
      />
      <div className="px-6 py-8 lg:px-10">
        <EmBreve
          itens={[
            "Lançamento por mês, com recorrência",
            "Separação entre escritório e pessoal",
            "Cadastro na tela ou importação por planilha",
          ]}
        />
      </div>
    </>
  );
}
