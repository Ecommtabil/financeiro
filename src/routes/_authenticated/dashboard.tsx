import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Fluxo Escritório & Casa" },
      { name: "description", content: "Indicadores e gráficos do escritório e das finanças pessoais." },
      { property: "og:title", content: "Dashboard · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Indicadores e gráficos do escritório e das finanças pessoais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Dashboard" descricao="Indicadores e gráficos do escritório e das finanças pessoais." usaPeriodo />,
});
