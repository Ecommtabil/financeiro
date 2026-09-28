import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/balanco")({
  head: () => ({
    meta: [
      { title: "Balanço · Fluxo Escritório & Casa" },
      { name: "description", content: "Patrimônio: ativos, passivos e reserva acumulada." },
      { property: "og:title", content: "Balanço · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Patrimônio: ativos, passivos e reserva acumulada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Balanço" descricao="Patrimônio: ativos, passivos e reserva acumulada." usaPeriodo />,
});
