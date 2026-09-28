# Boomerang – Cahier des charges de la webapp de révision CM2 (type Baobab, données minimales)

Version du 27/09/2026. Ce fichier est la référence du projet. Relis-le au début de chaque session et respecte en priorité la section 3.

## 1. Faisabilité et choix d'architecture

Webapp installable (PWA) qui tourne sur iPad et iPhone, sans compte nominatif. Un serveur de synchronisation facultatif (lot 5 bis) ne garde que les données minimales de la section 3. Le seul point dur est l'IA : générer une fiche à partir d'une photo impose d'envoyer du contenu à un modèle distant. D'où deux modes, livrés en deux temps.

| Mode | Qui utilise l'IA | Ce qui sort de l'iPad élève | Version |
| --- | --- | --- | --- |
| Mode Classe | L'enseignant, sur son poste, à partir de ses propres leçons | Rien. L'élève charge un paquet de révision et travaille hors ligne | V1 |
| Mode Photo | L'élève (ou le parent), depuis l'app | Le texte de la leçon, sans image, après relecture et nettoyage | V2, optionnelle |

Le Mode Classe fonctionne entièrement hors ligne ; la synchronisation ne fait que recopier la progression entre les appareils d'un même élève. Le Mode Photo reste désactivé par défaut et ne s'active qu'après validation (section 15).

Architecture retenue : site statique (HTML, CSS, JavaScript), hébergé gratuitement sur GitHub Pages à l'adresse https://boomerang.tableautablettes.fr (racine du domaine). La racine sert une page d'accueil publique (`index.html`) ; l'app est derrière elle (`app.html`) et n'est accessible qu'avec un code de classe valide. Le site comprend aussi les pages publiques `confidentialite.html` et `mentions-legales.html`, service worker pour le hors ligne, stockage local IndexedDB, qui reste la référence. Synchronisation par un projet Supabase gratuit, en région Europe (Francfort) : la base n'est jamais accessible directement depuis l'app, tout passe par une Edge Function. Aucun compte nominatif, aucun outil d'analyse d'audience.

## 2. Objectifs et périmètre

L'app transforme une leçon de la classe en entraînement actif : fiche courte, cartes recto-verso, quiz, avec retour immédiat. Elle sert en classe (PDT, temps autonome, 12 iPads partagés) et à la maison sur le smartphone ou la tablette familiale.

Objectifs mesurables :

- Un élève ouvre un paquet et commence une révision en moins de 30 secondes, sans aide.
- Une séance de révision dure 5 à 10 minutes.
- L'enseignant produit un paquet complet à partir d'une leçon en moins de 10 minutes, relecture comprise.
- L'app fonctionne sans réseau une fois le paquet chargé.

Périmètre V1 : Mode Classe, lecteur de paquets, 3 activités (fiche, cartes, quiz), répétition espacée locale, affichage adapté DYS, lecture à voix haute. Disciplines prioritaires : histoire-géographie, sciences, vocabulaire, grammaire, conjugaison, faits numériques, grandeurs et mesures.

## 3. Données minimales : règles opposables

Ces règles s'imposent au code. Vérifie-les à chaque étape. Chaque règle a un test de recette (section 14).

1. Accès réservé aux classes participantes : la page d'accueil demande un code de classe, vérifié par la fonction Supabase. L'appareil le retient ; aux visites suivantes, la page d'accueil est sautée. Code faux : « Code inconnu. Vérifie auprès de ton enseignant. », et 5 codes faux bloquent la saisie une heure sur l'appareil. Sans code, `app.html` renvoie à la page d'accueil. Aucun compte nominatif, aucune adresse mail, aucun prénom demandé. L'élève est représenté par un avatar (animal, couleur), unique dans la classe, protégé par un code élève à 4 chiffres. La classe est identifiée par un code de classe de 6 caractères, saisi une fois par appareil.
2. Le serveur ne stocke que : le code de classe, l'empreinte du code enseignant de la classe (jamais le code en clair), les paquets publiés par l'enseignant pour sa classe (contenu pédagogique, aucune donnée d'élève), l'avatar, l'empreinte du code élève (jamais le code en clair), l'état de la plante sous la forme d'un simple nombre de séances par avatar (sans date ni lieu) et l'état des cartes. S'y ajoutent des champs techniques : le sel (sert au calcul des empreintes), le nombre d'essais faux et la fin du blocage, pour le code élève comme pour le code enseignant. Les réglages (police, taille, voix) restent sur l'appareil. IndexedDB reste la référence ; le serveur n'en est qu'une copie.
3. Aucun script tiers : pas d'analytics, pas de police Google chargée à distance, pas de CDN au moment de l'usage. Toutes les ressources sont embarquées dans le site.
4. Aucun cookie.
5. Aucune requête réseau hors du site lui-même et de la fonction de synchronisation. L'app reste entièrement utilisable hors ligne ; la synchronisation se fait au retour du réseau.
6. Aucun accès direct aux tables depuis l'app : tout passe par une Edge Function. Après 5 codes élève faux, l'avatar est bloqué une heure. Les actions enseignant (publier, liste des avatars, réinitialiser un code, effacer un élève) sont protégées par le code enseignant de la classe, d'au moins 12 caractères, avec la même limitation d'essais. La clé d'administration, d'au moins 12 caractères, ne sert qu'à créer une classe et à définir son code enseignant.
7. Code élève : saisi deux fois à la création, demandé à chaque ouverture ; chiffres tous identiques et 1234 refusés ; clavier à gros chiffres avec lecture vocale. L'atelier peut réinitialiser le code d'un avatar sans toucher à sa progression.
8. En V2, la photo reste sur l'appareil. La reconnaissance du texte (OCR) se fait localement. Seul le texte relu part vers l'IA.
9. « Effacer mes données » vide l'appareil en un geste et supprime aussi la progression sur le serveur. Toutes les données du serveur sont effacées automatiquement chaque 31 août.
10. Une page « Confidentialité » en langage élève dit ce que l'app garde, où (appareil et serveur), et comment l'effacer.

## 4. Utilisateurs et contextes d'usage

| Utilisateur | Appareil | Contexte | Besoin principal |
| --- | --- | --- | --- |
| Élève CM2 | iPad de classe partagé | Temps PDT, atelier autonome, 5 à 10 min | Réviser sans lire de consigne longue |
| Élève CM2 | Smartphone ou tablette familiale | Leçon du soir, veille d'évaluation | Ouvrir le bon paquet via un lien ou un QR code |
| Enseignant | Mac ou iPad enseignant | Préparation de la leçon | Créer, relire, publier un paquet |
| Enseignante stagiaire | Son propre appareil | Jours de décharge | Distribuer un paquet existant, sans rien configurer |
| Parent | Smartphone | Accompagnement ponctuel | Comprendre l'outil en une page |

Un même iPad sert à plusieurs élèves. La progression est rangée par avatar, sur l'appareil. Objectif de la synchronisation (lot 5 bis) : l'élève montre en classe le travail fait à la maison, et inversement. Sa progression le suit d'un appareil à l'autre grâce au code de classe, à son avatar et à son code élève.

## 5. Fonctionnalités V1 : Mode Classe

Deux outils : un atelier enseignant pour fabriquer les paquets, un lecteur élève pour s'entraîner.

### 5.1 Atelier enseignant

- L'enseignant colle le texte de sa leçon dans Claude (chat), avec un prompt fourni par le projet. Claude renvoie un paquet au format JSON (section 10).
- L'atelier importe ce JSON, l'affiche question par question et permet de corriger, supprimer, réordonner, ajouter.
- Validation obligatoire : un paquet ne peut pas être publié tant que chaque élément n'est pas coché « relu ».
- Publication (lot 5 ter) : « Publier » enregistre le paquet sur le serveur pour la classe, puis affiche son QR code. Sans synchronisation, un export en fichier .json à déposer dans `paquets/` reste possible. Parcours détaillé et libellés exacts : voir le lot 5 ter (section 13).
- Métadonnées : discipline, titre, période (P1 à P10), niveau (accompagné, standard, approfondi).

### 5.2 Lecteur élève

- Accueil : choix de l'avatar, puis liste des paquets disponibles, classés par discipline avec une icône et une couleur.
- Ouverture d'un paquet par lien, QR code (appareil photo natif) ou liste.
- Trois activités par paquet :
    - Fiche : 5 à 8 idées clés, courtes, avec mots importants en gras.
    - Cartes : recto (question, mot, date), verso (réponse). L'élève se note : « Je savais », « Presque », « Je ne savais pas ».
    - Quiz : QCM à 3 choix, vrai ou faux, texte à trous, remise en ordre. Correction immédiate avec l'explication.
        - Remise en ordre : pas de glisser-déposer. L'élève touche les étiquettes dans l'ordre, elles se placent dans des cases numérotées ; un nouvel appui sur une case retire son étiquette.
        - Texte à trous : l'élève tape le mot. Les majuscules et les espaces en trop sont ignorés. Les accents suivent le champ `accents` de la question (section 10).
- Fin de séance : nombre de réussites, cartes à revoir, message court et factuel. Pas de classement entre élèves.
- Trois niveaux par paquet, choisis par l'enseignant ou par l'élève selon le réglage.

## 6. Fonctionnalités V2 : Mode Photo (optionnel, ne pas développer avant validation)

1. L'élève photographie sa leçon. L'image reste sur l'appareil.
2. Reconnaissance du texte en local (Tesseract.js, modèle français embarqué).
3. Écran de relecture obligatoire : comparaison au cahier, correction, suppression de tout nom propre de personne.
4. Envoi du texte seul vers une fonction relais (Cloudflare Worker ou Netlify Function) qui appelle l'API Claude. La fonction ne journalise rien et ne stocke rien.
5. Réception d'un paquet au format de la section 10, puis même lecteur qu'en V1.
6. Bandeau permanent sur la fiche générée : « Vérifie avec ton cahier ».

Limites à annoncer à l'élève avant la photo : écriture manuscrite, tableaux, schémas, maths posées. Plafond quotidien d'appels côté fonction relais.

## 7. Moteur de révision

Deux principes : se tester plutôt que relire, et revoir juste avant d'oublier. Pas de bibliothèque externe.

Répétition espacée en 5 boîtes (système Leitner) :

| Boîte | Carte revue après | Passage |
| --- | --- | --- |
| 1 | Même séance | « Je savais » : boîte 2 |
| 2 | 1 jour | « Je savais » : boîte suivante |
| 3 | 3 jours | « Presque » : reste dans sa boîte |
| 4 | 7 jours | « Je ne savais pas » : retour boîte 1 |
| 5 | 14 jours | Carte considérée comme sue |

Règles de séance :

- 10 cartes maximum par séance, dont au moins 3 cartes en retard.
- Quiz : les questions ratées reviennent en fin de quiz, une seule fois.
- Une erreur affiche toujours la bonne réponse et une phrase d'explication.

Ludification sobre : une plante qui pousse au fil des séances, par avatar. Pas de points échangeables, pas de série quotidienne, pas de notification.

## 8. Accessibilité DYS

- Police par défaut : Luciole, embarquée dans le site. Alternative : Lexend.
- Taille de texte réglable sur 3 crans, interligne 1,5 minimum, texte aligné à gauche, jamais justifié.
- Lecture à voix haute de chaque consigne, carte et question, via Web Speech API (voix française de l'appareil). Aucun envoi réseau.
- Consignes de 12 mots maximum, un verbe d'action en tête. Tutoiement.
- Une seule question à l'écran, boutons de 44 points minimum.
- Aucune activité minutée.
- Contraste WCAG AA. L'information ne passe jamais par la couleur seule.
- Compatibilité VoiceOver : tous les boutons ont un libellé lisible.

## 9. Contraintes techniques PWA

| Sujet | Exigence |
| --- | --- |
| Pile | HTML, CSS, JavaScript sans framework lourd (ou Vite + Preact si utile). Aucune dépendance chargée à l'usage |
| Cibles | Safari iPadOS et iOS récents, Chrome Android, Safari macOS |
| Installation | Manifeste web + icônes, installable via « Sur l'écran d'accueil ». Nom de l'app installée : « Boomerang ». `start_url` : `app.html`, qui ouvre l'app directement si l'appareil a déjà un code de classe, sinon renvoie à la page d'accueil |
| Hors ligne | Service worker : le site et les paquets déjà ouverts restent disponibles sans réseau |
| Stockage | IndexedDB, qui reste la référence. Recommander l'installation sur l'écran d'accueil (Safari peut effacer les données d'un site non installé) |
| Synchronisation | Projet Supabase gratuit, région Europe (Francfort). Une Edge Function unique, tables inaccessibles depuis l'app. Au retour du réseau, fusion carte par carte : la progression la plus avancée l'emporte (boîte la plus haute, puis révision la plus récente). Plante : le plus grand nombre de séances l'emporte |
| Mise en pause | Le projet Supabase gratuit se met en pause après 7 jours sans activité : le relancer depuis le tableau de bord Supabase après chaque vacances |
| Affichage | Portrait et paysage, du smartphone 6 pouces à l'iPad 13 pouces. Zones sûres respectées |
| Poids | Moins de 2 Mo hors polices et modèle OCR. Chargement en moins de 3 secondes en 4G |
| Hébergement | Statique, gratuit : GitHub Pages, domaine personnalisé https://boomerang.tableautablettes.fr, à la racine (fichier `CNAME` du dépôt). Tous les chemins sont relatifs : manifeste, service worker, liens et QR codes suivent l'adresse réelle. Fonction de synchronisation sur Supabase, qui n'accepte que les origines listées dans le secret `BOOMERANG_ORIGINE` |
| Sauvegarde | Export et import manuel de la progression d'un avatar en fichier |

## 10. Format de données des paquets

Un paquet est un fichier JSON unique, rangé dans `paquets/` sous le nom `<id>.json` et déclaré dans `paquets/index.json`. L'app refuse tout fichier non conforme et dit pourquoi. Le validateur de référence est `validation.js`. Les paquets `paquets/hist-symboles-republique.json` et `paquets/geom-u1-vocabulaire.json` sont les exemples qui font foi.

```json
{
  "version": 1,
  "id": "hist-symboles-republique",
  "titre": "Les symboles de la République",
  "discipline": "histoire",
  "periode": "P1",
  "niveau": "standard",
  "relu": true,
  "fiche": [
    "La devise de la République est **Liberté, Égalité, Fraternité**."
  ],
  "cartes": [
    { "recto": "L'hymne national", "verso": "La Marseillaise" }
  ],
  "quiz": [
    {
      "type": "qcm",
      "question": "Qui représente la République ?",
      "choix": ["Jeanne d'Arc", "Marianne", "La reine"],
      "reponse": 1,
      "explication": "Marianne est la femme symbole de la République."
    },
    {
      "type": "vraifaux",
      "question": "La Marseillaise était au départ un chant de guerre.",
      "reponse": true,
      "explication": "Elle a été composée par un soldat, Rouget de Lisle, pendant une guerre."
    },
    {
      "type": "trous",
      "texte": "La devise de la République est Liberté, ___, Fraternité.",
      "reponse": "Égalité",
      "explication": "La devise dit que nous sommes libres, égaux, et que nous devons nous entraider."
    },
    {
      "type": "ordre",
      "question": "Range ces dates de la plus ancienne à la plus récente.",
      "elements": ["1789 : prise de la Bastille", "1794 : le drapeau tricolore", "1880 : première Fête nationale le 14 juillet"],
      "explication": "1789 vient d'abord, puis 1794, puis 1880."
    }
  ]
}
```

Champs du paquet (tous obligatoires sauf `accents`, aucun autre accepté) :

| Champ | Règle |
| --- | --- |
| `version` | 1 |
| `id` | Minuscules sans accent, chiffres, tirets. Identique au nom du fichier |
| `titre` | Texte, 80 caractères maximum |
| `discipline` | `histoire`, `geographie`, `sciences`, `grammaire`, `conjugaison`, `vocabulaire`, `nombres`, `calcul`, `grandeurs`, `geometrie`, `emc` |
| `periode` | `P1` à `P10` |
| `niveau` | `accompagne`, `standard`, `approfondi` (l'ancienne écriture `accompagné` reste acceptée) |
| `relu` | Doit valoir `true`. Un paquet non relu est refusé par l'app |
| `accents` | Facultatif, `false` par défaut. `false` : dans les textes à trous, les accents manquants sont acceptés mais la bonne orthographe s'affiche ; `true` : l'accent est exigé |
| `fiche` | 5 à 8 idées clés. `**mot**` en gras, `*mot*` en italique |
| `cartes` | Au moins une carte `{ "recto": …, "verso": … }` |
| `quiz` | Au moins une question, d'un des 4 types ci-dessous |

Types de quiz (chacun a une `explication`, affichée après la réponse) :

| Type | Champs | Règle |
| --- | --- | --- |
| `qcm` | `question`, `choix`, `reponse` | 3 choix différents. `reponse` : position de la bonne réponse, 0, 1 ou 2 |
| `vraifaux` | `question`, `reponse` | `question` est une affirmation. `reponse` : `true` ou `false`, sans guillemets |
| `trous` | `texte`, `reponse`, `accents` (facultatif) | `texte` contient une seule fois `___` (trois tirets bas). `reponse` : le mot manquant. Pas de champ `question`. Un `accents` placé sur la question remplace celui du paquet pour cette question |
| `ordre` | `question`, `elements` | 3 à 6 éléments différents, écrits dans le bon ordre. L'app les mélange |

Aucun champ ne contient de donnée d'élève : tout champ inconnu fait refuser le paquet.

Prompt de génération : il est intégré à l'atelier enseignant (bouton « Copier le prompt »), dans `atelier.js` (constante `PROMPT`), qui fait foi. Il produit exactement ce format, avec `"relu": false` : la relecture dans l'atelier coche chaque élément puis exporte le paquet avec `"relu": true`. Règles clés : uniquement le contenu de la leçon, phrases de 15 mots maximum, titre sans le nom de la discipline, aucun piège, une explication d'une phrase par question.

## 11. Écrans

| Écran | Contenu | Côté |
| --- | --- | --- |
| Page d'accueil (`index.html`, publique) | Charte Sable (fond `#F6E7CE`, texte `#3D2B1F`, bouton ambre `#E8A860`), mobile d'abord. En-tête : icône, titre « Boomerang », logo iCARE en haut à droite (lien vers tableautablettes.fr). Accroche « Les cartes qu'on ne sait pas reviennent. Jusqu'à ce qu'on les sache. » Trois blocs : « Se tester plutôt que relire », « Revoir juste avant d'oublier », « Pensé pour tous les élèves : voix, police Luciole, aucun chronomètre ». Ligne « Aucun nom, aucun compte, aucune publicité. Un avatar et un code suffisent. » Encadré « Entrer dans Boomerang » : champ « Code de classe », bouton « Entrer », puis « Boomerang est réservé aux classes participantes. Vous êtes enseignant et l'outil vous intéresse ? » avec le lien « Me contacter » (tableautablettes.fr/contact.html). Pied de page : « Confidentialité », « Mentions légales » | Public |
| Confidentialité et Mentions légales (pages publiques) | Données conservées, emplacement, durée, effacement, crédits ; éditeur, hébergeur (GitHub Pages), prestataire de synchronisation (Supabase, région Europe) | Public |
| Choix de l'avatar | 44 avatars possibles : 11 animaux (renard, panda, grenouille, hibou, tortue, dauphin, lion, lapin, hérisson, abeille, chat) déclinés en 4 couleurs (rouge, jaune, vert, bleu). Les avatars déjà créés ne changent pas. L'écran n'affiche que les avatars créés sur cet appareil, plus le bouton « Nouvel avatar ». Sur un même appareil, un avatar déjà pris ne peut plus être choisi | Élève |
| Mes paquets | Paquets par discipline, pastille « cartes à revoir ». Avec une classe : seulement les paquets publiés pour la classe, gardés sur l'appareil pour le hors ligne. Sans classe : les fichiers du dossier `paquets/` | Élève |
| Paquet | Trois gros boutons : Fiche, Cartes, Quiz | Élève |
| Fiche | Idées clés, bouton haut-parleur par ligne | Élève |
| Cartes | Carte à retourner, trois boutons d'autoévaluation | Élève |
| Quiz | Une question, correction immédiate, explication | Élève |
| Bilan | Réussites, cartes à revoir, plante de l'avatar | Élève |
| Réglages | Police, taille, voix (propres à chaque avatar), bloc « Classe » avec le bouton « Utiliser sans classe » et l'avertissement « Sans code de classe, ta progression ne te suivra pas sur les autres appareils. », confidentialité. Accessible aussi sans avatar depuis l'écran du code de classe (bloc « Classe » seulement). Pas d'effacement côté élève : il se fait dans l'atelier | Élève et adulte |
| Atelier | « Nouveau paquet », « Mes paquets », connexion à la classe par code enseignant, administration (créer une classe, définir son code enseignant), avatars de la classe, date de test, données de l'appareil. Écran « Nouveau paquet » : menus, leçon, « Copier pour Claude », « Coller la réponse de Claude », relecture (corbeille, « Relu »), « Publier », QR code | Enseignant |

L'atelier est protégé par un code local à 4 chiffres. C'est un garde-fou, pas une sécurité.

Identité visuelle : tons sable, sobres, une couleur par discipline.

## 12. Hors périmètre

- Tableau de bord enseignant des résultats par élève.
- Comptes nominatifs, connexion ENT. (La synchronisation entre appareils est traitée au lot 5 bis, avec les seules données de la section 3.)
- Classement, défis entre élèves, partage de scores.
- Notifications et rappels.
- Aide aux devoirs par chat avec l'IA côté élève.
- Publication sur l'App Store.

## 13. Plan de développement

Lots courts, chacun testé sur un vrai iPad avant le suivant. Ne passe jamais au lot suivant sans validation.

| Lot | Contenu | Test de fin de lot |
| --- | --- | --- |
| 0 | Dépôt GitHub, squelette PWA, hébergement GitHub Pages | Le site s'installe sur l'écran d'accueil de l'iPad |
| 1 | Validation du format JSON, lecteur Fiche, 2 paquets exemples | Un paquet s'affiche hors ligne |
| 2 | Cartes et moteur Leitner, avatars, stockage IndexedDB | La progression survit à la fermeture de l'app |
| 3 | Quiz (4 types), bilan de séance | Les questions ratées reviennent en fin de quiz |
| 4 | Accessibilité : Luciole, tailles, synthèse vocale, VoiceOver | Grille de la section 8 cochée |
| 5 | Atelier enseignant, relecture, export, QR code, prompt de génération | Une leçon réelle devient un paquet en moins de 10 minutes |
| 5 bis | Synchronisation : projet Supabase (Francfort), Edge Function, code de classe, code élève, avatars uniques dans la classe, fusion au retour du réseau, réinitialisation du code dans l'atelier, effacement sur le serveur, purge du 31 août | Un élève retrouve en classe la progression faite à la maison, et inversement ; 5 codes faux bloquent l'avatar une heure |
| 5 ter | Publication d'un paquet sans fichier ni GitHub, multi-classes (détail ci-dessous). À réaliser après validation du lot 5 bis | Un paquet passe de la leçon à la publication pour la classe sans fichier ni GitHub |
| 6 | Test en classe sur 2 semaines, corrections | Retours intégrés |
| 7 | V2 Mode Photo, si validée | OCR local et fonction relais sans journal |

### Lot 5 ter : publier un paquet sans fichier ni GitHub

Codé le 27/09/2026 (version 0.7.0), après validation du lot 5 bis.

- Multi-classes : chaque classe a son code de classe et un code enseignant d'au moins 12 caractères (il autorise à publier sur le serveur), stocké uniquement sous forme d'empreinte, vérifié par une Edge Function avec la même limitation d'essais (5 essais faux, puis blocage d'une heure).
- La clé d'administration (le secret `BOOMERANG_CLE_ENSEIGNANT`, 12 caractères au moins) ne sert plus qu'à créer une classe et à définir ou redéfinir le code enseignant d'une classe. Elle n'est jamais gardée sur l'appareil.
- Les élèves ne voient que les paquets de leur classe. Les paquets actuels du dossier `paquets/` sont rattachés à la classe d'Eric.
- Atelier, dans cet ordre et avec exactement ces libellés :
    1. Bouton « Nouveau paquet ».
    2. Trois menus : discipline, période, niveau.
    3. Un grand cadre pour coller la leçon.
    4. Bouton « Copier pour Claude » : copie le prompt de génération complété avec les menus et la leçon.
    5. Bouton « Coller la réponse de Claude » : lit le presse-papiers et affiche le paquet, ou un message clair si le JSON est incomplet.
    6. Relecture élément par élément, avec correction en place, corbeille et bouton « Relu ».
    7. Bouton « Publier », actif seulement quand tout est relu : enregistre le paquet sur Supabase pour la classe.
    8. QR code du paquet affiché après publication.
    9. Une liste « Mes paquets » pour rouvrir, corriger et publier à nouveau.
- Les paquets publiés restent disponibles hors ligne sur les appareils qui les ont déjà ouverts.

## 14. Critères de recette

- [ ] Mode avion : un paquet déjà ouvert se relit, se révise, et la progression s'enregistre.
- [ ] Inspecteur réseau de Safari : aucune requête hors du site et de la fonction de synchronisation.
- [ ] Aucun cookie, aucun traceur.
- [ ] « Effacer toutes mes données » vide l'IndexedDB.
- [ ] « Effacer mes données » supprime aussi la progression sur le serveur.
- [ ] Un élève de CM2 lance une révision seul en moins de 30 secondes.
- [ ] Deux avatars sur le même iPad ont des progressions séparées.
- [ ] Un JSON mal formé est refusé avec un message clair.
- [ ] Un paquet non relu ne peut pas être exporté.
- [ ] « Publier » reste inactif tant qu'un élément n'est pas relu.
- [ ] Sans code de classe, l'app n'est pas accessible : `app.html` renvoie à la page d'accueil.
- [ ] Un appareil qui a déjà un code saute la page d'accueil, y compris depuis l'icône de l'écran d'accueil.
- [ ] Un élève ne voit que les paquets de sa classe.
- [ ] Toutes les consignes sont lisibles par la synthèse vocale et par VoiceOver.
- [ ] Contraste AA vérifié sur tous les écrans.

## 15. Points à vérifier (hors code)

- [ ] Mode Photo : conditions de conservation des données de l'API Anthropic en vigueur.
- [ ] Mode Photo : avis du DPD de l'académie.
- [ ] Information de l'IEN et mention au conseil des maîtres.
- [ ] Conservation de l'IndexedDB sur iPadOS pour une PWA installée, à tester sur le parc réel.
- [ ] Licence de la police Luciole pour l'embarquement dans un site.
- [ ] Crédit de la police Luciole dans la page Confidentialité.
- [ ] Compléter les mentions légales (`mentions-legales.html`, zones entre crochets) : éditeur, directeur de la publication, adresse de Supabase, responsable du traitement, droits sur les contenus et le logo.
- [ ] Qualité de Tesseract.js sur une écriture de cahier CM2, avant le lot 7.
- [ ] Changement d'adresse (boomerang.tableautablettes.fr) : les données locales d'un appareil sont liées à l'adresse du site. Sur chaque appareil, installer l'app depuis la nouvelle adresse, retaper le code de classe et retrouver son avatar avec son code élève (la progression revient du serveur). Les avatars sans classe et les réglages (police, taille, voix) repartent de zéro.
- [ ] Une fois tous les appareils passés à la nouvelle adresse, retirer https://evottero.github.io du secret `BOOMERANG_ORIGINE`.
- [ ] Information des familles sur l'ENT.
- [ ] Synchronisation : avis du DPD de l'académie avant la mise en service en classe.
