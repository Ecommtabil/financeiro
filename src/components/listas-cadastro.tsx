import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfig, useSalvarConfig } from "@/lib/config";
import { useLista } from "@/lib/dados";
import { normalizarBanco } from "@/lib/format";

/** Pré-cadastro de categorias, pagamentos e bancos (salvo em config.carteira_listas com prefixo cad_). */
export type ChaveLista = "cad_categorias" | "cad_pgtos" | "cad_bancos";
const ROTULO: Record<ChaveLista, string> = { cad_categorias: "Categorias", cad_pgtos: "Pagamentos", cad_bancos: "Bancos" };
const sel = "h-7 max-w-44 rounded-md border border-input bg-background px-1.5 text-sm";

const limpar = (k: ChaveLista, v: string) => {
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return k === "cad_bancos" ? normalizarBanco(t) : k === "cad_categorias" ? t.toUpperCase() : t;
};
const unicos = (k: ChaveLista, l: (string | null | undefined)[]) =>
  [...new Set(l.map((v) => limpar(k, v ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function useListasCadastro() {
  const { data: cfg } = useConfig();
  const salvar = useSalvarConfig();
  const { data: saidas = [] } = useLista("saidas");
  const { data: entradas = [] } = useLista("entradas");
  const { data: pessoais = [] } = useLista("entradas_pessoais");
  const todas = (cfg?.carteira_listas ?? {}) as Record<string, unknown>;
  const salvas = (k: ChaveLista) => (Array.isArray(todas[k]) ? (todas[k] as string[]) : []);
  const listas = useMemo(() => ({
    cad_categorias: unicos("cad_categorias", [...salvas("cad_categorias"), ...saidas.map((s) => s.categoria)]),
    cad_pgtos: unicos("cad_pgtos", [...salvas("cad_pgtos"), ...saidas.map((s) => s.pgto)]),
    cad_bancos: unicos("cad_bancos", [...salvas("cad_bancos"), ...saidas.map((s) => s.banco), ...entradas.map((e) => e.banco), ...pessoais.map((p) => p.banco)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cfg, saidas, entradas, pessoais]);
  const gravar = (k: ChaveLista, l: string[]) => salvar.mutateAsync({ carteira_listas: { ...todas, [k]: unicos(k, l) } as never });
  return { listas, salvas, gravar, limpar };
}

/** Select ligado ao pré-cadastro; "+ novo…" adiciona à lista e já escolhe. */
export function SelLista({ lista, value, onChange, vazio = "—" }: { lista: ChaveLista; value: string | null; onChange: (v: string | null) => void; vazio?: string }) {
  const { listas, salvas, gravar } = useListasCadastro();
  const ops = listas[lista];
  const atual = value ?? "";
  return (
    <select className={sel} value={atual} onChange={async (e) => {
      const v = e.target.value;
      if (v === "__novo") {
        const n = limpar(lista, window.prompt(`Novo item em ${ROTULO[lista]}:`) ?? "");
        if (!n) return;
        if (!ops.includes(n)) await gravar(lista, [...salvas(lista), n]);
        onChange(n);
      } else onChange(v || null);
    }}>
      <option value="">{vazio}</option>
      {atual && !ops.includes(atual) ? <option value={atual}>{atual}</option> : null}
      {ops.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value="__novo">+ novo…</option>
    </select>
  );
}

export function SelDia({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <select className={`${sel} num w-16`} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">—</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
    </select>
  );
}

/** Botão + janela para editar o pré-cadastro (um item por linha). */
export function BotaoListas() {
  const { listas, gravar } = useListasCadastro();
  const [aberto, setAberto] = useState(false);
  const [txt, setTxt] = useState<Record<ChaveLista, string>>({ cad_categorias: "", cad_pgtos: "", cad_bancos: "" });
  const abrir = () => {
    setTxt({ cad_categorias: listas.cad_categorias.join("\n"), cad_pgtos: listas.cad_pgtos.join("\n"), cad_bancos: listas.cad_bancos.join("\n") });
    setAberto(true);
  };
  const salvar = async () => {
    try {
      for (const k of Object.keys(txt) as ChaveLista[]) await gravar(k, txt[k].split("\n"));
      toast.success("Listas salvas.");
      setAberto(false);
    } catch (e) { toast.error(`Não foi possível salvar: ${(e as Error).message}`); }
  };
  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={abrir}><ListChecks className="size-4" />Listas</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pré-cadastro das listas</DialogTitle>
            <DialogDescription>Um item por linha. Itens já usados em algum cadastro continuam aparecendo nas listas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(ROTULO) as ChaveLista[]).map((k) => (
              <label key={k} className="text-sm">
                <span className="text-xs text-muted-foreground">{ROTULO[k]}</span>
                <textarea className="mt-1 h-72 w-full rounded-md border border-input bg-background p-2 text-sm" value={txt[k]} onChange={(e) => setTxt({ ...txt, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <DialogFooter><Button onClick={salvar}>Salvar listas</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
