import { useRef, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarBRL, formatarNumero } from "@/lib/format";
import { paraNumero } from "@/lib/importacao";
import { baixarModeloPat, importarPat, type TabPat } from "@/lib/patrimonio";
import type { Saida } from "@/lib/dados";

export function CampoNum({ valor, onSalvar, className = "", casas = 2 }: { valor: number | null; onSalvar: (n: number) => void; className?: string; casas?: number }) {
  return (
    <Input key={valor ?? "x"} className={`num h-8 text-right ${className}`} defaultValue={valor == null ? "" : formatarNumero(valor, casas)} placeholder="0,00"
      onBlur={(e) => { const n = paraNumero(e.target.value) ?? 0; if (n !== valor) onSalvar(n); }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

export function CampoTxt({ valor, onSalvar, className = "", placeholder }: { valor: string | null; onSalvar: (s: string | null) => void; className?: string; placeholder?: string }) {
  return (
    <Input key={valor ?? "x"} className={`h-8 ${className}`} defaultValue={valor ?? ""} placeholder={placeholder}
      onBlur={(e) => { const s = e.target.value.trim() || null; if (s !== valor) onSalvar(s); }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

export function BotaoImportarPat({ tabela, rotulo, saidas }: { tabela: TabPat; rotulo: string; saidas: Saida[] }) {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setOcupado(true);
        try { toast.success(await importarPat(tabela, f, saidas)); qc.invalidateQueries({ queryKey: [tabela] }); }
        catch (err) { toast.error((err as Error).message); }
        finally { setOcupado(false); }
      }} />
      <Button size="sm" variant="ghost" title="Baixar modelo" onClick={() => baixarModeloPat(tabela)}><Download className="size-4" /></Button>
      <Button size="sm" variant="outline" disabled={ocupado} onClick={() => ref.current?.click()}><FileSpreadsheet className="size-4" />{ocupado ? "Importando…" : rotulo}</Button>
    </div>
  );
}

export function Op({ children }: { children: string }) {
  return <span className="num text-2xl text-muted-foreground">{children}</span>;
}
export function Ind({ rotulo, v, forte, extra }: { rotulo: string; v: number; forte?: boolean; extra?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={`num ${forte ? "text-2xl font-semibold" : "text-lg"} ${v < 0 ? "text-negative" : ""}`}>{formatarBRL(v)}</div>
      {extra && <div className="num text-xs text-muted-foreground">{extra}</div>}
    </div>
  );
}

export const selectCls = "h-8 rounded-md border bg-card px-2 text-sm";
