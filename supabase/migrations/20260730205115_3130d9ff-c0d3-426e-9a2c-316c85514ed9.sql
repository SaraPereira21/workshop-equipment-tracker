
-- mapa nome -> id legado (meq-*) e id de perfil (uuid)
create temporary table mec_map as
select lower(trim(m1.data->>'nome')) nome, m1.id as legado, m2.id as novo
from app_mechanics m1
join app_mechanics m2
  on lower(trim(m1.data->>'nome')) = lower(trim(m2.data->>'nome'))
 and m1.id <> m2.id
where m1.id like 'meq-%' and m2.id not like 'meq-%';

-- remapeia mecanicoId nos cards
update app_assets a
set data = jsonb_set(a.data, '{mecanicoId}', to_jsonb(mm.novo))
from mec_map mm
where a.data->>'mecanicoId' = mm.legado;

-- remapeia mecanicoIds (array)
update app_assets a
set data = jsonb_set(
  a.data,
  '{mecanicoIds}',
  (select jsonb_agg(distinct coalesce(mm.novo, e.val))
     from jsonb_array_elements_text(a.data->'mecanicoIds') as e(val)
     left join mec_map mm on mm.legado = e.val)
)
where jsonb_typeof(a.data->'mecanicoIds') = 'array'
  and exists (
    select 1 from jsonb_array_elements_text(a.data->'mecanicoIds') e(val)
    join mec_map mm on mm.legado = e.val
  );

-- remapeia ordens de serviço
update app_work_orders w
set data = jsonb_set(w.data, '{mecanicoId}', to_jsonb(mm.novo))
from mec_map mm
where w.data->>'mecanicoId' = mm.legado;

-- remove cadastros legados duplicados
delete from app_mechanics where id in (select legado from mec_map);
