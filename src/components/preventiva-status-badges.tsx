import { Badge } from "@/components/ui/badge";
import type { Asset } from "@/lib/types";

/**
 * Descobre o documento de preventiva da máquina.
 * Além dos campos dedicados, também considera anexos comuns cujo nome/descrição
 * indique preventiva (ex.: "PREV2002...EH118.pdf"), pois muita gente anexa por lá.
 */
function findPreventivaDoc(asset: Asset): string | undefined {
  const direto = asset.preventivaBaseDocUrl || asset.ultimaPreventivaDocUrl;
  if (direto) return direto;
  const anexo = (asset.anexos ?? []).find((a) =>
    /prev/i.test(`${a.nome ?? ""} ${a.descricao ?? ""}`),
  );
  return anexo?.dataUrl;
}

/**
 * Selos de situação de preventiva/anexos e liberação da máquina.
 * Usado nas listas e cards do PCM para saber de relance se a máquina
 * já tem anexo de preventiva ou se a preventiva/máquina já foi liberada.
 */
export function PreventivaStatusBadges({ asset }: { asset: Asset }) {
  const docPreventiva = findPreventivaDoc(asset);
  const docsGerados = (asset.documentos ?? []).filter((d) => d.tipo === "os_preventiva");
  const temAnexo = !!docPreventiva || docsGerados.length > 0;
  const liberada = asset.column === "liberado";

  return (
    <>
      {temAnexo ? (
        docPreventiva ? (
          <a
            href={docPreventiva}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            <Badge className="bg-success/15 text-success text-[10px] hover:bg-success/25">
              ✓ Preventiva anexada
            </Badge>
          </a>
        ) : (
          <Badge className="bg-success/15 text-success text-[10px]">✓ Preventiva anexada</Badge>
        )
      ) : (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Sem anexo de preventiva
        </Badge>
      )}

      {asset.preventivaBaseFeita && (
        <Badge variant="secondary" className="text-[10px]">Preventiva feita na base</Badge>
      )}

      {asset.preventivaLiberada && (
        <Badge className="bg-primary/15 text-primary text-[10px]">Preventiva liberada</Badge>
      )}

      {liberada && (
        <Badge className="bg-success/15 text-success text-[10px]">Máquina liberada</Badge>
      )}
    </>
  );
}

/**
 * Versão compacta para listas/cards do supervisor:
 * "Prev anexada" e/ou "Prev liberada p/ execução".
 */
export function PreventivaResumoBadges({ asset }: { asset: Asset }) {
  const docPreventiva = findPreventivaDoc(asset);
  const docsGerados = (asset.documentos ?? []).filter((d) => d.tipo === "os_preventiva");
  const temAnexo = !!docPreventiva || docsGerados.length > 0;

  if (!temAnexo && !asset.preventivaLiberada) {
    if (!asset.temPreventiva) return null;
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Sem anexo de prev.
      </Badge>
    );
  }

  return (
    <>
      {temAnexo && (
        <Badge className="bg-success/15 text-success text-[10px] hover:bg-success/25">
          ✓ Prev anexada
        </Badge>
      )}
      {asset.preventivaLiberada && (
        <Badge className="bg-primary/15 text-primary text-[10px] hover:bg-primary/25">
          Prev liberada p/ execução
        </Badge>
      )}
    </>
  );
}
