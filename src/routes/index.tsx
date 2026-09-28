import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel · Fluxo Escritório & Casa" },
      {
        name: "description",
        content: "Lucro do escritório e reserva pessoal projetados a partir da base zero.",
      },
      { property: "og:title", content: "Painel · Fluxo Escritório & Casa" },
      {
        property: "og:description",
        content: "Lucro do escritório e reserva pessoal projetados a partir da base zero.",
      },
    ],
  }),
  component: Painel,
});

const FORMULAS = [
  {
    titulo: "Lucro do escritório",
    formula: "Entradas − Saídas do escritório",
    chip: "escritorio" as const,
  },
  {
    titulo: "Reserva",
    formula: "Lucro + Entradas pessoais − Saídas pessoais",
    chip: "pessoal" as const,
  },
];

function Painel() {
  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Painel"
        description="Resumo do escritório e da casa a partir da base zero."
        actions={
          <Button asChild>
            <Link to="/base-zero">
              Definir base zero <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <div className="space-y-8 px-6 py-8 lg:px-10">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Cartao titulo="Entradas do escritório" />
          <Cartao titulo="Saídas do escritório" />
          <Cartao titulo="Lucro" destaque />
          <Cartao titulo="Reserva" destaque />
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {FORMULAS.map((f) => (
            <div key={f.titulo} className="surface-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">{f.titulo}</h2>
                <span className={f.chip === "escritorio" ? "chip-escritorio" : "chip-pessoal"}>
                  {f.chip === "escritorio" ? "Escritório" : "Pessoal"}
                </span>
              </div>
              <p className="num mt-3 text-sm text-muted-foreground">{f.formula}</p>
            </div>
          ))}
        </section>

        <section className="surface-card flex flex-col items-start gap-3 p-6">
          <span className="label-eyebrow">Próximo passo</span>
          <p className="max-w-xl text-sm text-muted-foreground">
            Ainda não existe uma base zero cadastrada. Informe a data-foto com os saldos
            bancários, investimentos e dívidas para que o sistema projete no mínimo 5 anos
            completos.
          </p>
          <Button asChild variant="outline">
            <Link to="/base-zero">Começar pela base zero</Link>
          </Button>
        </section>
      </div>
    </>
  );
}

function Cartao({ titulo, destaque }: { titulo: string; destaque?: boolean }) {
  return (
    <div className="surface-card p-5">
      <p className="label-eyebrow">{titulo}</p>
      <p
        className={
          destaque
            ? "num mt-2 text-2xl font-semibold text-primary"
            : "num mt-2 text-2xl font-semibold"
        }
      >
        —
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Sem dados ainda</p>
    </div>
  );
}
