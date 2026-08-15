# Corrigir filtros de máquinas liberadas

## Objetivo
Fazer o relatório responder corretamente ao período selecionado e permitir separar as máquinas liberadas por destino.

## Alterações
- Corrigir a base de contagem das liberações para usar a data real de liberação de cada máquina, em vez de exigir os marcadores `libNovoStatus`/`libNovoInspectionId`, que hoje limitam o resultado às mesmas 8 máquinas.
- Desconsiderar o lote de datas sintéticas preenchidas em massa, identificado nos dados por 73 máquinas com o mesmo instante de liberação, sem excluir liberações individuais registradas pelo aplicativo.
- Manter o resumo **Máquinas liberadas no período**, com os totais de:
  - todas as liberadas;
  - seminovos;
  - contratos.
- Adicionar na aba **Máquinas** um filtro independente com as opções:
  - Todas as máquinas;
  - Liberadas;
  - Seminovos;
  - Contratos.
- Aplicar conjuntamente período, busca e novo filtro à tabela, aos totais e aos arquivos CSV correspondentes.
- Exibir a lista detalhada das liberadas no período abaixo do resumo, para permitir conferir quais máquinas compõem cada número.

## Validação
- Conferir períodos de 30 dias, 90 dias e personalizado com datas que incluam e excluam liberações conhecidas.
- Verificar que a soma de Seminovos + Contratos seja igual ao total de liberadas no mesmo período.
- Confirmar que o CSV contenha exatamente as linhas exibidas pelo filtro ativo.

## Detalhes técnicos
- Separar a coleção-base de máquinas da coleção filtrada para evitar que o filtro de entrada da oficina elimine ou recalcule incorretamente as liberações.
- Classificar Seminovos pela correspondência normalizada de prefixo já usada no módulo de Seminovos; as demais liberadas serão classificadas como Contratos.
