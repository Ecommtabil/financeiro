import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Panorama · Fluxo Escritório & Casa" },
      { name: "description", content: "Visão geral de entradas, saídas, lucro e reserva no período." },
      { property: "og:title", content: "Panorama · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Visão geral de entradas, saídas, lucro e reserva no período." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Panorama" descricao="Visão geral de entradas, saídas, lucro e reserva no período." usaPeriodo />,
});
