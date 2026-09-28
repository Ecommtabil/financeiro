import { createFileRoute } from "@tanstack/react-router";
import { AbaVazia } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/cadastro")({
  head: () => ({
    meta: [
      { title: "Cadastro · Fluxo Escritório & Casa" },
      { name: "description", content: "Cadastre entradas, saídas e contas na tela ou importe por planilha." },
      { property: "og:title", content: "Cadastro · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Cadastre entradas, saídas e contas na tela ou importe por planilha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AbaVazia titulo="Cadastro" descricao="Cadastre entradas, saídas e contas na tela ou importe por planilha."  />,
});
