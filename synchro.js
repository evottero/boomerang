/*
 * Synchronisation (lot 5 bis). IndexedDB reste la référence : le serveur n'en est qu'une copie.
 * Seules requêtes hors du site : la fonction Boomerang sur Supabase (URL_FONCTION ci-dessous).
 * Données envoyées : code de classe, avatar, code élève (vérifié puis transformé en empreinte
 * par le serveur, jamais stocké en clair), nombre de séances (plante), état des cartes.
 */
(function (racine) {
  'use strict';

  // Adresse de la fonction : https://<référence du projet>.supabase.co/functions/v1/boomerang
  // Vide = synchronisation désactivée (l'app fonctionne comme avant, sans classe).
  const URL_FONCTION = 'https://krifwnmqmiangtckeirg.supabase.co/functions/v1/boomerang';
  const DELAI_MS = 10000;

  const RE_CLASSE = /^[A-HJ-NP-Z2-9]{6}$/;
  // Code de classe : 6 caractères, sans les lettres et chiffres qui se confondent (O/0, I/1).
  const ALPHABET_CLASSE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function active() {
    return URL_FONCTION !== '';
  }

  function normaliserClasse(texte) {
    return String(texte || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function classeValide(code) {
    return RE_CLASSE.test(code);
  }

  function nouveauCodeClasse(aleatoire) {
    const t = new Uint8Array(6);
    if (aleatoire) for (let i = 0; i < 6; i++) t[i] = Math.floor(aleatoire() * 256);
    else racine.crypto.getRandomValues(t);
    let code = '';
    for (let i = 0; i < 6; i++) code += ALPHABET_CLASSE[t[i] % ALPHABET_CLASSE.length];
    return code;
  }

  // Code élève : 4 chiffres, ni chiffres tous identiques, ni 1234. Renvoie un message ou null.
  function problemeCode(code) {
    if (!/^[0-9]{4}$/.test(code)) return 'Tape 4 chiffres.';
    if (/^(\d)\1{3}$/.test(code) || code === '1234') return 'Choisis un code plus difficile à deviner.';
    return null;
  }

  // Même règle que le serveur : boîte la plus haute, puis révision la plus récente, puis vues.
  function plusAvancee(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.boite !== b.boite) return a.boite > b.boite ? a : b;
    if (a.derniere !== b.derniere) return a.derniere > b.derniere ? a : b;
    return a.vues >= b.vues ? a : b;
  }

  // Fusionne des cartes locales et distantes. Renvoie les cartes à écrire localement.
  function aMettreAJour(locales, distantes) {
    const index = {};
    locales.forEach(function (c) { index[c.paquet + '\u0000' + c.cle] = c; });
    return distantes.filter(function (d) {
      const l = index[d.paquet + '\u0000' + d.cle];
      return plusAvancee(l, d) === d && (!l || l.boite !== d.boite || l.echeance !== d.echeance ||
        l.vues !== d.vues || l.derniere !== d.derniere);
    });
  }

  // Empreinte locale du code : vérification hors ligne à l'ouverture (garde-fou entre élèves).
  function empreinteLocale(code, sel) {
    const donnees = new TextEncoder().encode('boomerang|' + sel + '|' + code);
    return racine.crypto.subtle.digest('SHA-256', donnees).then(function (t) {
      return Array.from(new Uint8Array(t)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function selLocal() {
    const t = new Uint8Array(16);
    racine.crypto.getRandomValues(t);
    return Array.from(t).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // Appel à la fonction. Renvoie { statut, corps } ; statut 0 = pas de réseau.
  function appeler(action, donnees) {
    if (!active()) return Promise.resolve({ statut: 0, corps: { erreur: 'desactive' } });
    const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const minuteur = controle ? setTimeout(function () { controle.abort(); }, DELAI_MS) : null;
    return fetch(URL_FONCTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, donnees)),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controle ? controle.signal : undefined
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (corps) { return { statut: r.status, corps: corps }; });
      })
      .catch(function () { return { statut: 0, corps: { erreur: 'reseau' } }; })
      .then(function (r) { if (minuteur) clearTimeout(minuteur); return r; });
  }

  const api = {
    URL_FONCTION: URL_FONCTION,
    active: active,
    normaliserClasse: normaliserClasse,
    classeValide: classeValide,
    nouveauCodeClasse: nouveauCodeClasse,
    problemeCode: problemeCode,
    plusAvancee: plusAvancee,
    aMettreAJour: aMettreAJour,
    empreinteLocale: empreinteLocale,
    selLocal: selLocal,
    appeler: appeler
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.Synchro = api;
})(typeof window !== 'undefined' ? window : globalThis);
