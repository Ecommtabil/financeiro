import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/situacao")({
  head: () => ({
    meta: [
      { title: "Situação atual · Fluxo Escritório & Casa" },
      { name: "description", content: "Saldos, investimentos e dívidas na data da base zero." },
      { property: "og:title", content: "Situação atual · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Saldos, investimentos e dívidas na data da base zero." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Situação atual" descricao="Saldos, investimentos e dívidas na data da base zero."  />,
});
