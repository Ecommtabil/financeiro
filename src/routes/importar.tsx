import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Planilhas · Fluxo Escritório & Casa" },
      {
        name: "description",
        content: "Modelos .xlsx preenchidos com os dados atuais e importação de cada cadastro.",
      },
      { property: "og:title", content: "Planilhas · Fluxo Escritório & Casa" },
      {
        property: "og:description",
        content: "Modelos .xlsx preenchidos com os dados atuais e importação de cada cadastro.",
      },
    ],
  }),
  component: Importar,
});

function Importar() {
  return (
    <>
      <PageHeader
        eyebrow="Entrada em lote"
        title="Planilhas"
        description="Cada tipo de cadastro tem seu modelo .xlsx, que sai preenchido com os dados atuais e com a aba COMO PREENCHER."
      />
      <div className="px-6 py-8 lg:px-10">
        <EmBreve
          itens={[
            "Baixar modelo de base zero, entradas e saídas",
            "Importar planilha preenchida com validação linha a linha",
            "Normalização automática dos nomes de bancos",
          ]}
        />
      </div>
    </>
  );
}
