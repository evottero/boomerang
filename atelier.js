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
        return navigator.clipboard.writeText(texte).catch(function () { return copierSecours(zoneSecours); });
      }
      return copierSecours(zoneSecours);
    }

    function copierSecours(zone) {
      if (!zone) return Promise.reject(new Error('copie impossible'));
      zone.removeAttribute('readonly');
      zone.select();
      const ok = document.execCommand('copy');
      zone.setAttribute('readonly', '');
      return ok ? Promise.resolve() : Promise.reject(new Error('copie impossible'));
    }

    function lienCourt(id) {
      return location.origin + location.pathname.replace(/index\.html$/, '') + '#/p/' + id;
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

    function ecranAccueil(encoreActuel) {
      Promise.all([chargerBrouillon(), c.chargerListe().catch(function () { return null; })]).then(function (r) {
        if (!encoreActuel()) return;
        const b = r[0];
        const liste = r[1];
        let html = '<h1>Atelier enseignant</h1>' +
          '<section class="bloc"><h2>Créer un paquet</h2><ol class="etapes">' +
          '<li><a class="bouton secondaire" href="#/atelier/prompt">1. Copier le prompt</a>' +
          '<p class="note-discrete">Colle-le dans Claude, puis ta leçon à la fin.</p></li>' +
          '<li><a class="bouton" href="#/atelier/import">2. Importer la réponse de Claude</a></li></ol>';
        if (b) {
          const n = compter(b);
          html += '<div class="brouillon"><p><strong>Relecture en cours :</strong> ' + echapper(b.meta.titre || b.meta.id || 'sans titre') +
            ' — ' + n.relus + ' élément' + (n.relus > 1 ? 's' : '') + ' relu' + (n.relus > 1 ? 's' : '') + ' sur ' + n.total + '</p>' +
            '<div class="boutons-ligne"><a class="bouton" href="#/atelier/relecture">Reprendre la relecture</a>' +
            '<button class="bouton danger" type="button" id="abandonner">Abandonner</button></div></div>';
        }
        html += '</section><section class="bloc"><h2>Paquets en ligne</h2>';
        if (!liste) {
          html += '<p>Liste indisponible sans réseau.</p>';
        } else {
          html += '<ul class="paquets-atelier">';
          liste.forEach(function (p) {
            html += '<li><span class="paquet-nom">' + (p.paquet ? echapper(p.paquet.titre) : 'Paquet illisible') +
              ' <code>' + echapper(p.id) + '</code></span><span class="paquet-actions">' +
              (p.paquet ? '<a class="lien" href="#/atelier/modifier/' + p.id + '">Modifier</a>' : '') +
              '<a class="lien" href="#/atelier/qr/' + p.id + '">QR code</a></span></li>';
          });
          html += '</ul>';
        }
        html += '</section>' +
          '<section class="bloc" id="bloc-classe"><h2>Classe et synchronisation</h2><p>Chargement…</p></section>' +
          blocDateTest() +
          '<section class="bloc"><h2>Données de l\'appareil</h2>' +
          '<p>Efface de cet appareil : avatars, progression, code de l\'atelier, clé enseignant, code de classe, date de test et brouillon.</p>' +
          (c.SY.active() ? '<p class="note-discrete">La progression enregistrée sur le serveur est conservée : chaque élève la retrouve avec son code. ' +
            'Pour effacer aussi le serveur, utilise « Effacer ses données » dans la liste des avatars de la classe.</p>' : '') +
          '<button class="bouton danger" type="button" id="effacer">Effacer les données de cet appareil</button></section>' +
          '<button class="bouton secondaire" type="button" id="fermer">Fermer l\'atelier</button>';
        c.afficher(html, 'Atelier');

        const abandonner = document.getElementById('abandonner');
        if (abandonner) {
          abandonner.addEventListener('click', function () {
            if (!window.confirm('Abandonner la relecture en cours ? Les modifications seront perdues.')) return;
            abandonnerBrouillon().then(function () { ecranAccueil(encoreActuel); });
          });
        }
        brancherDateTest(function () { ecranAccueil(encoreActuel); });
        remplirBlocClasse(encoreActuel);
        document.getElementById('effacer').addEventListener('click', function () {
          if (!window.confirm('Effacer tous les avatars et toute la progression de cet appareil ? C\'est définitif sur cet appareil.')) return;
          c.S.toutEffacer().catch(function () {}).then(function () {
            brouillon = null;
            ouvert = false;
            c.reinitialiser();
            location.hash = '#/';
          });
        });
        document.getElementById('fermer').addEventListener('click', function () {
          ouvert = false;
          location.hash = '#/';
        });
      });
    }

    // ---------- Classe et synchronisation (lot 5 bis) ----------

    function remplirBlocClasse(encoreActuel) {
      const bloc = document.getElementById('bloc-classe');
      if (!bloc) return;
      if (!c.SY.active()) {
        bloc.innerHTML = '<h2>Classe et synchronisation</h2><p>Synchronisation non configurée : l\'adresse de la fonction est vide dans synchro.js.</p>';
        return;
      }
      c.S.lireReglage('cleEnseignant', null).then(function (cle) {
        if (!encoreActuel()) return;
        const classe = c.getClasse();
        let html = '<h2>Classe et synchronisation</h2>' +
          '<p>Code de la classe sur cet appareil : ' + (classe ? '<strong class="code-affiche">' + classe + '</strong>' : '<strong>aucun</strong>') + '</p>';
        if (!cle) {
          html += '<p>Pour gérer la classe, tape la clé enseignant définie dans Supabase.</p>' +
            '<label class="champ" for="cle-ens">Clé enseignant</label>' +
            '<input id="cle-ens" class="saisie" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">' +
            '<p class="message" id="message-cle" role="alert"></p>' +
            '<button class="bouton" type="button" id="enregistrer-cle">Enregistrer la clé</button>';
        } else {
          html += '<div class="boutons-ligne">' +
            '<button class="bouton" type="button" id="nouvelle-classe">Créer une nouvelle classe</button>' +
            '<button class="bouton secondaire" type="button" id="autre-classe">Utiliser un autre code de classe</button></div>' +
            '<p class="message-ok" id="message-classe" role="status"></p>' +
            '<h3>Avatars de la classe</h3><div id="liste-classe"><p>' + (classe ? 'Chargement…' : 'Aucune classe sur cet appareil.') + '</p></div>' +
            '<button class="lien bouton-lien" type="button" id="oublier-cle">Oublier la clé enseignant sur cet appareil</button>';
        }
        bloc.innerHTML = html;
        const refaire = function () { remplirBlocClasse(encoreActuel); };

        if (!cle) {
          document.getElementById('enregistrer-cle').addEventListener('click', function () {
            const valeur = document.getElementById('cle-ens').value.trim();
            const message = document.getElementById('message-cle');
            if (valeur.length < 12) { message.textContent = 'La clé fait au moins 12 caractères.'; return; }
            const verification = classe
              ? c.SY.appeler('admin-liste', { classe: classe, cle: valeur })
              : Promise.resolve({ statut: 200 });
            verification.then(function (r) {
              if (r.statut === 403) { message.textContent = 'Clé enseignant refusée.'; return; }
              if (r.statut === 0) { message.textContent = 'Connecte-toi à Internet, puis réessaie.'; return; }
              c.S.ecrireReglage('cleEnseignant', valeur).then(refaire);
            });
          });
          return;
        }

        const messageClasse = document.getElementById('message-classe');
        document.getElementById('nouvelle-classe').addEventListener('click', function () {
          if (!window.confirm('Créer une nouvelle classe ? Cet appareil passera sur le nouveau code.')) return;
          let essais = 0;
          (function essayer() {
            const code = c.SY.nouveauCodeClasse();
            c.SY.appeler('admin-creer-classe', { classe: code, cle: cle }).then(function (r) {
              if (r.statut === 409 && ++essais < 3) { essayer(); return; }
              if (r.statut === 200) {
                c.setClasse(code).then(function () {
                  refaire();
                  setTimeout(function () {
                    const m = document.getElementById('message-classe');
                    if (m) m.textContent = '✓ Nouvelle classe : ' + code + '. Donne ce code aux élèves.';
                  }, 300);
                });
              } else {
                messageClasse.textContent = r.statut === 403 ? 'Clé enseignant refusée.' :
                  r.statut === 0 ? 'Connecte-toi à Internet, puis réessaie.' : 'Création impossible. Réessaie.';
              }
            });
          })();
        });
        document.getElementById('autre-classe').addEventListener('click', function () {
          if (!window.confirm('Oublier le code de la classe sur cet appareil ? Il sera demandé à la prochaine ouverture.')) return;
          c.oublierClasse().then(refaire);
        });
        document.getElementById('oublier-cle').addEventListener('click', function () {
          c.S.ecrireReglage('cleEnseignant', null).then(refaire);
        });
        if (classe) listerClasse(classe, cle, encoreActuel, refaire);
      });
    }

    function listerClasse(classe, cle, encoreActuel, refaire) {
      c.SY.appeler('admin-liste', { classe: classe, cle: cle }).then(function (r) {
        if (!encoreActuel()) return;
        const zone = document.getElementById('liste-classe');
        if (!zone) return;
        if (r.statut === 0) { zone.innerHTML = '<p>Liste indisponible sans réseau.</p>'; return; }
        if (r.statut === 403) { zone.innerHTML = '<p>Clé enseignant refusée. Oublie-la puis tape la bonne.</p>'; return; }
        if (r.statut === 404) { zone.innerHTML = '<p>Ce code de classe n\'existe plus sur le serveur (effacement du 31 août ?).</p>'; return; }
        if (r.statut !== 200) { zone.innerHTML = '<p>Liste indisponible.</p>'; return; }
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
            c.SY.appeler('admin-reinitialiser', { classe: classe, avatar: id, cle: cle }).then(function (rep) {
              if (rep.statut !== 200) { window.alert('Réinitialisation impossible. Vérifie la connexion.'); return; }
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
            c.SY.appeler('admin-effacer', { classe: classe, avatar: id, cle: cle }).then(function (rep) {
              if (rep.statut !== 200) { window.alert('Effacement impossible. Vérifie la connexion.'); return; }
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

    // ---------- Prompt ----------

    function ecranPrompt() {
      c.afficher(
        c.lienRetour('#/atelier', 'Atelier') +
        '<h1>Prompt de génération</h1>' +
        '<p>Choisis la discipline, la période et le niveau si tu veux les indiquer à Claude. Sinon, laisse « à compléter ».</p>' +
        '<div class="grille-champs">' +
        '<div><label class="champ" for="p-discipline">Discipline</label><select id="p-discipline" class="select">' + options(disciplines(), '', 'À compléter') + '</select></div>' +
        '<div><label class="champ" for="p-periode">Période</label><select id="p-periode" class="select">' + options(periodes(), '', 'À compléter') + '</select></div>' +
        '<div><label class="champ" for="p-niveau">Niveau</label><select id="p-niveau" class="select">' + options(NIVEAUX_ATELIER, '', 'À compléter') + '</select></div>' +
        '</div>' +
        '<label class="champ" for="prompt">Prompt</label>' +
        '<textarea id="prompt" class="zone-texte" rows="16" readonly></textarea>' +
        '<button class="bouton" type="button" id="copier">Copier le prompt</button>' +
        '<p class="message-ok" id="message" role="status"></p>' +
        '<p>Dans Claude : colle le prompt, remplace « [coller la leçon] » par ta leçon, puis envoie.</p>' +
        '<a class="bouton secondaire" href="#/atelier/import">Étape suivante : importer la réponse</a>',
        'Prompt'
      );
      const zone = document.getElementById('prompt');
      const selects = ['p-discipline', 'p-periode', 'p-niveau'].map(function (id) { return document.getElementById(id); });

      function majPrompt() {
        const valeurs = selects.map(function (s) { return s.value; });
        let ligne = LIGNE_A_COMPLETER;
        if (valeurs.some(Boolean)) {
          ligne = 'Discipline, période et niveau : ' +
            (valeurs[0] || '[à compléter]') + ', ' + (valeurs[1] || '[à compléter]') + ', ' + (valeurs[2] || '[à compléter]');
        }
        zone.value = PROMPT.replace(LIGNE_A_COMPLETER, ligne);
      }
      selects.forEach(function (s) { s.addEventListener('change', majPrompt); });
      majPrompt();

      document.getElementById('copier').addEventListener('click', function () {
        const message = document.getElementById('message');
        copier(zone.value, zone).then(function () {
          message.textContent = '✓ Prompt copié. Colle-le dans Claude.';
        }, function () {
          message.textContent = 'Copie impossible : sélectionne le texte et copie-le à la main.';
        });
      });
    }

    // ---------- Import ----------

    function extraireJSON(brut) {
      const t = String(brut).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const debut = t.indexOf('{');
      const fin = t.lastIndexOf('}');
      if (debut === -1 || fin < debut) throw new Error('Aucun objet JSON { … } trouvé dans le texte collé.');
      try {
        return JSON.parse(t.slice(debut, fin + 1));
      } catch (e) {
        throw new Error('Le JSON n\'est pas valide. Demande à Claude de le renvoyer. (Détail : ' + e.message + ')');
      }
    }

    function ecranImport() {
      c.afficher(
        c.lienRetour('#/atelier', 'Atelier') +
        '<h1>Importer la réponse de Claude</h1>' +
        '<label class="champ" for="json">Colle ici la réponse de Claude</label>' +
        '<textarea id="json" class="zone-texte" rows="14" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>' +
        '<label class="champ" for="fichier">Ou choisis un fichier .json</label>' +
        '<input id="fichier" class="fichier" type="file" accept=".json,application/json">' +
        '<div class="message" id="message" role="alert"></div>' +
        '<button class="bouton" type="button" id="importer">Importer et relire</button>',
        'Importer'
      );
      const zone = document.getElementById('json');
      const message = document.getElementById('message');

      document.getElementById('fichier').addEventListener('change', function (e) {
        const f = e.target.files[0];
        if (!f) return;
        f.text().then(function (t) { zone.value = t; });
      });

      document.getElementById('importer').addEventListener('click', function () {
        let obj;
        try {
          obj = extraireJSON(zone.value);
        } catch (err) {
          message.textContent = err.message;
          return;
        }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          message.textContent = 'Le texte doit contenir un objet { … }.';
          return;
        }
        const suite = function () {
          brouillon = versModele(obj, false, 'import');
          c.S.ecrireReglage('brouillonAtelier', brouillon).catch(function () {});
          location.hash = '#/atelier/relecture';
        };
        chargerBrouillon().then(function (b) {
          if (b && !window.confirm('Une relecture est déjà en cours. La remplacer par ce nouveau paquet ?')) return;
          suite();
        });
      });
    }

    function modifierPaquet(id, encoreActuel) {
      c.chargerPaquet(id).then(function (r) {
        if (!encoreActuel()) return;
        if (!r.paquet) { location.hash = '#/atelier'; return; }
        chargerBrouillon().then(function (b) {
          if (b && !window.confirm('Une relecture est déjà en cours. La remplacer par « ' + r.paquet.titre + ' » ?')) {
            location.hash = '#/atelier';
            return;
          }
          // Paquet déjà publié : il a été relu. Toute modification décoche l'élément concerné.
          brouillon = versModele(r.paquet, true, 'site');
          c.S.ecrireReglage('brouillonAtelier', brouillon).catch(function () {});
          location.replace('#/atelier/relecture');
        });
      });
    }

    // ---------- Relecture ----------

    function outils(groupe, i, n, nom) {
      return '<div class="outils">' +
        '<button type="button" class="outil" data-action="monter" aria-label="Monter ' + nom + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="outil" data-action="descendre" aria-label="Descendre ' + nom + '"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" class="outil" data-action="supprimer" aria-label="Supprimer ' + nom + '">Supprimer</button></div>';
    }

    function caseRelu(relu, id) {
      return '<label class="case-relu" for="' + id + '"><input type="checkbox" id="' + id + '" data-relu' + (relu ? ' checked' : '') + '> Relu</label>';
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

    function ecranRelecture(encoreActuel) {
      chargerBrouillon().then(function (b) {
        if (!encoreActuel()) return;
        if (!b) { location.replace('#/atelier'); return; }
        dessinerRelecture();
      });
    }

    function dessinerRelecture(cibleFocus) {
      const m = brouillon;
      let quiz = '';
      m.quiz.forEach(function (q, i) { quiz += htmlQuestion(q, i, m.quiz.length); });
      const scroll = window.scrollY;
      c.afficher(
        '<div id="editeur">' +
        c.lienRetour('#/atelier', 'Atelier') +
        '<h1>Relecture</h1>' +
        '<p>Relis chaque élément, corrige-le si besoin, puis coche « Relu ». Modifier un élément le décoche.</p>' +
        (m.ignores && m.ignores.length ? '<p class="alerte-discrete">Champs ignorés à l\'import : ' + m.ignores.map(echapper).join(', ') + '.</p>' : '') +
        htmlMeta(m) +
        '<h2 class="titre-groupe">Fiche (' + m.fiche.length + ' idées, 5 à 8)</h2>' + htmlFiche(m) +
        '<button type="button" class="bouton secondaire" data-action="ajouter-fiche">Ajouter une idée</button>' +
        '<h2 class="titre-groupe">Cartes (' + m.cartes.length + ')</h2>' + htmlCartes(m) +
        '<button type="button" class="bouton secondaire" data-action="ajouter-carte">Ajouter une carte</button>' +
        '<h2 class="titre-groupe">Quiz (' + m.quiz.length + ' questions)</h2>' + quiz +
        '<div class="ajout-question"><label class="champ" for="type-ajout">Type de la nouvelle question</label>' +
        '<select id="type-ajout" class="select">' + options(TYPES, 'qcm') + '</select>' +
        '<button type="button" class="bouton secondaire" data-action="ajouter-question">Ajouter une question</button></div>' +
        '<div class="bilan-relecture" id="bilan-relecture"></div>' +
        '</div>',
        'Relecture'
      );
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
      majBilan();
      brancherRelecture();
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
      html += '<button class="bouton" type="button" data-action="exporter"' + (pret ? '' : ' disabled') + '>' +
        (pret ? 'Exporter le paquet' : 'Exporter (tout doit être relu et correct)') + '</button>';
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
      const box = section.querySelector('[data-relu]');
      if (box) box.checked = false;
    }

    function brancherRelecture() {
      const editeur = document.getElementById('editeur');

      editeur.addEventListener('input', function (ev) { saisie(ev.target); });
      editeur.addEventListener('change', function (ev) {
        const t = ev.target;
        if (t.matches('[data-relu]')) {
          const section = t.closest('.element');
          if (section.dataset.groupe === 'meta') brouillon.metaRelu = t.checked;
          else elementDe(section).relu = t.checked;
          majBilan();
          sauvegarder();
        } else if (t.matches('select, input[type="radio"], input[type="checkbox"]')) {
          saisie(t);
        }
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
          dessinerRelecture({ id: 'el-' + groupe + '-' + j, selecteur: '[data-action="' + action + '"]' });
        } else if (action === 'supprimer') {
          if (!window.confirm('Supprimer cet élément ?')) return;
          liste.splice(i, 1);
          sauvegarder();
          dessinerRelecture({ id: 'el-' + groupe + '-' + Math.max(0, i - 1) });
        } else if (action === 'ajouter-fiche') {
          brouillon.fiche.push({ texte: '', relu: false });
          sauvegarder();
          dessinerRelecture({ id: 'el-fiche-' + (brouillon.fiche.length - 1), selecteur: 'textarea' });
        } else if (action === 'ajouter-carte') {
          brouillon.cartes.push({ recto: '', verso: '', relu: false });
          sauvegarder();
          dessinerRelecture({ id: 'el-cartes-' + (brouillon.cartes.length - 1), selecteur: 'input' });
        } else if (action === 'ajouter-question') {
          const type = document.getElementById('type-ajout').value;
          brouillon.quiz.push(versModele({ quiz: [{ type: type }] }, false).quiz[0]);
          sauvegarder();
          dessinerRelecture({ id: 'el-quiz-' + (brouillon.quiz.length - 1), selecteur: 'textarea, input[type="text"]' });
        } else if (action === 'proposer-id') {
          brouillon.meta.id = proposerId(brouillon.meta.discipline, brouillon.meta.titre);
          document.getElementById('m-id').value = brouillon.meta.id;
          decocher(section);
          majBilan();
          sauvegarder();
        } else if (action === 'exporter') {
          exporter();
        }
      });
    }

    // ---------- Export ----------

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
        '<a class="bouton secondaire" href="#/atelier/relecture">Revenir à la relecture</a>',
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
      if (ecran === 'prompt') ecranPrompt();
      else if (ecran === 'import') ecranImport();
      else if (ecran === 'relecture') ecranRelecture(encoreActuel);
      else if (ecran === 'export') ecranExport();
      else if (ecran === 'modifier' && parties[1]) modifierPaquet(decodeURIComponent(parties[1]), encoreActuel);
      else if (ecran === 'qr' && parties[1]) ecranQR(decodeURIComponent(parties[1]), encoreActuel);
      else ecranAccueil(encoreActuel);
    }

    return {
      router: router,
      // Exposés pour les tests
      versModele: versModele,
      versPaquet: versPaquet,
      extraireJSON: extraireJSON,
      proposerId: proposerId
    };
  }

  racine.Atelier = { installer: installer, PROMPT: PROMPT };
})(this);
