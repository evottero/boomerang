/*
 * Stockage local IndexedDB (règle 2 : rien ne quitte l'appareil).
 *
 * avatars  : { id: 'renard-bleu', animal, couleur, cree, seances }
 * cartes   : { avatar, paquet, cle, boite, echeance, vues, derniere }  clé [avatar, paquet, cle]
 * reglages : { cle, valeur }  (code de l'atelier, décalage de date de test)
 */
(function (racine) {
  'use strict';

  const NOM = 'revision-cm2';
  const VERSION_BASE = 1;
  let connexion = null;

  function requete(req) {
    return new Promise(function (resoudre, rejeter) {
      req.onsuccess = function () { resoudre(req.result); };
      req.onerror = function () { rejeter(req.error); };
    });
  }

  function ouvrir() {
    if (connexion) return Promise.resolve(connexion);
    if (!('indexedDB' in racine)) return Promise.reject(new Error('IndexedDB indisponible'));
    return new Promise(function (resoudre, rejeter) {
      const req = indexedDB.open(NOM, VERSION_BASE);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains('avatars')) db.createObjectStore('avatars', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('cartes')) {
          const cartes = db.createObjectStore('cartes', { keyPath: ['avatar', 'paquet', 'cle'] });
          cartes.createIndex('avatar_paquet', ['avatar', 'paquet']);
          cartes.createIndex('avatar', 'avatar');
        }
        if (!db.objectStoreNames.contains('reglages')) db.createObjectStore('reglages', { keyPath: 'cle' });
      };
      req.onsuccess = function () {
        connexion = req.result;
        // Une autre fenêtre demande l'effacement : on libère la base.
        connexion.onversionchange = function () { connexion.close(); connexion = null; };
        resoudre(connexion);
      };
      req.onerror = function () { rejeter(req.error); };
      req.onblocked = function () { rejeter(new Error('base bloquée')); };
    });
  }

  // Exécute fn(magasins) dans une transaction et attend sa fin.
  function transaction(noms, mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (resoudre, rejeter) {
        const tx = db.transaction(noms, mode);
        const magasins = {};
        noms.forEach(function (n) { magasins[n] = tx.objectStore(n); });
        let resultat;
        Promise.resolve(fn(magasins)).then(function (r) { resultat = r; }, rejeter);
        tx.oncomplete = function () { resoudre(resultat); };
        tx.onerror = function () { rejeter(tx.error); };
        tx.onabort = function () { rejeter(tx.error); };
      });
    });
  }

  // ---------- Avatars ----------

  function listerAvatars() {
    return transaction(['avatars'], 'readonly', function (m) {
      return requete(m.avatars.getAll());
    }).then(function (liste) {
      return liste.sort(function (a, b) { return a.cree - b.cree; });
    });
  }

  function lireAvatar(id) {
    return transaction(['avatars'], 'readonly', function (m) {
      return requete(m.avatars.get(id));
    });
  }

  function ajouterAvatar(avatar) {
    return transaction(['avatars'], 'readwrite', function (m) {
      return requete(m.avatars.add(avatar));
    });
  }

  function compterSeance(id) {
    return transaction(['avatars'], 'readwrite', function (m) {
      return requete(m.avatars.get(id)).then(function (a) {
        if (!a) return 0;
        a.seances = (a.seances || 0) + 1;
        return requete(m.avatars.put(a)).then(function () { return a.seances; });
      });
    });
  }

  // ---------- Cartes ----------

  // Renvoie { cle: etat } pour un avatar et un paquet.
  function etatsCartes(avatar, paquet) {
    return transaction(['cartes'], 'readonly', function (m) {
      return requete(m.cartes.index('avatar_paquet').getAll([avatar, paquet]));
    }).then(function (liste) {
      const etats = {};
      liste.forEach(function (e) { etats[e.cle] = e; });
      return etats;
    });
  }

  function enregistrerCarte(avatar, paquet, cle, etat) {
    const rec = { avatar: avatar, paquet: paquet, cle: cle, boite: etat.boite, echeance: etat.echeance, vues: etat.vues, derniere: etat.derniere };
    return transaction(['cartes'], 'readwrite', function (m) {
      return requete(m.cartes.put(rec));
    });
  }

  // ---------- Réglages ----------

  function lireReglage(cle, parDefaut) {
    return transaction(['reglages'], 'readonly', function (m) {
      return requete(m.reglages.get(cle));
    }).then(function (r) { return r ? r.valeur : parDefaut; });
  }

  function ecrireReglage(cle, valeur) {
    return transaction(['reglages'], 'readwrite', function (m) {
      return requete(m.reglages.put({ cle: cle, valeur: valeur }));
    });
  }

  // ---------- Tout effacer (règle 7) ----------

  function toutEffacer() {
    if (connexion) { connexion.close(); connexion = null; }
    return requete(indexedDB.deleteDatabase(NOM));
  }

  // Demande au navigateur de ne pas effacer la base de lui-même (aucun envoi réseau).
  function demanderPersistance() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  racine.Stockage = {
    ouvrir: ouvrir,
    listerAvatars: listerAvatars,
    lireAvatar: lireAvatar,
    ajouterAvatar: ajouterAvatar,
    compterSeance: compterSeance,
    etatsCartes: etatsCartes,
    enregistrerCarte: enregistrerCarte,
    lireReglage: lireReglage,
    ecrireReglage: ecrireReglage,
    toutEffacer: toutEffacer,
    demanderPersistance: demanderPersistance
  };
})(this);
