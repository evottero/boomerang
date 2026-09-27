'use strict';

// Lot 0 : enregistre le service worker et affiche l'état d'installation.
// Aucun cookie, aucune requête hors du site.

(function () {
  const etatInstallation = document.getElementById('etat-installation');
  const etatHorsLigne = document.getElementById('etat-horsligne');
  const aide = document.getElementById('aide-installation');

  const installee =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (installee) {
    etatInstallation.textContent = '✔ Application installée sur l’écran d’accueil.';
  } else {
    etatInstallation.textContent = 'Application ouverte dans le navigateur (pas encore installée).';
    aide.hidden = false;
  }

  if (!('serviceWorker' in navigator)) {
    etatHorsLigne.textContent = 'Ce navigateur ne permet pas le mode hors ligne.';
    return;
  }

  navigator.serviceWorker
    .register('sw.js', { scope: './' })
    .then(function () { return navigator.serviceWorker.ready; })
    .then(function () {
      etatHorsLigne.textContent = '✔ Mode hors ligne prêt.';
    })
    .catch(function () {
      etatHorsLigne.textContent = 'Le mode hors ligne n’a pas pu démarrer.';
    });
})();
