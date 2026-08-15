UPDATE public.app_assets a
SET data = jsonb_set(a.data, '{pendingTasks}', (
  SELECT jsonb_agg(t || jsonb_build_object('text', upper(t->>'text')))
  FROM jsonb_array_elements(a.data->'pendingTasks') t
))
WHERE jsonb_typeof(a.data->'pendingTasks') = 'array'
  AND jsonb_array_length(a.data->'pendingTasks') > 0;

UPDATE public.app_work_orders w
SET data = jsonb_set(w.data, '{operations}', (
  SELECT jsonb_agg(o
    || jsonb_build_object('problema', upper(coalesce(o->>'problema','')))
    || jsonb_build_object('causa', upper(coalesce(o->>'causa','')))
    || jsonb_build_object('solucao', upper(coalesce(o->>'solucao',''))))
  FROM jsonb_array_elements(w.data->'operations') o
))
WHERE jsonb_typeof(w.data->'operations') = 'array'
  AND jsonb_array_length(w.data->'operations') > 0;

UPDATE public.app_work_orders w
SET data = jsonb_set(w.data, '{pmpChecklist}', (
  SELECT jsonb_agg(c || jsonb_build_object('label', upper(coalesce(c->>'label',''))))
  FROM jsonb_array_elements(w.data->'pmpChecklist') c
))
WHERE jsonb_typeof(w.data->'pmpChecklist') = 'array'
  AND jsonb_array_length(w.data->'pmpChecklist') > 0;

UPDATE public.app_work_orders w
SET data = jsonb_set(w.data, '{falhasHerdadas}', (
  SELECT jsonb_agg(to_jsonb(upper(f#>>'{}')))
  FROM jsonb_array_elements(w.data->'falhasHerdadas') f
))
WHERE jsonb_typeof(w.data->'falhasHerdadas') = 'array'
  AND jsonb_array_length(w.data->'falhasHerdadas') > 0
  AND jsonb_typeof(w.data->'falhasHerdadas'->0) = 'string';