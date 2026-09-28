import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Regra do projeto: nada é apagado sem confirmação na própria tela.
 * O botão vira "Confirmar" por 3 segundos e depois volta ao estado normal.
 */
export function BotaoExcluir({
  onConfirmar,
  rotulo = "Excluir",
}: {
  onConfirmar: () => void;
  rotulo?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function clicar() {
    if (confirmando) {
      if (timer.current) clearTimeout(timer.current);
      setConfirmando(false);
      onConfirmar();
      return;
    }
    setConfirmando(true);
    timer.current = setTimeout(() => setConfirmando(false), 3000);
  }

  return (
    <Button
      type="button"
      variant={confirmando ? "destructive" : "ghost"}
      size="sm"
      onClick={clicar}
    >
      <Trash2 className="size-4" />
      {confirmando ? "Confirmar" : rotulo}
    </Button>
  );
}
