import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Ação em massa com confirmação na tela: o botão vira "Confirmar" por 3 segundos. */
export function BotaoConfirmar({ onConfirmar, children, disabled }: { onConfirmar: () => void; children: ReactNode; disabled?: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <Button type="button" size="sm" variant={confirmando ? "default" : "outline"} disabled={disabled}
      onClick={() => {
        if (confirmando) { if (timer.current) clearTimeout(timer.current); setConfirmando(false); onConfirmar(); return; }
        setConfirmando(true);
        timer.current = setTimeout(() => setConfirmando(false), 3000);
      }}>
      {confirmando ? "Confirmar" : children}
    </Button>
  );
}
