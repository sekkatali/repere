-- Repère : scan gratuit réalisé par l'agent, consultable par lien privé (sans compte)
alter table public.scan_requests
  add column if not exists token uuid not null default gen_random_uuid(),
  add column if not exists maps_url text,
  add column if not exists source text not null default 'site',
  add column if not exists prospect_id uuid references public.prospects(id) on delete set null,
  add column if not exists result jsonb,
  add column if not exists done_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists notes text;
create unique index if not exists scan_requests_token_key on public.scan_requests(token);

alter table public.scan_requests drop constraint if exists scan_requests_status_check;
alter table public.scan_requests add constraint scan_requests_status_check
  check (status in ('nouveau','pret','envoye','client','introuvable'));
alter table public.scan_requests add constraint scan_requests_source_check
  check (source in ('site','admin','prospect'));

-- Le public ne peut créer qu'une demande vierge (pas de résultat ni de date fabriqués)
drop policy if exists "scan : tout le monde peut demander" on public.scan_requests;
create policy "scan : tout le monde peut demander" on public.scan_requests for insert to anon, authenticated
  with check (status = 'nouveau' and source = 'site' and result is null and done_at is null and sent_at is null and prospect_id is null);

-- Lecture d'un scan par son lien privé (le jeton fait office de mot de passe)
create or replace function public.get_scan(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when s.id is null then null
    when s.status in ('pret','envoye','client') then jsonb_build_object('status','pret','restaurant',s.restaurant,'city',s.city,'done_at',s.done_at,'result',s.result)
    when s.status = 'introuvable' then jsonb_build_object('status','introuvable','restaurant',s.restaurant,'city',s.city)
    else jsonb_build_object('status','en_attente','restaurant',s.restaurant,'city',s.city,'created_at',s.created_at)
  end
  from (select 1) d left join public.scan_requests s on s.token = p_token;
$$;
revoke all on function public.get_scan(uuid) from public;
grant execute on function public.get_scan(uuid) to anon, authenticated;
