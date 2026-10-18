begin;
alter table public.workspace_rooms add column section_order uuid[] not null default '{}',add column order_version integer not null default 1 check(order_version>0);
update public.workspace_rooms r set section_order=coalesce((select array_agg(s.id order by s.created_at,s.id) from public.workspace_sections s where s.room_id=r.id),'{}'::uuid[]);
grant select(section_order,order_version) on public.workspace_rooms to authenticated;
create or replace function private.workspace_rooms() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'owner_id',r.owner_id,'description',r.description,'icon_path',r.icon_path,'layout',r.layout,'metadata_version',r.metadata_version,'section_order',r.section_order,'order_version',r.order_version,'invite',case when r.owner_id=auth.uid() then r.invite else null end) order by r.created_at),'[]'::jsonb) from public.workspace_rooms r join public.workspace_members m on m.room_id=r.id where m.user_id=auth.uid();
$$;
create or replace function private.workspace_snapshot(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.workspace_is_member(target::text) then raise exception 'Workspace membership required' using errcode='42501';end if;
 return jsonb_build_object('notes',coalesce((select jsonb_agg(s order by array_position(r.section_order,s.id) nulls last,s.created_at,s.id) from public.workspace_sections s join public.workspace_rooms r on r.id=s.room_id where s.room_id=target),'[]'::jsonb),'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.name,m.name),'last_seen',m.last_seen,'avatar_path',coalesce(p.avatar_path,''),'color',coalesce(p.color,'#466c50')) order by m.name) from public.workspace_members m left join public.workspace_profiles p on p.id=m.user_id where m.room_id=target),'[]'::jsonb),'room',(select value from jsonb_array_elements(private.workspace_rooms()) where value->>'id'=target::text),'serverTime',(extract(epoch from now())*1000)::bigint);
end;$$;
alter function private.workspace_action(jsonb) rename to workspace_action_media;
create function private.workspace_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; expected integer; requested uuid[]; actual uuid[]; result jsonb;begin
 if input->>'action' in ('reorder','add','delete') then
  target:=(input->>'roomId')::uuid;
  if not private.workspace_is_member(target::text) then raise exception 'Workspace membership required' using errcode='42501';end if;
  select order_version into expected from public.workspace_rooms where id=target for update;
  if input->>'action'='reorder' then
   if expected is distinct from (input->>'version')::integer then raise exception 'Someone changed the section order. The latest order has been loaded; try moving your section again.' using errcode='40001';end if;
   if jsonb_typeof(input->'order') is distinct from 'array' then raise exception 'Send a section order';end if;
   select coalesce(array_agg(value::uuid),'{}'::uuid[]) into requested from jsonb_array_elements_text(input->'order');
   select coalesce(array_agg(id),'{}'::uuid[]) into actual from public.workspace_sections where room_id=target;
   if cardinality(requested)<>cardinality(actual) or cardinality(requested)<>(select count(distinct x) from unnest(requested) x) or not requested @> actual or not actual @> requested then raise exception 'The section order must include each section in this workspace exactly once';end if;
   update public.workspace_rooms set section_order=requested,order_version=order_version+1 where id=target;
   return jsonb_build_object('ok',true);
  end if;
  result:=private.workspace_action_media(input);
  update public.workspace_rooms r set section_order=coalesce((select array_agg(s.id order by array_position(r.section_order,s.id) nulls last,s.created_at,s.id) from public.workspace_sections s where s.room_id=target),'{}'::uuid[]),order_version=order_version+1 where r.id=target;
  return result;
 end if;
 return private.workspace_action_media(input);
end;$$;
revoke all on function private.workspace_action(jsonb) from public,anon;
grant execute on function private.workspace_action(jsonb) to authenticated;
commit;
