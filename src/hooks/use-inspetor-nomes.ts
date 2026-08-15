import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { listInspetores } from "@/lib/inspetores.functions";

export const normNomePessoa = (n: string) =>
  n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Nomes (normalizados) de quem tem perfil de INSPETOR.
 * Usado para não misturar inspetores na lista de manutentores da alocação.
 */
export function useInspetorNomes() {
  const fetchInspetores = useServerFn(listInspetores);
  const { data } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ["inspetores"],
    queryFn: () => fetchInspetores(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  return useMemo(
    () => new Set((data ?? []).map((i) => normNomePessoa(i.nome))),
    [data],
  );
}
