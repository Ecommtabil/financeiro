import { Check } from "lucide-react";

export function EmBreve({ itens }: { itens: string[] }) {
  return (
    <div className="surface-card max-w-2xl p-6">
      <span className="label-eyebrow">O que vem nesta tela</span>
      <ul className="mt-4 space-y-3">
        {itens.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <Check className="size-3" />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
