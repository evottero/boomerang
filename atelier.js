/*
 * Atelier enseignant (section 5.1 du cahier des charges).
 * Écrans : #/atelier (accueil), #/atelier/prompt, #/atelier/import, #/atelier/relecture,
 * #/atelier/export, #/atelier/modifier/ID, #/atelier/qr/ID.
 * Protégé par un code local à 4 chiffres (garde-fou, pas une sécurité).
 * Aucune requête hors du site : le QR code est calculé sur l'appareil (qrcode.js).
 */
(function (racine) {
  'use strict';

  // Prompt de génération fourni par l'enseignant, à coller dans Claude avec la leçon.
  const PROMPT = `Tu génères un paquet de révision pour des élèves de CM2 (10-11 ans), à partir de la leçon collée ci-dessous.

Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans balises de code.

Format :
{
  "version": 1,
  "id": "[discipline]-[mot-clé]",
  "titre": "...",
  "discipline": "histoire | geographie | sciences | grammaire | conjugaison | vocabulaire | nombres | calcul | grandeurs | geometrie | emc",
  "periode": "P1 à P10",
  "niveau": "accompagne | standard | approfondi",
  "relu": false,
  "accents": false,
  "fiche": [5 à 8 phrases],
  "cartes": [8 à 10 objets {"recto": "...", "verso": "..."}],
  "quiz": [6 à 8 questions, au moins une de chaque type]
}

Types de quiz :
- {"type": "qcm", "question": "...", "choix": [3 réponses], "reponse": index de la bonne (0, 1 ou 2), "explication": "..."}
- {"type": "vraifaux", "question": "affirmation", "reponse": true ou false, "explication": "..."}
- {"type": "trous", "texte": "phrase avec ___", "reponse": "mot attendu", "explication": "..."}
- {"type": "ordre", "question": "...", "elements": [3 ou 4 éléments dans le bon ordre], "explication": "..."}

Règles de rédaction :
- Uniquement le contenu de la leçon. N'ajoute aucun fait, aucune date, aucun exemple absent de la leçon.
- Le titre ne reprend pas le nom de la discipline.
- Phrases de 15 mots maximum. Vocabulaire de la leçon. Mots importants de la fiche en **gras**.
- Tutoiement. Consignes de 12 mots maximum, verbe d'action en tête.
- Aucun piège, aucune double négation. Les mauvaises réponses des QCM sont plausibles mais clairement fausses.
- Chaque explication tient en une phrase et dit pourquoi la bonne réponse est juste.
- Prénoms variés et contextes non stéréotypés si un énoncé en contient.
- "accents": true seulement si l'orthographe fait partie de l'objectif (conjugaison, orthographe).
- Niveau accompagné : questions directes, vocabulaire simple. Niveau approfondi : questions qui demandent de relier deux idées.

Discipline, période et niveau : [à compléter]

Leçon :
[coller la leçon]`;

  const LIGNE_A_COMPLETER = 'Discipline, période et niveau : [à compléter]';
  const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];
  const NIVEAUX_ATELIER = { accompagne: 'Accompagné', standard: 'Standard', approfondi: 'Approfondi' };
  const TYPES = { qcm: 'QCM', vraifaux: 'Vrai ou faux', trous: 'Texte à trous', ordre: 'Remise en ordre' };

  function installer(c) {
    const app = c.app;
    const echapper = c.echapper;
    let ouvert = false;
    let brouillon = null;       // paquet en cours de relecture (modèle d'édition)
    let dernierExport = null;   // { id, json, index }
    let minuteurSauvegarde = null;
    let enseignant = null;          // { classe, code } : connexion enseignant de cet appareil (lot 5 ter)
    let pageNouveau = null;         // { discipline, periode, niveau, lecon } : écran « Nouveau paquet »
    let minuteurPage = null;
    let dernierePublication = null; // { id, classe } : pour le message sous le QR code

    // ---------- Outils ----------

    function options(valeurs, choisie, vide) {
      let html = vide ? '<option value="">' + vide + '</option>' : '';
      Object.keys(valeurs).forEach(function (v) {
        html += '<option value="' + v + '"' + (v === choisie ? ' selected' : '') + '>' + valeurs[v] + '</option>';
      });
      return html;
    }

    function disciplines() {
      const d = {};
      Object.keys(c.DISCIPLINES).forEach(function (k) { d[k] = c.DISCIPLINES[k].nom; });
      return d;
    }

    function periodes() {
      const p = {};
      PERIODES.forEach(function (x) { p[x] = 'Période ' + x.slice(1); });
      return p;
    }

    function telecharger(nom, texte) {
      const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }

    function copier(texte, zoneSecours) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(texte).catch(function () { return copierSecours(zoneSecours, texte); });
      }
      return copierSecours(zoneSecours, texte);
    }

    function copierSecours(zone, texte) {
      if (!zone) {
        const tmp = document.createElement('textarea');
        tmp.value = texte || '';
        tmp.setAttribute('readonly', '');
        tmp.className = 'cache';
        document.body.appendChild(tmp);
        const r = copierSecours(tmp);
        tmp.remove();
        return r;
      }
      zone.removeAttribute('readonly');
      zone.select();
      const ok = document.execCommand('copy');
      zone.setAttribute('readonly', '');
      return ok ? Promise.resolve() : Promise.reject(new Error('copie impossible'));
    }

    function lienCourt(id) {
      // Racine du site : un appareil sans code passe par la page d'accueil, qui transmet le lien à l'app.
      return location.origin + location.pathname.replace(/(index|app)\.html$/, '') + '#/p/' + id;
    }

    function proposerId(discipline, titre) {
      const mots = String(titre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
        .filter(function (m) { return m.length > 2 && ['les', 'des', 'une', 'aux', 'dans', 'pour', 'avec', 'sur'].indexOf(m) === -1; })
        .slice(0, 3);
      return [discipline || 'paquet'].concat(mots).join('-').slice(0, 60).replace(/-+$/, '');
    }

    // ---------- Modèle d'édition ----------

    function texte(v) {
      return typeof v === 'string' ? v : (v === undefined || v === null ? '' : String(v));
    }

    // Transforme un objet importé en modèle d'édition. relu : état initial des cases.
    function versModele(obj, relu, origine) {
      const connus = ['version', 'id', 'titre', 'discipline', 'periode', 'niveau', 'relu', 'accents', 'fiche', 'cartes', 'quiz'];
      const ignores = Object.keys(obj).filter(function (k) { return connus.indexOf(k) === -1; });
      const niveau = obj.niveau === 'accompagné' ? 'accompagne' : texte(obj.niveau);
      const m = {
        origine: origine,
        ignores: ignores,
        meta: {
          id: texte(obj.id) || proposerId(obj.discipline, obj.titre),
          titre: texte(obj.titre),
          discipline: texte(obj.discipline),
          periode: texte(obj.periode),
          niveau: niveau,
          accents: obj.accents === true
        },
        metaRelu: relu,
        fiche: (Array.isArray(obj.fiche) ? obj.fiche : []).map(function (t) { return { texte: texte(t), relu: relu }; }),
        cartes: (Array.isArray(obj.cartes) ? obj.cartes : []).map(function (k) {
          k = k || {};
          return { recto: texte(k.recto), verso: texte(k.verso), relu: relu };
        }),
        quiz: (Array.isArray(obj.quiz) ? obj.quiz : []).map(function (q) {
          q = q || {};
          const e = { type: TYPES[q.type] ? q.type : 'qcm', explication: texte(q.explication), relu: relu };
          if (e.type === 'qcm') {
            e.question = texte(q.question);
            e.choix = [0, 1, 2].map(function (i) { return texte(Array.isArray(q.choix) ? q.choix[i] : ''); });
            e.reponse = [0, 1, 2].indexOf(Number(q.reponse)) !== -1 ? Number(q.reponse) : 0;
          } else if (e.type === 'vraifaux') {
            e.question = texte(q.question);
            e.reponse = q.reponse === true || q.reponse === 'true';
          } else if (e.type === 'trous') {
            e.texte = texte(q.texte || q.question);
            e.reponse = texte(q.reponse);
            if (typeof q.accents === 'boolean') e.accents = q.accents;
          } else {
            e.question = texte(q.question);
            e.elements = (Array.isArray(q.elements) ? q.elements : []).map(texte);
          }
          return e;
        })
      };
      return m;
    }

    // Paquet final (relu: true : l'export n'est possible que si tout est coché).
    function versPaquet(m) {
      return {
        version: 1,
        id: m.meta.id,
        titre: m.meta.titre.trim(),
        discipline: m.meta.discipline,
        periode: m.meta.periode,
        niveau: m.meta.niveau,
        relu: true,
        accents: m.meta.accents,
        fiche: m.fiche.map(function (f) { return f.texte.trim(); }),
        cartes: m.cartes.map(function (k) { return { recto: k.recto.trim(), verso: k.verso.trim() }; }),
        quiz: m.quiz.map(function (q) {
          if (q.type === 'qcm') return { type: 'qcm', question: q.question.trim(), choix: q.choix.map(function (x) { return x.trim(); }), reponse: q.reponse, explication: q.explication.trim() };
          if (q.type === 'vraifaux') return { type: 'vraifaux', question: q.question.trim(), reponse: q.reponse, explication: q.explication.trim() };
          if (q.type === 'trous') {
            const t = { type: 'trous', texte: q.texte.trim(), reponse: q.reponse.trim(), explication: q.explication.trim() };
            if (typeof q.accents === 'boolean') t.accents = q.accents;
            return t;
          }
          return { type: 'ordre', question: q.question.trim(), elements: q.elements.map(function (x) { return x.trim(); }).filter(Boolean), explication: q.explication.trim() };
        })
      };
    }

    function compter(m) {
      const elements = [{ relu: m.metaRelu }].concat(m.fiche, m.cartes, m.quiz);
      return { relus: elements.filter(function (e) { return e.relu; }).length, total: elements.length };
    }

    function sauvegarder() {
      clearTimeout(minuteurSauvegarde);
      minuteurSauvegarde = setTimeout(function () {
        c.S.ecrireReglage('brouillonAtelier', brouillon).catch(function () {});
      }, 400);
    }

    function chargerBrouillon() {
      if (brouillon) return Promise.resolve(brouillon);
      return c.S.lireReglage('brouillonAtelier', null).then(function (b) { brouillon = b; return b; });
    }

    function abandonnerBrouillon() {
      brouillon = null;
      return c.S.ecrireReglage('brouillonAtelier', null);
    }

    // ---------- Code d'accès ----------

    function ecranCode(suite, encoreActuel) {
      c.S.lireReglage('codeAtelier', null).then(function (code) {
        if (!encoreActuel()) return;
        const creation = code === null;
        const champ = function (idChamp, libelle) {
          return '<label class="champ" for="' + idChamp + '">' + libelle + '</label>' +
            '<input class="code" id="' + idChamp + '" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*">';
        };
        c.afficher(
          c.lienRetour('#/', 'Quitter') +
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
            c.S.ecrireReglage('codeAtelier', v1).then(function () { ouvert = true; suite(); });
          } else if (v1 === code) {
            ouvert = true;
            suite();
          } else {
            message.textContent = 'Code incorrect.';
            code1.value = '';
            code1.focus();
          }
        }
        document.getElementById('valider').addEventListener('click', valider);
        app.querySelectorAll('.code').forEach(function (champCode) {
          champCode.addEventListener('keydown', function (e) { if (e.key === 'Enter') valider(); });
        });
      });
    }

    // ---------- Accueil de l'atelier ----------

    function chargerEnseignant() {
      return c.S.lireReglage('enseignant', null).then(function (e) {
        enseignant = e && e.classe && e.code ? e : null;
        return enseignant;
      });
    }

    function connecte() {
      return c.SY.active() && !!enseignant;
    }

    function minutes(jusqua) {
      return Math.max(1, Math.ceil((Date.parse(jusqua) - Date.now()) / 60000));
    }

    // Message clair pour une réponse du serveur aux actions enseignant.
    function messageServeur(r) {
      if (r.statut === 0) return 'Connecte-toi à Internet, puis réessaie.';
      if (r.statut === 401) return 'Code enseignant faux. Il reste ' + r.corps.restants + ' essai' + (r.corps.restants > 1 ? 's' : '') + '.';
      if (r.statut === 423) return 'Trop d\'essais : réessaie dans ' + minutes(r.corps.jusqua) + ' minutes.';
      if (r.statut === 403 && r.corps.erreur === 'sans-code-enseignant') {
        return 'Cette classe n\'a pas encore de code enseignant : définis-le dans « Administration », plus bas.';
      }
      if (r.statut === 403) return 'Clé d\'administration refusée.';
      if (r.statut === 404) return 'Ce code de classe n\'existe pas.';
      if (r.statut === 400 && r.corps.erreur === 'code-enseignant-court') return 'Le code enseignant fait au moins 12 caractères.';
      if (r.statut === 400 && r.corps.erreur === 'paquet') return 'Le serveur a refusé ce paquet.';
      return 'Un problème est survenu. Réessaie.';
    }

    function ecranAccueil(encoreActuel) {
      Promise.all([chargerBrouillon(), chargerEnseignant()]).then(function (r) {
        if (!encoreActuel()) return;
        const b = r[0];
        let html = '<h1>Atelier enseignant</h1>' +
          '<button class="bouton" type="button" id="nouveau-paquet">Nouveau paquet</button>';
        if (b) {
          const n = compter(b);
          html += '<p class="brouillon">Paquet en cours : <strong>' + echapper(b.meta.titre || b.meta.id || 'sans titre') + '</strong>, ' +
            n.relus + ' élément' + (n.relus > 1 ? 's' : '') + ' relu' + (n.relus > 1 ? 's' : '') + ' sur ' + n.total + '. ' +
            '<a class="lien" href="#/atelier/nouveau">Reprendre</a></p>';
        }
        html += '<section class="bloc" id="bloc-mes-paquets"><h2>Mes paquets</h2><p>Chargement…</p></section>' +
          '<section class="bloc" id="bloc-classe"><h2>Classe et synchronisation</h2><p>Chargement…</p></section>' +
          blocDateTest() +
          '<section class="bloc"><h2>Données de l\'appareil</h2>' +
          '<p>Efface de cet appareil : avatars, progression, paquets gardés hors ligne, code de l\'atelier, connexion enseignant, code de classe, date de test et brouillon.</p>' +
          (c.SY.active() ? '<p class="note-discrete">La progression et les paquets enregistrés sur le serveur sont conservés. ' +
            'Pour effacer aussi le serveur, utilise « Effacer ses données » dans la liste des avatars de la classe.</p>' : '') +
          '<button class="bouton danger" type="button" id="effacer">Effacer les données de cet appareil</button></section>' +
          '<button class="bouton secondaire" type="button" id="fermer">Fermer l\'atelier</button>';
        c.afficher(html, 'Atelier');

        document.getElementById('nouveau-paquet').addEventListener('click', function () {
          if (b && !window.confirm('Un paquet est en cours. L\'abandonner et commencer un nouveau paquet ?')) return;
          (b ? abandonnerBrouillon() : Promise.resolve()).then(function () {
            pageNouveau = { discipline: '', periode: '', niveau: '', lecon: '' };
            return c.S.ecrireReglage('nouveauPaquet', pageNouveau).catch(function () {});
          }).then(function () { location.hash = '#/atelier/nouveau'; });
        });
        brancherDateTest(function () { ecranAccueil(encoreActuel); });
        remplirMesPaquets(encoreActuel);
        remplirBlocClasse(encoreActuel);
        document.getElementById('effacer').addEventListener('click', function () {
          if (!window.confirm('Effacer tous les avatars et toute la progression de cet appareil ? C\'est définitif sur cet appareil.')) return;
          c.S.toutEffacer().catch(function () {}).then(function () {
            brouillon = null;
            enseignant = null;
            pageNouveau = null;
            ouvert = false;
            c.reinitialiser();
            try { sessionStorage.removeItem('boomerang-acces'); } catch (e) { /* sans conséquence */ }
            location.replace('./'); // plus de code de classe : retour à la page d'accueil
          });
        });
        document.getElementById('fermer').addEventListener('click', function () {
          ouvert = false;
          location.hash = '#/';
        });
      });
    }

    // Liste « Mes paquets » : paquets publiés pour la classe, puis fichiers du site pas encore publiés.
    function remplirMesPaquets(encoreActuel) {
      const zone = document.getElementById('bloc-mes-paquets');
      if (!zone) return;
      const publies = connecte()
        ? c.SY.appeler('paquets', { classe: enseignant.classe }).then(function (r) { return r.statut === 200 ? r.corps.paquets : null; })
        : Promise.resolve([]);
      Promise.all([publies, c.chargerListeFichiers().catch(function () { return []; })]).then(function (r) {
        if (!encoreActuel() || !document.getElementById('bloc-mes-paquets')) return;
        const enLigne = r[0];
        const fichiers = r[1];
        let html = '<h2>Mes paquets</h2>';
        if (connecte()) html += '<p class="note-discrete">Paquets publiés pour la classe ' + enseignant.classe + '.</p>';
        else if (c.SY.active()) html += '<p class="note-discrete">Connecte-toi à ta classe (bloc « Classe et synchronisation ») pour voir et publier ses paquets.</p>';
        if (connecte() && enLigne === null) html += '<p>Paquets de la classe indisponibles sans réseau.</p>';

        const vus = {};
        let lignes = '';
        const ligne = function (titre, id, mention) {
          return '<li><span class="paquet-nom">' + echapper(titre) + ' <code>' + echapper(id) + '</code>' +
            (mention ? ' <small>(' + mention + ')</small>' : '') + '</span><span class="paquet-actions">' +
            '<a class="lien" href="#/atelier/rouvrir/' + id + '">Rouvrir</a>' +
            '<a class="lien" href="#/atelier/qr/' + id + '">QR code</a></span></li>';
        };
        (enLigne || []).forEach(function (p) {
          vus[p.id] = true;
          lignes += ligne(p.titre, p.id, '');
        });
        fichiers.forEach(function (f) {
          if (vus[f.id] || !f.paquet) return;
          lignes += ligne(f.paquet.titre, f.id, connecte() ? 'fichier du site, pas encore publié' : 'fichier du site');
        });
        zone.innerHTML = html + (lignes ? '<ul class="paquets-atelier">' + lignes + '</ul>' : '<p>Aucun paquet pour l\'instant.</p>');
      });
    }

    // ---------- Classe et synchronisation (lots 5 bis et 5 ter) ----------

    let messageClasse = '';

    function remplirBlocClasse(encoreActuel) {
      const bloc = document.getElementById('bloc-classe');
      if (!bloc) return;
      if (!c.SY.active()) {
        bloc.innerHTML = '<h2>Classe et synchronisation</h2><p>Synchronisation non configurée : l\'adresse de la fonction est vide dans synchro.js.</p>';
        return;
      }
      const refaire = function () { remplirBlocClasse(encoreActuel); remplirMesPaquets(encoreActuel); };
      const champ = function (id, libelle, type, valeur, extra) {
        return '<div><label class="champ" for="' + id + '">' + libelle + '</label>' +
          '<input id="' + id + '" class="saisie" type="' + type + '" autocomplete="off" autocapitalize="' + (type === 'password' ? 'off' : 'characters') +
          '" spellcheck="false"' + (valeur ? ' value="' + echapper(valeur) + '"' : '') + (extra || '') + '></div>';
      };
      let html = '<h2>Classe et synchronisation</h2>';
      if (enseignant) {
        html += '<p>Connecté à la classe <strong class="code-affiche">' + enseignant.classe + '</strong>.</p>' +
          '<p class="message-ok" id="message-classe" role="status">' + echapper(messageClasse) + '</p>' +
          '<button class="bouton secondaire" type="button" id="deconnexion">Se déconnecter</button>' +
          '<h3>Avatars de la classe</h3><div id="liste-classe"><p>Chargement…</p></div>';
      } else {
        html += '<p>Connecte-toi à ta classe pour publier des paquets et gérer les avatars.</p>' +
          '<div class="grille-champs deux">' +
          champ('ens-classe', 'Code de la classe', 'text', c.getClasse() || '', ' maxlength="8"') +
          champ('ens-code', 'Code enseignant', 'password', '') + '</div>' +
          '<p class="message" id="message-ens" role="alert"></p>' +
          '<button class="bouton" type="button" id="connexion">Se connecter</button>';
      }
      html += '<details class="administration"><summary>Administration : créer une classe ou définir son code enseignant</summary>' +
        '<p class="note-discrete">Il faut la clé d\'administration enregistrée dans Supabase (BOOMERANG_CLE_ENSEIGNANT). Elle n\'est jamais gardée sur l\'appareil.</p>' +
        '<div class="grille-champs deux">' +
        champ('adm-cle', 'Clé d\'administration', 'password', '') +
        champ('adm-classe', 'Code de la classe (pour définir son code)', 'text', (enseignant && enseignant.classe) || c.getClasse() || '', ' maxlength="8"') +
        champ('adm-code1', 'Nouveau code enseignant (12 caractères au moins)', 'password', '') +
        champ('adm-code2', 'Répète le code enseignant', 'password', '') + '</div>' +
        '<p class="message" id="message-adm" role="alert"></p>' +
        '<div class="boutons-ligne"><button class="bouton" type="button" id="creer-classe">Créer une nouvelle classe</button>' +
        '<button class="bouton secondaire" type="button" id="definir-code">Définir le code enseignant de cette classe</button></div></details>';
      bloc.innerHTML = html;
      messageClasse = '';

      const seConnecter = function (classe, code) {
        enseignant = { classe: classe, code: code };
        return c.S.ecrireReglage('enseignant', enseignant).then(function () { return c.setClasse(classe); });
      };

      if (enseignant) {
        document.getElementById('deconnexion').addEventListener('click', function () {
          enseignant = null;
          c.S.ecrireReglage('enseignant', null).then(refaire);
        });
        listerClasse(enseignant.classe, enseignant.code, encoreActuel, refaire);
      } else {
        document.getElementById('connexion').addEventListener('click', function () {
          const classe = c.SY.normaliserClasse(document.getElementById('ens-classe').value);
          const code = document.getElementById('ens-code').value;
          const message = document.getElementById('message-ens');
          if (!c.SY.classeValide(classe)) { message.textContent = 'Le code de la classe a 6 lettres ou chiffres.'; return; }
          if (code.length < 12) { message.textContent = 'Le code enseignant fait au moins 12 caractères.'; return; }
          message.textContent = 'Connexion…';
          c.SY.appeler('ens-connexion', { classe: classe, codeEnseignant: code }).then(function (r) {
            if (r.statut !== 200) { message.textContent = messageServeur(r); return; }
            seConnecter(classe, code).then(refaire);
          });
        });
      }

      // Administration : la clé n'est lue que le temps de l'action.
      const lireAdministration = function () {
        const message = document.getElementById('message-adm');
        const cle = document.getElementById('adm-cle').value;
        const code1 = document.getElementById('adm-code1').value;
        const code2 = document.getElementById('adm-code2').value;
        if (cle.length < 12) { message.textContent = 'La clé d\'administration fait au moins 12 caractères.'; return null; }
        if (code1.length < 12) { message.textContent = 'Le code enseignant fait au moins 12 caractères.'; return null; }
        if (code1 !== code2) { message.textContent = 'Les deux codes enseignant sont différents.'; return null; }
        return { cle: cle, code: code1, message: message };
      };
      document.getElementById('creer-classe').addEventListener('click', function () {
        const a = lireAdministration();
        if (!a) return;
        let essais = 0;
        (function essayer() {
          const classe = c.SY.nouveauCodeClasse();
          c.SY.appeler('admin-creer-classe', { classe: classe, cle: a.cle, codeEnseignant: a.code }).then(function (r) {
            if (r.statut === 409 && ++essais < 3) { essayer(); return; }
            if (r.statut !== 200) { a.message.textContent = messageServeur(r); return; }
            messageClasse = '✓ Nouvelle classe : ' + classe + '. Donne ce code aux élèves.';
            seConnecter(classe, a.code).then(refaire);
          });
        })();
      });
      document.getElementById('definir-code').addEventListener('click', function () {
        const a = lireAdministration();
        if (!a) return;
        const classe = c.SY.normaliserClasse(document.getElementById('adm-classe').value);
        if (!c.SY.classeValide(classe)) { a.message.textContent = 'Le code de la classe a 6 lettres ou chiffres.'; return; }
        c.SY.appeler('admin-code-enseignant', { classe: classe, cle: a.cle, codeEnseignant: a.code }).then(function (r) {
          if (r.statut !== 200) { a.message.textContent = messageServeur(r); return; }
          messageClasse = '✓ Code enseignant défini pour la classe ' + classe + '.';
          seConnecter(classe, a.code).then(refaire);
        });
      });
    }

    function listerClasse(classe, code, encoreActuel, refaire) {
      c.SY.appeler('ens-liste', { classe: classe, codeEnseignant: code }).then(function (r) {
        if (!encoreActuel()) return;
        const zone = document.getElementById('liste-classe');
        if (!zone) return;
        if (r.statut === 0) { zone.innerHTML = '<p>Liste indisponible sans réseau.</p>'; return; }
        if (r.statut === 404) { zone.innerHTML = '<p>Ce code de classe n\'existe plus sur le serveur (effacement du 31 août ?).</p>'; return; }
        if (r.statut !== 200) { zone.innerHTML = '<p>' + echapper(messageServeur(r)) + ' Déconnecte-toi puis reconnecte-toi.</p>'; return; }
        if (!r.corps.avatars.length) { zone.innerHTML = '<p>Aucun avatar dans cette classe pour l\'instant.</p>'; return; }
        let html = '<ul class="paquets-atelier">';
        r.corps.avatars.forEach(function (a) {
          const etat = a.bloque ? ' <small>(bloqué une heure)</small>' : (a.sansCode ? ' <small>(code à choisir)</small>' : '');
          const nom = echapper(c.nomAvatarId(a.avatar));
          html += '<li><span class="paquet-nom">' + nom + etat + '</span><span class="paquet-actions">' +
            '<button class="lien bouton-lien" type="button" data-reinit="' + a.avatar + '" aria-label="Réinitialiser le code de ' + nom + '">Réinitialiser le code</button>' +
            '<button class="lien bouton-lien" type="button" data-effacer="' + a.avatar + '" aria-label="Effacer les données de ' + nom + '">Effacer ses données</button>' +
            '</span></li>';
        });
        zone.innerHTML = html + '</ul>';

        zone.querySelectorAll('[data-reinit]').forEach(function (b) {
          b.addEventListener('click', function () {
            const id = b.dataset.reinit;
            if (!window.confirm('Réinitialiser le code de ' + c.nomAvatarId(id) + ' ? Sa progression est conservée ; il choisira un nouveau code.')) return;
            c.SY.appeler('ens-reinitialiser', { classe: classe, avatar: id, codeEnseignant: code }).then(function (rep) {
              if (rep.statut !== 200) { window.alert(messageServeur(rep)); return; }
              // Sur cet appareil aussi, l'ancien code ne doit plus ouvrir l'avatar.
              c.S.lireAvatar(id).then(function (local) {
                if (!local || local.classe !== classe) return;
                local.empreinteLocale = null;
                local.essaisFaux = 0;
                local.bloqueJusqua = null;
                return c.S.enregistrerAvatar(local);
              }).then(refaire);
            });
          });
        });
        zone.querySelectorAll('[data-effacer]').forEach(function (b) {
          b.addEventListener('click', function () {
            const id = b.dataset.effacer;
            if (!window.confirm('Effacer toutes les données de ' + c.nomAvatarId(id) + ', sur cet appareil et sur le serveur ? C\'est définitif.')) return;
            c.SY.appeler('ens-effacer', { classe: classe, avatar: id, codeEnseignant: code }).then(function (rep) {
              if (rep.statut !== 200) { window.alert(messageServeur(rep)); return; }
              c.S.lireAvatar(id).then(function (local) {
                if (local && local.classe === classe) return c.S.effacerAvatarLocal(id);
              }).then(refaire);
            });
          });
        });
      });
    }

    function blocDateTest() {
      const decalage = c.getDecalage();
      return '<section class="bloc"><h2>Date de test</h2>' +
        '<p>Date utilisée par l\'app : <strong>' + c.dateLisible(c.aujourdhui()) + '</strong><br>' +
        (decalage === 0
          ? 'C\'est la vraie date.'
          : '<span class="alerte">Vraie date + ' + decalage + (decalage > 1 ? ' jours' : ' jour') + '.</span>') +
        '</p>' +
        '<p class="note-discrete">Sert à tester la répétition espacée. Les élèves ne voient pas ce réglage : pense à revenir à la vraie date.</p>' +
        '<div class="boutons-ligne">' +
        '<button class="bouton" type="button" id="avancer">Avancer d\'un jour</button>' +
        '<button class="bouton secondaire" type="button" id="vraie-date"' + (decalage === 0 ? ' disabled' : '') + '>Revenir à la vraie date</button>' +
        '</div></section>';
    }

    function brancherDateTest(apres) {
      function changer(n) {
        c.S.ecrireReglage('decalageJours', n).then(function () { c.setDecalage(n); apres(); });
      }
      document.getElementById('avancer').addEventListener('click', function () { changer(c.getDecalage() + 1); });
      document.getElementById('vraie-date').addEventListener('click', function () { changer(0); });
    }

    // ---------- Nouveau paquet : leçon, Claude, relecture, publication (lot 5 ter) ----------

    function pageVide() {
      return { discipline: '', periode: '', niveau: '', lecon: '' };
    }

    function chargerPageNouveau() {
      if (pageNouveau) return Promise.resolve(pageNouveau);
      return c.S.lireReglage('nouveauPaquet', null).then(function (p) {
        pageNouveau = Object.assign(pageVide(), p || {});
        return pageNouveau;
      });
    }

    function sauvegarderPage() {
      clearTimeout(minuteurPage);
      minuteurPage = setTimeout(function () {
        c.S.ecrireReglage('nouveauPaquet', pageNouveau).catch(function () {});
      }, 400);
    }

    // Prompt de génération complété avec les menus et la leçon.
    function promptComplete() {
      const p = pageNouveau;
      const ligne = 'Discipline, période et niveau : ' + (p.discipline || '[à compléter]') + ', ' +
        (p.periode || '[à compléter]') + ', ' + (p.niveau || '[à compléter]');
      return PROMPT.replace(LIGNE_A_COMPLETER, ligne).replace('[coller la leçon]', p.lecon.trim());
    }

    // Profondeur d'accolades et de crochets restant ouverts à la fin du texte (hors chaînes).
    function profondeurFinale(t) {
      let profondeur = 0;
      let chaine = false;
      let echappe = false;
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (chaine) {
          if (echappe) echappe = false;
          else if (ch === '\\') echappe = true;
          else if (ch === '"') chaine = false;
          continue;
        }
        if (ch === '"') chaine = true;
        else if (ch === '{' || ch === '[') profondeur++;
        else if (ch === '}' || ch === ']') profondeur--;
      }
      return chaine ? Math.max(profondeur, 1) : profondeur;
    }

    function extraireJSON(brut) {
      const t = String(brut || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const debut = t.indexOf('{');
      if (debut === -1) {
        throw new Error('Le presse-papiers ne contient pas de paquet. Dans Claude, copie toute sa réponse, puis réessaie.');
      }
      if (profondeurFinale(t.slice(debut)) > 0) {
        throw new Error('La réponse de Claude est incomplète : le paquet s\'arrête avant la fin. ' +
          'Demande à Claude « Renvoie le paquet complet », copie sa réponse, puis réessaie.');
      }
      try {
        return JSON.parse(t.slice(debut, t.lastIndexOf('}') + 1));
      } catch (e) {
        throw new Error('La réponse de Claude n\'est pas un JSON valide. Demande-lui de renvoyer le paquet, sans texte autour. (Détail : ' + e.message + ')');
      }
    }

    function lirePressePapiers() {
      if (navigator.clipboard && navigator.clipboard.readText) return navigator.clipboard.readText();
      return Promise.reject(new Error('presse-papiers indisponible'));
    }

    function ecranNouveau(encoreActuel) {
      Promise.all([chargerPageNouveau(), chargerBrouillon(), chargerEnseignant()]).then(function () {
        if (encoreActuel()) dessinerNouveau();
      });
    }

    function dessinerNouveau(cibleFocus) {
      const p = pageNouveau;
      const scroll = window.scrollY;
      let html = c.lienRetour('#/atelier', 'Atelier') +
        '<h1>Nouveau paquet</h1>' +
        '<div class="grille-champs">' +
        '<div><label class="champ" for="n-discipline">Discipline</label><select id="n-discipline" class="select" data-menu="discipline">' + options(disciplines(), p.discipline, 'À compléter') + '</select></div>' +
        '<div><label class="champ" for="n-periode">Période</label><select id="n-periode" class="select" data-menu="periode">' + options(periodes(), p.periode, 'À compléter') + '</select></div>' +
        '<div><label class="champ" for="n-niveau">Niveau</label><select id="n-niveau" class="select" data-menu="niveau">' + options(NIVEAUX_ATELIER, p.niveau, 'À compléter') + '</select></div>' +
        '</div>' +
        '<label class="champ" for="lecon">Leçon</label>' +
        '<textarea id="lecon" class="zone-texte cadre-lecon" rows="14" placeholder="Colle ici le texte de ta leçon.">' + echapper(p.lecon) + '</textarea>' +
        '<button class="bouton" type="button" id="copier-claude">Copier pour Claude</button>' +
        '<p class="message-ok" id="message-copie" role="status"></p>' +
        '<p class="note-discrete">Dans Claude : colle, envoie, puis copie toute sa réponse.</p>' +
        '<button class="bouton" type="button" id="coller-claude">Coller la réponse de Claude</button>' +
        '<div class="message" id="message-coller" role="alert"></div>' +
        '<div id="coller-secours" hidden>' +
        '<label class="champ" for="texte-secours">Colle ici la réponse de Claude</label>' +
        '<textarea id="texte-secours" class="zone-texte" rows="8" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>' +
        '<button class="bouton secondaire" type="button" id="utiliser-secours">Utiliser ce texte</button></div>';
      if (brouillon) html += '<div id="editeur">' + htmlRelecture() + '</div>';
      c.afficher(html, 'Nouveau paquet');

      if (cibleFocus) {
        const el = document.getElementById(cibleFocus.id);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          const f = cibleFocus.selecteur ? el.querySelector(cibleFocus.selecteur) : null;
          if (f && !f.disabled) f.focus();
        }
      } else {
        window.scrollTo(0, scroll);
      }
      brancherNouveau();
      if (brouillon) { majBilan(); brancherRelecture(); }
    }

    function brancherNouveau() {
      app.querySelectorAll('[data-menu]').forEach(function (m) {
        m.addEventListener('change', function () { pageNouveau[m.dataset.menu] = m.value; sauvegarderPage(); });
      });
      const lecon = document.getElementById('lecon');
      lecon.addEventListener('input', function () { pageNouveau.lecon = lecon.value; sauvegarderPage(); });

      document.getElementById('copier-claude').addEventListener('click', function () {
        const message = document.getElementById('message-copie');
        if (!pageNouveau.lecon.trim()) { message.textContent = 'Colle d\'abord ta leçon dans le cadre.'; return; }
        copier(promptComplete(), null).then(function () {
          message.textContent = '✓ Copié. Colle dans Claude, puis envoie.';
        }, function () {
          message.textContent = 'Copie impossible sur cet appareil. Réessaie depuis Safari.';
        });
      });

      const messageColler = document.getElementById('message-coller');
      const importer = function (texteBrut) {
        let obj;
        try {
          obj = extraireJSON(texteBrut);
        } catch (err) {
          messageColler.textContent = err.message;
          return;
        }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          messageColler.textContent = 'La réponse de Claude doit contenir un paquet { … }.';
          return;
        }
        if (brouillon && !window.confirm('Remplacer le paquet en cours par cette réponse de Claude ?')) return;
        brouillon = versModele(obj, false, 'import');
        c.S.ecrireReglage('brouillonAtelier', brouillon).catch(function () {});
        dessinerNouveau({ id: 'el-meta' });
      };
      document.getElementById('coller-claude').addEventListener('click', function () {
        messageColler.textContent = '';
        lirePressePapiers().then(importer, function () {
          document.getElementById('coller-secours').hidden = false;
          messageColler.textContent = 'Le presse-papiers n\'est pas accessible : colle la réponse dans le cadre ci-dessous.';
          document.getElementById('texte-secours').focus();
        });
      });
      document.getElementById('utiliser-secours').addEventListener('click', function () {
        importer(document.getElementById('texte-secours').value);
      });
    }

    // « Rouvrir » un paquet de « Mes paquets » : il repart relu, chaque correction décoche l'élément.
    function rouvrirPaquet(id, encoreActuel) {
      c.chargerPaquet(id).then(function (r) {
        if (!encoreActuel()) return;
        if (!r.paquet) { location.replace('#/atelier'); return; }
        chargerBrouillon().then(function (b) {
          if (b && !window.confirm('Un paquet est en cours. Le remplacer par « ' + r.paquet.titre + ' » ?')) {
            location.replace('#/atelier');
            return;
          }
          brouillon = versModele(r.paquet, true, 'site');
          pageNouveau = {
            discipline: r.paquet.discipline,
            periode: r.paquet.periode,
            niveau: r.paquet.niveau === 'accompagné' ? 'accompagne' : r.paquet.niveau,
            lecon: ''
          };
          c.S.ecrireReglage('brouillonAtelier', brouillon).catch(function () {});
          c.S.ecrireReglage('nouveauPaquet', pageNouveau).catch(function () {});
          location.replace('#/atelier/nouveau');
        });
      });
    }

    // ---------- Relecture ----------

    const ICONE_CORBEILLE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
      '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function outils(groupe, i, n, nom) {
      return '<div class="outils">' +
        '<button type="button" class="outil" data-action="monter" aria-label="Monter ' + nom + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="outil" data-action="descendre" aria-label="Descendre ' + nom + '"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" class="outil corbeille" data-action="supprimer" aria-label="Supprimer ' + nom + '" title="Supprimer">' + ICONE_CORBEILLE + '</button></div>';
    }

    function caseRelu(relu, id) {
      return '<button type="button" class="bouton-relu" id="' + id + '" data-relu aria-pressed="' + (relu ? 'true' : 'false') + '">Relu</button>';
    }

    function champTexte(id, libelle, valeur, champ, lignes, extra) {
      return '<label class="champ" for="' + id + '">' + libelle + '</label>' +
        (lignes
          ? '<textarea id="' + id + '" class="zone-texte" rows="' + lignes + '" data-champ="' + champ + '"' + (extra || '') + '>' + echapper(valeur) + '</textarea>'
          : '<input id="' + id + '" class="saisie" type="text" data-champ="' + champ + '" value="' + echapper(valeur) + '"' + (extra || '') + '>');
    }

    function htmlMeta(m) {
      return '<section class="element" data-groupe="meta" id="el-meta"><div class="element-tete"><h3>Informations du paquet</h3></div>' +
        champTexte('m-titre', 'Titre', m.meta.titre, 'titre') +
        '<div class="grille-champs">' +
        '<div><label class="champ" for="m-discipline">Discipline</label><select id="m-discipline" class="select" data-champ="discipline">' + options(disciplines(), m.meta.discipline, 'Choisir') + '</select></div>' +
        '<div><label class="champ" for="m-periode">Période</label><select id="m-periode" class="select" data-champ="periode">' + options(periodes(), m.meta.periode, 'Choisir') + '</select></div>' +
        '<div><label class="champ" for="m-niveau">Niveau</label><select id="m-niveau" class="select" data-champ="niveau">' + options(NIVEAUX_ATELIER, m.meta.niveau, 'Choisir') + '</select></div>' +
        '</div>' +
        champTexte('m-id', 'Identifiant (nom du fichier)', m.meta.id, 'id', 0, ' autocapitalize="off" autocorrect="off" spellcheck="false"') +
        '<button type="button" class="lien bouton-lien" data-action="proposer-id">Proposer un identifiant à partir du titre</button>' +
        '<label class="case-relu" for="m-accents"><input type="checkbox" id="m-accents" data-champ="accents"' + (m.meta.accents ? ' checked' : '') + '> Accents exigés dans les textes à trous</label>' +
        caseRelu(m.metaRelu, 'r-meta') + '</section>';
    }

    function htmlFiche(m) {
      let html = '';
      m.fiche.forEach(function (f, i) {
        html += '<section class="element" data-groupe="fiche" data-i="' + i + '" id="el-fiche-' + i + '">' +
          '<div class="element-tete"><h3>Idée ' + (i + 1) + '</h3>' + outils('fiche', i, m.fiche.length, 'l\'idée ' + (i + 1)) + '</div>' +
          champTexte('f-' + i, 'Texte (**mot** pour le gras)', f.texte, 'texte', 2) +
          '<p class="apercu">' + c.avecGras(f.texte) + '</p>' +
          caseRelu(f.relu, 'r-fiche-' + i) + '</section>';
      });
      return html;
    }

    function htmlCartes(m) {
      let html = '';
      m.cartes.forEach(function (k, i) {
        html += '<section class="element" data-groupe="cartes" data-i="' + i + '" id="el-cartes-' + i + '">' +
          '<div class="element-tete"><h3>Carte ' + (i + 1) + '</h3>' + outils('cartes', i, m.cartes.length, 'la carte ' + (i + 1)) + '</div>' +
          '<div class="grille-champs deux">' +
          '<div>' + champTexte('c-r-' + i, 'Recto', k.recto, 'recto') + '</div>' +
          '<div>' + champTexte('c-v-' + i, 'Verso', k.verso, 'verso') + '</div></div>' +
          caseRelu(k.relu, 'r-cartes-' + i) + '</section>';
      });
      return html;
    }

    function htmlQuestion(q, i, n) {
      const p = 'q' + i + '-';
      let html = '<section class="element" data-groupe="quiz" data-i="' + i + '" id="el-quiz-' + i + '">' +
        '<div class="element-tete"><h3>Question ' + (i + 1) + ' · ' + TYPES[q.type] + '</h3>' + outils('quiz', i, n, 'la question ' + (i + 1)) + '</div>';
      if (q.type === 'qcm') {
        html += champTexte(p + 'question', 'Question', q.question, 'question', 2) +
          '<fieldset class="choix-atelier"><legend class="champ">Choix (coche la bonne réponse)</legend>';
        q.choix.forEach(function (ch, k) {
          html += '<div class="ligne-choix"><label class="zone-radio" for="' + p + 'bonne-' + k + '">' +
            '<input type="radio" name="' + p + 'bonne" id="' + p + 'bonne-' + k + '" data-champ="bonne" value="' + k + '"' + (q.reponse === k ? ' checked' : '') + '>' +
            '<span class="sr">Bonne réponse : choix ' + (k + 1) + '</span></label>' +
            '<input class="saisie" type="text" data-champ="choix" data-k="' + k + '" aria-label="Choix ' + (k + 1) + '" value="' + echapper(ch) + '"></div>';
        });
        html += '</fieldset>';
      } else if (q.type === 'vraifaux') {
        html += champTexte(p + 'question', 'Affirmation', q.question, 'question', 2) +
          '<fieldset class="choix-atelier"><legend class="champ">Réponse</legend><div class="ligne-choix">' +
          '<label class="case-relu" for="' + p + 'vrai"><input type="radio" name="' + p + 'vf" id="' + p + 'vrai" data-champ="vf" value="true"' + (q.reponse ? ' checked' : '') + '> Vrai</label>' +
          '<label class="case-relu" for="' + p + 'faux"><input type="radio" name="' + p + 'vf" id="' + p + 'faux" data-champ="vf" value="false"' + (!q.reponse ? ' checked' : '') + '> Faux</label>' +
          '</div></fieldset>';
      } else if (q.type === 'trous') {
        html += champTexte(p + 'texte', 'Phrase (mets ___ à la place du mot)', q.texte, 'texte', 2) +
          champTexte(p + 'reponse', 'Mot attendu', q.reponse, 'reponse');
      } else {
        html += champTexte(p + 'question', 'Consigne', q.question, 'question', 2) +
          champTexte(p + 'elements', 'Éléments dans le bon ordre (un par ligne)', q.elements.join('\n'), 'elements', 4);
      }
      html += champTexte(p + 'explication', 'Explication', q.explication, 'explication', 2) +
        caseRelu(q.relu, 'r-quiz-' + i) + '</section>';
      return html;
    }

    function htmlRelecture() {
      const m = brouillon;
      let quiz = '';
      m.quiz.forEach(function (q, i) { quiz += htmlQuestion(q, i, m.quiz.length); });
      return '<h2 class="titre-groupe">Relecture</h2>' +
        '<p>Relis chaque élément, corrige-le sur place si besoin, puis touche « Relu ». Modifier un élément enlève son « Relu ».</p>' +
        (m.ignores && m.ignores.length ? '<p class="alerte-discrete">Champs ignorés : ' + m.ignores.map(echapper).join(', ') + '.</p>' : '') +
        htmlMeta(m) +
        '<h2 class="titre-groupe">Fiche (' + m.fiche.length + ' idées, 5 à 8)</h2>' + htmlFiche(m) +
        '<button type="button" class="bouton secondaire" data-action="ajouter-fiche">Ajouter une idée</button>' +
        '<h2 class="titre-groupe">Cartes (' + m.cartes.length + ')</h2>' + htmlCartes(m) +
        '<button type="button" class="bouton secondaire" data-action="ajouter-carte">Ajouter une carte</button>' +
        '<h2 class="titre-groupe">Quiz (' + m.quiz.length + ' questions)</h2>' + quiz +
        '<div class="ajout-question"><label class="champ" for="type-ajout">Type de la nouvelle question</label>' +
        '<select id="type-ajout" class="select">' + options(TYPES, 'qcm') + '</select>' +
        '<button type="button" class="bouton secondaire" data-action="ajouter-question">Ajouter une question</button></div>' +
        '<div class="bilan-relecture" id="bilan-relecture"></div>';
    }

    function erreursActuelles() {
      return c.V.validerPaquet(versPaquet(brouillon), brouillon.meta.id);
    }

    function majBilan() {
      const zone = document.getElementById('bilan-relecture');
      if (!zone) return;
      const n = compter(brouillon);
      const erreurs = erreursActuelles();
      const pret = n.relus === n.total && erreurs.length === 0;
      let html = '<p><strong>' + n.relus + '</strong> élément' + (n.relus > 1 ? 's' : '') + ' relu' + (n.relus > 1 ? 's' : '') +
        ' sur <strong>' + n.total + '</strong>' + (erreurs.length ? ' · ' + erreurs.length + ' problème' + (erreurs.length > 1 ? 's' : '') + ' à corriger' : '') + '</p>';
      if (erreurs.length) {
        html += '<details><summary>Voir les problèmes</summary><ul>';
        erreurs.forEach(function (e) { html += '<li>' + echapper(e) + '</li>'; });
        html += '</ul></details>';
      }
      if (c.SY.active()) {
        const peut = pret && connecte();
        html += '<button class="bouton" type="button" data-action="publier"' + (peut ? '' : ' disabled') + '>Publier</button>';
        if (!pret) html += '<p class="note-discrete">« Publier » s\'active quand tout est relu et correct.</p>';
        else if (!connecte()) html += '<p class="note-discrete">Pour publier, connecte-toi à ta classe dans l\'atelier (bloc « Classe et synchronisation »).</p>';
        else html += '<p class="note-discrete">Le paquet sera publié pour la classe ' + enseignant.classe + '.</p>';
        html += '<p class="message" id="message-publier" role="alert"></p>';
      } else {
        html += '<button class="bouton" type="button" data-action="exporter"' + (pret ? '' : ' disabled') + '>' +
          (pret ? 'Exporter le paquet' : 'Exporter (tout doit être relu et correct)') + '</button>';
      }
      zone.innerHTML = html;
    }

    function elementDe(section) {
      const groupe = section.dataset.groupe;
      if (groupe === 'meta') return null;
      return brouillon[groupe][Number(section.dataset.i)];
    }

    function decocher(section) {
      const e = elementDe(section);
      if (section.dataset.groupe === 'meta') brouillon.metaRelu = false;
      else if (e) e.relu = false;
      const relu = section.querySelector('[data-relu]');
      if (relu) relu.setAttribute('aria-pressed', 'false');
    }

    function brancherRelecture() {
      const editeur = document.getElementById('editeur');

      editeur.addEventListener('input', function (ev) { saisie(ev.target); });
      editeur.addEventListener('change', function (ev) {
        const t = ev.target;
        if (t.matches('select, input[type="radio"], input[type="checkbox"]')) saisie(t);
      });

      function saisie(t) {
        const champ = t.dataset.champ;
        const section = t.closest('.element');
        if (!champ || !section) return;
        if (section.dataset.groupe === 'meta') {
          brouillon.meta[champ] = champ === 'accents' ? t.checked : t.value;
        } else {
          const e = elementDe(section);
          if (champ === 'choix') e.choix[Number(t.dataset.k)] = t.value;
          else if (champ === 'bonne') e.reponse = Number(t.value);
          else if (champ === 'vf') e.reponse = t.value === 'true';
          else if (champ === 'elements') e.elements = t.value.split('\n');
          else e[champ] = t.value;
          if (champ === 'texte' && section.dataset.groupe === 'fiche') {
            section.querySelector('.apercu').innerHTML = c.avecGras(t.value);
          }
        }
        decocher(section);
        majBilan();
        sauvegarder();
      }

      editeur.addEventListener('click', function (ev) {
        const relu = ev.target.closest('[data-relu]');
        if (relu) {
          const sec = relu.closest('.element');
          const etat = relu.getAttribute('aria-pressed') !== 'true';
          relu.setAttribute('aria-pressed', String(etat));
          if (sec.dataset.groupe === 'meta') brouillon.metaRelu = etat;
          else elementDe(sec).relu = etat;
          majBilan();
          sauvegarder();
          return;
        }
        const b = ev.target.closest('[data-action]');
        if (!b || b.disabled) return;
        const action = b.dataset.action;
        const section = b.closest('.element');
        const groupe = section ? section.dataset.groupe : null;
        const i = section ? Number(section.dataset.i) : -1;
        const liste = groupe && groupe !== 'meta' ? brouillon[groupe] : null;

        if (action === 'monter' || action === 'descendre') {
          const j = action === 'monter' ? i - 1 : i + 1;
          const tmp = liste[i]; liste[i] = liste[j]; liste[j] = tmp;
          sauvegarder();
          dessinerNouveau({ id: 'el-' + groupe + '-' + j, selecteur: '[data-action="' + action + '"]' });
        } else if (action === 'supprimer') {
          if (!window.confirm('Supprimer cet élément ?')) return;
          liste.splice(i, 1);
          sauvegarder();
          dessinerNouveau({ id: 'el-' + groupe + '-' + Math.max(0, i - 1) });
        } else if (action === 'ajouter-fiche') {
          brouillon.fiche.push({ texte: '', relu: false });
          sauvegarder();
          dessinerNouveau({ id: 'el-fiche-' + (brouillon.fiche.length - 1), selecteur: 'textarea' });
        } else if (action === 'ajouter-carte') {
          brouillon.cartes.push({ recto: '', verso: '', relu: false });
          sauvegarder();
          dessinerNouveau({ id: 'el-cartes-' + (brouillon.cartes.length - 1), selecteur: 'input' });
        } else if (action === 'ajouter-question') {
          const type = document.getElementById('type-ajout').value;
          brouillon.quiz.push(versModele({ quiz: [{ type: type }] }, false).quiz[0]);
          sauvegarder();
          dessinerNouveau({ id: 'el-quiz-' + (brouillon.quiz.length - 1), selecteur: 'textarea, input[type="text"]' });
        } else if (action === 'proposer-id') {
          brouillon.meta.id = proposerId(brouillon.meta.discipline, brouillon.meta.titre);
          document.getElementById('m-id').value = brouillon.meta.id;
          decocher(section);
          majBilan();
          sauvegarder();
        } else if (action === 'exporter') {
          exporter();
        } else if (action === 'publier') {
          publier();
        }
      });
    }

    // ---------- Publication (lot 5 ter) ----------

    function publier() {
      const paquet = versPaquet(brouillon);
      if (c.V.validerPaquet(paquet, paquet.id).length || !connecte()) return;
      const message = document.getElementById('message-publier');
      message.textContent = 'Publication…';
      c.SY.appeler('ens-publier', { classe: enseignant.classe, codeEnseignant: enseignant.code, paquet: paquet }).then(function (r) {
        if (r.statut !== 200) { message.textContent = messageServeur(r); return; }
        // Le paquet est aussitôt disponible sur cet appareil, y compris hors ligne.
        return c.enregistrerPaquetClasse(enseignant.classe, paquet).catch(function () {}).then(function () {
          dernierePublication = { id: paquet.id, classe: enseignant.classe };
          return abandonnerBrouillon();
        }).then(function () {
          pageNouveau = pageVide();
          c.S.ecrireReglage('nouveauPaquet', pageNouveau).catch(function () {});
          location.hash = '#/atelier/qr/' + paquet.id;
        });
      });
    }

    // ---------- Export (sans synchronisation) ----------

    function exporter() {
      const paquet = versPaquet(brouillon);
      if (c.V.validerPaquet(paquet, paquet.id).length) return;
      const json = JSON.stringify(paquet, null, 2) + '\n';
      telecharger(paquet.id + '.json', json);
      fetch('paquets/index.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (index) {
          let nouvelIndex = null;
          if (index && Array.isArray(index.paquets) && index.paquets.indexOf(paquet.id) === -1) {
            nouvelIndex = JSON.stringify({ version: 1, paquets: index.paquets.concat([paquet.id]) }, null, 2) + '\n';
          }
          dernierExport = { id: paquet.id, titre: paquet.titre, json: json, index: nouvelIndex, indexInconnu: !index };
          location.hash = '#/atelier/export';
        });
    }

    function ecranExport() {
      if (!dernierExport) { location.replace('#/atelier'); return; }
      const e = dernierExport;
      const fichier = '<code>' + echapper(e.id) + '.json</code>';
      c.afficher(
        c.lienRetour('#/atelier', 'Atelier') +
        '<h1>Paquet exporté</h1>' +
        '<p>Le fichier ' + fichier + ' est dans tes téléchargements.</p>' +
        '<div class="boutons-ligne">' +
        '<button class="bouton secondaire" type="button" id="re-telecharger">Télécharger à nouveau ' + echapper(e.id) + '.json</button>' +
        '<button class="bouton secondaire" type="button" id="copier-json">Copier le JSON</button></div>' +
        (e.index
          ? '<p class="alerte-discrete">Nouveau paquet : la liste des paquets change aussi.</p>' +
            '<button class="bouton secondaire" type="button" id="telecharger-index">Télécharger index.json</button>'
          : '') +
        '<textarea id="json-export" class="zone-texte cache" readonly>' + echapper(e.json) + '</textarea>' +
        '<h2>Mettre le paquet en ligne</h2><ol class="etapes-export">' +
        '<li>Dépose ' + fichier + ' dans le dossier <code>paquets/</code> du dépôt ' +
        '(Documents › GitHub › revision-cm2 › paquets). Remplace l\'ancien fichier s\'il existe.' +
        (e.index ? ' Remplace aussi <code>paquets/index.json</code> par le fichier <code>index.json</code> téléchargé (renomme-le s\'il s\'appelle index-1.json).' : '') +
        (e.indexInconnu ? ' Vérifie que ' + echapper(e.id) + ' figure dans <code>paquets/index.json</code>, sinon ajoute-le.' : '') +
        '</li>' +
        '<li>Dans GitHub Desktop : écris un résumé, par exemple « Paquet ' + echapper(e.titre) + ' », clique sur <strong>Commit to main</strong>, puis sur <strong>Push origin</strong>.</li>' +
        '<li>Sur github.com, ouvre le dépôt et attends la <strong>coche verte</strong> à côté du dernier commit (1 à 2 minutes). Le paquet est alors en ligne.</li>' +
        '<li>Imprime le QR code pour les élèves.</li></ol>' +
        '<a class="bouton" href="#/atelier/qr/' + e.id + '">QR code à imprimer</a>' +
        '<a class="bouton secondaire" href="#/atelier/nouveau">Revenir à la relecture</a>',
        'Paquet exporté'
      );
      document.getElementById('re-telecharger').addEventListener('click', function () { telecharger(e.id + '.json', e.json); });
      document.getElementById('copier-json').addEventListener('click', function (ev) {
        copier(e.json, document.getElementById('json-export')).then(function () {
          ev.target.textContent = '✓ JSON copié';
        });
      });
      const idx = document.getElementById('telecharger-index');
      if (idx) idx.addEventListener('click', function () { telecharger('index.json', e.index); });
    }

    // ---------- QR code ----------

    function ecranQR(id, encoreActuel) {
      if (!c.V.ID_VALIDE.test(id)) { location.replace('#/atelier'); return; }
      const url = lienCourt(id);
      c.chargerPaquet(id).then(function (r) {
        if (!encoreActuel()) return;
        let titre = r.paquet ? r.paquet.titre : (brouillon && brouillon.meta.id === id ? brouillon.meta.titre : id);
        let sousTitre = '';
        if (r.paquet) {
          sousTitre = c.DISCIPLINES[r.paquet.discipline].nom + ' · Période ' + r.paquet.periode.slice(1);
        } else if (brouillon && brouillon.meta.id === id && c.DISCIPLINES[brouillon.meta.discipline]) {
          sousTitre = c.DISCIPLINES[brouillon.meta.discipline].nom + ' · Période ' + brouillon.meta.periode.slice(1);
        }
        const grand = racine.QRCode.svg(url, { niveau: 'M', couleur: '#000000', classe: 'qr-grand', libelle: 'QR code du paquet ' + echapper(titre) });
        const petit = racine.QRCode.svg(url, { niveau: 'M', couleur: '#000000', classe: 'qr-petit' });
        let planche = '';
        for (let k = 0; k < 12; k++) {
          planche += '<div class="etiquette-qr">' + petit + '<p>' + echapper(titre) + '</p></div>';
        }
        c.afficher(
          '<div class="ecran-seul">' + c.lienRetour('#/atelier', 'Atelier') +
          '<h1>QR code</h1>' +
          (dernierePublication && dernierePublication.id === id
            ? '<p class="message-ok">✓ Paquet publié pour la classe ' + dernierePublication.classe + '. Les élèves le voient dans « Mes paquets ».</p>' : '') +
          (r.paquet ? '' : '<p class="alerte-discrete">Ce paquet n\'est pas encore en ligne : le QR code fonctionnera après le push et la coche verte.</p>') +
          '<p>Lien : <code class="lien-court">' + echapper(url) + '</code></p>' +
          '<div class="options"><button class="option" type="button" data-mode="affiche" aria-pressed="true">Affiche</button>' +
          '<button class="option" type="button" data-mode="planche" aria-pressed="false">Planche de 12 étiquettes</button></div>' +
          '<div class="boutons-ligne"><button class="bouton" type="button" id="imprimer">Imprimer</button>' +
          '<button class="bouton secondaire" type="button" id="copier-lien">Copier le lien</button></div>' +
          '<textarea id="lien-texte" class="zone-texte cache" readonly>' + echapper(url) + '</textarea></div>' +
          '<div class="impression" data-mode="affiche">' +
          '<div class="affiche"><p class="affiche-titre">' + echapper(titre) + '</p>' +
          (sousTitre ? '<p class="affiche-sous-titre">' + echapper(sousTitre) + '</p>' : '') +
          grand +
          '<p class="affiche-consigne">Scanne avec l\'appareil photo de la tablette.</p>' +
          '<p class="affiche-lien">' + echapper(url) + '</p></div>' +
          '<div class="planche">' + planche + '</div></div>',
          'QR code'
        );
        const zone = app.querySelector('.impression');
        app.querySelectorAll('[data-mode]').forEach(function (b) {
          if (b === zone) return;
          b.addEventListener('click', function () {
            zone.dataset.mode = b.dataset.mode;
            app.querySelectorAll('button[data-mode]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
          });
        });
        document.getElementById('imprimer').addEventListener('click', function () { window.print(); });
        document.getElementById('copier-lien').addEventListener('click', function (ev) {
          copier(url, document.getElementById('lien-texte')).then(function () { ev.target.textContent = '✓ Lien copié'; });
        });
      });
    }

    // ---------- Aiguillage ----------

    function router(parties, encoreActuel) {
      if (!c.stockageOk()) {
        c.afficher(c.lienRetour('#/', 'Quitter') + '<h1>Atelier enseignant</h1><p>Le stockage de cet appareil est indisponible.</p>', 'Atelier');
        return;
      }
      if (!ouvert) {
        ecranCode(function () { router(parties, encoreActuel); }, encoreActuel);
        return;
      }
      const ecran = parties[0] || '';
      if (ecran === 'nouveau' || ecran === 'relecture' || ecran === 'prompt' || ecran === 'import') ecranNouveau(encoreActuel);
      else if (ecran === 'export') ecranExport();
      else if ((ecran === 'rouvrir' || ecran === 'modifier') && parties[1]) rouvrirPaquet(decodeURIComponent(parties[1]), encoreActuel);
      else if (ecran === 'qr' && parties[1]) ecranQR(decodeURIComponent(parties[1]), encoreActuel);
      else ecranAccueil(encoreActuel);
    }

    return {
      router: router,
      // Exposés pour les tests
      versModele: versModele,
      versPaquet: versPaquet,
      extraireJSON: extraireJSON,
      proposerId: proposerId,
      profondeurFinale: profondeurFinale
    };
  }

  racine.Atelier = { installer: installer, PROMPT: PROMPT };
})(this);
