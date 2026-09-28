import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/projecao")({
  head: () => ({
    meta: [
      { title: "Projeção · Fluxo Escritório & Casa" },
      { name: "description", content: "Projeção mês a mês até o fim do horizonte, com reajustes anuais." },
      { property: "og:title", content: "Projeção · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Projeção mês a mês até o fim do horizonte, com reajustes anuais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Projeção" descricao="Projeção mês a mês até o fim do horizonte, com reajustes anuais."  />,
});
