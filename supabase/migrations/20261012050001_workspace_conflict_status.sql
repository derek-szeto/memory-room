create or replace function public.workspace_action(input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 return private.workspace_action(input);
exception when serialization_failure then
 raise exception '%',sqlerrm using errcode='PT409';
end;$$;
