# Tela do Inspetor: só as inspeções dele + PDF

Mudança restrita à tela `/inspetor` (lista de inspeções). Nenhuma outra tela, regra de fluxo ou permissão é alterada.

## O que muda

1. **Histórico filtrado por inspetor**
   - A lista de inspeções registradas (parte de baixo da tela) passa a mostrar apenas as inspeções feitas pelo próprio usuário logado.
   - A comparação usa o nome do inspetor gravado na inspeção contra o nome do perfil logado, ignorando maiúsculas/minúsculas e acentos, para evitar falsos negativos.
   - Toda a gestão (admin, PCM, supervisor, gerência) continua com visão completa: vê todas as inspeções de todos os inspetores, sem filtro. O recorte por pessoa vale apenas para quem tem função de inspetor.
   - O contador no topo passa a refletir a lista exibida.

2. **Botão de baixar o PDF da inspeção**
   - Cada card do histórico ganha um botão "PDF" que gera e baixa o documento da inspeção (mesmo gerador já usado no detalhe da inspeção).
   - O botão não navega para o detalhe: o clique é isolado do link do card.
   - Estado de carregando enquanto gera e aviso de erro caso falhe.

## Detalhes técnicos

- Arquivo único: `src/routes/_authenticated/inspetor.index.tsx`.
- Filtro aplicado sobre a lista `inspections` já existente (que hoje só filtra por prefixos ativos); as seções superiores (solicitações do supervisor, pendentes, rascunhos, aguardando saída, prontos para envio, rejeitadas) ficam exatamente como estão.
- Download usa import dinâmico de `generateInspectionPdf` de `@/lib/inspection-pdf`, passando o ativo correspondente (`assets.find(a => a.id === inspection.assetId)`) e `{ save: true }`.
- Sem alterações de banco, tipos ou store.
