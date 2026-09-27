'use strict';

// Lecteur élève. Écrans : #/ (mes paquets), #/paquet/ID, #/paquet/ID/fiche.
// Aucun cookie, aucune requête hors du site.

(function () {
  const V = window.ValidationPaquet;
  const app = document.getElementById('app');

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

  const installee =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

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

  // Numéro de l'écran demandé : un chargement lent ne doit pas écraser un écran plus récent.
  let ecranCourant = 0;

  function afficher(html, titre) {
    app.innerHTML = html;
    document.title = titre ? titre + ' – Révision CM2' : 'Révision CM2';
    window.scrollTo(0, 0);
    // VoiceOver annonce le nouvel écran.
    const h1 = app.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
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

  // ---------- Chargement ----------

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

  // ---------- Écrans ----------

  function ecranAccueil(encoreActuel) {
    afficher('<h1>Mes paquets</h1><p class="consigne">Chargement…</p>', 'Mes paquets');

    chargerListe()
      .then(function (resultats) {
        if (!encoreActuel()) return;
        const valides = resultats.filter(function (r) { return r.paquet; });
        const invalides = resultats.filter(function (r) { return !r.paquet && !r.horsLigne; });
        let html = '<h1>Mes paquets</h1>';

        if (!installee) {
          html += '<p class="bandeau">Installe l\'app : touche <strong>Partager</strong>, puis <strong>Sur l\'écran d\'accueil</strong>.</p>';
        }

        if (valides.length === 0) {
          html += '<p class="consigne">Aucun paquet disponible pour l\'instant.</p>';
        } else {
          html += '<p class="consigne">Choisis un paquet.</p>';
          Object.keys(DISCIPLINES).forEach(function (cle) {
            const duGroupe = valides.filter(function (r) { return r.paquet.discipline === cle; });
            if (duGroupe.length === 0) return;
            const d = DISCIPLINES[cle];
            html += '<section class="groupe"><h2><span aria-hidden="true">' + d.icone + '</span> ' + d.nom + '</h2><ul class="liste-paquets">';
            duGroupe.forEach(function (r) {
              html += '<li><a class="carte-paquet" data-discipline="' + cle + '" href="#/paquet/' + r.id + '">' +
                '<span class="carte-titre">' + echapper(r.paquet.titre) + '</span>' +
                '<span class="carte-infos">Période ' + r.paquet.periode.slice(1) + ' · ' + NIVEAUX[r.paquet.niveau] + '</span>' +
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
          '<h1>Mes paquets</h1>' +
          '<p class="consigne">Connecte-toi à Internet une première fois pour voir les paquets.</p>' +
          piedDePage(),
          'Mes paquets'
        );
      });
  }

  function ecranPaquet(id, encoreActuel) {
    afficher('<p class="consigne">Chargement…</p>');
    chargerPaquet(id).then(function (r) {
      if (!encoreActuel()) return;
      if (!r.paquet) { ecranErreur(r); return; }
      const p = r.paquet;
      afficher(
        lienRetour('#/', 'Mes paquets') +
        '<h1>' + echapper(p.titre) + '</h1>' +
        etiquettes(p) +
        '<p class="consigne">Choisis une activité.</p>' +
        '<div class="activites">' +
        '<a class="activite" href="#/paquet/' + p.id + '/fiche"><span aria-hidden="true">📄</span> Fiche</a>' +
        '<button class="activite" type="button" disabled><span aria-hidden="true">🃏</span> Cartes <span class="bientot">bientôt</span></button>' +
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
    let html = lienRetour('#/', 'Mes paquets') +
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

  function piedDePage() {
    return '<p class="version">Version <span id="version">0.1.1</span></p>';
  }

  // ---------- Navigation ----------

  function router() {
    const numero = ++ecranCourant;
    const encoreActuel = function () { return numero === ecranCourant; };
    const morceaux = (location.hash.replace(/^#\/?/, '') || '').split('/');
    if (morceaux[0] === 'paquet' && morceaux[1]) {
      const id = decodeURIComponent(morceaux[1]);
      if (morceaux[2] === 'fiche') ecranFiche(id, encoreActuel);
      else ecranPaquet(id, encoreActuel);
    } else {
      ecranAccueil(encoreActuel);
    }
  }

  window.addEventListener('hashchange', router);
  router();

  // ---------- Hors ligne ----------

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  }
})();
