'use strict';

// Page d'accueil : vérifie le code de classe, puis ouvre l'app (app.html).
// Aux visites suivantes, un appareil qui a déjà un code saute cette page.
// Aucun cookie, aucun traceur : l'accès est retenu dans le stockage local (IndexedDB).

(function () {
  const S = window.Stockage;
  const SY = window.Synchro;
  const ESSAIS_MAX = 5;
  const BLOCAGE_MS = 60 * 60 * 1000;
  const CLE_SESSION = 'boomerang-acces';

  // Masque la page le temps de vérifier l'accès (évite un affichage bref avant la redirection).
  document.documentElement.classList.add('verification');

  function versApp() {
    // Le lien d'un QR code (#/p/…) est transmis à l'app.
    location.replace('app.html' + location.hash);
  }

  function afficher() {
    document.documentElement.classList.remove('verification');
  }

  function accesSession() {
    try { return sessionStorage.getItem(CLE_SESSION) === '1'; } catch (e) { return false; }
  }

  // L'appareil a-t-il déjà un code de classe ?
  function aAcces() {
    if (accesSession()) return Promise.resolve(true);
    return S.ouvrir()
      .then(function () { return Promise.all([S.lireReglage('acces', false), S.lireReglage('classe', null)]); })
      .then(function (r) { return r[0] === true || !!r[1]; })
      .catch(function () { return false; });
  }

  // Limitation d'essais : 5 codes faux, puis blocage d'une heure sur cet appareil.
  function lireEssais() {
    return S.lireReglage('essaisClasse', null).catch(function () { return null; }).then(function (e) {
      return e || { n: 0, jusqua: 0 };
    });
  }

  function ecrireEssais(e) {
    return S.ecrireReglage('essaisClasse', e).catch(function () {});
  }

  function minutes(jusqua) {
    return Math.max(1, Math.ceil((jusqua - Date.now()) / 60000));
  }

  function brancher() {
    const champ = document.getElementById('code-classe');
    const bouton = document.getElementById('entrer');
    const message = document.getElementById('message');
    let occupe = false;

    function echec(essais) {
      essais.n += 1;
      if (essais.n >= ESSAIS_MAX) {
        essais.n = 0;
        essais.jusqua = Date.now() + BLOCAGE_MS;
        message.textContent = 'Trop d\'essais. Réessaie dans 60 minutes.';
      } else {
        message.textContent = 'Code inconnu. Vérifie auprès de ton enseignant.';
      }
      return ecrireEssais(essais);
    }

    function succes(code) {
      try { sessionStorage.setItem(CLE_SESSION, '1'); } catch (e) { /* sans conséquence */ }
      return S.ecrireReglage('classe', code)
        .then(function () { return S.ecrireReglage('sansClasse', false); })
        .then(function () { return S.ecrireReglage('acces', true); })
        .then(function () { return S.ecrireReglage('essaisClasse', null); })
        .then(function () { S.demanderPersistance(); })
        .catch(function () { /* stockage indisponible : accès pour cette session seulement */ })
        .then(versApp);
    }

    function entrer() {
      if (occupe) return;
      occupe = true;
      message.textContent = '';
      lireEssais().then(function (essais) {
        if (essais.jusqua > Date.now()) {
          message.textContent = 'Trop d\'essais. Réessaie dans ' + minutes(essais.jusqua) + ' minutes.';
          return;
        }
        const code = SY.normaliserClasse(champ.value);
        if (!SY.classeValide(code)) return echec(essais);
        message.textContent = 'Vérification…';
        return SY.appeler('classe', { classe: code }).then(function (r) {
          if (r.statut === 200) return succes(code);
          if (r.statut === 0) { message.textContent = 'Pas de connexion à Internet. Réessaie dans un instant.'; return; }
          return echec(essais);
        });
      }).then(function () { occupe = false; });
    }

    bouton.addEventListener('click', entrer);
    champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') entrer(); });
  }

  // Synchronisation non configurée (développement) : pas de code à vérifier.
  if (!SY.active()) { versApp(); return; }

  let pret = false;
  function montrerPage() {
    if (pret) return;
    pret = true;
    const suite = function () { afficher(); brancher(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', suite);
    else suite();
  }
  // Si le stockage ne répond pas, la page s'affiche quand même.
  setTimeout(montrerPage, 3000);
  aAcces().then(function (ok) {
    if (ok && !pret) { pret = true; versApp(); return; }
    montrerPage();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).catch(function () {});
  }
})();
