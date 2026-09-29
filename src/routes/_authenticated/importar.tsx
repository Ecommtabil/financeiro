import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import type * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { TIPOS, abasDoBackup, baixarBackup, baixarModeloTipo, carregarCtx, defDe, importarBackup, lerArquivo, type Previa, type TipoImp } from "@/lib/importador";
import { cn } from "@/lib/utils";

const IDS = TIPOS.map((t) => t.id) as TipoImp[];

export const Route = createFileRoute("/_authenticated/importar")({
  validateSearch: (s: Record<string, unknown>): { tipo?: TipoImp } =>
    IDS.includes(s["tipo"] as TipoImp) ? { tipo: s["tipo"] as TipoImp } : {},
  head: () => ({
    meta: [
      { title: "Importar planilha · Fluxo Escritório & Casa" },
      { name: "description", content: "Importe entradas, saídas, saldos, baixas, reajustes, DRE e patrimônio por planilha, ou faça backup completo." },
      { property: "og:title", content: "Importar planilha · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Importe qualquer cadastro por planilha e baixe o backup completo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Importar,
});

const COMPORTA: Record<TipoImp, string> = {
  entradas: "Substitui os importados e mantém os cadastrados na tela.",
  saidas: "Substitui as importadas e mantém as cadastradas na tela.",
  pessoais: "Substitui as importadas e mantém as cadastradas na tela.",
  saldos: "Atualiza o saldo dos bancos listados.",
  baixas: "Soma às baixas existentes (mesma conta e mês é atualizada).",
  reajustes: "Lista todas as empresas e demais itens cadastrados para ajustar SIM/NÃO e o índice anual.",
  dre: "Atualiza a linha das categorias listadas.",
  investimentos: "Substitui a lista inteira.",
  bens: "Substitui a lista inteira.",
  dividas: "Substitui a lista inteira.",
  carteira: "Substitui a lista inteira.",
};

async function modelo(t: TipoImp) {
  try { baixarModeloTipo(t, await carregarCtx()); } catch (e) { toast.error((e as Error).message); }
}

function Importar() {
  const { tipo } = Route.useSearch();
  return (
    <div className="px-6 py-8 lg:px-10">
      {tipo ? <Tipo tipo={tipo} /> : <Painel />}
    </div>
  );
}

function Painel() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Importar planilha</h1>
      <p className="mt-1 text-sm text-muted-foreground">Escolha o que importar. O modelo já vem preenchido com seus dados atuais — edite e importe de volta.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TIPOS.map((d) => (
          <div key={d.id} className="surface-card flex flex-col gap-3 p-4">
            <div>
              <p className="font-semibold">{d.titulo}</p>
              <p className="mt-1 text-xs text-muted-foreground">{COMPORTA[d.id]}</p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" asChild><Link to="/importar" search={{ tipo: d.id }}><Upload className="size-4" />Importar</Link></Button>
              <Button size="sm" variant="ghost" onClick={() => modelo(d.id)}><Download className="size-4" />Baixar modelo</Button>
            </div>
          </div>
        ))}
      </div>
      <Backup />
    </>
  );
}

function Backup() {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [lido, setLido] = useState<{ wb: XLSX.WorkBook; tipos: ReturnType<typeof defDe>[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="surface-card mt-6 flex flex-wrap items-center gap-3 p-4">
      <div className="mr-auto">
        <p className="font-semibold">Backup completo</p>
        <p className="text-xs text-muted-foreground">Todas as abas num arquivo só. A importação lê as abas reconhecidas pelo nome.</p>
        {lido ? <p className="mt-2 text-sm">Abas reconhecidas: <b>{lido.tipos.map((t) => t.titulo).join(", ")}</b></p> : null}
      </div>
      <Button variant="outline" size="sm" onClick={async () => { try { baixarBackup(await carregarCtx()); } catch (e) { toast.error((e as Error).message); } }}>
        <Download className="size-4" />Baixar backup completo
      </Button>
      {lido ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setLido(null)}>Cancelar</Button>
          <Button size="sm" disabled={ocupado} onClick={async () => {
            setOcupado(true);
            try { toast.success(await importarBackup(lido.wb, lido.tipos)); setLido(null); }
            catch (e) { toast.error((e as Error).message); }
            finally { setOcupado(false); qc.invalidateQueries(); }
          }}>{ocupado ? "Importando…" : `Importar ${lido.tipos.length} abas`}</Button>
        </>
      ) : (
        <Button size="sm" onClick={() => ref.current?.click()}><Upload className="size-4" />Importar backup completo</Button>
      )}
      <input ref={ref} type="file" accept=".xlsx,.xls" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        try { setLido(await abasDoBackup(f)); } catch (err) { toast.error((err as Error).message); }
      }} />
    </div>
  );
}

function Tipo({ tipo }: { tipo: TipoImp }) {
  const d = defDe(tipo);
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function ler(f?: File) {
    if (!f) return;
    setErro(null); setPrevia(null); setOcupado(true);
    try { setPrevia(await lerArquivo(f, tipo, await carregarCtx())); } catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }
  async function confirmar() {
    if (!previa) return;
    setOcupado(true);
    try { toast.success(`Importado: ${await previa.aplicar()}.`); setPrevia(null); qc.invalidateQueries(); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }

  return (
    <>
      <Link to="/importar" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Todos os tipos</Link>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">Importar {d.titulo.toLowerCase()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{COMPORTA[tipo]} Aba: <span className="num">{d.aba}</span> (ou a primeira aba).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => modelo(tipo)}><Download className="size-4" />Baixar modelo preenchido</Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="surface-card overflow-hidden">
          <p className="label-eyebrow px-4 pt-4">Colunas esperadas</p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {d.colunas.map(([c, o]) => (
                <tr key={c} className="border-t border-border">
                  <td className="num px-4 py-2 align-top font-medium whitespace-nowrap">{c}</td>
                  <td className="px-4 py-2 text-muted-foreground">{o}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4">
          <button type="button"
            onClick={() => ref.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); ler(e.dataTransfer.files?.[0]); }}
            className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card px-6 py-10 text-center transition-colors",
              arrastando && "border-primary bg-accent")}>
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <span className="font-medium">{ocupado && !previa ? "Lendo…" : "Arraste a planilha aqui ou clique para escolher"}</span>
            <span className="text-xs text-muted-foreground">Arquivo .xlsx sem senha. <span className="underline" onClick={(e) => { e.stopPropagation(); modelo(tipo); }}>Baixar o modelo</span></span>
          </button>
          <input ref={ref} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { ler(e.target.files?.[0]); e.target.value = ""; }} />

          {erro ? <p className="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">{erro}</p> : null}

          {previa ? (
            <div className="surface-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="num mr-auto text-lg font-semibold">{previa.resumo}</p>
                <Button variant="ghost" size="sm" onClick={() => setPrevia(null)}>Cancelar</Button>
                <Button size="sm" disabled={ocupado || !previa.linhas.length} onClick={confirmar}>{ocupado ? "Importando…" : "Confirmar importação"}</Button>
              </div>
              {previa.avisos.map((a) => <p key={a} className="mt-2 rounded-md bg-warning/15 px-3 py-2 text-sm">{a}</p>)}
              <div className="mt-3 max-h-[28rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card"><tr>{previa.cab.map((c) => <th key={c} className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">{c}</th>)}</tr></thead>
                  <tbody>
                    {previa.linhas.slice(0, 200).map((l, i) => (
                      <tr key={i} className="border-t border-border">{l.map((v, j) => <td key={j} className="num px-2 py-1 whitespace-nowrap">{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                {previa.linhas.length > 200 ? <p className="mt-2 text-xs text-muted-foreground">Mostrando 200 de {previa.linhas.length} linhas.</p> : null}
              </div>
            </div>
          ) : null}
          <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => navigate({ to: "/importar" })}>Escolher outro tipo</button>
        </div>
      </div>
    </>
  );
}
