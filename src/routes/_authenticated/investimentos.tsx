import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/investimentos")({
  head: () => ({
    meta: [
      { title: "Investimentos · Fluxo Escritório & Casa" },
      { name: "description", content: "Evolução das aplicações ao longo do horizonte." },
      { property: "og:title", content: "Investimentos · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Evolução das aplicações ao longo do horizonte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Investimentos" descricao="Evolução das aplicações ao longo do horizonte." usaPeriodo />,
});
