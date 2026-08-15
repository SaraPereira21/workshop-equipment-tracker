# Corrigir a MT 021 repetida na tela do inspetor

## O que foi encontrado

Existem três cards da MT 021 cadastrados no sistema (05/08 18:22, 10/08 15:44 e 10/08 15:47), todos com um rascunho de inspeção em aberto — por isso ela aparece 3x para o inspetor.

O checklist realmente concluído é o do card de 15:47 (`a-1786376867220`): inspeção de ENTRADA finalizada às 15:54 por ANDERSON JOSÉ DE SOUSA, horímetro 1.127,9, com foto da plaqueta do chassi e do horímetro, 113 dos 120 itens preenchidos e apontamentos registrados. Os outros dois são rascunhos incompletos (70 e 74 itens, sem inspeção finalizada).

A inspeção finalizada foi gravada, mas a atualização do card não chegou ao banco — ele continuou como "em inspeção / chegada" com o rascunho aberto, em vez de ir para a Fila PCM. O card ficou com vários MB de fotos embutidas no rascunho, o que fez essa gravação falhar.

## Correção dos dados

- Mover o card de 15:47 para a **Fila PCM**: status de inspeção concluída, coluna PCM, rascunho encerrado, vínculo com a inspeção `insp-1786377248986` e assinatura/registro do inspetor preservados, com os apontamentos do checklist virando tarefas do card.
- Remover os dois cards duplicados (05/08 e 10/08 15:44), que só têm rascunho incompleto e nenhuma inspeção finalizada.
- Nenhuma inspeção finalizada é apagada.

## Correções no sistema (para não repetir)

1. **Trava de duplicidade no cadastro pelo inspetor**: ao iniciar/salvar uma inspeção, o prefixo é comparado ignorando espaços e maiúsculas contra os cards existentes; se já existir, o app usa o card existente em vez de criar outro.
2. **Envio da inspeção à prova de falha**: se a gravação do card falhar ao finalizar, o app avisa o inspetor e mantém a inspeção na fila de reenvio, em vez de deixá-la "concluída no papel" mas parada na tela.
3. **Rascunho leve**: o rascunho deixa de carregar as fotos pesadas (já ajustado), o que era a causa da falha de gravação.

## Detalhes técnicos

- Dados: atualização em `app_assets` — no card `a-1786376867220`, definir `column: "pcm"`, limpar `inspectionDraft` e os campos de trava do inspetor, manter `libNovoInspectionId`; marcar `deletedAt` nos cards `a-1785954141624` e `a-1786376655560`.
- `src/routes/_authenticated/inspetor.nova.tsx`: normalizar o prefixo na busca de `existing` (trim + uppercase + colapso de espaços) em `saveDraft` e `handleSubmit`; tratar o retorno do `upsertAsset` com aviso de erro.
- `src/lib/store.ts`: garantir que a gravação remota do asset que falha entre na fila offline (`enqueueOp`) em vez de ser descartada silenciosamente.
