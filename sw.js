'use strict';

// Service worker : met le site en cache pour qu'il fonctionne sans réseau.
// Change VERSION à chaque mise en ligne pour forcer la mise à jour du cache.
const VERSION = 'v0.0.2';
const CACHE = 'revision-cm2-' + VERSION;

// Chemins relatifs : fonctionne à la racine comme dans /revision-cm2/ sur GitHub Pages.
const FICHIERS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
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
      .then(function (cache) { return cache.addAll(FICHIERS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (noms) {
        return Promise.all(
          noms
            .filter(function (nom) { return nom.startsWith('revision-cm2-') && nom !== CACHE; })
            .map(function (nom) { return caches.delete(nom); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const requete = event.request;
  if (requete.method !== 'GET') return;

  // Règle 3 et 5 : on ne sert et on ne met en cache que le domaine du site.
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Pages : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
  if (requete.mode === 'navigate') {
    event.respondWith(
      fetch(requete)
        .then(function (reponse) {
          // Safari refuse de servir une réponse redirigée : on ne garde que les réponses directes.
          if (reponse.ok && !reponse.redirected) {
            const copie = reponse.clone();
            caches.open(CACHE).then(function (cache) { cache.put('index.html', copie); });
          }
          return reponse;
        })
        .catch(function () {
          return caches.match('index.html', { ignoreSearch: true })
            .then(function (enCache) { return enCache || caches.match('./', { ignoreSearch: true }); })
            .then(nettoyer);
        })
    );
    return;
  }

  // Autres fichiers : cache d'abord, puis réseau (et mise en cache au passage).
  event.respondWith(
    caches.match(requete).then(function (enCache) {
      if (enCache) return enCache;
      return fetch(requete).then(function (reponse) {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then(function (cache) { cache.put(requete, copie); });
        }
        return reponse;
      });
    })
  );
});
