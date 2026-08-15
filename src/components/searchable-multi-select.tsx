import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Lista com campo de busca para selecionar vários itens (tags, tipos, etc.). */
export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  label,
  placeholder = "Digite para pesquisar...",
  icon,
  className,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.toLowerCase().includes(term));
  }, [options, q]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={selected.length ? "default" : "outline"}
          size="sm"
          className={`h-8 gap-2 ${className ?? ""}`}
        >
          {icon}
          {label}
          {selected.length > 0 && (
            <span className="rounded-full bg-background/20 px-1.5 text-[10px] font-bold">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nenhum resultado
            </div>
          )}
          {filtered.map((o) => {
            const active = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{o}</span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Limpar seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
