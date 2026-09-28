import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: "Contas a pagar e receber · Fluxo Escritório & Casa" },
      { name: "description", content: "Compromissos futuros de entrada e saída." },
      { property: "og:title", content: "Contas a pagar e receber · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Compromissos futuros de entrada e saída." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Contas a pagar e receber" descricao="Compromissos futuros de entrada e saída." usaPeriodo />,
});
