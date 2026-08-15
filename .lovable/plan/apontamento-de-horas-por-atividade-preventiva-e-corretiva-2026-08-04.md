# Apontamento de horas por atividade (preventiva e corretiva)

Sim, é totalmente possível. A ideia é ter um cronômetro simples de "Iniciar / Finalizar" em dois níveis: o serviço inteiro e cada atividade.

## Como vai funcionar

**Na OS Preventiva**
- No topo da OS: botão **Iniciar preventiva** / **Finalizar preventiva**, mostrando o cronômetro rodando (ex.: "em execução há 01:42").
- Em cada item do checklist PMP (troca de óleo, filtros, lubrificação etc.): botão **Iniciar** e depois **Finalizar**, com o tempo do item ao lado (ex.: "18 min").
- Ao finalizar um item, ele é marcado como concluído automaticamente.
- Rodapé com o resumo: tempo total da preventiva, soma dos tempos apontados e lista de tempos individuais.

**Na OS Corretiva**
- Mesmo botão geral **Iniciar / Finalizar** da OS.
- Botão Iniciar/Finalizar em **todas** as atividades da seção "Execução do mecânico — o que foi feito" (as tarefas vindas da inspeção) e nas operações registradas (problema/causa/solução).
- Resumo com tempo total e tempo por atividade.

**Regras**
- Só um cronômetro de atividade ativo por vez na mesma OS: ao iniciar outra, a anterior é finalizada (evita tempo duplicado).
- Iniciar a primeira atividade inicia a OS automaticamente, se ainda não tiver sido iniciada.
- O tempo é gravado por horário real (início e fim), então funciona mesmo se a pessoa fechar o app; e continua funcionando offline, sincronizando depois.
- Tempos já gravados podem ser corrigidos manualmente pelo PCM/supervisor (campo de hora editável), não pelo mecânico.

**No PDF da OS**
- Cabeçalho com hora de início, hora de fim e duração total.
- Tabela de apontamento com uma linha por atividade: descrição, início, fim, duração — substituindo/complementando o bloco manual de apontamento à caneta.

**Fora da OS**
- O cronômetro fica restrito à tela da OS: nada de indicador de tempo no card do Planner nem na lista de máquinas.

**Botão "Solicitar peça" duplicado**
- Hoje o botão aparece duas vezes na OS corretiva. Fica só o de cima; o segundo é removido.

**Padronização das atividades**
- Toda descrição de atividade/tarefa digitada (tarefas do card, operações da OS, itens de execução) é gravada em CAIXA ALTA automaticamente, sem aviso na tela.
- Vale para o que já é criado a partir da inspeção também, para o texto sair uniforme nos relatórios.

**Preparado para relatórios**
- Os tempos ficam gravados de forma estruturada (atividade, início, fim, duração, mecânico, equipamento, tipo de OS), não só como texto no PDF.
- Já nesta etapa: exportação CSV dos apontamentos (por período / por máquina / por mecânico) para o planejamento do dia do manutentor.
- Base pronta para, depois, montar telas de relatório (tempo médio por tipo de atividade, produtividade por manutentor) sem precisar remodelar dados.

## Detalhes técnicos

- `src/lib/types.ts`: novos campos opcionais `execInicio` / `execFim` em `WorkOrder`; `inicio` / `fim` em cada item de `pmpChecklist`, em `WorkOrderOperation` e em `PendingTask`. Tudo opcional — OSs antigas continuam válidas.
- Novo componente `src/components/time-tracker.tsx` (botão Iniciar/Finalizar + duração formatada) e helper `src/lib/tempo.ts` (formatação hh:mm, soma de durações).
- Uso em `os.preventiva.$id.tsx` (itens PMP + topo) e `os.corretiva.$id.tsx` (operações, tarefas e topo). Remoção do segundo botão "Solicitar peça" em `os.corretiva.$id.tsx`.
- Normalização: helper `normalizarAtividade()` em `src/lib/tarefas-inspecao.ts` (uppercase + trim + espaços colapsados), aplicado em `textoTarefaItem`, na criação/edição de tarefas do card e nas operações da OS.
- Relatórios: `src/lib/apontamentos.ts` achatando OSs em linhas (prefixo, tipo OS, nº SAP, atividade, mecânico, início, fim, minutos) + export via `downloadCSV` existente.
- `src/lib/os-pdf.ts`: seção "Apontamento de horas" com tabela de atividades; o bloco manual em `os-apontamento.ts` só é impresso quando não houver apontamento digital.
- Persistência via `updateWorkOrder` / `updateAsset` já existentes (Supabase + fila offline) — sem mudança de schema, pois os dados ficam no JSONB.

