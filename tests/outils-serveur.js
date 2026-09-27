// Charge la logique de la fonction Supabase (entre les repères LOGIQUE DÉBUT / FIN)
// et fournit une base en mémoire qui imite les tables. Sert aux tests et au faux serveur local.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function chargerLogique() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'boomerang', 'index.ts'), 'utf8');
  const debut = source.indexOf('// --- LOGIQUE DÉBUT');
  const fin = source.indexOf('// --- LOGIQUE FIN ---');
  if (debut === -1 || fin === -1) throw new Error('Repères de logique introuvables dans index.ts');
  const code = source.slice(debut, fin);
  // eslint-disable-next-line no-new-func
  return new Function(code + '\nreturn { traiter: traiter, plusAvancee: plusAvancee, codeRefuse: codeRefuse, listeOrigines: listeOrigines, origineAutorisee: origineAutorisee };')();
}

function baseMemoire() {
  const classes = new Map(); // code -> ligne
  const paquets = new Map(); // "classe|id" -> ligne
  const avatars = new Map(); // "classe|avatar" -> ligne
  const cartes = new Map();  // "classe|avatar|paquet|cle" -> ligne
  const k = function (c, a) { return c + '|' + a; };
  return {
    donnees: { classes: classes, avatars: avatars, cartes: cartes, paquets: paquets },
    classeExiste: async function (c) { return classes.has(c); },
    creerClasse: async function (ligne) {
      classes.set(ligne.code, Object.assign({ essais_faux_enseignant: 0, bloque_enseignant_jusqua: null }, ligne));
    },
    lireClasse: async function (c) { const l = classes.get(c); return l ? Object.assign({}, l) : null; },
    majClasse: async function (c, champs) { Object.assign(classes.get(c), champs); },
    listerPaquets: async function (c) {
      return Array.from(paquets.values()).filter(function (p) { return p.classe === c; })
        .sort(function (x, y) { return x.id < y.id ? -1 : 1; })
        .map(function (p) { return { contenu: JSON.parse(JSON.stringify(p.contenu)) }; });
    },
    ecrirePaquet: async function (ligne) { paquets.set(ligne.classe + '|' + ligne.id, JSON.parse(JSON.stringify(ligne))); },
    listerAvatars: async function (c) {
      return Array.from(avatars.values()).filter(function (a) { return a.classe === c; })
        .sort(function (x, y) { return x.avatar < y.avatar ? -1 : 1; })
        .map(function (a) { return { avatar: a.avatar, empreinte: a.empreinte, bloque_jusqua: a.bloque_jusqua }; });
    },
    lireAvatar: async function (c, a) { const l = avatars.get(k(c, a)); return l ? Object.assign({}, l) : null; },
    creerAvatar: async function (ligne) {
      if (avatars.has(k(ligne.classe, ligne.avatar))) return false;
      avatars.set(k(ligne.classe, ligne.avatar), Object.assign({}, ligne));
      return true;
    },
    majAvatar: async function (c, a, champs) { Object.assign(avatars.get(k(c, a)), champs); },
    effacerAvatar: async function (c, a) {
      avatars.delete(k(c, a));
      Array.from(cartes.keys()).forEach(function (cle) { if (cle.indexOf(k(c, a) + '|') === 0) cartes.delete(cle); });
    },
    lireCartes: async function (c, a) {
      return Array.from(cartes.values()).filter(function (x) { return x.classe === c && x.avatar === a; })
        .map(function (x) { return Object.assign({}, x); });
    },
    ecrireCartes: async function (lignes) {
      lignes.forEach(function (l) { cartes.set([l.classe, l.avatar, l.paquet, l.cle].join('|'), Object.assign({}, l)); });
    },
    // Purge du 31 août : supprimer les classes supprime tout en cascade.
    purger: function () { classes.clear(); avatars.clear(); cartes.clear(); paquets.clear(); }
  };
}

module.exports = { chargerLogique: chargerLogique, baseMemoire: baseMemoire };
