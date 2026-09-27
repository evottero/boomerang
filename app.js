'use strict';

// Lecteur élève et atelier enseignant minimal.
// Écrans : #/ (avatar puis paquets), #/avatars, #/avatar/nouveau, #/paquets,
// #/paquet/ID, #/paquet/ID/fiche, #/paquet/ID/cartes, #/paquet/ID/quiz,
// #/reglages, #/confidentialite, #/p/ID (lien court), #/atelier… (caché, voir atelier.js).
// Aucun cookie, aucune requête hors du site.

(function () {
  const V = window.ValidationPaquet;
  const M = window.Moteur;
  const S = window.Stockage;
  const Q = window.Quiz;
  const VX = window.Voix;
  const SY = window.Synchro;
  const app = document.getElementById('app');
  const VERSION_APP = '0.7.0';

  const DISCIPLINES = {
    histoire: { nom: 'Histoire', icone: '🏰' },
    geographie: { nom: 'Géographie', icone: '🗺️' },
    sciences: { nom: 'Sciences', icone: '🔬' },
    grammaire: { nom: 'Grammaire', icone: '✏️' },
    conjugaison: { nom: 'Conjugaison', icone: '⏳' },
    vocabulaire: { nom: 'Vocabulaire', icone: '📖' },
    nombres: { nom: 'Nombres', icone: '🔢' },
    calcul: { nom: 'Calcul', icone: '➗' },
    grandeurs: { nom: 'Grandeurs et mesures', icone: '📏' },
    geometrie: { nom: 'Géométrie', icone: '📐' },
    emc: { nom: 'EMC', icone: '🤝' }
  };

  const NIVEAUX = { accompagne: 'Accompagné', 'accompagné': 'Accompagné', standard: 'Standard', approfondi: 'Approfondi' };

  // 44 avatars : 11 animaux (f = féminin, pour accorder la couleur) × 4 couleurs.
  const ANIMAUX = {
    renard: { nom: 'Renard', icone: '🦊' },
    panda: { nom: 'Panda', icone: '🐼' },
    grenouille: { nom: 'Grenouille', icone: '🐸', f: true },
    hibou: { nom: 'Hibou', icone: '🦉' },
    tortue: { nom: 'Tortue', icone: '🐢', f: true },
    dauphin: { nom: 'Dauphin', icone: '🐬' },
    lion: { nom: 'Lion', icone: '🦁' },
    lapin: { nom: 'Lapin', icone: '🐰' },
    herisson: { nom: 'Hérisson', icone: '🦔' },
    abeille: { nom: 'Abeille', icone: '🐝', f: true },
    chat: { nom: 'Chat', icone: '🐱' }
  };
  const COULEURS = {
    rouge: { m: 'rouge', f: 'rouge' },
    jaune: { m: 'jaune', f: 'jaune' },
    vert: { m: 'vert', f: 'verte' },
    bleu: { m: 'bleu', f: 'bleue' }
  };
  const NB_AVATARS = Object.keys(ANIMAUX).length * Object.keys(COULEURS).length;

  // Retirés de la liste le 27/09/2026 : les avatars déjà créés avec eux restent utilisables.
  const ANCIENS_ANIMAUX = {
    manchot: { nom: 'Manchot', icone: '🐧' },
    pieuvre: { nom: 'Pieuvre', icone: '🐙', f: true }
  };
  const ANCIENNES_COULEURS = {
    orange: { m: 'orange', f: 'orange' },
    violet: { m: 'violet', f: 'violette' }
  };

  function animalDe(a) {
    return ANIMAUX[a.animal] || ANCIENS_ANIMAUX[a.animal] || { nom: 'Avatar', icone: '🙂' };
  }

  const NOTES = {
    savais: { texte: 'Je savais', icone: '✓' },
    presque: { texte: 'Presque', icone: '≈' },
    pas: { texte: 'Je ne savais pas', icone: '✗' }
  };

  const installee =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  // ---------- État ----------

  let avatarCourant = null;     // avatar choisi pour cette ouverture de l'app
  let stockageOk = true;        // faux en navigation privée ou si IndexedDB est bloqué
  let decalageJours = 0;        // date de test, réglée dans l'atelier
  let apresAvatar = null;       // écran à rouvrir une fois l'avatar choisi
  let classeAppareil = null;    // code de la classe, saisi une fois par appareil (lot 5 bis)
  let sansClasse = false;       // l'appareil est utilisé sans synchronisation
  let codeCourant = null;       // code élève de l'avatar ouvert, gardé en mémoire seulement

  // Réglages d'affichage et de voix, propres à chaque avatar (iPad partagé).
  const REGLAGES_DEFAUT = { police: 'luciole', taille: 1, vitesse: 'normale', voix: null };

  function reglagesDe(avatar) {
    return Object.assign({}, REGLAGES_DEFAUT, avatar && avatar.reglages);
  }

  function appliquerReglages(r) {
    document.documentElement.dataset.police = r.police;
    document.documentElement.dataset.taille = String(r.taille);
    VX.regler(r);
  }

  function aujourdhui() {
    return M.jourLocal() + decalageJours;
  }

  function memoriserAvatar(avatar) {
    avatarCourant = avatar;
    appliquerReglages(reglagesDe(avatar));
    // sessionStorage : l'avatar est oublié à la fermeture de l'app (iPad partagé).
    try {
      if (avatar) sessionStorage.setItem('avatar', avatar.id);
      else sessionStorage.removeItem('avatar');
    } catch (e) { /* stockage de session indisponible : sans conséquence */ }
  }

  // ---------- Outils ----------

  function echapper(texte) {
    return String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // **mot** devient <strong>mot</strong> et *mot* devient <em>mot</em>, après échappement.
  function avecGras(texte) {
    return echapper(texte)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  function nomAvatar(a) {
    const animal = animalDe(a);
    const couleur = COULEURS[a.couleur] || ANCIENNES_COULEURS[a.couleur];
    return animal.nom + (couleur ? ' ' + couleur[animal.f ? 'f' : 'm'] : '');
  }

  function iconeAvatar(a) {
    return animalDe(a).icone;
  }

  function melanger(liste) {
    const l = liste.slice();
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = l[i]; l[i] = l[j]; l[j] = t;
    }
    return l;
  }

  function dateLisible(jour) {
    return new Date(jour * 86400000).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
    });
  }

  // Numéro de l'écran demandé : un chargement lent ne doit pas écraser un écran plus récent.
  let ecranCourant = 0;

  // Bouton haut-parleur. La lecture ne démarre que sur un appui (voir l'écouteur plus bas).
  const ICONE_HP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M3 9.5v5h4l5 4v-13l-5 4H3z" fill="currentColor"/>' +
    '<path d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function boutonLire(texte, libelle) {
    if (!VX.disponible()) return '';
    return '<button class="lire" type="button" data-lire="' + echapper(texte) + '" aria-label="' + libelle + '">' + ICONE_HP + '</button>';
  }

  // Ajoute un haut-parleur à chaque consigne, question, idée de fiche et correction.
  const A_LIRE = [
    ['.consigne', 'Écouter la consigne'],
    ['.question', 'Écouter la question'],
    ['.fiche li', 'Écouter cette idée'],
    ['.correction', 'Écouter la correction']
  ];

  // Texte affiché, un paragraphe = une phrase (sinon la voix colle les mots de deux paragraphes).
  function texteVisible(el) {
    return (el.innerText || el.textContent)
      .split(/\n+/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean)
      .map(function (l) { return /[.!?:;]$/.test(l) ? l : l + '.'; })
      .join(' ');
  }

  function ajouterLecture(racine) {
    if (!VX.disponible()) return;
    A_LIRE.forEach(function (paire) {
      racine.querySelectorAll(paire[0]).forEach(function (el) {
        if (el.classList.contains('a-lecture')) return;
        const texte = el.dataset.lire || texteVisible(el);
        if (!texte.trim()) return;
        el.classList.add('a-lecture');
        // Juste après la phrase lue : dans le dernier paragraphe quand il y en a plusieurs.
        const dernier = el.lastElementChild;
        const cible = dernier && /^(P|LI)$/.test(dernier.tagName) ? dernier : el;
        cible.insertAdjacentHTML('beforeend', ' ' + boutonLire(texte, paire[1]));
      });
    });
  }

  document.addEventListener('click', function (e) {
    const bouton = e.target.closest ? e.target.closest('.lire') : null;
    if (bouton) VX.lire(bouton.dataset.lire);
  });

  // options.large : page plus large (grille de « Mes paquets »).
  function afficher(html, titre, options) {
    app.classList.toggle('page-large', !!(options && options.large));
    app.innerHTML = html;
    ajouterLecture(app);
    document.title = titre ? titre + ' – Révision CM2' : 'Révision CM2';
    window.scrollTo(0, 0);
    // VoiceOver annonce le nouvel écran.
    const h1 = app.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
    brancherEntreeAtelier();
  }

  function lienRetour(href, texte) {
    return '<a class="retour" href="' + href + '"><span aria-hidden="true">←</span> ' + echapper(texte) + '</a>';
  }

  function etiquettes(p) {
    const d = DISCIPLINES[p.discipline];
    return '<p class="etiquettes">' +
      '<span class="etiquette discipline" data-discipline="' + p.discipline + '"><span aria-hidden="true">' + d.icone + '</span> ' + d.nom + '</span>' +
      '<span class="etiquette">Période ' + p.periode.slice(1) + '</span>' +
      '<span class="etiquette">' + NIVEAUX[p.niveau] + '</span>' +
      '</p>';
  }

  function piedDePage() {
    return '<p class="version">Version ' + VERSION_APP + '</p>';
  }

  // Entrée cachée de l'atelier : 5 touchers rapides sur le numéro de version.
  function brancherEntreeAtelier() {
    const pied = app.querySelector('.version');
    if (!pied) return;
    let touchers = 0;
    let minuteur = null;
    pied.addEventListener('click', function () {
      touchers++;
      clearTimeout(minuteur);
      minuteur = setTimeout(function () { touchers = 0; }, 2500);
      if (touchers >= 5) { touchers = 0; location.hash = '#/atelier'; }
    });
  }

  // ---------- Chargement des paquets ----------

  // ---------- Paquets de la classe (lot 5 ter) ----------
  // Sur un appareil avec classe, les élèves ne voient que les paquets publiés pour leur classe.
  // Ils sont gardés sur l'appareil : ceux déjà chargés restent disponibles hors ligne.

  function avecPaquetsClasse() {
    return SY.active() && stockageOk && !!classeAppareil;
  }

  function resultatPaquet(id, contenu) {
    const erreurs = V.validerPaquet(contenu, id);
    return erreurs.length ? { id: id, erreurs: erreurs } : { id: id, paquet: contenu };
  }

  function rafraichirPaquetsClasse() {
    const classe = classeAppareil;
    return SY.appeler('paquets', { classe: classe }).then(function (r) {
      if (r.statut === 200 && Array.isArray(r.corps.paquets)) {
        return S.remplacerPaquetsClasse(classe, r.corps.paquets).catch(function () {}).then(function () {
          return r.corps.paquets;
        });
      }
      return S.paquetsClasse(classe); // hors ligne : la réserve de l'appareil
    });
  }

  function chargerPaquet(id) {
    if (!V.ID_VALIDE.test(id)) {
      return Promise.resolve({ id: id, erreurs: ['Le nom du paquet dans le lien n\'est pas valide.'] });
    }
    if (!avecPaquetsClasse()) return chargerPaquetFichier(id);
    return S.lirePaquet(classeAppareil, id).then(function (p) {
      if (p) return resultatPaquet(id, p);
      return rafraichirPaquetsClasse()
        .then(function () { return S.lirePaquet(classeAppareil, id); })
        .then(function (p2) { return p2 ? resultatPaquet(id, p2) : chargerPaquetFichier(id); });
    }).catch(function () { return chargerPaquetFichier(id); });
  }

  // Paquet du dossier paquets/ du site (appareil sans classe, ou lien vers un fichier).
  function chargerPaquetFichier(id) {
    return fetch('paquets/' + id + '.json')
      .then(function (reponse) {
        if (reponse.status === 404) return { id: id, erreurs: ['Ce paquet n\'existe pas. Vérifie le lien.'] };
        if (!reponse.ok) return { id: id, erreurs: ['Le paquet n\'a pas pu être chargé (erreur ' + reponse.status + ').'] };
        return reponse.text().then(function (texte) {
          const r = V.validerTexte(texte, id);
          return r.ok ? { id: id, paquet: r.paquet } : { id: id, erreurs: r.erreurs };
        });
      })
      .catch(function () {
        return { id: id, horsLigne: true, erreurs: ['Ouvre ce paquet une première fois avec Internet.'] };
      });
  }

  function chargerListe() {
    if (avecPaquetsClasse()) {
      return rafraichirPaquetsClasse().then(function (liste) {
        return liste.map(function (p) { return resultatPaquet(p.id, p); });
      });
    }
    return chargerListeFichiers();
  }

  function chargerListeFichiers() {
    return fetch('paquets/index.json')
      .then(function (reponse) {
        if (!reponse.ok) throw new Error('liste');
        return reponse.json();
      })
      .then(function (liste) {
        if (!liste || !Array.isArray(liste.paquets)) throw new Error('liste');
        return Promise.all(liste.paquets.map(chargerPaquetFichier));
      });
  }

  function clesDuPaquet(p) {
    return p.cartes.map(M.cleCarte);
  }

  // ---------- Avatars ----------

  // Synchronisation active pour cet appareil ?
  function avecClasse() {
    return SY.active() && stockageOk && !!classeAppareil;
  }

  function ouvrirAvatar(a, code) {
    memoriserAvatar(a);
    codeCourant = code || null;
    synchroniser();
    const cible = apresAvatar || '#/paquets';
    apresAvatar = null;
    location.hash = cible;
  }

  // ---------- Synchronisation (IndexedDB reste la référence) ----------

  let synchroEnCours = false;

  function synchroniser() {
    const a = avatarCourant;
    if (!SY.active() || !a || !a.classe || !codeCourant || synchroEnCours) return Promise.resolve();
    synchroEnCours = true;
    return S.cartesAvatar(a.id).then(function (locales) {
      const envoi = locales.map(function (c) {
        return { paquet: c.paquet, cle: c.cle, boite: c.boite, echeance: c.echeance, vues: c.vues, derniere: c.derniere };
      });
      const seances = a.seances || 0;
      return SY.appeler('synchroniser', { classe: a.classe, avatar: a.id, code: codeCourant, seances: seances, cartes: envoi }).then(function (r) {
        if (r.statut === 200 && Array.isArray(r.corps.cartes)) {
          return S.enregistrerCartes(a.id, SY.aMettreAJour(locales, r.corps.cartes)).then(function () {
            // Plante : le plus grand nombre de séances l'emporte.
            if (Number.isInteger(r.corps.seances) && r.corps.seances > seances) {
              a.seances = r.corps.seances;
              return S.enregistrerAvatar(a);
            }
          });
        }
        if ((r.statut === 409 && r.corps.erreur === 'nouveauCode') || r.statut === 401) {
          // Code remis à zéro, ou changé sur un autre appareil : cet appareil oublie son code périmé.
          // À la prochaine ouverture, le code sera vérifié par le serveur (ou un nouveau sera demandé).
          a.empreinteLocale = null;
          codeCourant = null;
          return S.enregistrerAvatar(a);
        }
      });
    }).catch(function () {}).then(function () { synchroEnCours = false; });
  }

  window.addEventListener('online', function () { synchroniser(); });

  // ---------- Code de la classe ----------

  function ecranClasse() {
    afficher(
      '<h1>Code de la classe</h1>' +
      '<p class="consigne">Tape le code de la classe donné par ton enseignant.</p>' +
      '<input id="code-classe" class="code-classe" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Code de la classe">' +
      '<p class="message" id="message" role="alert"></p>' +
      '<button class="bouton" type="button" id="valider">Valider</button>' +
      '<p><a class="lien" href="#/reglages"><span aria-hidden="true">⚙️</span> Réglages</a></p>' +
      piedDePage(),
      'Code de la classe'
    );
    const champ = document.getElementById('code-classe');
    const message = document.getElementById('message');
    function valider() {
      const code = SY.normaliserClasse(champ.value);
      if (!SY.classeValide(code)) { message.textContent = 'Le code a 6 lettres ou chiffres.'; return; }
      message.textContent = 'Vérification…';
      SY.appeler('classe', { classe: code }).then(function (r) {
        if (r.statut === 200) {
          classeAppareil = code;
          sansClasse = false;
          S.ecrireReglage('classe', code).then(function () { return S.ecrireReglage('sansClasse', false); })
            .then(function () { location.hash = '#/avatars'; router(); });
        } else if (r.statut === 0) {
          message.textContent = 'Connecte-toi à Internet, puis réessaie.';
        } else if (r.statut === 404) {
          message.textContent = 'Ce code n\'existe pas. Vérifie-le avec ton enseignant.';
        } else {
          message.textContent = 'Le code a 6 lettres ou chiffres.';
        }
      });
    }
    document.getElementById('valider').addEventListener('click', valider);
    champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') valider(); });
  }

  // Bloc « Classe » des Réglages : utiliser l'appareil sans classe, ou entrer un code.
  function blocAppareil() {
    if (!SY.active() || !stockageOk) return '';
    let html = '<section class="bloc" id="bloc-appareil"><h2>Classe</h2>';
    if (classeAppareil) {
      html += '<p>Code de la classe : <strong class="code-affiche">' + classeAppareil + '</strong></p>' +
        '<p class="info">Sans code de classe, ta progression ne te suivra pas sur les autres appareils.</p>' +
        '<button class="bouton secondaire" type="button" id="sans-classe">Utiliser sans classe</button>';
    } else {
      html += '<p class="info">' + (sansClasse
        ? 'Cet appareil est utilisé sans classe. Sans code de classe, ta progression ne te suivra pas sur les autres appareils.'
        : 'Aucun code de classe sur cet appareil.') + '</p>' +
        '<button class="bouton secondaire" type="button" id="entrer-classe">Entrer un code de classe</button>';
    }
    return html + '</section>';
  }

  function brancherAppareil(reafficher) {
    const sans = document.getElementById('sans-classe');
    if (sans) {
      sans.addEventListener('click', function () {
        classeAppareil = null;
        sansClasse = true;
        S.ecrireReglage('classe', null)
          .then(function () { return S.ecrireReglage('sansClasse', true); })
          .then(reafficher);
      });
    }
    const entrer = document.getElementById('entrer-classe');
    if (entrer) {
      entrer.addEventListener('click', function () {
        sansClasse = false;
        S.ecrireReglage('sansClasse', false).then(function () {
          location.hash = '#/avatars';
          router();
        });
      });
    }
  }

  // ---------- Avatars ----------

  function ecranAvatars(encoreActuel) {
    if (!stockageOk) {
      afficher(
        '<h1>Qui es-tu ?</h1>' +
        '<p class="info">Cet appareil ne peut pas garder ta progression.</p>' +
        '<p class="consigne">Lis les fiches sans avatar.</p>' +
        '<a class="bouton" href="#/paquets">Voir les paquets</a>' +
        piedDePage(),
        'Qui es-tu ?'
      );
      return;
    }
    if (SY.active() && !classeAppareil && !sansClasse) { ecranClasse(); return; }
    S.listerAvatars().then(function (avatars) {
      if (!encoreActuel()) return;
      let html = '<h1>Qui es-tu ?</h1>';
      if (avatars.length === 0) {
        html += '<p class="consigne">Crée ton avatar pour commencer.</p>';
      } else {
        html += '<p class="consigne">Touche ton avatar.</p><ul class="avatars">';
        avatars.forEach(function (a) {
          html += '<li><button class="avatar" type="button" data-couleur="' + a.couleur + '" data-id="' + a.id + '">' +
            '<span class="avatar-icone" aria-hidden="true">' + iconeAvatar(a) + '</span>' +
            '<span class="avatar-nom">' + nomAvatar(a) + '</span></button></li>';
        });
        html += '</ul>';
      }
      const libres = NB_AVATARS - avatars.filter(function (a) {
        return ANIMAUX[a.animal] && COULEURS[a.couleur];
      }).length;
      html += (libres > 0
        ? '<a class="bouton" href="#/avatar/nouveau"><span aria-hidden="true">＋</span> Nouvel avatar</a>'
        : '<p class="info">Les ' + NB_AVATARS + ' avatars sont déjà pris sur cet appareil.</p>') +
        piedDePage();
      afficher(html, 'Qui es-tu ?');

      app.querySelectorAll('.avatar').forEach(function (bouton) {
        bouton.addEventListener('click', function () {
          const a = avatars.find(function (x) { return x.id === bouton.dataset.id; });
          // Avatar de classe : code secret à chaque ouverture. Avatar local : ouverture directe.
          if (a.classe && SY.active()) ecranCode(a, 'ouvrir');
          else ouvrirAvatar(a, null);
        });
      });
    }).catch(function () {
      stockageOk = false;
      if (encoreActuel()) ecranAvatars(encoreActuel);
    });
  }

  function ecranNouvelAvatar(encoreActuel) {
    if (SY.active() && stockageOk && !classeAppareil && !sansClasse) { ecranClasse(); return; }
    const classe = avecClasse() ? classeAppareil : null;
    Promise.all([
      S.listerAvatars(),
      classe ? SY.appeler('classe', { classe: classe }) : Promise.resolve(null)
    ]).then(function (r) {
      if (!encoreActuel()) return;
      const avatars = r[0];
      const reponse = r[1];
      if (reponse && reponse.statut !== 200) {
        const hors = reponse.statut === 0;
        afficher(
          lienRetour('#/avatars', 'Retour') + '<h1>Nouvel avatar</h1>' +
          '<p class="consigne">' + (hors
            ? 'Connecte-toi à Internet pour créer ton avatar.'
            : 'Montre cet écran à ton enseignant.') + '</p>' +
          (hors ? '' : '<p class="info">Le code de la classe n\'existe plus sur le serveur.</p>'),
          'Nouvel avatar'
        );
        return;
      }
      const pris = {};
      avatars.forEach(function (a) { pris[a.id] = true; });
      const prisClasse = {};
      if (reponse) reponse.corps.avatars.forEach(function (id) { prisClasse[id] = true; });
      const nbCouleurs = Object.keys(COULEURS).length;

      function choixAnimal() {
        let html = lienRetour('#/avatars', 'Retour') +
          '<h1>Nouvel avatar</h1><p class="consigne">Choisis un animal.</p><ul class="avatars">';
        Object.keys(ANIMAUX).forEach(function (cle) {
          const prises = Object.keys(COULEURS).filter(function (c) { return pris[cle + '-' + c]; }).length;
          const complet = prises === nbCouleurs;
          html += '<li><button class="avatar" type="button" data-animal="' + cle + '"' + (complet ? ' disabled' : '') + '>' +
            '<span class="avatar-icone" aria-hidden="true">' + ANIMAUX[cle].icone + '</span>' +
            '<span class="avatar-nom">' + ANIMAUX[cle].nom + (complet ? ' <small>(complet)</small>' : '') + '</span></button></li>';
        });
        html += '</ul>';
        afficher(html, 'Nouvel avatar');
        app.querySelectorAll('[data-animal]').forEach(function (b) {
          b.addEventListener('click', function () { choixCouleur(b.dataset.animal); });
        });
      }

      function choixCouleur(animal) {
        let html = '<button class="retour" type="button" id="changer-animal"><span aria-hidden="true">←</span> Changer d\'animal</button>' +
          '<h1>Nouvel avatar</h1><p class="consigne">Choisis une couleur.</p><ul class="avatars">';
        Object.keys(COULEURS).forEach(function (couleur) {
          const id = animal + '-' + couleur;
          const a = { animal: animal, couleur: couleur };
          const ici = pris[id];
          const ailleurs = !ici && prisClasse[id];
          html += '<li><button class="avatar" type="button" data-couleur="' + couleur + '"' + (ici ? ' disabled' : '') + '>' +
            '<span class="avatar-icone" aria-hidden="true">' + ANIMAUX[animal].icone + '</span>' +
            '<span class="avatar-nom">' + nomAvatar(a) +
            (ici ? ' <small>(déjà pris)</small>' : '') +
            (ailleurs ? ' <small>(déjà pris) C\'est le tien ?</small>' : '') +
            '</span></button></li>';
        });
        html += '</ul>';
        afficher(html, 'Nouvel avatar');
        document.getElementById('changer-animal').addEventListener('click', choixAnimal);
        app.querySelectorAll('[data-couleur]').forEach(function (b) {
          b.addEventListener('click', function () {
            const couleur = b.dataset.couleur;
            const avatar = { id: animal + '-' + couleur, animal: animal, couleur: couleur, cree: Date.now(), seances: 0 };
            if (classe) {
              avatar.classe = classe;
              ecranCode(avatar, prisClasse[avatar.id] ? 'retrouver' : 'creer');
              return;
            }
            S.ajouterAvatar(avatar).then(function () {
              S.demanderPersistance();
              ouvrirAvatar(avatar, null);
            }).catch(function () {
              // Pris entre-temps (autre fenêtre) : on recharge la liste.
              ecranNouvelAvatar(encoreActuel);
            });
          });
        });
      }

      choixAnimal();
    }).catch(function () {
      stockageOk = false;
      if (encoreActuel()) ecranAvatars(encoreActuel);
    });
  }

  // ---------- Code élève : clavier à gros chiffres ----------
  // modes : 'ouvrir' (avatar de l'appareil), 'retrouver' (avatar créé sur un autre appareil),
  //         'creer' (nouvel avatar), 'nouveau' (code remis à zéro par l'enseignant).

  const ESSAIS_MAX = 5;
  const BLOCAGE_MS = 60 * 60 * 1000;

  function minutesRestantes(jusqua) {
    return Math.max(1, Math.ceil((jusqua - Date.now()) / 60000));
  }

  function ecranCode(a, mode) {
    const numero = ecranCourant; // l'écran reste valable tant qu'on ne change pas de page
    let saisie = '';
    let premier = null;         // création : premier code tapé
    let occupe = false;

    function consigne() {
      if (mode === 'creer' || mode === 'nouveau') {
        return premier === null ? 'Choisis un code secret de 4 chiffres.' : 'Tape encore ton code secret.';
      }
      return 'Tape ton code secret.';
    }

    function dessiner(message) {
      let clavier = '';
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (ch) {
        clavier += '<button class="touche" type="button" data-chiffre="' + ch + '">' + ch + '</button>';
      });
      clavier += '<button class="touche touche-effacer" type="button" data-effacer aria-label="Effacer le dernier chiffre">⌫</button>' +
        '<button class="touche" type="button" data-chiffre="0">0</button>';
      afficher(
        '<button class="retour" type="button" id="retour-code"><span aria-hidden="true">←</span> Retour</button>' +
        '<h1><span aria-hidden="true">' + iconeAvatar(a) + '</span> ' + nomAvatar(a) + '</h1>' +
        (mode === 'nouveau' ? '<p class="info">Ton code a été remis à zéro. Choisis-en un nouveau.</p>' : '') +
        '<p class="consigne">' + consigne() + '</p>' +
        '<div class="points" id="points" aria-live="polite"></div>' +
        '<p class="message" id="message" role="alert">' + (message || '') + '</p>' +
        '<div class="clavier">' + clavier + '</div>' +
        (mode === 'ouvrir' || mode === 'retrouver' ? '<p class="note-discrete">Code oublié ? Demande à ton enseignant.</p>' : ''),
        nomAvatar(a)
      );
      majPoints();
      document.getElementById('retour-code').addEventListener('click', function () {
        location.hash = '#/avatars';
        router();
      });
      app.querySelectorAll('[data-chiffre]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (occupe || saisie.length >= 4) return;
          saisie += b.dataset.chiffre;
          majPoints();
          if (saisie.length === 4) traiter(saisie);
        });
      });
      app.querySelector('[data-effacer]').addEventListener('click', function () {
        if (occupe) return;
        saisie = saisie.slice(0, -1);
        majPoints();
      });
    }

    function majPoints() {
      const points = document.getElementById('points');
      if (!points) return;
      let html = '';
      for (let i = 0; i < 4; i++) html += '<span class="point' + (i < saisie.length ? ' plein' : '') + '" aria-hidden="true"></span>';
      points.innerHTML = html + '<span class="sr">' + saisie.length + ' chiffre' + (saisie.length > 1 ? 's' : '') + ' sur 4</span>';
    }

    function message(texte) {
      const m = document.getElementById('message');
      if (m) m.textContent = texte;
    }

    function recommencer(texte) {
      saisie = '';
      occupe = false;
      if (numero === ecranCourant) dessiner(texte);
    }

    function bloquer(clavierActif) {
      app.querySelectorAll('.touche').forEach(function (b) { b.disabled = !clavierActif; });
    }

    function enregistrerLocal(code) {
      const sel = SY.selLocal();
      return SY.empreinteLocale(code, sel).then(function (e) {
        a.sel = sel;
        a.empreinteLocale = e;
        a.essaisFaux = 0;
        a.bloqueJusqua = null;
        return S.enregistrerAvatar(a);
      });
    }

    function erreurServeur(r) {
      if (r.statut === 0) return 'Connecte-toi à Internet, puis réessaie.';
      if (r.statut === 401) return 'Code faux. Il te reste ' + r.corps.restants + ' essai' + (r.corps.restants > 1 ? 's' : '') + '.';
      if (r.statut === 423) return 'Trop d\'essais. Réessaie dans ' + minutesRestantes(Date.parse(r.corps.jusqua)) + ' minutes, ou demande à ton enseignant.';
      if (r.statut === 404) return 'Cet avatar n\'existe plus dans la classe. Demande à ton enseignant.';
      return 'Un problème est survenu. Réessaie.';
    }

    function traiter(code) {
      occupe = true;

      if (mode === 'creer' || mode === 'nouveau') {
        if (premier === null) {
          const probleme = SY.problemeCode(code);
          if (probleme) { recommencer(probleme); return; }
          premier = code;
          recommencer('');
          return;
        }
        if (code !== premier) { premier = null; recommencer('Les deux codes sont différents. Recommence.'); return; }
        message('Enregistrement…');
        SY.appeler(mode === 'creer' ? 'creer' : 'definir-code', { classe: a.classe, avatar: a.id, code: code }).then(function (r) {
          if (r.statut === 200) {
            // Crée ou met à jour l'avatar sur l'appareil, avec l'empreinte locale du code.
            return enregistrerLocal(code).then(function () {
              S.demanderPersistance();
              ouvrirAvatar(a, code);
            });
          }
          premier = null;
          if (r.statut === 409 && r.corps.erreur === 'pris') {
            recommencer('Cet avatar vient d\'être pris. Touche Retour et choisis-en un autre.');
          } else {
            recommencer(erreurServeur(r));
          }
        });
        return;
      }

      if (mode === 'retrouver' || !a.empreinteLocale) {
        // Vérification par le serveur (avatar venu d'un autre appareil, ou code remis à zéro).
        message('Vérification…');
        SY.appeler('verifier', { classe: a.classe, avatar: a.id, code: code }).then(function (r) {
          if (r.statut === 200) {
            enregistrerLocal(code).then(function () { ouvrirAvatar(a, code); });
            return;
          }
          if (r.statut === 409 && r.corps.erreur === 'nouveauCode') {
            mode = 'nouveau';
            premier = null;
            recommencer('');
            return;
          }
          recommencer(erreurServeur(r));
          if (r.statut === 423) bloquer(false);
        });
        return;
      }

      // Avatar de l'appareil : vérification locale, hors ligne possible.
      SY.empreinteLocale(code, a.sel).then(function (e) {
        if (e === a.empreinteLocale) {
          a.essaisFaux = 0;
          a.bloqueJusqua = null;
          S.enregistrerAvatar(a).catch(function () {}).then(function () { ouvrirAvatar(a, code); });
          return;
        }
        a.essaisFaux = (a.essaisFaux || 0) + 1;
        let texte;
        if (a.essaisFaux >= ESSAIS_MAX) {
          a.essaisFaux = 0;
          a.bloqueJusqua = Date.now() + BLOCAGE_MS;
          texte = 'Trop d\'essais. Réessaie dans 60 minutes, ou demande à ton enseignant.';
        } else {
          const restants = ESSAIS_MAX - a.essaisFaux;
          texte = 'Code faux. Il te reste ' + restants + ' essai' + (restants > 1 ? 's' : '') + '.';
        }
        S.enregistrerAvatar(a).catch(function () {}).then(function () {
          recommencer(texte);
          if (a.bloqueJusqua) bloquer(false);
        });
      });
    }

    // Blocage local en cours ?
    if (mode === 'ouvrir' && a.bloqueJusqua && a.bloqueJusqua > Date.now()) {
      dessiner('Trop d\'essais. Réessaie dans ' + minutesRestantes(a.bloqueJusqua) + ' minutes, ou demande à ton enseignant.');
      bloquer(false);
      return;
    }
    dessiner('');
    // En ligne : l'enseignant a-t-il remis le code à zéro ? Le serveur a-t-il bloqué l'avatar ?
    if (mode === 'ouvrir') {
      SY.appeler('etat', { classe: a.classe, avatar: a.id }).then(function (r) {
        if (numero !== ecranCourant || r.statut !== 200) return;
        if (r.corps.sansCode) { mode = 'nouveau'; premier = null; recommencer(''); }
      });
    }
  }

  // ---------- Mes paquets ----------

  function enteteAvatar() {
    if (avatarCourant) {
      return '<div class="entete-avatar" data-couleur="' + avatarCourant.couleur + '">' +
        '<span class="avatar-icone" aria-hidden="true">' + iconeAvatar(avatarCourant) + '</span>' +
        '<span class="avatar-nom">' + nomAvatar(avatarCourant) + '</span>' +
        '<a href="#/avatars" aria-label="Changer d\'avatar">Changer</a>' +
        '<a href="#/reglages"><span aria-hidden="true">⚙️</span> Réglages</a></div>';
    }
    if (stockageOk) return '<p><a class="lien" href="#/avatars">Choisir mon avatar</a></p>';
    return '';
  }

  function ecranAccueil(encoreActuel) {
    afficher('<h1>Mes paquets</h1><p class="chargement">Chargement…</p>', 'Mes paquets', { large: true });

    chargerListe()
      .then(function (resultats) {
        const valides = resultats.filter(function (r) { return r.paquet; });
        // Cartes à revoir par paquet, pour l'avatar choisi.
        const aRevoir = {};
        if (!avatarCourant) return { resultats: resultats, valides: valides, aRevoir: aRevoir };
        const jour = aujourdhui();
        return Promise.all(valides.map(function (r) {
          return S.etatsCartes(avatarCourant.id, r.id).then(function (etats) {
            aRevoir[r.id] = M.compterEnRetard(clesDuPaquet(r.paquet), etats, jour);
          }).catch(function () {});
        })).then(function () {
          return { resultats: resultats, valides: valides, aRevoir: aRevoir };
        });
      })
      .then(function (d) {
        if (!encoreActuel()) return;
        const invalides = d.resultats.filter(function (r) { return !r.paquet && !r.horsLigne; });
        let html = '<h1>Mes paquets</h1>' + enteteAvatar();

        if (!installee) {
          html += '<p class="bandeau">Installe l\'app : touche <strong>Partager</strong>, puis <strong>Sur l\'écran d\'accueil</strong>.</p>';
        }

        if (d.valides.length === 0) {
          html += '<p class="info">Aucun paquet disponible pour l\'instant.</p>';
        } else {
          html += '<p class="consigne">Choisis un paquet.</p>';
          // Une seule grille, classée par discipline : chaque carte porte l'icône et le nom de sa discipline.
          const ordre = Object.keys(DISCIPLINES);
          const tries = d.valides.slice().sort(function (a, b) {
            return ordre.indexOf(a.paquet.discipline) - ordre.indexOf(b.paquet.discipline) ||
              a.paquet.periode.slice(1) - b.paquet.periode.slice(1);
          });
          html += '<ul class="liste-paquets">';
          tries.forEach(function (r) {
            const cle = r.paquet.discipline;
            const disc = DISCIPLINES[cle];
            const n = d.aRevoir[r.id] || 0;
            html += '<li><a class="carte-paquet" data-discipline="' + cle + '" href="#/paquet/' + r.id + '">' +
              '<span class="carte-discipline"><span aria-hidden="true">' + disc.icone + '</span> ' + disc.nom + '</span>' +
              '<span class="carte-titre">' + echapper(r.paquet.titre) + '</span>' +
              '<span class="carte-infos">Période ' + r.paquet.periode.slice(1) + ' · ' + NIVEAUX[r.paquet.niveau] + '</span>' +
              (n > 0 ? '<span class="pastille">' + n + (n > 1 ? ' cartes' : ' carte') + ' à revoir</span>' : '') +
              '</a></li>';
          });
          html += '</ul>';
        }

        // Signalé discrètement pour l'enseignant.
        invalides.forEach(function (r) {
          html += '<p class="alerte-discrete"><a href="#/paquet/' + echapper(r.id) + '">Paquet illisible : ' + echapper(r.id) + '</a></p>';
        });

        html += piedDePage();
        afficher(html, 'Mes paquets', { large: true });
      })
      .catch(function () {
        if (!encoreActuel()) return;
        afficher(
          '<h1>Mes paquets</h1>' + enteteAvatar() +
          '<p class="consigne">Connecte-toi à Internet une première fois pour voir les paquets.</p>' +
          piedDePage(),
          'Mes paquets',
          { large: true }
        );
      });
  }

  // ---------- Paquet et fiche ----------

  function ecranPaquet(id, encoreActuel) {
    afficher('<p class="chargement">Chargement…</p>');
    chargerPaquet(id).then(function (r) {
      if (!encoreActuel()) return;
      if (!r.paquet) { ecranErreur(r); return; }
      const p = r.paquet;
      afficher(
        lienRetour('#/paquets', 'Mes paquets') +
        '<h1>' + echapper(p.titre) + '</h1>' +
        etiquettes(p) +
        '<p class="consigne">Choisis une activité.</p>' +
        '<div class="activites">' +
        '<a class="activite" href="#/paquet/' + p.id + '/fiche"><span aria-hidden="true">📄</span> Fiche</a>' +
        '<a class="activite" href="#/paquet/' + p.id + '/cartes"><span aria-hidden="true">🃏</span> Cartes</a>' +
        '<a class="activite" href="#/paquet/' + p.id + '/quiz"><span aria-hidden="true">❓</span> Quiz</a>' +
        '</div>',
        p.titre
      );
    });
  }

  function ecranFiche(id, encoreActuel) {
    afficher('<p class="chargement">Chargement…</p>');
    chargerPaquet(id).then(function (r) {
      if (!encoreActuel()) return;
      if (!r.paquet) { ecranErreur(r); return; }
      const p = r.paquet;
      let html = lienRetour('#/paquet/' + p.id, p.titre) +
        '<h1>Fiche : ' + echapper(p.titre) + '</h1>' +
        '<p class="consigne">Lis chaque idée, puis redis-la sans regarder.</p>' +
        '<ol class="fiche">';
      p.fiche.forEach(function (idee) {
        html += '<li>' + avecGras(idee) + '</li>';
      });
      html += '</ol>' +
        '<a class="bouton" href="#/paquet/' + p.id + '">J\'ai fini</a>';
      afficher(html, 'Fiche : ' + p.titre);
    });
  }

  function ecranErreur(r) {
    let html = lienRetour('#/paquets', 'Mes paquets') +
      '<h1>Ce paquet ne peut pas s\'ouvrir</h1>';
    if (r.horsLigne) {
      html += '<p class="consigne">' + echapper(r.erreurs[0]) + '</p>';
    } else {
      html += '<p class="consigne">Montre cet écran à ton enseignant.</p>' +
        '<div class="erreurs"><p>Fichier : <code>paquets/' + echapper(r.id) + '.json</code></p><ul>';
      r.erreurs.forEach(function (e) { html += '<li>' + echapper(e) + '</li>'; });
      html += '</ul></div>';
    }
    afficher(html, 'Paquet illisible');
  }

  // ---------- Cartes ----------

  function ecranCartes(id, encoreActuel) {
    if (!avatarCourant) {
      if (!stockageOk) { ecranAvatars(encoreActuel); return; }
      apresAvatar = '#/paquet/' + id + '/cartes';
      location.hash = '#/avatars';
      return;
    }
    afficher('<p class="chargement">Chargement…</p>');
    const avatar = avatarCourant;
    chargerPaquet(id).then(function (r) {
      if (!encoreActuel()) return;
      if (!r.paquet) { ecranErreur(r); return; }
      return S.etatsCartes(avatar.id, id).then(function (etats) {
        if (!encoreActuel()) return;
        const p = r.paquet;
        const cles = clesDuPaquet(p);
        const seance = M.composerSeance(cles, etats, aujourdhui());
        if (seance.length === 0) {
          afficher(
            lienRetour('#/paquet/' + p.id, p.titre) +
            '<h1>Cartes : ' + echapper(p.titre) + '</h1>' +
            '<p class="consigne">Reviens demain : rien à revoir aujourd\'hui.</p>' +
            '<button class="bouton" type="button" id="quand-meme">Revoir quand même</button>',
            'Cartes : ' + p.titre
          );
          document.getElementById('quand-meme').addEventListener('click', function () {
            lancerSeance(p, avatar, etats, M.composerSeanceAnticipee(cles, etats), encoreActuel);
          });
          return;
        }
        lancerSeance(p, avatar, etats, seance, encoreActuel);
      });
    }).catch(function () {
      if (!encoreActuel()) return;
      afficher(lienRetour('#/paquets', 'Mes paquets') +
        '<h1>Cartes</h1><p class="info">Ta progression n\'a pas pu être lue sur cet appareil.</p>');
    });
  }

  function lancerSeance(p, avatar, etats, seance, encoreActuel) {
    const cartes = {};
    p.cartes.forEach(function (c) { cartes[M.cleCarte(c)] = c; });

    const file = melanger(seance);
    const remises = {};       // cartes déjà remises en fin de séance (une seule fois)
    const premiereNote = {};  // pour le bilan : réussites du premier coup
    const derniereNote = {};  // pour le bilan : cartes à revoir
    let position = 0;

    afficher(
      lienRetour('#/paquet/' + p.id, p.titre) +
      '<h1>Cartes : ' + echapper(p.titre) + '</h1>' +
      '<p class="progression" id="progression"></p>' +
      '<div id="zone-carte"></div>',
      'Cartes : ' + p.titre
    );
    const zone = document.getElementById('zone-carte');
    const progression = document.getElementById('progression');

    function recto() {
      const carte = cartes[file[position]];
      progression.textContent = 'Carte ' + (position + 1) + ' sur ' + file.length;
      zone.innerHTML =
        '<p class="consigne">Trouve la réponse dans ta tête, puis touche la carte.</p>' +
        '<button class="carte" type="button" id="carte">' +
        '<span class="carte-texte">' + avecGras(carte.recto) + '</span>' +
        '<span class="carte-indice">Touche pour retourner</span></button>' +
        '<div class="lire-carte">' + boutonLire(carte.recto, 'Écouter la carte') + '</div>';
      ajouterLecture(zone);
      const bouton = document.getElementById('carte');
      if (position > 0) bouton.focus();
      bouton.addEventListener('click', verso);
    }

    function verso() {
      const carte = cartes[file[position]];
      let html =
        '<div class="carte retournee">' +
        '<p class="carte-recto">' + avecGras(carte.recto) + '</p>' +
        '<p class="carte-texte" id="verso" tabindex="-1">' + avecGras(carte.verso) + ' ' +
        boutonLire(carte.verso, 'Écouter la réponse') + '</p></div>' +
        '<p class="consigne">Dis si tu savais la réponse.</p><div class="notes">';
      Object.keys(NOTES).forEach(function (n) {
        html += '<button class="note" type="button" data-note="' + n + '">' +
          '<span aria-hidden="true">' + NOTES[n].icone + '</span> ' + NOTES[n].texte + '</button>';
      });
      html += '</div>';
      zone.innerHTML = html;
      ajouterLecture(zone);
      document.getElementById('verso').focus();
      zone.querySelectorAll('.note').forEach(function (b) {
        b.addEventListener('click', function () { noter(b.dataset.note); });
      });
    }

    function noter(note) {
      zone.querySelectorAll('.note').forEach(function (b) { b.disabled = true; });
      const cle = file[position];
      const etat = M.noter(etats[cle] || null, note, aujourdhui());
      etats[cle] = etat;
      if (!(cle in premiereNote)) premiereNote[cle] = note;
      derniereNote[cle] = note;
      // Boîte 1 : la carte revient dans la même séance, une seule fois.
      if (etat.boite === 1 && !remises[cle]) { remises[cle] = true; file.push(cle); }

      // Enregistré à chaque carte : fermer l'app en cours de séance ne perd rien.
      S.enregistrerCarte(avatar.id, p.id, cle, etat).catch(function () {}).then(function () {
        if (!encoreActuel()) return;
        position++;
        if (position < file.length) recto();
        else bilan();
      });
    }

    function bilan() {
      finirSeance(avatar).then(function (seances) {
        if (encoreActuel()) afficherBilan(seances);
      });
    }

    function afficherBilan(seances) {
      const vues = Object.keys(premiereNote);
      const reussites = vues.filter(function (c) { return premiereNote[c] === 'savais'; }).length;
      const aRevoir = vues.filter(function (c) { return derniereNote[c] !== 'savais'; });
      let html = lienRetour('#/paquet/' + p.id, p.titre) +
        '<h1>Séance terminée</h1>' +
        '<p class="resultat">Tu savais <strong>' + reussites + '</strong> ' + (reussites > 1 ? 'cartes' : 'carte') +
        ' sur <strong>' + vues.length + '</strong> du premier coup.</p>';
      if (aRevoir.length) {
        html += '<h2>Cartes à revoir</h2><ul class="a-revoir">';
        aRevoir.forEach(function (c) { html += '<li>' + avecGras(cartes[c].recto) + '</li>'; });
        html += '</ul><p>Elles reviendront dans une prochaine séance.</p>';
      }
      html += blocPlante(seances) +
        '<a class="bouton" href="#/paquet/' + p.id + '">Revenir au paquet</a>';
      afficher(html, 'Séance terminée');
    }

    recto();
  }

  // ---------- Fin de séance et plante ----------

  // Compte la séance pour l'avatar. Renvoie le nombre de séances, ou null si l'enregistrement échoue.
  function finirSeance(avatar) {
    return S.compterSeance(avatar.id).then(function (n) {
      if (avatarCourant && avatarCourant.id === avatar.id) avatarCourant.seances = n;
      synchroniser();
      return n;
    }).catch(function () { return null; });
  }

  // Dessin de la plante selon l'étape (0 : graine, 5 : fleur).
  function svgPlante(etape) {
    const hauteurs = [0, 76, 64, 52, 44, 40];
    const paires = [0, 1, 2, 3, 3, 3];
    const haut = hauteurs[etape];
    let svg = '<svg class="plante-dessin" viewBox="0 0 120 140" aria-hidden="true" focusable="false">';
    if (etape === 0) {
      svg += '<ellipse cx="60" cy="90" rx="7" ry="4.5" fill="#8a6d3b"/>';
    } else {
      svg += '<rect x="58.5" y="' + haut + '" width="3" height="' + (95 - haut) + '" rx="1.5" fill="#3f6b3a"/>';
      for (let k = 0; k < paires[etape]; k++) {
        const y = haut + 8 + k * 14;
        svg += '<ellipse cx="48" cy="' + y + '" rx="11" ry="5" fill="#5f9150" transform="rotate(-25 48 ' + y + ')"/>' +
          '<ellipse cx="72" cy="' + (y + 5) + '" rx="11" ry="5" fill="#3f6b3a" transform="rotate(25 72 ' + (y + 5) + ')"/>';
      }
      if (etape === 4) {
        svg += '<ellipse cx="60" cy="' + (haut - 5) + '" rx="5" ry="7" fill="#b8567a"/>';
      }
      if (etape === 5) {
        const cy = haut - 7;
        for (let a = 0; a < 5; a++) {
          const ang = (a * 72 - 90) * Math.PI / 180;
          svg += '<circle cx="' + (60 + 8 * Math.cos(ang)).toFixed(1) + '" cy="' + (cy + 8 * Math.sin(ang)).toFixed(1) + '" r="6.5" fill="#e3a33b"/>';
        }
        svg += '<circle cx="60" cy="' + cy + '" r="5" fill="#8a4b1f"/>';
      }
    }
    svg += '<ellipse cx="60" cy="96" rx="25" ry="4" fill="#6b4a2f"/>' +
      '<polygon points="36,100 84,100 78,132 42,132" fill="#b07048"/>' +
      '<rect x="31" y="93" width="58" height="10" rx="2" fill="#965c3a"/>' +
      '</svg>';
    return svg;
  }

  function blocPlante(seances) {
    if (seances === null || seances === undefined) return '';
    const etape = M.etapePlante(seances);
    const avant = M.etapePlante(seances - 1);
    return '<section class="plante">' + svgPlante(etape.numero) +
      '<div><p class="plante-titre">' + (etape.numero > avant.numero ? 'Ta plante a grandi !' : 'Ta plante') + '</p>' +
      '<p>C\'est ' + etape.nom + '. ' + seances + (seances > 1 ? ' séances terminées.' : ' séance terminée.') + '</p></div>' +
      '</section>';
  }

  // ---------- Quiz ----------

  function ecranQuiz(id, encoreActuel) {
    if (!avatarCourant) {
      if (!stockageOk) { ecranAvatars(encoreActuel); return; }
      apresAvatar = '#/paquet/' + id + '/quiz';
      location.hash = '#/avatars';
      return;
    }
    afficher('<p class="chargement">Chargement…</p>');
    const avatar = avatarCourant;
    chargerPaquet(id).then(function (r) {
      if (!encoreActuel()) return;
      if (!r.paquet) { ecranErreur(r); return; }
      lancerQuiz(r.paquet, avatar, encoreActuel);
    });
  }

  function bonneReponse(q) {
    if (q.type === 'qcm') return q.choix[q.reponse];
    if (q.type === 'vraifaux') return q.reponse ? 'Vrai' : 'Faux';
    if (q.type === 'trous') return q.reponse;
    return q.elements.join(' → ');
  }

  function lancerQuiz(p, avatar, encoreActuel) {
    const d = Q.creerDeroule(p.quiz.length);

    afficher(
      lienRetour('#/paquet/' + p.id, p.titre) +
      '<h1>Quiz : ' + echapper(p.titre) + '</h1>' +
      '<p class="progression" id="progression"></p>' +
      '<div id="zone-quiz"></div>',
      'Quiz : ' + p.titre
    );
    const zone = document.getElementById('zone-quiz');
    const progression = document.getElementById('progression');

    function question() {
      const i = Q.questionCourante(d);
      const q = p.quiz[i];
      progression.textContent = 'Question ' + (d.position + 1) + ' sur ' + d.file.length;
      let html = (i in d.premier) ? '<p class="deuxieme-essai">Deuxième essai</p>' : '';

      if (q.type === 'qcm') {
        html += '<p class="consigne">Choisis la bonne réponse.</p>' +
          '<p class="question" data-lire="' + echapper(q.question + ' Choix : ' + q.choix.join(' ; ') + '.') + '">' +
          avecGras(q.question) + '</p><div class="reponses">';
        q.choix.forEach(function (c, k) {
          html += '<button class="reponse" type="button" data-valeur="' + k + '">' + avecGras(c) + '</button>';
        });
        html += '</div>';
      } else if (q.type === 'vraifaux') {
        html += '<p class="consigne">Dis si c\'est vrai ou faux.</p>' +
          '<p class="question">' + avecGras(q.question) + '</p><div class="reponses deux">' +
          '<button class="reponse" type="button" data-valeur="true">Vrai</button>' +
          '<button class="reponse" type="button" data-valeur="false">Faux</button></div>';
      } else if (q.type === 'trous') {
        const morceaux = q.texte.split('___');
        html += '<p class="consigne">Écris le mot qui manque.</p>' +
          '<p class="question" data-lire="' + echapper(q.texte) + '">' + avecGras(morceaux[0]) +
          '<input class="trou" id="trou" type="text" aria-label="Mot qui manque" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">' +
          avecGras(morceaux[1]) + '</p>' +
          '<button class="bouton" type="button" id="valider" disabled>Valider</button>';
      } else {
        html += '<p class="consigne">Touche les étiquettes dans le bon ordre.</p>' +
          '<p class="question">' + avecGras(q.question) + '</p>' +
          '<ol class="cases" id="cases"></ol>' +
          '<div class="etiquettes-ordre" id="etiquettes"></div>' +
          '<p class="note-discrete">Touche une case pour retirer son étiquette.</p>' +
          '<button class="bouton" type="button" id="valider" disabled>Valider</button>';
      }
      zone.innerHTML = html;

      if (q.type === 'qcm' || q.type === 'vraifaux') {
        zone.querySelectorAll('.reponse').forEach(function (b) {
          b.addEventListener('click', function () {
            const valeur = q.type === 'qcm' ? Number(b.dataset.valeur) : b.dataset.valeur === 'true';
            b.classList.add('choisie');
            valider(q, valeur);
          });
        });
      } else if (q.type === 'trous') {
        const champ = document.getElementById('trou');
        const bouton = document.getElementById('valider');
        champ.addEventListener('input', function () { bouton.disabled = champ.value.trim() === ''; });
        champ.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && champ.value.trim() !== '') { e.preventDefault(); valider(q, champ.value); }
        });
        bouton.addEventListener('click', function () { valider(q, champ.value); });
        champ.focus();
      } else {
        brancherOrdre(q);
      }
      ajouterLecture(zone);
    }

    // Remise en ordre : l'élève touche les étiquettes, elles se placent dans des cases numérotées.
    function brancherOrdre(q) {
      const melange = Q.melangerOrdre(q.elements);
      // La voix lit les étiquettes dans l'ordre mélangé, jamais dans le bon ordre.
      zone.querySelector('.question').dataset.lire = q.question + ' Étiquettes : ' + melange.join(' ; ') + '.';
      const places = []; // indices dans melange, dans l'ordre choisi
      const cases = document.getElementById('cases');
      const etiquettes = document.getElementById('etiquettes');
      const bouton = document.getElementById('valider');

      function dessiner() {
        let hc = '';
        for (let k = 0; k < melange.length; k++) {
          const m = places[k];
          if (m === undefined) {
            hc += '<li><button class="case vide" type="button" disabled aria-label="Case ' + (k + 1) + ', vide">' +
              '<span class="case-numero" aria-hidden="true">' + (k + 1) + '</span><span class="case-texte"></span></button></li>';
          } else {
            hc += '<li><button class="case" type="button" data-k="' + k + '" aria-label="Case ' + (k + 1) + ' : ' + echapper(melange[m]) + '. Touche pour retirer.">' +
              '<span class="case-numero" aria-hidden="true">' + (k + 1) + '</span><span class="case-texte">' + avecGras(melange[m]) + '</span></button></li>';
          }
        }
        cases.innerHTML = hc;
        let he = '';
        melange.forEach(function (e, m) {
          const placee = places.indexOf(m) !== -1;
          he += '<button class="etiquette-ordre' + (placee ? ' placee' : '') + '" type="button" data-m="' + m + '"' +
            (placee ? ' disabled aria-hidden="true"' : '') + '>' + avecGras(e) + '</button>';
        });
        etiquettes.innerHTML = he;
        bouton.disabled = places.length !== melange.length;

        cases.querySelectorAll('.case[data-k]').forEach(function (b) {
          b.addEventListener('click', function () { places.splice(Number(b.dataset.k), 1); dessiner(); });
        });
        etiquettes.querySelectorAll('.etiquette-ordre:not(.placee)').forEach(function (b) {
          b.addEventListener('click', function () { places.push(Number(b.dataset.m)); dessiner(); });
        });
      }

      bouton.addEventListener('click', function () {
        valider(q, places.map(function (m) { return melange[m]; }));
      });
      dessiner();
    }

    function valider(q, reponse) {
      // « accents » de la question, sinon celui du paquet (false par défaut).
      const res = Q.corriger('accents' in q ? q : Object.assign({}, q, { accents: p.accents === true }), reponse);
      const reviendra = Q.repondre(d, res.juste);

      // Plus de réponse possible : on montre la correction sur place.
      zone.querySelectorAll('button:not(.lire)').forEach(function (el) { el.disabled = true; });
      zone.querySelectorAll('input').forEach(function (el) { el.readOnly = true; el.blur(); });
      const boutonValider = document.getElementById('valider');
      if (boutonValider) boutonValider.remove();
      if (q.type === 'qcm' || q.type === 'vraifaux') {
        zone.querySelectorAll('.reponse').forEach(function (b) {
          const valeur = q.type === 'qcm' ? Number(b.dataset.valeur) : b.dataset.valeur === 'true';
          if (valeur === q.reponse) {
            b.classList.add('bonne');
            b.insertAdjacentHTML('afterbegin', '<span class="marque" aria-hidden="true">✓</span>');
          } else if (b.classList.contains('choisie')) {
            b.classList.add('fausse');
            b.insertAdjacentHTML('afterbegin', '<span class="marque" aria-hidden="true">✗</span>');
          }
        });
      } else if (q.type === 'trous') {
        document.getElementById('trou').classList.add(res.juste ? 'bonne' : 'fausse');
      } else {
        document.getElementById('cases').classList.add(res.juste ? 'bonne' : 'fausse');
      }

      let html = '<div class="correction ' + (res.juste ? 'juste' : 'faux') + '" id="correction" tabindex="-1">' +
        '<p class="verdict">' + (res.juste ? '✓ C\'est juste.' : '✗ Ce n\'est pas ça.') + '</p>';
      if (!res.juste) {
        if (q.type === 'ordre') {
          html += '<p>Le bon ordre :</p><ol class="bon-ordre">';
          q.elements.forEach(function (e) { html += '<li>' + avecGras(e) + '</li>'; });
          html += '</ol>';
        } else {
          html += '<p>La bonne réponse : <strong>' + avecGras(bonneReponse(q)) + '</strong></p>';
        }
      } else if (res.orthographe) {
        html += '<p>Attention à l\'orthographe : <strong>' + echapper(q.reponse) + '</strong></p>';
      }
      html += '<p class="explication">' + avecGras(q.explication) + '</p>';
      if (reviendra) html += '<p class="note-discrete">Cette question reviendra à la fin du quiz.</p>';
      html += '</div><button class="bouton" type="button" id="continuer">Continuer</button>';
      zone.insertAdjacentHTML('beforeend', html);
      ajouterLecture(zone);

      const correction = document.getElementById('correction');
      correction.focus();
      correction.scrollIntoView({ block: 'nearest' });
      document.getElementById('continuer').addEventListener('click', function () {
        if (Q.suivante(d)) question();
        else bilan();
      });
    }

    function bilan() {
      finirSeance(avatar).then(function (seances) {
        if (!encoreActuel()) return;
        const b = Q.bilan(d);
        let html = lienRetour('#/paquet/' + p.id, p.titre) +
          '<h1>Quiz terminé</h1>' +
          '<p class="resultat">Tu as réussi <strong>' + b.reussites + '</strong> ' + (b.reussites > 1 ? 'questions' : 'question') +
          ' sur <strong>' + b.total + '</strong> du premier coup.</p>';
        if (b.rattrapees) {
          html += '<p>Tu en as corrigé ' + b.rattrapees + ' à la fin.</p>';
        }
        if (b.aRevoir.length) {
          html += '<h2>Questions à revoir</h2><ul class="a-revoir">';
          b.aRevoir.forEach(function (i) {
            const q = p.quiz[i];
            html += '<li>' + avecGras(q.type === 'trous' ? q.texte : q.question) +
              '<br><span class="reponse-attendue">Réponse : ' + avecGras(bonneReponse(q)) + '</span></li>';
          });
          html += '</ul>';
        }
        html += blocPlante(seances) +
          '<a class="bouton" href="#/paquet/' + p.id + '">Revenir au paquet</a>';
        afficher(html, 'Quiz terminé');
      });
    }

    question();
  }

  // ---------- Réglages de l'avatar ----------

  const TAILLES = { 1: 'Normale', 2: 'Grande', 3: 'Très grande' };
  const REGIONS = { FR: 'France', CA: 'Canada', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg' };

  function ecranReglages(encoreActuel) {
    if (!avatarCourant) {
      if (!stockageOk) { ecranAvatars(encoreActuel); return; }
      // Sans avatar : réglages de l'appareil seulement (police, taille et voix sont propres à chaque avatar).
      afficher(
        lienRetour('#/avatars', 'Retour') +
        '<h1>Réglages</h1>' +
        '<p class="info">Choisis ton avatar pour régler la police, la taille du texte et la voix.</p>' +
        blocAppareil() +
        '<p><a class="lien" href="#/confidentialite">Confidentialité</a></p>',
        'Réglages'
      );
      brancherAppareil(function () { ecranReglages(encoreActuel); });
      return;
    }
    const avatar = avatarCourant;
    const r = reglagesDe(avatar);

    function option(reglage, valeur, contenu, classe) {
      return '<button class="option' + (classe ? ' ' + classe : '') + '" type="button" data-reglage="' + reglage +
        '" data-valeur="' + echapper(String(valeur)) + '" aria-pressed="' + (String(r[reglage]) === String(valeur)) + '">' +
        contenu + '</button>';
    }

    function blocVoix() {
      const voix = VX.voixFrancaises();
      if (voix.length === 0) {
        return '<p class="info">Aucune voix française n\'est installée sur cet appareil.</p>';
      }
      const choisie = VX.voixChoisie();
      let html = '<p class="consigne">Choisis une voix, puis touche Essayer.</p><div class="options">';
      // Voix de France d'abord.
      voix.slice().sort(function (a, b) {
        return (/^fr[-_]FR/i.test(b.lang) ? 1 : 0) - (/^fr[-_]FR/i.test(a.lang) ? 1 : 0);
      }).forEach(function (v) {
        const region = REGIONS[(v.lang.split(/[-_]/)[1] || '').toUpperCase()];
        html += '<button class="option" type="button" data-reglage="voix" data-valeur="' + echapper(v.voiceURI) +
          '" aria-pressed="' + (choisie && choisie.voiceURI === v.voiceURI) + '">' +
          echapper(v.name.replace(/\s*\(français.*\)\s*$/i, '')) +
          (region ? ' <small>(' + region + ')</small>' : '') + '</button>';
      });
      html += '</div><h3>Vitesse</h3><div class="options">' +
        option('vitesse', 'normale', 'Normale') + option('vitesse', 'lente', 'Lente') +
        '</div><button class="bouton secondaire" type="button" id="essayer">Essayer la voix</button>';
      return html;
    }

    afficher(
      lienRetour('#/paquets', 'Mes paquets') +
      '<h1>Réglages</h1>' +
      '<p class="info">Ces réglages sont ceux de ton avatar : <strong>' + nomAvatar(avatar) + '</strong>.</p>' +
      '<section class="bloc"><h2>Police</h2><p class="consigne">Choisis la police la plus facile à lire.</p><div class="options">' +
      option('police', 'luciole', '<span class="apercu-luciole">Luciole</span>') +
      option('police', 'lexend', '<span class="apercu-lexend">Lexend</span>') +
      '</div></section>' +
      '<section class="bloc"><h2>Taille du texte</h2><p class="consigne">Choisis la taille du texte.</p><div class="options">' +
      [1, 2, 3].map(function (t) { return option('taille', t, '<span class="apercu-taille-' + t + '">' + TAILLES[t] + '</span>'); }).join('') +
      '</div></section>' +
      '<section class="bloc" id="bloc-voix"><h2>Voix</h2>' + blocVoix() + '</section>' +
      blocAppareil() +
      '<p><a class="lien" href="#/confidentialite">Confidentialité</a></p>',
      'Réglages'
    );
    brancherAppareil(function () { ecranReglages(encoreActuel); });

    function brancher(racine) {
      racine.querySelectorAll('.option').forEach(function (b) {
        b.addEventListener('click', function () {
          const reglage = b.dataset.reglage;
          r[reglage] = reglage === 'taille' ? Number(b.dataset.valeur) : b.dataset.valeur;
          avatar.reglages = Object.assign({}, r);
          appliquerReglages(r);
          S.enregistrerAvatar(avatar).catch(function () {});
          app.querySelectorAll('.option[data-reglage="' + reglage + '"]').forEach(function (o) {
            o.setAttribute('aria-pressed', String(o === b));
          });
        });
      });
      const essayer = racine.querySelector('#essayer');
      if (essayer) {
        essayer.addEventListener('click', function () {
          VX.lire('Bonjour ! Je lis les consignes et les questions pour toi.');
        });
      }
    }
    brancher(app);

    // Les voix peuvent arriver après l'affichage : on complète alors le bloc Voix.
    let nbVoix = VX.voixFrancaises().length;
    VX.quandPretes(function () {
      if (!encoreActuel() || VX.voixFrancaises().length === nbVoix) return;
      nbVoix = VX.voixFrancaises().length;
      const bloc = document.getElementById('bloc-voix');
      bloc.innerHTML = '<h2>Voix</h2>' + blocVoix();
      ajouterLecture(bloc);
      brancher(bloc);
    });
  }

  // ---------- Confidentialité (règle 8) ----------

  function ecranConfidentialite() {
    afficher(
      lienRetour(avatarCourant ? '#/reglages' : '#/avatars', 'Retour') +
      '<h1>Confidentialité</h1>' +
      '<section class="bloc"><h2>Ce que l\'app garde</h2><ul class="liste-simple">' +
      '<li>Ton avatar : un animal et une couleur. Jamais ton prénom.</li>' +
      '<li>Tes réponses aux cartes, pour savoir quand les revoir.</li>' +
      '<li>Le nombre de séances, pour faire pousser ta plante.</li>' +
      '<li>Tes réglages : police, taille du texte, voix.</li>' +
      (SY.active() ? '<li>Avec une classe : le code de la classe, et ton code secret, transformé pour que personne ne puisse le lire.</li>' : '') +
      '</ul></section>' +
      '<section class="bloc"><h2>Où ?</h2>' +
      '<p>Sur cet appareil.</p>' +
      (SY.active()
        ? '<p>Avec une classe, une copie part sur un serveur en Europe (Supabase, à Francfort) : ' +
          'le code de la classe, ton avatar, ton code secret transformé, le nombre de séances de ta plante et tes réponses aux cartes. Rien d\'autre. ' +
          'C\'est ce qui te permet de retrouver ton travail en classe et à la maison.</p>' +
          '<p>Le serveur efface tout, chaque année, le 31 août.</p>'
        : '<p>Rien ne part sur Internet.</p>') +
      '<p>Pas de compte, pas de cookie, pas de publicité.</p>' +
      '<p>La voix qui lit est celle de l\'appareil. Elle aussi reste sur l\'appareil.</p></section>' +
      '<section class="bloc"><h2>Comment tout effacer ?</h2>' +
      '<p>Demande à ton enseignant ou à ton enseignante : ' + (SY.active() ? 'il peut effacer tes données sur l\'appareil et sur le serveur.' : 'il peut tout effacer.') + '</p>' +
      '<p>À la maison : supprimer l\'app de l\'écran d\'accueil efface ce qui est sur l\'appareil.</p></section>' +
      '<section class="bloc"><h2>Crédits</h2>' +
      '<p>Police Luciole © Laurent Bourcellier &amp; Jonathan Fabreguettes (Perez), 2019-2026, typographies.fr. ' +
      'Licence Creative Commons Attribution 4.0 International : creativecommons.org/licenses/by/4.0/deed.fr. ' +
      'Fichiers non modifiés.</p>' +
      '<p>Police Lexend © 2019 The Lexend Project Authors. Licence SIL Open Font License 1.1 : openfontlicense.org.</p>' +
      '</section>' +
      piedDePage(),
      'Confidentialité'
    );
  }

  // ---------- Atelier enseignant (atelier.js) ----------

  const atelier = window.Atelier.installer({
    app: app,
    afficher: afficher,
    lienRetour: lienRetour,
    echapper: echapper,
    avecGras: avecGras,
    S: S,
    V: V,
    DISCIPLINES: DISCIPLINES,
    chargerPaquet: chargerPaquet,
    chargerListe: chargerListe,
    chargerListeFichiers: chargerListeFichiers,
    enregistrerPaquetClasse: function (classe, contenu) { return S.enregistrerPaquet(classe, contenu); },
    stockageOk: function () { return stockageOk; },
    getDecalage: function () { return decalageJours; },
    setDecalage: function (n) { decalageJours = n; },
    aujourdhui: aujourdhui,
    dateLisible: dateLisible,
    reinitialiser: function () {
      memoriserAvatar(null);
      decalageJours = 0;
      classeAppareil = null;
      sansClasse = false;
      codeCourant = null;
    },
    // Synchronisation (lot 5 bis)
    SY: SY,
    getClasse: function () { return classeAppareil; },
    setClasse: function (code) {
      classeAppareil = code;
      sansClasse = false;
      return S.ecrireReglage('classe', code).then(function () { return S.ecrireReglage('sansClasse', false); });
    },
    oublierClasse: function () {
      classeAppareil = null;
      return S.ecrireReglage('classe', null);
    },
    nomAvatarId: function (id) {
      const morceaux = String(id).split('-');
      return nomAvatar({ animal: morceaux[0], couleur: morceaux[1] });
    }
  });

  // ---------- Navigation ----------

  function router() {
    VX.arreter(); // changer d'écran coupe la voix
    const numero = ++ecranCourant;
    const encoreActuel = function () { return numero === ecranCourant; };
    const morceaux = (location.hash.replace(/^#\/?/, '') || '').split('/');

    // #/p/ID : lien court des QR codes
    if (morceaux[0] === 'p' && morceaux[1]) morceaux[0] = 'paquet';

    if (morceaux[0] === 'paquet' && morceaux[1]) {
      const id = decodeURIComponent(morceaux[1]);
      if (morceaux[2] === 'fiche') ecranFiche(id, encoreActuel);
      else if (morceaux[2] === 'cartes') ecranCartes(id, encoreActuel);
      else if (morceaux[2] === 'quiz') ecranQuiz(id, encoreActuel);
      else ecranPaquet(id, encoreActuel);
    } else if (morceaux[0] === 'paquets') {
      ecranAccueil(encoreActuel);
    } else if (morceaux[0] === 'avatars') {
      ecranAvatars(encoreActuel);
    } else if (morceaux[0] === 'avatar' && morceaux[1] === 'nouveau') {
      ecranNouvelAvatar(encoreActuel);
    } else if (morceaux[0] === 'reglages') {
      ecranReglages(encoreActuel);
    } else if (morceaux[0] === 'confidentialite') {
      ecranConfidentialite();
    } else if (morceaux[0] === 'atelier') {
      atelier.router(morceaux.slice(1), encoreActuel);
    } else if (avatarCourant || !stockageOk) {
      ecranAccueil(encoreActuel);
    } else {
      ecranAvatars(encoreActuel);
    }
  }

  // ---------- Démarrage ----------

  function demarrer() {
    let idMemorise = null;
    try { idMemorise = sessionStorage.getItem('avatar'); } catch (e) { /* sans conséquence */ }

    return S.ouvrir()
      .then(function () { return S.lireReglage('decalageJours', 0); })
      .then(function (n) { decalageJours = Number(n) || 0; })
      .then(function () { return S.lireReglage('classe', null); })
      .then(function (c) { classeAppareil = c; })
      .then(function () { return S.lireReglage('sansClasse', false); })
      .then(function (v) { sansClasse = v === true; })
      .then(function () { return idMemorise ? S.lireAvatar(idMemorise) : null; })
      .then(function (a) { if (a) memoriserAvatar(a); })
      .catch(function () { stockageOk = false; });
  }

  demarrer().then(function () {
    window.addEventListener('hashchange', router);
    router();
    // Les voix de l'appareil arrivent parfois après le premier affichage.
    VX.quandPretes(function () { ajouterLecture(app); });
    // Charge tous les paquets en arrière-plan : le service worker les garde pour le hors ligne.
    chargerListe().catch(function () {});
  });

  // ---------- Hors ligne ----------

  if ('serviceWorker' in navigator) {
    // updateViaCache: 'none' : sw.js est toujours vérifié en ligne, jamais pris dans le cache HTTP.
    navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })
      .then(function (inscription) {
        // Sur iPad, l'app revient souvent du fond sans se recharger : on vérifie alors la mise à jour.
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') inscription.update().catch(function () {});
        });
      })
      .catch(function () {});
  }
})();
