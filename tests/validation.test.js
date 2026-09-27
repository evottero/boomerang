// Tests du validateur de paquets. Lancer depuis la racine du dépôt : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../validation.js');

const DOSSIER = path.join(__dirname, '..', 'paquets');

// Paquet de référence, forcé à relu: true pour tester les autres règles une par une.
function exemple() {
  const p = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'hist-symboles-republique.json'), 'utf8'));
  p.relu = true;
  return p;
}

function erreurs(modifier) {
  const p = exemple();
  modifier(p);
  return V.validerPaquet(p, 'hist-symboles-republique');
}

function contient(liste, morceau) {
  assert.ok(liste.some(function (e) { return e.indexOf(morceau) !== -1; }),
    'attendu « ' + morceau + ' » dans : ' + JSON.stringify(liste));
}

function paquetsListes() {
  const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'index.json'), 'utf8'));
  return index.paquets.map(function (id) {
    return { id: id, paquet: JSON.parse(fs.readFileSync(path.join(DOSSIER, id + '.json'), 'utf8')) };
  });
}

test('chaque paquet listé dans index.json existe et respecte le format', function () {
  const liste = paquetsListes();
  assert.ok(liste.length >= 2);
  liste.forEach(function (e) {
    const p = Object.assign({}, e.paquet, { relu: true }); // la relecture est testée à part
    assert.deepStrictEqual(V.validerPaquet(p, e.id), [], e.id);
  });
});

test('chaque paquet listé dans index.json est marqué relu', function () {
  const nonRelus = paquetsListes().filter(function (e) { return e.paquet.relu !== true; }).map(function (e) { return e.id; });
  assert.deepStrictEqual(nonRelus, [], 'paquets à relire puis passer à "relu": true');
});

test('chaque fichier du dossier paquets est listé dans index.json', function () {
  const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'index.json'), 'utf8'));
  fs.readdirSync(DOSSIER)
    .filter(function (f) { return f.endsWith('.json') && f !== 'index.json'; })
    .forEach(function (f) { assert.ok(index.paquets.includes(f.replace(/\.json$/, '')), f); });
});

test('JSON mal formé : refusé avec un message clair', function () {
  const r = V.validerTexte('{ "version": 1, }', 'x');
  assert.strictEqual(r.ok, false);
  contient(r.erreurs, 'pas un JSON valide');
});

test('fichier vide ou trop gros : refusé', function () {
  contient(V.validerTexte('   ').erreurs, 'vide');
  contient(V.validerTexte('"' + 'a'.repeat(200001) + '"').erreurs, 'trop gros');
});

test('pas un objet : refusé', function () {
  contient(V.validerTexte('[1, 2]').erreurs, 'objet');
});

test('champs généraux', function () {
  contient(erreurs(function (p) { p.version = 2; }), '« version »');
  contient(erreurs(function (p) { p.id = 'Hist P2'; }), '« id »');
  contient(erreurs(function (p) { p.id = 'autre-id'; }), 'identiques');
  contient(erreurs(function (p) { p.titre = ' '; }), '« titre »');
  contient(erreurs(function (p) { p.discipline = 'musique'; }), '« discipline »');
  contient(erreurs(function (p) { p.periode = 'P11'; }), '« periode »');
  contient(erreurs(function (p) { p.niveau = 'facile'; }), '« niveau »');
});

test('paquet non relu : refusé', function () {
  contient(erreurs(function (p) { p.relu = false; }), 'relu');
  contient(erreurs(function (p) { delete p.relu; }), 'relu');
});

test('champ inconnu (donnée d\'élève) : refusé', function () {
  contient(erreurs(function (p) { p.eleve = 'Léa'; }), 'Champ inconnu « eleve »');
  contient(erreurs(function (p) { p.cartes[0].note = 3; }), 'Carte 1 : champ inconnu');
  contient(erreurs(function (p) { p.quiz[0].auteur = 'x'; }), 'question 1 (qcm) : champ inconnu');
});

test('fiche : 5 à 8 idées, gras refermé', function () {
  contient(erreurs(function (p) { p.fiche = p.fiche.slice(0, 4); }), '5 à 8');
  contient(erreurs(function (p) { p.fiche.push('a', 'b'); }), '5 à 8');
  contient(erreurs(function (p) { p.fiche[1] = 'Le blanc **représentait le roi.'; }), 'Fiche, idée 2 : un gras');
  contient(erreurs(function (p) { p.fiche[7] = 'En latin, *gallus veut dire coq.'; }), 'Fiche, idée 8 : un italique');
  assert.deepStrictEqual(erreurs(function (p) { p.fiche[7] = '**Le coq**, en latin *gallus*.'; }), []);
  contient(erreurs(function (p) { p.fiche[0] = ''; }), 'Fiche, idée 1 : texte vide');
});

test('cartes', function () {
  contient(erreurs(function (p) { p.cartes = []; }), 'au moins une carte');
  contient(erreurs(function (p) { p.cartes[2].verso = ''; }), 'Carte 3 : « verso »');
});

test('quiz : types et champs', function () {
  contient(erreurs(function (p) { p.quiz = []; }), 'au moins une question');
  contient(erreurs(function (p) { p.quiz[0].type = 'libre'; }), '« type »');
  contient(erreurs(function (p) { p.quiz[0].explication = ''; }), '« explication »');
  // qcm
  contient(erreurs(function (p) { p.quiz[0].choix.pop(); }), 'exactement 3');
  contient(erreurs(function (p) { p.quiz[0].choix[2] = 'Jeanne d\'Arc'; }), 'identiques');
  contient(erreurs(function (p) { p.quiz[0].reponse = 3; }), '0, 1 ou 2');
  contient(erreurs(function (p) { p.quiz[0].reponse = '1'; }), '0, 1 ou 2');
  // vraifaux
  contient(erreurs(function (p) { p.quiz[2].reponse = 'faux'; }), 'true ou false');
  contient(erreurs(function (p) { p.quiz[2].question = ''; }), '« question »');
  // trous : le champ s'appelle « texte »
  contient(erreurs(function (p) { p.quiz[4].texte = 'Sans trou.'; }), '___');
  contient(erreurs(function (p) { p.quiz[4].texte = '___ et ___'; }), '___');
  contient(erreurs(function (p) { delete p.quiz[4].texte; }), '« texte » vide');
  contient(erreurs(function (p) { p.quiz[4].question = 'x'; }), 'question 5 (trous) : champ inconnu « question »');
  contient(erreurs(function (p) { p.quiz[4].reponse = ''; }), 'mot manquant');
  // ordre
  contient(erreurs(function (p) { p.quiz[7].elements = ['a', 'b']; }), '3 à 6');
  contient(erreurs(function (p) { p.quiz[7].elements = ['a', 'b', 'a']; }), 'identiques');
});

test('trop d\'erreurs : liste raccourcie', function () {
  const p = exemple();
  p.fiche = p.fiche.map(function () { return ''; });
  p.cartes = p.cartes.map(function () { return {}; });
  const r = V.validerTexte(JSON.stringify(p), 'hist-symboles-republique');
  assert.strictEqual(r.erreurs.length, 21);
  contient(r.erreurs, 'd\'autres erreurs');
});

test('trous : champ facultatif « accents » (true ou false)', function () {
  assert.deepStrictEqual(erreurs(function (p) { p.quiz[4].accents = true; }), []);
  assert.deepStrictEqual(erreurs(function (p) { p.quiz[4].accents = false; }), []);
  contient(erreurs(function (p) { p.quiz[4].accents = 'oui'; }), '« accents » doit être true ou false');
  contient(erreurs(function (p) { p.quiz[0].accents = true; }), 'question 1 (qcm) : champ inconnu « accents »');
});
