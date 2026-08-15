# Apontamentos filtrados pela data do trabalho, não pela data da OS

## O que está acontecendo

O relatório de apontamentos hoje filtra pela **data de criação da OS**, e não pela data em que a atividade foi executada.

- Período 10/08 a 11/08: entram as OSs criadas no dia 10 (Samuel) — e junto vêm todos os apontamentos delas, inclusive os feitos no dia 11.
- Período só 11/08: as OSs do Samuel foram criadas no dia 10, então somem inteiras — mesmo tendo apontamento no dia 11. Sobra só o Arley, cuja OS foi criada no próprio dia 11.

Ou seja: a data que manda é a da OS, não a do apontamento. Por isso a lista não representa "o que foi feito no dia".

## Como vai ficar

- Cada linha passa a ser filtrada **somente pela data do apontamento** (início; se não houver início, o fim). Apontamento sem data nenhuma não entra no período — a data da OS deixa de influenciar.
- Escolhendo 11/08, aparecem exatamente os apontamentos executados em 11/08 — de qualquer OS, criada quando for.
- Escolhendo 10/08 a 11/08, aparecem os dois dias, sem trazer nem esconder trabalho por causa da data da OS.
- Os KPIs do topo (horas apontadas, média por atividade) e a aba **Manutentores** passam a somar exatamente as mesmas linhas da lista, então os números batem entre as abas.
- O CSV exporta o mesmo conjunto filtrado.
- Os filtros de tipo de OS e a busca por prefixo/nº SAP continuam funcionando igual.
- Os blocos **Máquinas** e **Inspeções** continuam com a lógica de período atual (não são apontamentos).
- O card "OSs no período" continua contando OSs criadas no período, com o rótulo mantendo esse sentido.

## Detalhes técnicos

Em `src/routes/_authenticated/relatorios.tsx`:

- Manter `workOrders` sem recorte de data para a geração das linhas de apontamento (aplicando apenas `tipoOs` e busca).
- Gerar `linhas` com `apontamentosDeOrdens` e filtrar por `noPeriodo(l.inicio ?? l.fim)`, descartando linhas sem início e sem fim.
- `osComAtividade`, `contabiliza`, `totalMinutos`, `atividades` e `porMecanico` passam a derivar dessa lista já filtrada, garantindo consistência entre Apontamentos e Manutentores.
- `ordens` (contagem de OSs no período) permanece com o filtro por `createdAt`.
