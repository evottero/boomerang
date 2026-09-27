// Tests du moteur de répétition espacée. Lancer depuis la racine du dépôt : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const M = require('../moteur.js');

const J = 20000; // un jour quelconque

test('intervalles des 5 boîtes : même séance, 1, 3, 7, 14 jours', function () {
  assert.deepStrictEqual(M.INTERVALLES, { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 });
});

test('carte nouvelle : « Je savais » envoie en boîte 2, revue demain', function () {
  const e = M.noter(null, 'savais', J);
  assert.deepStrictEqual(e, { boite: 2, echeance: J + 1, vues: 1, derniere: J });
});

test('carte nouvelle : « Presque » ou « Je ne savais pas » reste en boîte 1, même séance', function () {
  assert.strictEqual(M.noter(null, 'presque', J).boite, 1);
  assert.strictEqual(M.noter(null, 'presque', J).echeance, J);
  assert.strictEqual(M.noter(null, 'pas', J).boite, 1);
});

test('« Je savais » fait monter de boîte jusqu\'à 5, puis reste en 5', function () {
  let e = null;
  const attendu = [[2, 1], [3, 3], [4, 7], [5, 14], [5, 14]];
  attendu.forEach(function (a, i) {
    e = M.noter(e, 'savais', J);
    assert.strictEqual(e.boite, a[0], 'étape ' + i);
    assert.strictEqual(e.echeance, J + a[1], 'étape ' + i);
  });
  assert.strictEqual(e.vues, 5);
});

test('« Presque » garde la boîte et repousse l\'échéance selon la boîte', function () {
  const e = M.noter({ boite: 3, echeance: J, vues: 4, derniere: J - 3 }, 'presque', J);
  assert.strictEqual(e.boite, 3);
  assert.strictEqual(e.echeance, J + 3);
});

test('« Je ne savais pas » renvoie en boîte 1', function () {
  const e = M.noter({ boite: 4, echeance: J, vues: 6, derniere: J - 7 }, 'pas', J);
  assert.strictEqual(e.boite, 1);
  assert.strictEqual(e.echeance, J);
});

test('note inconnue : erreur', function () {
  assert.throws(function () { M.noter(null, 'bof', J); });
});

function cles(n, prefixe) {
  return Array.from({ length: n }, function (_, i) { return (prefixe || 'c') + i; });
}

test('séance : 10 cartes au maximum', function () {
  assert.strictEqual(M.composerSeance(cles(30), {}, J).length, 10);
  assert.strictEqual(M.composerSeance(cles(4), {}, J).length, 4);
});

test('séance : au moins 3 cartes en retard quand il y en a', function () {
  const c = cles(3, 'r').concat(cles(20, 'n'));
  const etats = { r0: { boite: 2, echeance: J - 1 }, r1: { boite: 3, echeance: J }, r2: { boite: 1, echeance: J - 5 } };
  const s = M.composerSeance(c, etats, J);
  assert.strictEqual(s.length, 10);
  ['r0', 'r1', 'r2'].forEach(function (r) { assert.ok(s.includes(r), r); });
});

test('séance : beaucoup de retard laisse quand même 3 places aux nouvelles cartes', function () {
  const retard = cles(15, 'r');
  const etats = {};
  retard.forEach(function (r, i) { etats[r] = { boite: 2, echeance: J - i }; });
  const s = M.composerSeance(retard.concat(cles(5, 'n')), etats, J);
  assert.strictEqual(s.length, 10);
  assert.strictEqual(s.filter(function (x) { return x[0] === 'r'; }).length, 7);
  assert.strictEqual(s.filter(function (x) { return x[0] === 'n'; }).length, 3);
  // Les plus en retard d'abord.
  assert.strictEqual(s[0], 'r14');
});

test('séance : sans nouvelles cartes, le retard remplit les 10 places', function () {
  const retard = cles(15, 'r');
  const etats = {};
  retard.forEach(function (r) { etats[r] = { boite: 2, echeance: J - 1 }; });
  assert.strictEqual(M.composerSeance(retard, etats, J).length, 10);
});

test('séance : les cartes pas encore dues sont exclues', function () {
  const etats = { a: { boite: 3, echeance: J + 2 }, b: { boite: 2, echeance: J + 1 } };
  assert.deepStrictEqual(M.composerSeance(['a', 'b'], etats, J), []);
  // Le lendemain, b est due.
  assert.deepStrictEqual(M.composerSeance(['a', 'b'], etats, J + 1), ['b']);
});

test('séance anticipée : les échéances les plus proches d\'abord', function () {
  const etats = { a: { boite: 3, echeance: J + 5 }, b: { boite: 2, echeance: J + 1 }, c: { boite: 5, echeance: J + 14 } };
  assert.deepStrictEqual(M.composerSeanceAnticipee(['a', 'b', 'c'], etats), ['b', 'a', 'c']);
});

test('compteurs : cartes en retard et nouvelles', function () {
  const etats = { a: { boite: 2, echeance: J }, b: { boite: 3, echeance: J + 3 } };
  assert.strictEqual(M.compterEnRetard(['a', 'b', 'c'], etats, J), 1);
  assert.strictEqual(M.compterNouvelles(['a', 'b', 'c'], etats), 1);
});

test('jour local : change à minuit', function () {
  const avant = new Date(2026, 8, 27, 23, 59);
  const apres = new Date(2026, 8, 28, 0, 1);
  assert.strictEqual(M.jourLocal(apres) - M.jourLocal(avant), 1);
});

test('clé de carte : dépend du recto et du verso', function () {
  assert.notStrictEqual(M.cleCarte({ recto: 'a', verso: 'b' }), M.cleCarte({ recto: 'a', verso: 'c' }));
  assert.strictEqual(M.cleCarte({ recto: 'a', verso: 'b' }), M.cleCarte({ recto: 'a', verso: 'b' }));
});
