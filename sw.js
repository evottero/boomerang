'use strict';

// Service worker : fait fonctionner le site sans réseau.
// Avec le réseau, l'app prend toujours la dernière version en ligne ;
// le cache ne sert que hors ligne ou si le réseau est trop lent.
// Change VERSION à chaque mise en ligne pour renouveler la copie hors ligne.
const VERSION = 'v0.8.2';
const CACHE = 'revision-cm2-' + VERSION;
// Les paquets ouverts ont leur propre cache, conservé d'une version à l'autre.
const CACHE_PAQUETS = 'revision-cm2-paquets';
const DELAI_RESEAU = 4000; // au-delà, on sert la copie en cache

// Chemins relatifs : fonctionne à la racine du domaine (boomerang.tableautablettes.fr) comme dans un sous-dossier.
const FICHIERS = [
  './',
  'index.html',
  'app.html',
  'accueil.js',
  'accueil.css',
  'confidentialite.html',
  'mentions-legales.html',
  'icons/logo-icare.png',
  'icons/boomerang.png',
  'styles.css',
  'validation.js',
  'moteur.js',
  'stockage.js',
  'quiz.js',
  'voix.js',
  'qrcode.js',
  'synchro.js',
  'atelier.js',
  'app.js',
  'manifest.webmanifest',
  'polices/Luciole-Regular.woff2',
  'polices/Luciole-Bold.woff2',
  'polices/Luciole-Italic.woff2',
  'polices/Luciole-BoldItalic.woff2',
  'polices/Lexend-Regular.woff2',
  'polices/Lexend-Bold.woff2',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

// Recopie une réponse marquée « redirigée » pour que Safari accepte de l'afficher.
function nettoyer(reponse) {
  if (!reponse || !reponse.redirected) return reponse;
  return reponse.blob().then(function (corps) {
    return new Response(corps, { status: 200, headers: reponse.headers });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        // cache: 'reload' évite de reprendre une ancienne copie du cache HTTP.
        return cache.addAll(FICHIERS.map(function (f) { return new Request(f, { cache: 'reload' }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (noms) {
        return Promise.all(
          noms
            .filter(function (nom) {
              return nom.startsWith('revision-cm2-') && nom !== CACHE && nom !== CACHE_PAQUETS;
            })
            .map(function (nom) { return caches.delete(nom); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Réseau d'abord : la version en ligne si elle arrive à temps, sinon la copie en cache.
// cle : l'entrée du cache à lire et à mettre à jour. page : vrai pour la page HTML.
function reseauDabord(url, nomCache, cle, page) {
  return caches.open(nomCache).then(function (cache) {
    return new Promise(function (resoudre, rejeter) {
      let fini = false;
      function servir(reponse) {
        if (!fini) { fini = true; resoudre(reponse); }
      }
      function copie() {
        return cache.match(cle, { ignoreSearch: true }).then(nettoyer);
      }

      const minuteur = setTimeout(function () {
        copie().then(function (c) { if (c) servir(c); });
      }, DELAI_RESEAU);

      // no-cache : revalide auprès du serveur au lieu de reprendre le cache HTTP (10 min sur GitHub Pages).
      fetch(url, { cache: 'no-cache' })
        .then(function (reponse) {
          clearTimeout(minuteur);
          if (reponse.ok && !reponse.redirected) cache.put(cle, reponse.clone());
          else if (reponse.status === 404 && !page) cache.delete(cle);
          servir(page ? nettoyer(reponse) : reponse);
        })
        .catch(function () {
          clearTimeout(minuteur);
          copie().then(function (c) {
            if (c) servir(c);
            else if (!fini) { fini = true; rejeter(new Error('hors ligne')); }
          });
        });
    });
  });
}

self.addEventListener('fetch', function (event) {
  const requete = event.request;
  if (requete.method !== 'GET') return;

  // Règles 3 et 5 : on ne sert et on ne met en cache que le domaine du site.
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (requete.mode === 'navigate') {
    // Chaque page (accueil, app, mentions…) est gardée sous sa propre adresse, sans paramètres.
    event.respondWith(reseauDabord(requete.url, CACHE, url.origin + url.pathname, true));
  } else if (url.pathname.indexOf('/paquets/') !== -1 && url.pathname.endsWith('.json')) {
    event.respondWith(reseauDabord(requete.url, CACHE_PAQUETS, requete.url, false));
  } else {
    event.respondWith(reseauDabord(requete.url, CACHE, requete.url, false));
  }
});
