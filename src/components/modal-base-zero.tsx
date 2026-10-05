import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { calcularHorizonte, descreverHorizonte, hojeISO } from "@/lib/horizonte";
import { useSalvarConfig, type Config } from "@/lib/config";

export function ModalBaseZero({
  aberto,
  obrigatorio,
  config,
  onFechar,
}: {
  aberto: boolean;
  obrigatorio: boolean;
  config: Config | null | undefined;
  onFechar: () => void;
}) {
  const salvar = useSalvarConfig();
  const [data, setData] = useState(hojeISO());
  const [anos, setAnos] = useState(5);
  const [restante, setRestante] = useState(true);

  useEffect(() => {
    if (!aberto) return;
    setData(config?.base_data ?? hojeISO());
    setAnos(config?.anos_projecao ?? 5);
    setRestante(config?.incluir_restante ?? true);
  }, [aberto, config]);

  const anosValidos = Math.min(30, Math.max(1, anos || 1));
  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(data);
  const previa = dataValida ? descreverHorizonte(calcularHorizonte(data, anosValidos, restante)) : "Informe a data.";

  async function confirmar() {
    await salvar.mutateAsync({ base_data: data, anos_projecao: anosValidos, incluir_restante: restante });
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !obrigatorio && onFechar()}>
      <DialogContent
        onInteractOutside={(e) => obrigatorio && e.preventDefault()}
        onEscapeKeyDown={(e) => obrigatorio && e.preventDefault()}
        className={obrigatorio ? "[&>button]:hidden" : undefined}
      >
        <DialogHeader>
          <DialogTitle>Base zero e período da projeção</DialogTitle>
          <DialogDescription>A data-foto dos saldos. Tudo no app parte daqui.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bz-data">Data da base zero</Label>
            <Input id="bz-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bz-anos">Anos a projetar (5 a 30)</Label>
            <Input id="bz-anos" type="number" min={1} max={30} value={anos} onChange={(e) => setAnos(Number(e.target.value))} className="num" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={restante} onCheckedChange={(v) => setRestante(v === true)} className="mt-0.5" />
            Projetar também os meses que faltam do ano da base zero
          </label>
          <p className="rounded-md bg-muted p-3 text-sm">{previa}</p>
          {salvar.error ? <p className="text-sm text-destructive">{(salvar.error as Error).message}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          {!obrigatorio ? <Button variant="outline" onClick={onFechar}>Cancelar</Button> : null}
          <Button onClick={confirmar} disabled={!dataValida || salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
