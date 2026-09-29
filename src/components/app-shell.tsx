import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient, useIsMutating } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Check, FileSpreadsheet, House, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useConfig } from "@/lib/config";
import { calcularHorizonte, faixaCurta, isoParaBR, type Horizonte, type MesRef } from "@/lib/horizonte";
import { formatarMes } from "@/lib/format";
import { ModalBaseZero } from "./modal-base-zero";

const ABAS = [
  { to: "/", label: "Panorama", periodo: true, pessoal: true },
  { to: "/dashboard", label: "Dashboard", periodo: true, pessoal: true },
  { to: "/dre", label: "DRE", periodo: true },
  { to: "/situacao", label: "Situação atual", periodo: false },
  { to: "/contas", label: "Contas a pagar e receber", periodo: true },
  { to: "/investimentos", label: "Investimentos", periodo: true },
  { to: "/balanco", label: "Balanço", periodo: true },
  { to: "/projecao", label: "Projeção", periodo: false },
  { to: "/cadastro", label: "Cadastro", periodo: false },
] as const;

export type Periodo = number | "todos";
export type Coluna = { chave: string; rotulo: string; meses: MesRef[] };

export type Area = "ESCRITORIO" | "PESSOAL";
type Ctx = { horizonte: Horizonte | null; periodo: Periodo; colunas: Coluna[]; area: Area };
const PeriodoCtx = createContext<Ctx>({ horizonte: null, periodo: "todos", colunas: [], area: "ESCRITORIO" });
/** Área escolhida no topo (Escritório | Pessoal). Destino vazio conta como Escritório. */
export const useArea = () => useContext(PeriodoCtx).area;
export const daArea = (destino: string | null | undefined, area: Area) => (destino === "PESSOAL" ? "PESSOAL" : "ESCRITORIO") === area;
export const usePeriodo = () => useContext(PeriodoCtx);

function colunasDo(h: Horizonte, p: Periodo): Coluna[] {
  if (p === "todos") return h.anos.map((a) => ({ chave: String(a.ano), rotulo: a.rotulo, meses: a.meses }));
  const ano = h.anos.find((a) => a.ano === p);
  return (ano?.meses ?? []).map((m) => ({ chave: `${m.ano}-${m.mes}`, rotulo: formatarMes(m.ano, m.mes), meses: [m] }));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: config, isLoading } = useConfig();
  const salvando = useIsMutating() > 0;
  const [modal, setModal] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [area, setAreaSt] = useState<Area>("ESCRITORIO");
  useEffect(() => { if (localStorage.getItem("fluxo-area") === "PESSOAL") setAreaSt("PESSOAL"); }, []);
  const setArea = (a: Area) => { setAreaSt(a); localStorage.setItem("fluxo-area", a); };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const horizonte = useMemo(
    () => (config?.base_data ? calcularHorizonte(config.base_data, config.anos_projecao, config.incluir_restante) : null),
    [config],
  );
  useEffect(() => {
    if (horizonte && periodo !== "todos" && !horizonte.anos.some((a) => a.ano === periodo)) setPeriodo("todos");
  }, [horizonte, periodo]);

  const colunas = horizonte ? colunasDo(horizonte, periodo) : [];
  const abaAtual = ABAS.find((a) => (a.to === "/" ? pathname === "/" : pathname.startsWith(a.to)));
  const obrigatorio = !isLoading && !config?.base_data;

  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <PeriodoCtx.Provider value={{ horizonte, periodo, colunas, area }}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-border bg-card">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3 lg:px-10">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-sm font-bold">FE</span>
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Fluxo Escritório & Casa</p>
                <p className="text-xs text-muted-foreground">
                  Entradas − Saídas = Lucro · Lucro − Saídas pessoais = Reserva
                </p>
              </div>
            </div>
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {(["ESCRITORIO", "PESSOAL"] as const).map((a) => (
                <button key={a} onClick={() => setArea(a)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${area === a ? (a === "ESCRITORIO" ? "bg-office text-office-foreground" : "bg-personal text-personal-foreground") : "text-muted-foreground hover:text-foreground"}`}>
                  {a === "ESCRITORIO" ? <><Building2 className="size-4" />Escritório</> : <><House className="size-4" />Pessoal</>}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {salvando ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                {salvando ? "Salvando…" : "Salvo"}
              </span>
              <Button variant="outline" size="sm" onClick={() => setModal(true)} className="num">
                {horizonte && config?.base_data
                  ? `Base zero ${isoParaBR(config.base_data)} · ${faixaCurta(horizonte)}`
                  : "Base zero —"}
              </Button>
              {abaAtual?.periodo && horizonte ? (
                <Select value={String(periodo)} onValueChange={(v) => setPeriodo(v === "todos" ? "todos" : Number(v))}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {horizonte.anos.map((a) => (
                      <SelectItem key={a.ano} value={String(a.ano)}>{a.rotuloPeriodo}</SelectItem>
                    ))}
                    <SelectItem value="todos">Todos os anos</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <Button size="sm" asChild>
                <Link to="/importar"><FileSpreadsheet className="size-4" />Importar planilha</Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={sair} aria-label="Sair"><LogOut className="size-4" /></Button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4 lg:px-8">
            {ABAS.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                activeOptions={{ exact: a.to === "/" }}
                className="border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground"
                activeProps={{ className: "border-primary text-foreground" }}
              >
                {a.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="min-w-0">{children}</main>
      </div>
      <ModalBaseZero aberto={obrigatorio || modal} obrigatorio={obrigatorio} config={config} onFechar={() => setModal(false)} />
    </PeriodoCtx.Provider>
  );
}

/** Conteúdo provisório de uma aba vazia. */
export function AbaVazia({ titulo, descricao, usaPeriodo }: { titulo: string; descricao: string; usaPeriodo?: boolean }) {
  const { colunas } = usePeriodo();
  return (
    <div className="px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descricao}</p>
      {usaPeriodo && colunas.length ? (
        <div className="surface-card mt-6 overflow-x-auto p-4">
          <p className="label-eyebrow mb-3">Colunas do período</p>
          <div className="flex gap-2">
            {colunas.map((c) => (
              <span key={c.chave} className="num rounded-md bg-muted px-2 py-1 text-xs whitespace-nowrap">{c.rotulo}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
