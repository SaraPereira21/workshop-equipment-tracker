# Inspeção alocada pelo supervisor

Hoje toda máquina em "Nova Solicitação" (coluna `chegada`) aparece liberada para qualquer inspetor, que se reserva sozinho. Vamos passar esse controle para o supervisor.

## Como vai funcionar

1. **Supervisor aloca o inspetor**
   Na aba "Enviar para inspeção" (tela do supervisor) entra um bloco novo no topo: **"Novas solicitações — alocar inspetor"**, listando as máquinas da coluna Nova Solicitação. Cada linha tem uma lista de inspetores (busca por nome) e o botão "Liberar para inspeção". Também dá para desfazer a alocação ou trocar de inspetor.

2. **Tela do inspetor separada por inspetor**
   A seção "Novas Solicitações" passa a ter três grupos:
   - **Minhas inspeções** — máquinas alocadas para o usuário logado, com botão Inspecionar/Continuar.
   - **De outros inspetores** — visíveis, em cinza, mostrando o nome de quem foi alocado, sem botão de ação.
   - **Aguardando liberação do supervisor** — máquinas ainda sem inspetor alocado, em cinza, com o aviso e sem botão de inspecionar.

3. **Nada muda no que já começou**
   Máquinas que já têm inspeção iniciada (rascunho salvo ou reserva atual do inspetor) continuam exatamente como estão: são tratadas como já alocadas ao inspetor que iniciou e seguem editáveis por ele. Inspeção de saída, reinspeção e o resto do fluxo não mudam.

## Detalhes técnicos

- Novos campos em `Asset` (`src/lib/types.ts`): `inspetorAlocadoId`, `inspetorAlocadoNome`, `inspetorAlocadoEm`. Sem migração — os ativos são JSONB em `app_assets`.
- Compatibilidade: se `inspetorAlocadoId` estiver vazio mas existir `inspetorLockId` ou `inspectionDraft.inspetorId`, esse valor é usado como inspetor responsável (grandfathering, sem escrita em massa no banco).
- Lista de inspetores: `profiles` só é legível pelo próprio usuário ou admin, então crio `src/lib/inspetores.functions.ts` — um `createServerFn` com `requireSupabaseAuth` que valida se o chamador é admin/pcm/supervisor, usa `user_ids_by_roles(['inspetor'])` e retorna apenas `{ id, nome }` dos inspetores ativos. Consumido via `useQuery` no componente do supervisor.
- `src/components/enviar-para-inspecao-section.tsx`: novo bloco de alocação usando `SearchableMultiSelect`/Select para escolher o inspetor e `updateAsset` para gravar.
- `src/routes/_authenticated/inspetor.index.tsx`: divide `pendentes` nos três grupos acima; o botão "Inspecionar" só aparece para o inspetor alocado (admin/pcm/supervisor continuam com acesso total).
