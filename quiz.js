/*
 * Logique du quiz (sections 5.2 et 7 du cahier des charges), sans affichage.
 * - Correction des 4 types : qcm, vraifaux, trous, ordre.
 * - Trous : majuscules et espaces en trop ignorés ; accents selon le champ « accents ».
 * - Les questions ratées reviennent en fin de quiz, une seule fois.
 */
(function (racine) {
  'use strict';

  // Majuscules et espaces en trop ignorés. L'apostrophe courbe du clavier iPad vaut l'apostrophe droite.
  function simplifier(texte) {
    return String(texte)
      .replace(/[’‘`]/g, '\'')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Comme simplifier, sans les accents.
  function sansAccents(texte) {
    return simplifier(texte).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  }

  // Renvoie { juste, orthographe }. orthographe : juste, mais accents mal écrits.
  function corriger(question, reponse) {
    switch (question.type) {
      case 'qcm':
      case 'vraifaux':
        return { juste: reponse === question.reponse, orthographe: false };
      case 'trous': {
        // accents: true  -> l'accent est exigé.
        // accents absent ou false -> accents manquants acceptés, la bonne orthographe est affichée.
        if (typeof reponse !== 'string') return { juste: false, orthographe: false };
        const exact = simplifier(reponse).normalize('NFC') === simplifier(question.reponse).normalize('NFC');
        if (exact || question.accents === true) return { juste: exact, orthographe: false };
        const juste = sansAccents(reponse) === sansAccents(question.reponse);
        return { juste: juste, orthographe: juste };
      }
      case 'ordre': {
        const attendu = question.elements;
        const juste = Array.isArray(reponse) && reponse.length === attendu.length &&
          reponse.every(function (e, i) { return e === attendu[i]; });
        return { juste: juste, orthographe: false };
      }
      default:
        throw new Error('type inconnu : ' + question.type);
    }
  }

  // Mélange les éléments d'une question « ordre », jamais dans le bon ordre.
  function melangerOrdre(elements, aleatoire) {
    const hasard = aleatoire || Math.random;
    let l;
    let essais = 0;
    do {
      l = elements.slice();
      for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(hasard() * (i + 1));
        const t = l[i]; l[i] = l[j]; l[j] = t;
      }
      essais++;
    } while (l.every(function (e, i) { return e === elements[i]; }) && essais < 20);
    if (l.every(function (e, i) { return e === elements[i]; })) l.push(l.shift()); // hasard têtu
    return l;
  }

  // Déroulé d'un quiz de n questions (indices 0 à n-1, dans l'ordre du paquet).
  function creerDeroule(n) {
    return {
      file: Array.from({ length: n }, function (_, i) { return i; }),
      position: 0,
      remises: {},   // questions déjà remises en fin de quiz
      premier: {},   // résultat au premier essai
      dernier: {}    // résultat au dernier essai
    };
  }

  function questionCourante(d) {
    return d.file[d.position];
  }

  // Une question ratée pour la première fois revient à la fin.
  // Renvoie vrai si elle reviendra.
  function repondre(d, juste) {
    const i = d.file[d.position];
    if (!(i in d.premier)) d.premier[i] = juste;
    d.dernier[i] = juste;
    let reviendra = false;
    if (!juste && !d.remises[i]) {
      d.remises[i] = true;
      d.file.push(i);
      reviendra = true;
    }
    return reviendra;
  }

  function suivante(d) {
    d.position++;
    return d.position < d.file.length;
  }

  function bilan(d) {
    const vues = Object.keys(d.premier).map(Number);
    return {
      total: vues.length,
      reussites: vues.filter(function (i) { return d.premier[i]; }).length,
      rattrapees: vues.filter(function (i) { return !d.premier[i] && d.dernier[i]; }).length,
      aRevoir: vues.filter(function (i) { return !d.dernier[i]; })
    };
  }

  const api = {
    simplifier: simplifier,
    sansAccents: sansAccents,
    corriger: corriger,
    melangerOrdre: melangerOrdre,
    creerDeroule: creerDeroule,
    questionCourante: questionCourante,
    repondre: repondre,
    suivante: suivante,
    bilan: bilan
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.Quiz = api;
})(this);
