
-- Realinhar buckets com os 8 da planilha real do Planner + manter workflow interno (pcm/atribu_do)
-- 1. Atualizar títulos e ordem dos buckets existentes
UPDATE public.kanban_columns SET titulo='INSERIR',            titulo_curto='INSERIR',       ordem=0 WHERE chave='chegada';
UPDATE public.kanban_columns SET titulo='Fila PCM (OS SAP)',  titulo_curto='PCM',           ordem=1 WHERE chave='pcm';
UPDATE public.kanban_columns SET titulo='Aguardando Material', titulo_curto='Aguard. Material', ordem=4 WHERE chave='aguardando_pcm';
UPDATE public.kanban_columns SET titulo='Aguardando MO',      titulo_curto='Aguard. MO',    ordem=5 WHERE chave='mdo';
UPDATE public.kanban_columns SET titulo='Manutentor Alocado', titulo_curto='Alocado',       ordem=6 WHERE chave='atribu_do';
UPDATE public.kanban_columns SET titulo='Em Execução',        titulo_curto='Em Execução',   ordem=7 WHERE chave='manutencao';
UPDATE public.kanban_columns SET titulo='Melhoria',           titulo_curto='Melhoria',      ordem=8 WHERE chave='melhoria';
UPDATE public.kanban_columns SET titulo='Liberado',           titulo_curto='Liberado',      ordem=9 WHERE chave='liberado';

-- 2. Inserir os 2 buckets novos da planilha
INSERT INTO public.kanban_columns (chave, titulo, titulo_curto, ordem) VALUES
  ('aguardando_rc',     'Aguardando RC',     'Aguard. RC',     2),
  ('aguardando_pedido', 'Aguardando Pedido', 'Aguard. Pedido', 3)
ON CONFLICT (chave) DO UPDATE SET titulo=EXCLUDED.titulo, titulo_curto=EXCLUDED.titulo_curto, ordem=EXCLUDED.ordem;
