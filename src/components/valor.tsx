import { cn } from "@/lib/utils";
import { formatarBRL } from "@/lib/format";

/** Exibe um valor em BRL com cor semântica (positivo/negativo) e fonte monoespaçada. */
export function Valor({
  valor,
  colorido = true,
  className,
}: {
  valor: number;
  colorido?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "num",
        colorido && valor > 0 && "text-positive",
        colorido && valor < 0 && "text-negative",
        className,
      )}
    >
      {formatarBRL(valor)}
    </span>
  );
}

export function ChipDestino({ destino }: { destino: "ESCRITORIO" | "PESSOAL" }) {
  return destino === "ESCRITORIO" ? (
    <span className="chip-escritorio">Escritório</span>
  ) : (
    <span className="chip-pessoal">Pessoal</span>
  );
}
