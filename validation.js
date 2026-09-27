/*
 * Validation des paquets de révision (section 10 du cahier des charges).
 * Un paquet non conforme est refusé, avec la liste des raisons en français.
 *
 * Format d'un paquet :
 * {
 *   "version": 1,
 *   "id": "hist-p2-revolution",        minuscules, chiffres, tirets ; identique au nom du fichier
 *   "titre": "La Révolution française",
 *   "discipline": "histoire",          voir DISCIPLINES
 *   "periode": "P2",                   P1 à P10
 *   "niveau": "standard",              accompagné, standard ou approfondi
 *   "relu": true,                      obligatoire : un paquet non relu est refusé
 *   "fiche": ["…"],                    5 à 8 idées clés ; **mot** en gras, *mot* en italique
 *   "cartes": [{ "recto": "…", "verso": "…" }],
 *   "quiz": [ … ]                      voir les 4 types ci-dessous
 * }
 *
 * Types de quiz (tous ont "explication") :
 *   qcm      "question", "choix": 3 réponses, "reponse": position de la bonne (0, 1 ou 2)
 *   vraifaux "question" (une affirmation), "reponse": true ou false
 *   trous    "texte" contenant une seule fois ___, "reponse": le mot manquant
 *   ordre    "question", "elements": 3 à 6 éléments, écrits dans le bon ordre (l'app les mélange)
 *
 * Aucun champ en dehors de cette liste n'est accepté : un paquet ne transporte
 * jamais de donnée d'élève.
 */
(function (racine) {
  'use strict';

  const TAILLE_MAX = 200000; // 200 Ko
  const MAX_ERREURS = 20;

  const DISCIPLINES = [
    'histoire', 'geographie', 'sciences', 'vocabulaire',
    'grammaire', 'conjugaison', 'calcul', 'geometrie', 'mesures'
  ];
  const PERIODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];
  const NIVEAUX = ['accompagné', 'standard', 'approfondi'];
  const TYPES_QUIZ = ['qcm', 'vraifaux', 'trous', 'ordre'];
  const ID_VALIDE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  const CHAMPS_PAQUET = ['version', 'id', 'titre', 'discipline', 'periode', 'niveau', 'relu', 'fiche', 'cartes', 'quiz'];
  const CHAMPS_CARTE = ['recto', 'verso'];
  const CHAMPS_QUIZ = {
    qcm: ['type', 'question', 'choix', 'reponse', 'explication'],
    vraifaux: ['type', 'question', 'reponse', 'explication'],
    trous: ['type', 'texte', 'reponse', 'explication'],
    ordre: ['type', 'question', 'elements', 'explication']
  };

  function estObjet(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function estTexte(v) {
    return typeof v === 'string' && v.trim() !== '';
  }

  function liste(valeurs) {
    return valeurs.join(', ');
  }

  function validerPaquet(p, idAttendu) {
    const erreurs = [];
    const err = function (message) { erreurs.push(message); };

    if (!estObjet(p)) {
      return ['Le fichier doit contenir un objet entre accolades { … }.'];
    }

    Object.keys(p).forEach(function (cle) {
      if (CHAMPS_PAQUET.indexOf(cle) === -1) err('Champ inconnu « ' + cle + ' ».');
    });

    if (p.version !== 1) err('« version » doit valoir 1.');

    if (typeof p.id !== 'string' || !ID_VALIDE.test(p.id) || p.id.length > 60) {
      err('« id » doit contenir seulement des minuscules sans accent, des chiffres et des tirets (ex. hist-p2-revolution).');
    } else if (idAttendu && p.id !== idAttendu) {
      err('« id » vaut « ' + p.id + ' » mais le fichier s\'appelle « ' + idAttendu + '.json ». Les deux doivent être identiques.');
    }

    if (!estTexte(p.titre)) err('« titre » est vide ou absent.');
    else if (p.titre.length > 80) err('« titre » est trop long (80 caractères maximum).');

    if (DISCIPLINES.indexOf(p.discipline) === -1) {
      err('« discipline » inconnue. Valeurs possibles : ' + liste(DISCIPLINES) + '.');
    }
    if (PERIODES.indexOf(p.periode) === -1) err('« periode » doit être P1 à P10.');
    if (NIVEAUX.indexOf(p.niveau) === -1) err('« niveau » doit être : ' + liste(NIVEAUX) + '.');
    if (p.relu !== true) err('Ce paquet n\'est pas marqué comme relu (« relu »: true).');

    // Fiche
    if (!Array.isArray(p.fiche)) {
      err('« fiche » doit être une liste d\'idées clés.');
    } else {
      if (p.fiche.length < 5 || p.fiche.length > 8) {
        err('La fiche doit contenir 5 à 8 idées clés (ici ' + p.fiche.length + ').');
      }
      p.fiche.forEach(function (idee, i) {
        const ou = 'Fiche, idée ' + (i + 1) + ' : ';
        if (!estTexte(idee)) err(ou + 'texte vide ou absent.');
        else if ((idee.match(/\*\*/g) || []).length % 2 !== 0) err(ou + 'un gras ** n\'est pas refermé.');
        else if ((idee.replace(/\*\*/g, '').match(/\*/g) || []).length % 2 !== 0) err(ou + 'un italique * n\'est pas refermé.');
      });
    }

    // Cartes
    if (!Array.isArray(p.cartes) || p.cartes.length === 0) {
      err('« cartes » doit être une liste d\'au moins une carte.');
    } else {
      p.cartes.forEach(function (carte, i) {
        const ou = 'Carte ' + (i + 1) + ' : ';
        if (!estObjet(carte)) { err(ou + 'doit être un objet { "recto": …, "verso": … }.'); return; }
        Object.keys(carte).forEach(function (cle) {
          if (CHAMPS_CARTE.indexOf(cle) === -1) err(ou + 'champ inconnu « ' + cle + ' ».');
        });
        if (!estTexte(carte.recto)) err(ou + '« recto » vide ou absent.');
        if (!estTexte(carte.verso)) err(ou + '« verso » vide ou absent.');
      });
    }

    // Quiz
    if (!Array.isArray(p.quiz) || p.quiz.length === 0) {
      err('« quiz » doit être une liste d\'au moins une question.');
    } else {
      p.quiz.forEach(function (q, i) {
        validerQuestion(q, 'Quiz, question ' + (i + 1) + ' : ', err);
      });
    }

    return erreurs;
  }

  function validerQuestion(q, ou, err) {
    if (!estObjet(q)) { err(ou + 'doit être un objet { … }.'); return; }
    if (TYPES_QUIZ.indexOf(q.type) === -1) {
      err(ou + '« type » doit être : ' + liste(TYPES_QUIZ) + '.');
      return;
    }
    ou = ou.replace(/ : $/, ' (' + q.type + ') : ');

    Object.keys(q).forEach(function (cle) {
      if (CHAMPS_QUIZ[q.type].indexOf(cle) === -1) err(ou + 'champ inconnu « ' + cle + ' ».');
    });
    if (q.type !== 'trous' && !estTexte(q.question)) err(ou + '« question » vide ou absente.');
    if (!estTexte(q.explication)) err(ou + '« explication » vide ou absente.');

    if (q.type === 'qcm') {
      if (!Array.isArray(q.choix) || q.choix.length !== 3 || !q.choix.every(estTexte)) {
        err(ou + '« choix » doit contenir exactement 3 réponses.');
      } else if (new Set(q.choix).size !== 3) {
        err(ou + 'deux choix sont identiques.');
      }
      if (q.reponse !== 0 && q.reponse !== 1 && q.reponse !== 2) {
        err(ou + '« reponse » doit être 0, 1 ou 2 (position de la bonne réponse, en comptant à partir de 0).');
      }
    } else if (q.type === 'vraifaux') {
      if (typeof q.reponse !== 'boolean') err(ou + '« reponse » doit être true ou false, sans guillemets.');
    } else if (q.type === 'trous') {
      if (!estTexte(q.texte)) err(ou + '« texte » vide ou absent.');
      else if (q.texte.split('___').length !== 2) err(ou + '« texte » doit contenir une seule fois ___ (trois tirets bas).');
      if (!estTexte(q.reponse)) err(ou + '« reponse » doit être le mot manquant.');
    } else if (q.type === 'ordre') {
      if (!Array.isArray(q.elements) || q.elements.length < 3 || q.elements.length > 6 || !q.elements.every(estTexte)) {
        err(ou + '« elements » doit contenir 3 à 6 éléments, dans le bon ordre.');
      } else if (new Set(q.elements).size !== q.elements.length) {
        err(ou + 'deux éléments sont identiques.');
      }
    }
  }

  // Valide le texte brut d'un fichier. Renvoie { ok, paquet, erreurs }.
  function validerTexte(texte, idAttendu) {
    if (typeof texte !== 'string' || texte.trim() === '') {
      return { ok: false, erreurs: ['Le fichier est vide.'] };
    }
    if (texte.length > TAILLE_MAX) {
      return { ok: false, erreurs: ['Le fichier est trop gros (200 Ko maximum).'] };
    }
    let paquet;
    try {
      paquet = JSON.parse(texte);
    } catch (e) {
      return {
        ok: false,
        erreurs: ['Le fichier n\'est pas un JSON valide. Vérifie les virgules, les guillemets et les accolades. (Détail : ' + e.message + ')']
      };
    }
    let erreurs = validerPaquet(paquet, idAttendu);
    if (erreurs.length > MAX_ERREURS) {
      erreurs = erreurs.slice(0, MAX_ERREURS).concat(['… et d\'autres erreurs.']);
    }
    return erreurs.length ? { ok: false, erreurs: erreurs } : { ok: true, paquet: paquet, erreurs: [] };
  }

  const api = {
    DISCIPLINES: DISCIPLINES,
    NIVEAUX: NIVEAUX,
    ID_VALIDE: ID_VALIDE,
    validerPaquet: validerPaquet,
    validerTexte: validerTexte
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.ValidationPaquet = api;
})(this);
