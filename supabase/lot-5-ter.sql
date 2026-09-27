-- Boomerang : mise à jour de la base pour le lot 5 ter (multi-classes, publication des paquets).
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». Une seule fois.
-- Sans risque pour les données existantes : ne fait qu'ajouter des colonnes et une table.

-- Code enseignant de chaque classe : uniquement son empreinte, avec la même limitation d'essais.
alter table public.classes add column if not exists empreinte_enseignant text;
alter table public.classes add column if not exists sel_enseignant text;
alter table public.classes add column if not exists essais_faux_enseignant smallint not null default 0;
alter table public.classes add column if not exists bloque_enseignant_jusqua timestamptz;

-- Paquets publiés par l'enseignant pour sa classe (contenu pédagogique, aucune donnée d'élève).
create table if not exists public.paquets (
  classe  text not null references public.classes(code) on delete cascade,
  id      text not null check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 60),
  contenu jsonb not null,
  primary key (classe, id)
);

-- Même règle que les autres tables : aucun accès direct depuis l'app.
alter table public.paquets enable row level security;
revoke all on public.paquets from anon, authenticated;
