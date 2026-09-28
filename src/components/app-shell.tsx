import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarClock,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

type Item = { to: string; label: string; icon: LucideIcon };

const NAV: Item[] = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/base-zero", label: "Base zero", icon: CalendarClock },
  { to: "/entradas", label: "Entradas", icon: ArrowUpCircle },
  { to: "/saidas", label: "Saídas", icon: ArrowDownCircle },
  { to: "/projecao", label: "Projeção", icon: TrendingUp },
  { to: "/importar", label: "Planilhas", icon: FileSpreadsheet },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-bold">FE</span>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-sidebar-foreground">Fluxo Escritório</p>
            <p className="text-xs text-muted-foreground">& Casa · Ecommtabil</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground",
              }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-card px-6 py-6 lg:px-10">
      <div>
        {eyebrow ? <p className="label-eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}
