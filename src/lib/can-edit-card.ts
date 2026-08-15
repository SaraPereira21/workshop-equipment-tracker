import type { AppRole } from "@/hooks/use-auth";

/** Perfis que podem editar os cards do Planner (dados, tags, tarefas, coluna, exclusão). */
export const EDIT_CARD_ROLES: AppRole[] = ["admin", "pcm", "supervisor", "frota"];

/** Mecânicos e inspetores têm acesso somente leitura aos cards (chat e anexos seguem liberados). */
export function canEditCards(roles: AppRole[]): boolean {
  return roles.some((r) => EDIT_CARD_ROLES.includes(r));
}
