-- Boomerang : schéma de la base de synchronisation (lot 5 bis).
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». Une seule fois.
--
-- Données stockées (section 3 du CLAUDE.md) : code de classe, avatar, empreinte du code élève
-- (jamais le code en clair), nombre de séances de l'avatar (état de la plante, sans date ni lieu)
-- et état des cartes. S'y ajoutent trois champs techniques : « sel » (sert à calculer
-- l'empreinte), « essais_faux » et « bloque_jusqua » (blocage d'une heure après 5 codes faux).

create table if not exists public.classes (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  -- Code enseignant de la classe (lot 5 ter) : empreinte seulement, jamais le code en clair.
  empreinte_enseignant     text,
  sel_enseignant           text,
  essais_faux_enseignant   smallint not null default 0,
  bloque_enseignant_jusqua timestamptz
);

create table if not exists public.avatars (
  classe        text not null references public.classes(code) on delete cascade,
  avatar        text not null check (avatar ~ '^[a-z]{2,20}-[a-z]{2,20}$'),
  empreinte     text,                       -- HMAC du code élève ; null = code à redéfinir
  sel           text not null,
  essais_faux   smallint not null default 0,
  bloque_jusqua timestamptz,
  seances       integer not null default 0 check (seances >= 0),   -- plante : nombre de séances
  primary key (classe, avatar)
);

create table if not exists public.cartes (
  classe   text not null,
  avatar   text not null,
  paquet   text not null check (char_length(paquet) <= 60),
  cle      text not null check (char_length(cle) <= 1000),
  boite    smallint not null check (boite between 1 and 5),
  echeance integer not null,
  vues     integer not null,
  derniere integer not null,
  primary key (classe, avatar, paquet, cle),
  foreign key (classe, avatar) references public.avatars(classe, avatar) on delete cascade
);

-- Paquets publiés par l'enseignant pour sa classe (lot 5 ter) : contenu pédagogique, aucune donnée d'élève.
create table if not exists public.paquets (
  classe  text not null references public.classes(code) on delete cascade,
  id      text not null check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 60),
  contenu jsonb not null,
  primary key (classe, id)
);

-- Aucun accès direct depuis l'app : sécurité par ligne activée, aucune règle d'accès.
-- Seule l'Edge Function, avec la clé de service, lit et écrit.
alter table public.classes enable row level security;
alter table public.avatars enable row level security;
alter table public.cartes  enable row level security;
alter table public.paquets enable row level security;
revoke all on public.classes, public.avatars, public.cartes, public.paquets from anon, authenticated;

-- Effacement automatique de toutes les données chaque 31 août à 3 h (heure UTC).
-- Supprimer les classes supprime en cascade les avatars et les cartes.
create extension if not exists pg_cron;
select cron.schedule('boomerang-purge-31-aout', '0 3 31 8 *', $$ delete from public.classes $$);
