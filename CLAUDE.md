# Cahier des charges – Webapp de révision CM2 (type Baobab, zéro collecte)

Version du 26/09/2026. Ce fichier est la référence du projet. Relis-le au début de chaque session et respecte en priorité la section 3.

## 1. Faisabilité et choix d'architecture

Webapp installable (PWA) qui tourne sur iPad et iPhone, sans compte ni serveur de données. Le seul point dur est l'IA : générer une fiche à partir d'une photo impose d'envoyer du contenu à un modèle distant. D'où deux modes, livrés en deux temps.

| Mode | Qui utilise l'IA | Ce qui sort de l'iPad élève | Version |
| --- | --- | --- | --- |
| Mode Classe | L'enseignant, sur son poste, à partir de ses propres leçons | Rien. L'élève charge un paquet de révision et travaille hors ligne | V1 |
| Mode Photo | L'élève (ou le parent), depuis l'app | Le texte de la leçon, sans image, après relecture et nettoyage | V2, optionnelle |

Le Mode Classe tient seul et respecte strictement le zéro collecte. Le Mode Photo reste désactivé par défaut et ne s'active qu'après validation (section 15).

Architecture retenue : site statique (HTML, CSS, JavaScript), hébergé gratuitement (GitHub Pages ou Netlify), service worker pour le hors ligne, stockage local IndexedDB. Aucune base de données distante, aucun compte, aucun outil d'analyse d'audience.

## 2. Objectifs et périmètre

L'app transforme une leçon de la classe en entraînement actif : fiche courte, cartes recto-verso, quiz, avec retour immédiat. Elle sert en classe (PDT, temps autonome, 12 iPads partagés) et à la maison sur le smartphone ou la tablette familiale.

Objectifs mesurables :

- Un élève ouvre un paquet et commence une révision en moins de 30 secondes, sans aide.
- Une séance de révision dure 5 à 10 minutes.
- L'enseignant produit un paquet complet à partir d'une leçon en moins de 10 minutes, relecture comprise.
- L'app fonctionne sans réseau une fois le paquet chargé.

Périmètre V1 : Mode Classe, lecteur de paquets, 3 activités (fiche, cartes, quiz), répétition espacée locale, affichage adapté DYS, lecture à voix haute. Disciplines prioritaires : histoire-géographie, sciences, vocabulaire, grammaire, conjugaison, faits numériques, grandeurs et mesures.

## 3. Principe zéro collecte : règles opposables

Ces règles s'imposent au code. Vérifie-les à chaque étape. Chaque règle a un test de recette (section 14).

1. Aucun compte, aucun identifiant, aucune adresse mail, aucun prénom demandé. Le profil élève est facultatif et se limite à un avatar choisi dans une liste (animal, couleur).
2. Aucune donnée de progression ne quitte l'appareil. Stockage uniquement en IndexedDB local.
3. Aucun script tiers : pas d'analytics, pas de police Google chargée à distance, pas de CDN au moment de l'usage. Toutes les ressources sont embarquées dans le site.
4. Aucun cookie.
5. Le Mode Classe n'émet aucune requête réseau après le chargement du paquet, sauf la mise à jour du site lui-même.
6. En V2, la photo reste sur l'appareil. La reconnaissance du texte (OCR) se fait localement. Seul le texte relu part vers l'IA.
7. Un bouton « Effacer toutes mes données » vide l'appareil en un geste.
8. Une page « Confidentialité » en langage élève dit ce que l'app garde, où, et comment l'effacer.

## 4. Utilisateurs et contextes d'usage

| Utilisateur | Appareil | Contexte | Besoin principal |
| --- | --- | --- | --- |
| Élève CM2 | iPad de classe partagé | Temps PDT, atelier autonome, 5 à 10 min | Réviser sans lire de consigne longue |
| Élève CM2 | Smartphone ou tablette familiale | Leçon du soir, veille d'évaluation | Ouvrir le bon paquet via un lien ou un QR code |
| Enseignant | Mac ou iPad enseignant | Préparation de la leçon | Créer, relire, publier un paquet |
| Enseignante stagiaire | Son propre appareil | Jours de décharge | Distribuer un paquet existant, sans rien configurer |
| Parent | Smartphone | Accompagnement ponctuel | Comprendre l'outil en une page |

Un même iPad sert à plusieurs élèves. La progression est rangée par avatar, sur l'appareil. Si un élève change d'iPad, sa progression ne le suit pas. Choix assumé : aucune synchronisation, donc aucune collecte.

## 5. Fonctionnalités V1 : Mode Classe

Deux outils : un atelier enseignant pour fabriquer les paquets, un lecteur élève pour s'entraîner.

### 5.1 Atelier enseignant

- L'enseignant colle le texte de sa leçon dans Claude (chat), avec un prompt fourni par le projet. Claude renvoie un paquet au format JSON (section 10).
- L'atelier importe ce JSON, l'affiche question par question et permet de corriger, supprimer, réordonner, ajouter.
- Validation obligatoire : un paquet ne peut pas être publié tant que chaque élément n'est pas coché « relu ».
- Export : un fichier .json à déposer dans le dossier `paquets/` du site, puis génération d'un lien court et d'un QR code imprimable.
- Métadonnées : discipline, titre, période (P1 à P10), niveau (accompagné, standard, approfondi).

### 5.2 Lecteur élève

- Accueil : choix de l'avatar, puis liste des paquets disponibles, classés par discipline avec une icône et une couleur.
- Ouverture d'un paquet par lien, QR code (appareil photo natif) ou liste.
- Trois activités par paquet :
    - Fiche : 5 à 8 idées clés, courtes, avec mots importants en gras.
    - Cartes : recto (question, mot, date), verso (réponse). L'élève se note : « Je savais », « Presque », « Je ne savais pas ».
    - Quiz : QCM à 3 choix, vrai ou faux, texte à trous, remise en ordre. Correction immédiate avec l'explication.
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
| Installation | Manifeste web + icônes, installable via « Sur l'écran d'accueil » |
| Hors ligne | Service worker : le site et les paquets déjà ouverts restent disponibles sans réseau |
| Stockage | IndexedDB. Recommander l'installation sur l'écran d'accueil (Safari peut effacer les données d'un site non installé) |
| Affichage | Portrait et paysage, du smartphone 6 pouces à l'iPad 13 pouces. Zones sûres respectées |
| Poids | Moins de 2 Mo hors polices et modèle OCR. Chargement en moins de 3 secondes en 4G |
| Hébergement | Statique, gratuit : GitHub Pages ou Netlify |
| Sauvegarde | Export et import manuel de la progression d'un avatar en fichier |

## 10. Format de données des paquets

Un paquet est un fichier JSON unique. L'app refuse tout fichier non conforme et dit pourquoi.

```json
{
  "version": 1,
  "id": "hist-p2-revolution",
  "titre": "La Révolution française",
  "discipline": "histoire",
  "periode": "P2",
  "niveau": "standard",
  "relu": true,
  "fiche": [
    "En **1789**, les députés réunis à Versailles forment l'Assemblée nationale."
  ],
  "cartes": [
    { "recto": "14 juillet 1789", "verso": "Prise de la Bastille" }
  ],
  "quiz": [
    {
      "type": "qcm",
      "question": "Quel roi règne en 1789 ?",
      "choix": ["Louis XIV", "Louis XVI", "Napoléon"],
      "reponse": 1,
      "explication": "Louis XVI est roi de France de 1774 à 1792."
    }
  ]
}
```

Types de quiz acceptés : `qcm`, `vraifaux`, `trous`, `ordre`. Aucun champ ne contient de donnée d'élève. Le projet fournit aussi le prompt de génération à coller dans Claude avec la leçon (phrases courtes, vocabulaire de la leçon, pas de piège).

## 11. Écrans

| Écran | Contenu | Côté |
| --- | --- | --- |
| Choix de l'avatar | 12 avatars (animaux, couleurs), bouton « Nouvel avatar » | Élève |
| Mes paquets | Paquets par discipline, pastille « cartes à revoir » | Élève |
| Paquet | Trois gros boutons : Fiche, Cartes, Quiz | Élève |
| Fiche | Idées clés, bouton haut-parleur par ligne | Élève |
| Cartes | Carte à retourner, trois boutons d'autoévaluation | Élève |
| Quiz | Une question, correction immédiate, explication | Élève |
| Bilan | Réussites, cartes à revoir, plante de l'avatar | Élève |
| Réglages | Police, taille, voix, effacer mes données, confidentialité | Élève et adulte |
| Atelier | Import JSON, relecture élément par élément, export, QR code | Enseignant |

L'atelier est protégé par un code local à 4 chiffres. C'est un garde-fou, pas une sécurité.

Identité visuelle : tons sable, sobres, une couleur par discipline.

## 12. Hors périmètre

- Tableau de bord enseignant des résultats par élève.
- Synchronisation entre appareils, comptes, connexion ENT.
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
| 6 | Test en classe sur 2 semaines, corrections | Retours intégrés |
| 7 | V2 Mode Photo, si validée | OCR local et fonction relais sans journal |

## 14. Critères de recette

- [ ] Mode avion : un paquet déjà ouvert se relit, se révise, et la progression s'enregistre.
- [ ] Inspecteur réseau de Safari : aucune requête vers un autre domaine que celui du site.
- [ ] Aucun cookie, aucun traceur.
- [ ] « Effacer toutes mes données » vide l'IndexedDB.
- [ ] Un élève de CM2 lance une révision seul en moins de 30 secondes.
- [ ] Deux avatars sur le même iPad ont des progressions séparées.
- [ ] Un JSON mal formé est refusé avec un message clair.
- [ ] Un paquet non relu ne peut pas être exporté.
- [ ] Toutes les consignes sont lisibles par la synthèse vocale et par VoiceOver.
- [ ] Contraste AA vérifié sur tous les écrans.

## 15. Points à vérifier (hors code)

- [ ] Mode Photo : conditions de conservation des données de l'API Anthropic en vigueur.
- [ ] Mode Photo : avis du DPD de l'académie.
- [ ] Information de l'IEN et mention au conseil des maîtres.
- [ ] Conservation de l'IndexedDB sur iPadOS pour une PWA installée, à tester sur le parc réel.
- [ ] Licence de la police Luciole pour l'embarquement dans un site.
- [ ] Qualité de Tesseract.js sur une écriture de cahier CM2, avant le lot 7.
