-- Run in SQL Editor AFTER migration. Fixtures and changes are rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('eeeeeeee-0000-4000-8000-000000000001','workspace-test-alice@example.invalid','{"name":"Alice"}'),
 ('eeeeeeee-0000-4000-8000-000000000002','workspace-test-bob@example.invalid','{"name":"Bob"}');
set local role authenticated;
do $$
declare
 room uuid; section uuid; second_section uuid; order_version integer; invite_code text; payload jsonb; result jsonb;
begin
 perform set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
 room := (public.workspace_action('{"action":"create","name":"Access test"}') ->> 'roomId')::uuid;
 select value->>'invite' into invite_code from jsonb_array_elements(public.workspace_rooms()) where value->>'id'=room::text;
 if invite_code is null then raise exception 'Owner cannot see invite'; end if;
 payload := jsonb_build_object('action','add','roomId',room,'title','Test','body','Hello','kind','note','pinned',false,'memoryDate','');
 section := (public.workspace_action(payload)->>'noteId')::uuid;
 -- A direct table write must be denied even to a member.
 begin
   update public.workspace_sections set body='Bypass' where id=section;
   raise exception 'FAIL: direct writes are allowed';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
 if exists(select 1 from public.workspace_sections where id=section) then raise exception 'FAIL: outsider can read section'; end if;
 begin
   perform public.workspace_action(payload);
   raise exception 'FAIL: outsider can write section';
 exception when insufficient_privilege then null; end;
 begin
   perform public.workspace_action(jsonb_build_object('action','reorder','roomId',room,'version',2,'order',jsonb_build_array(section)));
   raise exception 'FAIL: outsider can reorder sections';
 exception when insufficient_privilege then null; end;
 begin
   insert into storage.objects(bucket_id,name,owner_id) values('workspace-files',room::text||'/test/outsider.txt',auth.uid()::text);
   raise exception 'FAIL: outsider can upload';
 exception when insufficient_privilege then null; end;
 perform public.workspace_action(jsonb_build_object('action','join','invite',invite_code));
 select value into result from jsonb_array_elements(public.workspace_rooms()) where value->>'id'=room::text;
 if result->>'invite' is not null then raise exception 'FAIL: nonowner sees invite'; end if;
 perform public.workspace_action(payload || jsonb_build_object('action','edit','noteId',section,'version',1,'body','Bob edited'));
 begin
   perform public.workspace_action(payload || jsonb_build_object('action','edit','noteId',section,'version',1,'body','Stale draft'));
   raise exception 'FAIL: stale write succeeded';
 exception when sqlstate 'PT409' then null; end;
 begin
   perform public.workspace_action(jsonb_build_object('action','delete','roomId',room,'noteId',section,'version',1));
   raise exception 'FAIL: stale deletion succeeded';
 exception when sqlstate 'PT409' then null; end;
 insert into storage.objects(bucket_id,name,owner_id) values('workspace-files',room::text||'/test/member.txt',auth.uid()::text);
 if not exists(select 1 from storage.objects where bucket_id='workspace-files' and name=room::text||'/test/member.txt') then raise exception 'FAIL: member cannot read file'; end if;
 second_section := (public.workspace_action(payload || jsonb_build_object('title','Second section'))->>'noteId')::uuid;
 order_version := (public.workspace_snapshot(room)->'room'->>'order_version')::integer;
 perform public.workspace_action(jsonb_build_object('action','reorder','roomId',room,'version',order_version,'order',jsonb_build_array(second_section,section)));
 result := public.workspace_snapshot(room);
 if result->'notes'->0->>'id'<>second_section::text then raise exception 'FAIL: order not shared in snapshots';end if;
 if (select version from public.workspace_sections where id=section)<>2 then raise exception 'FAIL: moving changed the content version';end if;
 begin
   perform public.workspace_action(jsonb_build_object('action','reorder','roomId',room,'version',order_version,'order',jsonb_build_array(section,second_section)));
   raise exception 'FAIL: stale order overwrote another move';
 exception when sqlstate 'PT409' then null;end;
 begin
   perform public.workspace_action(jsonb_build_object('action','reorder','roomId',room,'version',order_version+1,'order',jsonb_build_array(section,section)));
   raise exception 'FAIL: duplicate sections accepted' using errcode='XX000';
 exception when sqlstate 'P0001' then null;end;
 perform public.workspace_action(jsonb_build_object('action','delete','roomId',room,'noteId',section,'version',2));
 result := public.workspace_snapshot(room);
 if result->'room'->'section_order' @> jsonb_build_array(section) then raise exception 'FAIL: deleted section stays in shared order';end if;
 raise notice 'PASS: membership, invitation privacy, RPC writes, stale edits/deletes, and Storage policies';
end $$;
rollback;
