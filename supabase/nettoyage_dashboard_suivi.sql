-- À exécuter UNE fois dans le SQL Editor du projet DASHBOARD SUIVI (compte mbafoodsarl) :
-- retire tout ce que Repère y avait créé. Ne touche à aucune table de Dunk Pilotage.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.update_my_settings(uuid, boolean, boolean, boolean, text, text, text, text, boolean, text, text, text);
drop function if exists public.decide_review(uuid, text, text);
drop function if exists public.add_my_restaurant(text, text, text);
drop table if exists public.scan_requests, public.agent_runs, public.prospects, public.weekly_reports, public.reviews, public.restaurants, public.profiles cascade;
drop function if exists public.is_admin();
