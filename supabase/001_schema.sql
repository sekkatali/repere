-- Repère : schéma initial
-- Comptes : connexion par lien e-mail (Supabase Auth). Un compte = un profil ; un client possède un ou plusieurs établissements.

create extension if not exists pgcrypto;

-- Profils -------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'client' check (role in ('client','admin')),
  created_at timestamptz not null default now()
);

-- Établissements (un par abonnement) -----------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  city text,
  google_maps_url text,
  -- abonnement
  plan_status text not null default 'trial' check (plan_status in ('trial','active','past_due','canceled')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  -- canaux de validation des réponses (le client choisit, plusieurs possibles)
  validate_whatsapp boolean not null default true,
  validate_sms boolean not null default false,
  validate_email boolean not null default true,
  phone text,
  notify_email text,
  -- style des réponses
  tone text not null default 'vous' check (tone in ('vous','tu')),
  signature text,
  auto_publish_positive boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.restaurants(owner_id);

-- Avis et réponses proposées ---------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  author text,
  stars int check (stars between 1 and 5),
  text text,
  review_date date,
  proposed_reply text,
  final_reply text,
  status text not null default 'a_valider' check (status in ('a_valider','valide','publie','ignore')),
  validated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.reviews(restaurant_id, status);

-- Rapports du dimanche ------------------------------------------------------------
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  week_start date not null,
  rating numeric(2,1),
  reviews_total int,
  reviews_week int,
  replied_week int,
  local_rank int,
  local_query text,
  chatgpt jsonb,          -- [{question, cite: bool}]
  actions jsonb,          -- ["Ajouter 5 photos…", …]
  created_at timestamptz not null default now(),
  unique (restaurant_id, week_start)
);

-- Prospection (agent quotidien, visible par l'admin seulement) ----------------------
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  analysed_on date not null default current_date,
  zone text,
  name text not null,
  rating numeric(2,1),
  reviews_count int,
  reviews_read int,
  unanswered int,
  negatives_unanswered int,
  score int,
  email text,
  email_source text,
  website text,
  phone text,
  maps_url text unique,
  status text not null default 'a_rediger' check (status in
    ('a_rediger','brouillon','envoye','a_repondu','essai','client','stop','ecarte_repond','ecarte_sans_email','ecarte_chaine')),
  subject text,
  drafted_on date,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.prospects(status);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_on date not null default current_date,
  zones text,
  analysed int,
  with_email int,
  drafts int,
  sent_since int,
  replies_since int,
  problems text,
  created_at timestamptz not null default now()
);

-- Rôle admin ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Création automatique du profil et de l'établissement à l'inscription ----------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, meta->>'full_name',
          case when lower(new.email) in ('alisekkat1234@gmail.com') then 'admin' else 'client' end)
  on conflict (id) do nothing;
  if coalesce(meta->>'restaurant_name','') <> '' then
    insert into public.restaurants (owner_id, name, city, google_maps_url, phone, notify_email)
    values (new.id, meta->>'restaurant_name', meta->>'city', nullif(meta->>'google_maps_url',''),
            nullif(meta->>'phone',''), new.email);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sécurité (RLS) -------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.reviews enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.prospects enable row level security;
alter table public.agent_runs enable row level security;

create policy "profil : soi-même ou admin" on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "resto : propriétaire ou admin (lecture)" on public.restaurants for select
  using (owner_id = auth.uid() or public.is_admin());
create policy "resto : admin (tout)" on public.restaurants for all
  using (public.is_admin()) with check (public.is_admin());
-- le client modifie ses réglages via la fonction update_my_settings (pas d'update direct : il ne doit pas toucher à son abonnement)

create policy "avis : propriétaire ou admin (lecture)" on public.reviews for select
  using (public.is_admin() or exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "avis : admin (tout)" on public.reviews for all
  using (public.is_admin()) with check (public.is_admin());

create policy "rapports : propriétaire ou admin" on public.weekly_reports for select
  using (public.is_admin() or exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "rapports : admin (tout)" on public.weekly_reports for all
  using (public.is_admin()) with check (public.is_admin());

create policy "prospects : admin" on public.prospects for all using (public.is_admin()) with check (public.is_admin());
create policy "journal agent : admin" on public.agent_runs for all using (public.is_admin()) with check (public.is_admin());

-- Actions du client (fonctions contrôlées) --------------------------------------------
create or replace function public.update_my_settings(
  p_restaurant uuid, p_whatsapp boolean, p_sms boolean, p_email boolean,
  p_phone text, p_notify_email text, p_tone text, p_signature text, p_auto boolean,
  p_name text, p_city text, p_maps text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from restaurants where id = p_restaurant and owner_id = auth.uid()) then
    raise exception 'non autorisé';
  end if;
  if not (p_whatsapp or p_sms or p_email) then
    raise exception 'Choisissez au moins un moyen de validation';
  end if;
  if (p_whatsapp or p_sms) and coalesce(trim(p_phone),'') = '' then
    raise exception 'Un numéro de téléphone est nécessaire pour WhatsApp ou SMS';
  end if;
  update restaurants set validate_whatsapp = p_whatsapp, validate_sms = p_sms, validate_email = p_email,
    phone = nullif(trim(p_phone),''), notify_email = nullif(trim(p_notify_email),''),
    tone = case when p_tone in ('vous','tu') then p_tone else tone end,
    signature = nullif(trim(p_signature),''), auto_publish_positive = p_auto,
    name = coalesce(nullif(trim(p_name),''), name), city = nullif(trim(p_city),''),
    google_maps_url = nullif(trim(p_maps),'')
  where id = p_restaurant;
end $$;

create or replace function public.decide_review(p_review uuid, p_action text, p_reply text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from reviews v join restaurants r on r.id = v.restaurant_id
                 where v.id = p_review and (r.owner_id = auth.uid() or public.is_admin())) then
    raise exception 'non autorisé';
  end if;
  if p_action = 'valider' then
    update reviews set status = 'valide', final_reply = coalesce(nullif(trim(p_reply),''), proposed_reply), validated_at = now() where id = p_review;
  elsif p_action = 'ignorer' then
    update reviews set status = 'ignore' where id = p_review;
  elsif p_action = 'modifier' then
    update reviews set proposed_reply = p_reply where id = p_review;
  else
    raise exception 'action inconnue';
  end if;
end $$;

create or replace function public.add_my_restaurant(p_name text, p_city text, p_maps text)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  insert into restaurants (owner_id, name, city, google_maps_url, notify_email)
  values (auth.uid(), trim(p_name), nullif(trim(p_city),''), nullif(trim(p_maps),''),
          (select email from profiles where id = auth.uid()))
  returning id into rid;
  return rid;
end $$;

revoke all on function public.update_my_settings from public, anon;
revoke all on function public.decide_review from public, anon;
revoke all on function public.add_my_restaurant from public, anon;
grant execute on function public.update_my_settings to authenticated;
grant execute on function public.decide_review to authenticated;
grant execute on function public.add_my_restaurant to authenticated;

-- Demandes de scan gratuit depuis la landing (tout le monde peut en créer, seul l'admin les lit)
create table public.scan_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant text not null check (length(restaurant) between 1 and 200),
  city text check (length(city) <= 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  status text not null default 'nouveau' check (status in ('nouveau','envoye','client')),
  created_at timestamptz not null default now()
);
alter table public.scan_requests enable row level security;
create policy "scan : tout le monde peut demander" on public.scan_requests for insert to anon, authenticated
  with check (status = 'nouveau');
create policy "scan : admin" on public.scan_requests for all using (public.is_admin()) with check (public.is_admin());

-- Comptes déjà présents dans le projet (créés avant Repère) : on leur crée un profil.
insert into public.profiles (id, email, role)
select id, email, case when lower(email) = 'alisekkat1234@gmail.com' then 'admin' else 'client' end
from auth.users where email is not null
on conflict (id) do nothing;
