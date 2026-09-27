/*
 * Lecture à voix haute (section 8 du cahier des charges).
 * - Web Speech API, voix françaises de l'appareil uniquement (localService) : aucun envoi réseau.
 * - La lecture ne démarre que sur un appui de l'élève : lire() n'est appelé que depuis un bouton.
 */
(function (racine) {
  'use strict';

  const synth = racine.speechSynthesis || null;
  let reglages = { voix: null, vitesse: 'normale' };

  // Voix françaises installées sur l'appareil (les voix « en ligne » de certains navigateurs sont exclues).
  function voixFrancaises() {
    if (!synth) return [];
    return synth.getVoices().filter(function (v) {
      return /^fr([-_]|$)/i.test(v.lang) && v.localService !== false;
    });
  }

  function disponible() {
    return voixFrancaises().length > 0;
  }

  function voixChoisie() {
    const liste = voixFrancaises();
    return liste.find(function (v) { return v.voiceURI === reglages.voix; }) ||
      liste.find(function (v) { return /^fr[-_]FR/i.test(v.lang); }) ||
      liste[0] || null;
  }

  // Retire ce qui ne doit pas être prononcé : gras, symboles, trous.
  function pourLaVoix(texte) {
    return String(texte)
      .replace(/\*\*|\*/g, '')
      .replace(/_{3,}/g, ' mot qui manque ')
      .replace(/→/g, ', ')
      .replace(/[✓✗≈＋←]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,;])(?:\s*[,;])+/g, '$1')
      .trim();
  }

  function lire(texte) {
    if (!synth) return;
    const voix = voixChoisie();
    if (!voix) return;
    synth.cancel();
    const enonce = new SpeechSynthesisUtterance(pourLaVoix(texte));
    enonce.voice = voix;
    enonce.lang = voix.lang;
    enonce.rate = reglages.vitesse === 'lente' ? 0.75 : 1;
    synth.speak(enonce);
  }

  function arreter() {
    if (synth) synth.cancel();
  }

  function regler(r) {
    reglages = { voix: r.voix || null, vitesse: r.vitesse || 'normale' };
  }

  // Les voix arrivent parfois après le chargement de la page.
  function quandPretes(fn) {
    if (!synth) return;
    if (synth.getVoices().length) fn();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', fn);
    else synth.onvoiceschanged = fn;
  }

  racine.Voix = {
    voixFrancaises: voixFrancaises,
    voixChoisie: voixChoisie,
    disponible: disponible,
    pourLaVoix: pourLaVoix,
    lire: lire,
    arreter: arreter,
    regler: regler,
    quandPretes: quandPretes
  };
})(this);
