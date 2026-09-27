'use strict';

// Lecteur élève et atelier enseignant minimal.
// Écrans : #/ (avatar puis paquets), #/avatars, #/avatar/nouveau, #/paquets,
// #/paquet/ID, #/paquet/ID/fiche, #/paquet/ID/cartes, #/atelier (caché).
// Aucun cookie, aucune requête hors du site.

(function () {
  const V = window.ValidationPaquet;
  const M = window.Moteur;
  const S = window.Stockage;
  const app = document.getElementById('app');
  const VERSION_APP = '0.2.0';

  const DISCIPLINES = {
    histoire: { nom: 'Histoire', icone: '🏰' },
    geographie: { nom: 'Géographie', icone: '🗺️' },
    sciences: { nom: 'Sciences', icone: '🔬' },
    vocabulaire: { nom: 'Vocabulaire', icone: '📖' },
    grammaire: { nom: 'Grammaire', icone: '✏️' },
    conjugaison: { nom: 'Conjugaison', icone: '⏳' },
    calcul: { nom: 'Calcul', icone: '🔢' },
    geometrie: { nom: 'Géométrie', icone: '📐' },
    mesures: { nom: 'Grandeurs et mesures', icone: '📏' }
  };

  const NIVEAUX = { 'accompagné': 'Accompagné', standard: 'Standard', approfondi: 'Approfondi' };

  // 12 animaux (f = féminin, pour accorder la couleur) et 6 couleurs.
  const ANIMAUX = {
    renard: { nom: 'Renard', icone: '🦊' },
    panda: { nom: 'Panda', icone: '🐼' },
    grenouille: { nom: 'Grenouille', icone: '🐸', f: true },
    hibou: { nom: 'Hibou', icone: '🦉' },
    tortue: { nom: 'Tortue', icone: '🐢', f: true },
    dauphin: { nom: 'Dauphin', icone: '🐬' },
    lion: { nom: 'Lion', icone: '🦁' },
    lapin: { nom: 'Lapin', icone: '🐰' },
    manchot: { nom: 'Manchot', icone: '🐧' },
    herisson: { nom: 'Hérisson', icone: '🦔' },
    pieuvre: { nom: 'Pieuvre', icone: '🐙', f: true },
    abeille: { nom: 'Abeille', icone: '🐝', f: true }
  };
  const COULEURS = {
    rouge: { m: 'rouge', f: 'rouge' },
    orange: { m: 'orange', f: 'orange' },
    jaune: { m: 'jaune', f: 'jaune' },
    vert: { m: 'vert', f: 'verte' },
    bleu: { m: 'bleu', f: 'bleue' },
    violet: { m: 'violet', f: 'violette' }
  };

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
  let atelierOuvert = false;    // code saisi pendant cette ouverture de l'app
  let apresAvatar = null;       // écran à rouvrir une fois l'avatar choisi

  function aujourdhui() {
    return M.jourLocal() + decalageJours;
  }

  function memoriserAvatar(avatar) {
    avatarCourant = avatar;
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
    const animal = ANIMAUX[a.animal];
    return animal.nom + ' ' + COULEURS[a.couleur][animal.f ? 'f' : 'm'];
  }

  function iconeAvatar(a) {
    return ANIMAUX[a.animal].icone;
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

  function afficher(html, titre) {
    app.innerHTML = html;
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

  function chargerPaquet(id) {
    if (!V.ID_VALIDE.test(id)) {
      return Promise.resolve({ id: id, erreurs: ['Le nom du paquet dans le lien n\'est pas valide.'] });
    }
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
        return { id: id, horsLigne: true, erreurs: ['Ce paquet n\'est pas encore sur cet appareil. Ouvre-le une première fois avec Internet.'] };
      });
  }

  function chargerListe() {
    return fetch('paquets/index.json')
      .then(function (reponse) {
        if (!reponse.ok) throw new Error('liste');
        return reponse.json();
      })
      .then(function (liste) {
        if (!liste || !Array.isArray(liste.paquets)) throw new Error('liste');
        return Promise.all(liste.paquets.map(chargerPaquet));
      });
  }

  function clesDuPaquet(p) {
    return p.cartes.map(M.cleCarte);
  }

  // ---------- Avatars ----------

  function ecranAvatars(encoreActuel) {
    if (!stockageOk) {
      afficher(
        '<h1>Qui es-tu ?</h1>' +
        '<p class="consigne">Cet appareil ne peut pas garder ta progression.</p>' +
        '<p>Tu peux quand même lire les fiches.</p>' +
        '<a class="bouton" href="#/paquets">Voir les paquets</a>' +
        piedDePage(),
        'Qui es-tu ?'
      );
      return;
    }
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
      html += '<a class="bouton" href="#/avatar/nouveau"><span aria-hidden="true">＋</span> Nouvel avatar</a>' +
        piedDePage();
      afficher(html, 'Qui es-tu ?');

      app.querySelectorAll('.avatar').forEach(function (bouton) {
        bouton.addEventListener('click', function () {
          const a = avatars.find(function (x) { return x.id === bouton.dataset.id; });
          memoriserAvatar(a);
          const cible = apresAvatar || '#/paquets';
          apresAvatar = null;
          location.hash = cible;
        });
      });
    }).catch(function () {
      stockageOk = false;
      if (encoreActuel()) ecranAvatars(encoreActuel);
    });
  }

  function ecranNouvelAvatar(encoreActuel) {
    S.listerAvatars().then(function (avatars) {
      if (!encoreActuel()) return;
      const pris = {};
      avatars.forEach(function (a) { pris[a.id] = true; });
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
          const a = { animal: animal, couleur: couleur };
          const dejaPris = pris[animal + '-' + couleur];
          html += '<li><button class="avatar" type="button" data-couleur="' + couleur + '"' + (dejaPris ? ' disabled' : '') + '>' +
            '<span class="avatar-icone" aria-hidden="true">' + ANIMAUX[animal].icone + '</span>' +
            '<span class="avatar-nom">' + nomAvatar(a) + (dejaPris ? ' <small>(déjà pris)</small>' : '') + '</span></button></li>';
        });
        html += '</ul>';
        afficher(html, 'Nouvel avatar');
        document.getElementById('changer-animal').addEventListener('click', choixAnimal);
        app.querySelectorAll('[data-couleur]').forEach(function (b) {
          b.addEventListener('click', function () {
            const avatar = { id: animal + '-' + b.dataset.couleur, animal: animal, couleur: b.dataset.couleur, cree: Date.now(), seances: 0 };
            S.ajouterAvatar(avatar).then(function () {
              S.demanderPersistance();
              memoriserAvatar(avatar);
              const cible = apresAvatar || '#/paquets';
              apresAvatar = null;
              location.hash = cible;
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

  // ---------- Mes paquets ----------

  function enteteAvatar() {
    if (avatarCourant) {
      return '<div class="entete-avatar" data-couleur="' + avatarCourant.couleur + '">' +
        '<span class="avatar-icone" aria-hidden="true">' + iconeAvatar(avatarCourant) + '</span>' +
        '<span class="avatar-nom">' + nomAvatar(avatarCourant) + '</span>' +
        '<a href="#/avatars">Changer</a></div>';
    }
    if (stockageOk) return '<p><a href="#/avatars">Choisir mon avatar</a></p>';
    return '';
  }

  function ecranAccueil(encoreActuel) {
    afficher('<h1>Mes paquets</h1><p class="consigne">Chargement…</p>', 'Mes paquets');

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
          html += '<p class="consigne">Aucun paquet disponible pour l\'instant.</p>';
        } else {
          html += '<p class="consigne">Choisis un paquet.</p>';
          Object.keys(DISCIPLINES).forEach(function (cle) {
            const duGroupe = d.valides.filter(function (r) { return r.paquet.discipline === cle; });
            if (duGroupe.length === 0) return;
            const disc = DISCIPLINES[cle];
            html += '<section class="groupe"><h2><span aria-hidden="true">' + disc.icone + '</span> ' + disc.nom + '</h2><ul class="liste-paquets">';
            duGroupe.forEach(function (r) {
              const n = d.aRevoir[r.id] || 0;
              html += '<li><a class="carte-paquet" data-discipline="' + cle + '" href="#/paquet/' + r.id + '">' +
                '<span class="carte-titre">' + echapper(r.paquet.titre) + '</span>' +
                '<span class="carte-infos">Période ' + r.paquet.periode.slice(1) + ' · ' + NIVEAUX[r.paquet.niveau] + '</span>' +
                (n > 0 ? '<span class="pastille">' + n + (n > 1 ? ' cartes' : ' carte') + ' à revoir</span>' : '') +
                '</a></li>';
            });
            html += '</ul></section>';
          });
        }

        // Signalé discrètement pour l'enseignant.
        invalides.forEach(function (r) {
          html += '<p class="alerte-discrete"><a href="#/paquet/' + echapper(r.id) + '">Paquet illisible : ' + echapper(r.id) + '</a></p>';
        });

        html += piedDePage();
        afficher(html, 'Mes paquets');
      })
      .catch(function () {
        if (!encoreActuel()) return;
        afficher(
          '<h1>Mes paquets</h1>' + enteteAvatar() +
          '<p class="consigne">Connecte-toi à Internet une première fois pour voir les paquets.</p>' +
          piedDePage(),
          'Mes paquets'
        );
      });
  }

  // ---------- Paquet et fiche ----------

  function ecranPaquet(id, encoreActuel) {
    afficher('<p class="consigne">Chargement…</p>');
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
        '<button class="activite" type="button" disabled><span aria-hidden="true">❓</span> Quiz <span class="bientot">bientôt</span></button>' +
        '</div>',
        p.titre
      );
    });
  }

  function ecranFiche(id, encoreActuel) {
    afficher('<p class="consigne">Chargement…</p>');
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
    afficher('<p class="consigne">Chargement…</p>');
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
            '<p class="consigne">Rien à revoir aujourd\'hui. Reviens demain.</p>' +
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
        '<h1>Cartes</h1><p class="consigne">Ta progression n\'a pas pu être lue sur cet appareil.</p>');
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
        '<span class="carte-indice">Touche pour retourner</span></button>';
      const bouton = document.getElementById('carte');
      if (position > 0) bouton.focus();
      bouton.addEventListener('click', verso);
    }

    function verso() {
      const carte = cartes[file[position]];
      let html =
        '<div class="carte retournee">' +
        '<p class="carte-recto">' + avecGras(carte.recto) + '</p>' +
        '<p class="carte-texte" id="verso" tabindex="-1">' + avecGras(carte.verso) + '</p></div>' +
        '<p class="consigne">Dis si tu savais la réponse.</p><div class="notes">';
      Object.keys(NOTES).forEach(function (n) {
        html += '<button class="note" type="button" data-note="' + n + '">' +
          '<span aria-hidden="true">' + NOTES[n].icone + '</span> ' + NOTES[n].texte + '</button>';
      });
      html += '</div>';
      zone.innerHTML = html;
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
      S.compterSeance(avatar.id).catch(function () {});
      const vues = Object.keys(premiereNote);
      const reussites = vues.filter(function (c) { return premiereNote[c] === 'savais'; }).length;
      const aRevoir = vues.filter(function (c) { return derniereNote[c] !== 'savais'; });
      let html = lienRetour('#/paquet/' + p.id, p.titre) +
        '<h1>Séance terminée</h1>' +
        '<p class="consigne">Tu savais <strong>' + reussites + '</strong> ' + (reussites > 1 ? 'cartes' : 'carte') +
        ' sur <strong>' + vues.length + '</strong> du premier coup.</p>';
      if (aRevoir.length) {
        html += '<h2>Cartes à revoir</h2><ul class="a-revoir">';
        aRevoir.forEach(function (c) { html += '<li>' + avecGras(cartes[c].recto) + '</li>'; });
        html += '</ul><p>Elles reviendront dans une prochaine séance.</p>';
      }
      html += '<a class="bouton" href="#/paquet/' + p.id + '">Revenir au paquet</a>';
      afficher(html, 'Séance terminée');
    }

    recto();
  }

  // ---------- Atelier enseignant (minimal) ----------

  function ecranAtelier(encoreActuel) {
    if (!stockageOk) {
      afficher(lienRetour('#/', 'Quitter') + '<h1>Atelier enseignant</h1><p>Le stockage de cet appareil est indisponible.</p>', 'Atelier');
      return;
    }
    if (atelierOuvert) { ecranAtelierOuvert(); return; }

    S.lireReglage('codeAtelier', null).then(function (code) {
      if (!encoreActuel()) return;
      const creation = code === null;
      const champ = function (idChamp, libelle) {
        return '<label class="champ" for="' + idChamp + '">' + libelle + '</label>' +
          '<input class="code" id="' + idChamp + '" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*">';
      };
      afficher(
        lienRetour('#/', 'Quitter') +
        '<h1>Atelier enseignant</h1>' +
        (creation
          ? '<p>Crée un code à 4 chiffres. C\'est un garde-fou pour les élèves, pas une sécurité.</p>' +
            champ('code1', 'Nouveau code') + champ('code2', 'Répète le code')
          : champ('code1', 'Code de l\'atelier')) +
        '<p class="message" id="message" role="alert"></p>' +
        '<button class="bouton" type="button" id="valider">' + (creation ? 'Enregistrer' : 'Ouvrir') + '</button>' +
        (creation ? '' : '<p class="note-discrete">Code oublié : supprimer l\'app de l\'écran d\'accueil efface toutes ses données, code compris.</p>'),
        'Atelier'
      );
      const message = document.getElementById('message');
      const code1 = document.getElementById('code1');
      code1.focus();

      function valider() {
        const v1 = code1.value;
        if (creation) {
          const v2 = document.getElementById('code2').value;
          if (!/^[0-9]{4}$/.test(v1)) { message.textContent = 'Le code doit avoir 4 chiffres.'; return; }
          if (v1 !== v2) { message.textContent = 'Les deux codes sont différents.'; return; }
          S.ecrireReglage('codeAtelier', v1).then(function () {
            atelierOuvert = true;
            ecranAtelierOuvert();
          });
        } else if (v1 === code) {
          atelierOuvert = true;
          ecranAtelierOuvert();
        } else {
          message.textContent = 'Code incorrect.';
          code1.value = '';
          code1.focus();
        }
      }
      document.getElementById('valider').addEventListener('click', valider);
      app.querySelectorAll('.code').forEach(function (c) {
        c.addEventListener('keydown', function (e) { if (e.key === 'Enter') valider(); });
      });
    });
  }

  function ecranAtelierOuvert() {
    afficher(
      '<h1>Atelier enseignant</h1>' +
      '<section class="bloc"><h2>Date de test</h2>' +
      '<p>Date utilisée par l\'app : <strong>' + dateLisible(aujourdhui()) + '</strong><br>' +
      (decalageJours === 0
        ? 'C\'est la vraie date.'
        : '<span class="alerte">Vraie date + ' + decalageJours + (decalageJours > 1 ? ' jours' : ' jour') + '.</span>') +
      '</p>' +
      '<p class="note-discrete">Sert à tester la répétition espacée. Les élèves ne voient pas ce réglage : pense à revenir à la vraie date.</p>' +
      '<div class="boutons-ligne">' +
      '<button class="bouton" type="button" id="avancer">Avancer d\'un jour</button>' +
      '<button class="bouton secondaire" type="button" id="vraie-date"' + (decalageJours === 0 ? ' disabled' : '') + '>Revenir à la vraie date</button>' +
      '</div></section>' +
      '<section class="bloc"><h2>Données de l\'appareil</h2>' +
      '<p>Efface tous les avatars, toute la progression, le code de l\'atelier et la date de test.</p>' +
      '<button class="bouton danger" type="button" id="effacer">Effacer toutes les données</button></section>' +
      '<button class="bouton secondaire" type="button" id="fermer">Fermer l\'atelier</button>',
      'Atelier'
    );

    function changerDecalage(n) {
      S.ecrireReglage('decalageJours', n).then(function () {
        decalageJours = n;
        ecranAtelierOuvert();
      });
    }
    document.getElementById('avancer').addEventListener('click', function () { changerDecalage(decalageJours + 1); });
    document.getElementById('vraie-date').addEventListener('click', function () { changerDecalage(0); });
    document.getElementById('effacer').addEventListener('click', function () {
      if (!window.confirm('Effacer tous les avatars et toute la progression de cet appareil ? C\'est définitif.')) return;
      S.toutEffacer().catch(function () {}).then(function () {
        memoriserAvatar(null);
        decalageJours = 0;
        atelierOuvert = false;
        location.hash = '#/';
      });
    });
    document.getElementById('fermer').addEventListener('click', function () {
      atelierOuvert = false;
      location.hash = '#/';
    });
  }

  // ---------- Navigation ----------

  function router() {
    const numero = ++ecranCourant;
    const encoreActuel = function () { return numero === ecranCourant; };
    const morceaux = (location.hash.replace(/^#\/?/, '') || '').split('/');

    if (morceaux[0] === 'paquet' && morceaux[1]) {
      const id = decodeURIComponent(morceaux[1]);
      if (morceaux[2] === 'fiche') ecranFiche(id, encoreActuel);
      else if (morceaux[2] === 'cartes') ecranCartes(id, encoreActuel);
      else ecranPaquet(id, encoreActuel);
    } else if (morceaux[0] === 'paquets') {
      ecranAccueil(encoreActuel);
    } else if (morceaux[0] === 'avatars') {
      ecranAvatars(encoreActuel);
    } else if (morceaux[0] === 'avatar' && morceaux[1] === 'nouveau') {
      ecranNouvelAvatar(encoreActuel);
    } else if (morceaux[0] === 'atelier') {
      ecranAtelier(encoreActuel);
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
      .then(function () { return idMemorise ? S.lireAvatar(idMemorise) : null; })
      .then(function (a) { if (a) avatarCourant = a; })
      .catch(function () { stockageOk = false; });
  }

  demarrer().then(function () {
    window.addEventListener('hashchange', router);
    router();
    // Charge tous les paquets en arrière-plan : le service worker les garde pour le hors ligne.
    chargerListe().catch(function () {});
  });

  // ---------- Hors ligne ----------

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  }
})();
