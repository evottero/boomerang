/*
 * Moteur de révision : répétition espacée en 5 boîtes (section 7 du cahier des charges).
 * Aucune bibliothèque externe. Les jours sont des numéros de jour local (entiers).
 *
 * Boîte : 1      2      3       4       5
 * Revue : même   1 jour 3 jours 7 jours 14 jours
 *         séance
 * « Je savais »        : boîte suivante (la boîte 5 reste la boîte 5)
 * « Presque »          : reste dans sa boîte
 * « Je ne savais pas » : retour en boîte 1
 * Une carte jamais vue compte comme une carte de boîte 1.
 */
(function (racine) {
  'use strict';

  const INTERVALLES = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
  const NOTES = ['savais', 'presque', 'pas'];
  const MAX_SEANCE = 10;
  const MAX_RETARD_PRIORITAIRE = 7; // laisse au moins 3 places aux nouvelles cartes

  // Numéro du jour local : change à minuit, heure de l'appareil.
  function jourLocal(date) {
    const d = date || new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }

  // Nouvel état d'une carte après une note. etat vaut null pour une carte jamais vue.
  function noter(etat, note, jour) {
    if (NOTES.indexOf(note) === -1) throw new Error('note inconnue : ' + note);
    let boite = etat ? etat.boite : 1;
    if (note === 'savais') boite = Math.min(boite + 1, 5);
    else if (note === 'pas') boite = 1;
    return {
      boite: boite,
      echeance: jour + INTERVALLES[boite],
      vues: (etat ? etat.vues : 0) + 1,
      derniere: jour
    };
  }

  function estEnRetard(etat, jour) {
    return !!etat && etat.echeance <= jour;
  }

  // Choisit les cartes d'une séance : 10 au plus, dont au moins 3 en retard s'il y en a.
  // cles : identifiants des cartes du paquet, dans l'ordre du paquet.
  // etats : { cle: etat } pour les cartes déjà vues.
  function composerSeance(cles, etats, jour) {
    const enRetard = cles
      .filter(function (c) { return estEnRetard(etats[c], jour); })
      .sort(function (a, b) {
        return etats[a].echeance - etats[b].echeance || etats[a].boite - etats[b].boite;
      });
    const nouvelles = cles.filter(function (c) { return !etats[c]; });

    const seance = enRetard.slice(0, MAX_RETARD_PRIORITAIRE);
    nouvelles.slice(0, MAX_SEANCE - seance.length).forEach(function (c) { seance.push(c); });
    enRetard.slice(MAX_RETARD_PRIORITAIRE, MAX_RETARD_PRIORITAIRE + MAX_SEANCE - seance.length)
      .forEach(function (c) { seance.push(c); });
    return seance;
  }

  // Séance « quand même » quand rien n'est à revoir : les cartes dont l'échéance est la plus proche.
  function composerSeanceAnticipee(cles, etats) {
    return cles.slice()
      .sort(function (a, b) {
        const ea = etats[a], eb = etats[b];
        return (ea ? ea.echeance : -Infinity) - (eb ? eb.echeance : -Infinity);
      })
      .slice(0, MAX_SEANCE);
  }

  function compterEnRetard(cles, etats, jour) {
    return cles.filter(function (c) { return estEnRetard(etats[c], jour); }).length;
  }

  function compterNouvelles(cles, etats) {
    return cles.filter(function (c) { return !etats[c]; }).length;
  }

  // Identifiant stable d'une carte : son contenu. Corriger une carte remet sa progression à zéro.
  function cleCarte(carte) {
    return carte.recto + '␞' + carte.verso;
  }

  const api = {
    INTERVALLES: INTERVALLES,
    MAX_SEANCE: MAX_SEANCE,
    jourLocal: jourLocal,
    noter: noter,
    estEnRetard: estEnRetard,
    composerSeance: composerSeance,
    composerSeanceAnticipee: composerSeanceAnticipee,
    compterEnRetard: compterEnRetard,
    compterNouvelles: compterNouvelles,
    cleCarte: cleCarte
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.Moteur = api;
})(this);
