# Apontamento de horas individual por mecânico na OS

Hoje cada atividade da OS tem **um único** cronômetro (um início, um fim). Quando dois manutentores atuam na mesma máquina, o primeiro que finaliza fecha a atividade para todos — o segundo não consegue mais apontar o tempo dele. A mudança transforma o apontamento em **sessões por mecânico**.

## Como vai funcionar

**Quem aponta**
- O tempo é sempre do usuário logado. Cada mecânico/eletricista abre a OS no próprio celular e aponta o seu tempo.
- O nome de quem apontou aparece ao lado do tempo.

**Na atividade (item PMP, operação corretiva, tarefa de execução)**
- Botão Iniciar/Pausar/Finalizar continua igual, mas age **apenas sobre o tempo do usuário logado**.
- Abaixo do botão, uma linha por pessoa: "SAMUEL · 01:20 (em execução)", "ARLEY · 45min".
- Finalizar encerra só o tempo de quem clicou. A atividade só fica concluída quando alguém marcar o check de concluído — o check continua livre para qualquer um da equipe.
- A regra de "só um cronômetro por vez" passa a valer por pessoa: ao iniciar outra atividade, pausa automaticamente a atividade anterior **daquele mesmo mecânico**, sem tocar nos cronômetros dos colegas.

**Na OS inteira**
- O cronômetro do topo também vira por mecânico: mostra o tempo do usuário logado e, ao lado, o total somado da equipe.
- Qualquer mecânico pode finalizar a OS; ao encerrar, os cronômetros ainda rodando dos demais são fechados automaticamente no mesmo horário.

**PCM / supervisor**
- Continuam podendo corrigir horários manualmente, agora escolhendo de qual mecânico é a sessão a corrigir, e podem excluir uma sessão errada.

**Relatórios e PDF**
- O relatório de apontamentos passa a ter uma linha por mecânico por atividade (hoje agrupa tudo em um nome só), então a produtividade por manutentor fica exata.
- No PDF da OS, a tabela de apontamento ganha a coluna "Mecânico".
- Apontamentos antigos (sem mecânico) continuam válidos e aparecem como sessão do executor registrado na OS, sem perda de histórico.

## Detalhes técnicos

- `src/lib/types.ts`: nova interface `Apontamento { id, userId, nome, inicio?, fim?, minAcum? }` e campo opcional `apontamentos?: Apontamento[]` em `WorkOrder` (nível OS), em cada item de `pmpChecklist`, em `WorkOrderOperation` e em `PendingTask`. Os campos atuais `inicio`/`fim`/`minAcum` e `execInicio`/`execFim`/`execMinAcum` permanecem para compatibilidade.
- `src/lib/tempo.ts`: helpers novos — `sessaoDoUsuario(lista, userId)`, `totalSessoes(lista)`, `upsertSessao()`, `fecharSessoesAbertas()`, e leitura de legado (`migrarLegado()` converte `inicio/fim/minAcum` soltos em uma sessão sem userId quando `apontamentos` não existe).
- `src/components/time-tracker.tsx`: passa a receber `apontamentos`, `userId`, `nome` e `onChange(lista)`; renderiza os botões para a sessão do usuário logado e a lista de sessões dos demais; o popover de edição (PCM/supervisor) opera por sessão e ganha remover.
- `src/routes/_authenticated/os.corretiva.$id.tsx` e `os.preventiva.$id.tsx`: `setTaskTempo`/`setOpTempo`/`setItemTempo`/`setOsTempo` passam a mutar a lista de sessões; a pausa automática ("só um por vez") filtra por `userId`; o fechamento da OS fecha sessões abertas de todos. O usuário vem de `useAuth` + `profiles.nome`.
- `src/lib/apontamentos.ts`: `apontamentosDeOs` emite uma linha por sessão (campo `mecanico` = nome da sessão), com fallback ao comportamento atual quando não houver sessões; headers/CSV inalterados.
- `src/lib/os-pdf.ts`: coluna "Mecânico" na tabela de apontamento.
- `src/routes/_authenticated/relatorios.tsx`: nenhuma mudança de lógica necessária — passa a receber linhas já individualizadas.
- Sem migração de banco: tudo vive no JSONB de `app_work_orders` / `app_assets`.
