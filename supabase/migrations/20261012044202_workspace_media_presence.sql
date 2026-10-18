begin;
alter table public.workspace_rooms add column description text not null default '' check(length(description)<=1000), add column icon_path text not null default '', add column layout text not null default 'document' check(layout in ('document','webpage')), add column metadata_version integer not null default 1;
grant select(description,icon_path,layout,metadata_version) on public.workspace_rooms to authenticated;
create table public.workspace_profiles(id uuid primary key references auth.users(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 80),avatar_path text not null default '',color text not null default '#466c50' check(color ~ '^#[a-fA-F0-9]{6}$'));
alter table public.workspace_profiles enable row level security;
revoke all on public.workspace_profiles from public,anon,authenticated;
grant select on public.workspace_profiles to authenticated;
create function private.workspace_can_see_profile(target text) returns boolean language sql stable security definer set search_path='' as $$
 select target=(select auth.uid())::text or exists(select 1 from public.workspace_members mine join public.workspace_members theirs on mine.room_id=theirs.room_id where mine.user_id=(select auth.uid()) and theirs.user_id::text=target);
$$;
revoke all on function private.workspace_can_see_profile(text) from public,anon;
grant execute on function private.workspace_can_see_profile(text) to authenticated;
create policy profiles_read on public.workspace_profiles for select to authenticated using(private.workspace_can_see_profile(id::text));
create or replace function private.workspace_rooms() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'owner_id',r.owner_id,'description',r.description,'icon_path',r.icon_path,'layout',r.layout,'metadata_version',r.metadata_version,'invite',case when r.owner_id=auth.uid() then r.invite else null end) order by r.created_at),'[]'::jsonb) from public.workspace_rooms r join public.workspace_members m on m.room_id=r.id where m.user_id=auth.uid();
$$;
create function private.workspace_snapshot(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.workspace_is_member(target::text) then raise exception 'Workspace membership required' using errcode='42501';end if;
 return jsonb_build_object('notes',coalesce((select jsonb_agg(s order by s.created_at,s.id) from public.workspace_sections s where s.room_id=target),'[]'::jsonb),'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.name,m.name),'last_seen',m.last_seen,'avatar_path',coalesce(p.avatar_path,''),'color',coalesce(p.color,'#466c50')) order by m.name) from public.workspace_members m left join public.workspace_profiles p on p.id=m.user_id where m.room_id=target),'[]'::jsonb),'room',(select value from jsonb_array_elements(private.workspace_rooms()) where value->>'id'=target::text),'serverTime',(extract(epoch from now())*1000)::bigint);
end;$$;
create function public.workspace_snapshot(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.workspace_snapshot(target);$$;
revoke all on function private.workspace_snapshot(uuid),public.workspace_snapshot(uuid) from public,anon;
grant execute on function private.workspace_snapshot(uuid),public.workspace_snapshot(uuid) to authenticated;
create function private.workspace_profile() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',u.id,'name',coalesce(p.name,u.raw_user_meta_data->>'name',u.email,'Friend'),'avatar_path',coalesce(p.avatar_path,''),'color',coalesce(p.color,'#466c50')) from auth.users u left join public.workspace_profiles p on p.id=u.id where u.id=auth.uid();
$$;
create function public.workspace_profile() returns jsonb language sql stable security invoker set search_path='' as $$select private.workspace_profile();$$;
revoke all on function private.workspace_profile(),public.workspace_profile() from public,anon;
grant execute on function private.workspace_profile(),public.workspace_profile() to authenticated;
-- Preserve the version-checked section writes from the original migration.
alter function private.workspace_action(jsonb) rename to workspace_action_base;
create function private.workspace_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; result jsonb; changed uuid; image_path text; profile_name text;begin
 if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
 if input->>'action'='profile' then
  profile_name:=trim(input->>'name');image_path:=coalesce(input->>'avatar_path','');
  if jsonb_typeof(input->'name') is distinct from 'string' or length(profile_name) not between 1 and 80 or coalesce(input->>'color','') !~ '^#[a-fA-F0-9]{6}$' then raise exception 'Enter a display name and valid cursor color';end if;
  if image_path<>'' and not exists(select 1 from storage.objects where bucket_id='profile-images' and name=image_path and (storage.foldername(name))[1]=actor::text) then raise exception 'Upload your own profile image first';end if;
  insert into public.workspace_profiles(id,name,avatar_path,color) values(actor,profile_name,image_path,input->>'color') on conflict(id) do update set name=excluded.name,avatar_path=excluded.avatar_path,color=excluded.color;
  update public.workspace_members set name=profile_name where user_id=actor;
  return private.workspace_profile();
 elsif input->>'action'='workspace' then
  target:=(input->>'roomId')::uuid;
  if not private.workspace_is_member(target::text) then raise exception 'Workspace membership required' using errcode='42501';end if;
  if jsonb_typeof(input->'description') is distinct from 'string' or length(input->>'description')>1000 or coalesce(input->>'layout','') not in ('document','webpage') then raise exception 'Invalid workspace description or layout';end if;
  image_path:=coalesce(input->>'icon_path','');
  if image_path<>'' and not exists(select 1 from storage.objects where bucket_id='workspace-files' and name=image_path and (storage.foldername(name))[1]=target::text and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')) then raise exception 'Choose an image uploaded to this workspace';end if;
  update public.workspace_rooms set description=input->>'description',layout=input->>'layout',icon_path=image_path,metadata_version=metadata_version+1 where id=target and metadata_version=(input->>'version')::integer returning id into changed;
  if changed is null then raise exception 'Workspace settings changed. Reopen settings and try again.' using errcode='40001';end if;
  return jsonb_build_object('ok',true);
 else
  result:=private.workspace_action_base(input);
  if input->>'action'='create' and input->>'layout'='webpage' then update public.workspace_rooms set layout='webpage' where id=(result->>'roomId')::uuid;end if;
  return result;
 end if;
end;$$;
revoke all on function private.workspace_action(jsonb) from public,anon;
grant execute on function private.workspace_action(jsonb) to authenticated;
-- Member-only ephemeral cursor and online presence channel.
create policy workspace_presence_read on realtime.messages for select to authenticated using(extension in ('broadcast','presence') and private.workspace_is_member(split_part((select realtime.topic()),':',2)) and split_part((select realtime.topic()),':',1)='workspace');
create policy workspace_presence_write on realtime.messages for insert to authenticated with check(extension in ('broadcast','presence') and private.workspace_is_member(split_part((select realtime.topic()),':',2)) and split_part((select realtime.topic()),':',1)='workspace');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-images','profile-images',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy profile_images_read on storage.objects for select to authenticated using(bucket_id='profile-images' and private.workspace_can_see_profile((storage.foldername(name))[1]));
create policy profile_images_insert on storage.objects for insert to authenticated with check(bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy profile_images_delete on storage.objects for delete to authenticated using(bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
