# Boomerang : configurer Supabase (lot 5 bis)

À faire une seule fois. Compte environ 20 minutes. Les libellés du tableau de bord Supabase peuvent varier un peu selon les mises à jour.

Ne communique jamais à personne (ni à Claude) : le mot de passe de la base, la clé `service_role`, le poivre ni la clé enseignant. Seule l'adresse de la fonction est publique.

## 1. Créer le projet

1. Va sur supabase.com et crée ton compte (ou connecte-toi).
2. Clique sur **New project**.
3. Nom : `boomerang`. Mot de passe de la base : clique sur **Generate a password** et range-le dans ton gestionnaire de mots de passe (il ne servira plus ici).
4. **Region** : **Central EU (Frankfurt)**.
5. Offre : **Free**. Clique sur **Create new project** et attends 1 à 2 minutes.

## 2. Créer les tables

1. Menu de gauche : **SQL Editor**, puis **New query**.
2. Colle tout le contenu du fichier `supabase/schema.sql` du dépôt.
3. Clique sur **Run**. Résultat attendu : « Success ».
4. Si une erreur parle de `pg_cron` : menu **Database** > **Extensions**, active **pg_cron**, puis relance la requête.
5. Vérifie dans **Table Editor** : trois tables `classes`, `avatars`, `cartes`, marquées « RLS enabled ». Un avertissement « RLS enabled, no policies » est normal : c'est voulu, l'app ne doit jamais lire les tables directement.
6. Vérifie dans **Integrations** > **Cron** (ou **Database** > **Cron**) la tâche `boomerang-purge-31-aout`.

## 3. Créer les secrets

Dans le Terminal du Mac, génère deux valeurs aléatoires (une commande à la fois, copie chaque résultat) :

```bash
openssl rand -hex 32
```

```bash
openssl rand -base64 18
```

Puis dans Supabase : **Edge Functions** > **Secrets** (ou **Project Settings** > **Edge Functions**), ajoute :

| Nom | Valeur |
| --- | --- |
| `BOOMERANG_POIVRE` | le résultat de `openssl rand -hex 32` |
| `BOOMERANG_CLE_ENSEIGNANT` | le résultat de `openssl rand -base64 18` (24 caractères ; 12 au minimum), à ranger dans ton gestionnaire de mots de passe : tu la taperas une fois dans l'atelier |
| `BOOMERANG_ORIGINE` | `https://evottero.github.io` |

Ne change plus jamais `BOOMERANG_POIVRE` : tous les codes élèves deviendraient faux.

## 4. Déployer la fonction

1. **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Nom de la fonction : `boomerang`.
3. Remplace tout le code proposé par le contenu du fichier `supabase/functions/boomerang/index.ts` du dépôt.
4. Clique sur **Deploy function**.
5. Dans les réglages de la fonction, **désactive la vérification JWT** (« Verify JWT » / « Enforce JWT verification »). L'app n'envoie aucune clé : la fonction se protège elle-même (codes, blocage, clé enseignant).
6. Copie l'adresse de la fonction. Elle ressemble à : `https://abcdefghijklmnop.supabase.co/functions/v1/boomerang`.

## 5. Brancher l'app

Envoie cette adresse à Claude (elle est publique). Il la mettra dans `synchro.js` et limitera la sécurité du site à ce seul projet. Puis commit, push, coche verte.

## 6. Première classe

1. Dans l'app : atelier (5 touchers sur le numéro de version, puis ton code).
2. Bloc **Classe et synchronisation** : tape la clé enseignant, puis **Créer une nouvelle classe**.
3. Note le code de 6 caractères affiché : c'est celui que les élèves tapent une fois sur chaque appareil.

## Chaque retour de vacances

Le projet gratuit se met en pause après 7 jours sans activité. Ouvre le tableau de bord Supabase et clique sur **Restore project** (ou **Resume**) avant la reprise. Les données sont conservées pendant la pause.

## Chaque 31 août

Toutes les données (classes, avatars, progressions) sont effacées automatiquement. À la rentrée, crée une nouvelle classe dans l'atelier.
