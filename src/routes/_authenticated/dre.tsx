import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/dre")({
  head: () => ({
    meta: [
      { title: "DRE · Fluxo Escritório & Casa" },
      { name: "description", content: "Demonstrativo de resultado do escritório, mês a mês ou por ano." },
      { property: "og:title", content: "DRE · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Demonstrativo de resultado do escritório, mês a mês ou por ano." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="DRE" descricao="Demonstrativo de resultado do escritório, mês a mês ou por ano." usaPeriodo />,
});
