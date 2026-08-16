import type { Asset } from "@/lib/types";

/**
 * Bloco com os dados técnicos da máquina (modelo, cód. Ativo, nº de série…)
 * usado nos diálogos de corretiva e preventiva do PCM.
 */
export function AssetDataGrid({ asset }: { asset: Asset }) {
  const dados = [
    { rotulo: "Modelo", valor: asset.modelo },
    { rotulo: "Marca", valor: asset.marca },
    { rotulo: "Tipo", valor: asset.tipo },
    { rotulo: "Cód. Ativo", valor: asset.codigoAtivo },
    { rotulo: "Nº de série", valor: asset.numeroSerie },
    { rotulo: "Inventário", valor: asset.inventario },
    { rotulo: "Horímetro", valor: asset.horimetroAtual ? `${asset.horimetroAtual}h` : "" },
    { rotulo: "Último PMP", valor: asset.horimetroUltimoPMP ? `${asset.horimetroUltimoPMP}h` : "" },
    { rotulo: "Próx. alvo PMP", valor: asset.proximoAlvoPMP ? `${asset.proximoAlvoPMP}h` : "" },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-3">
      {dados.map((d) => (
        <div key={d.rotulo} className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {d.rotulo}
          </div>
          <div className="truncate font-medium" title={d.valor?.toString() || undefined}>
            {d.valor?.toString().trim() || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
