import { Link } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TipoImp } from "@/lib/importador";

/** Botão de importação de uma aba: abre o painel de importação já no tipo certo. */
export function LinkImportar({ tipo, rotulo, variant = "outline" }: { tipo: TipoImp; rotulo: string; variant?: "outline" | "default" }) {
  return (
    <Button size="sm" variant={variant} asChild>
      <Link to="/importar" search={{ tipo }}><FileSpreadsheet className="size-4" />{rotulo}</Link>
    </Button>
  );
}
