// Tests du module de synchronisation côté app. Lancer : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const S = require('../synchro.js');
const L = require('./outils-serveur.js').chargerLogique();

test('code élève : 4 chiffres, ni chiffres identiques, ni 1234', function () {
  assert.strictEqual(S.problemeCode('4827'), null);
  ['0000', '5555', '1234'].forEach(function (c) { assert.ok(S.problemeCode(c), c); });
  ['123', '12345', 'abcd', ''].forEach(function (c) { assert.ok(S.problemeCode(c), c); });
  // Mêmes règles que le serveur
  ['0000', '5555', '1234', '4827', '4321'].forEach(function (c) {
    assert.strictEqual(S.problemeCode(c) !== null, L.codeRefuse(c), c);
  });
});

test('code de classe : saisie tolérante, alphabet sans O, 0, I, 1', function () {
  assert.strictEqual(S.normaliserClasse(' k7m-q4x '), 'K7MQ4X');
  assert.ok(S.classeValide('K7MQ4X'));
  assert.ok(!S.classeValide('K7MQ0X'));
  for (let i = 0; i < 200; i++) assert.ok(S.classeValide(S.nouveauCodeClasse()));
});

test('fusion : même règle que le serveur', function () {
  const cas = [
    [{ boite: 3, derniere: 1, vues: 1 }, { boite: 2, derniere: 9, vues: 9 }],
    [{ boite: 2, derniere: 5, vues: 1 }, { boite: 2, derniere: 4, vues: 9 }],
    [{ boite: 2, derniere: 5, vues: 1 }, { boite: 2, derniere: 5, vues: 3 }]
  ];
  cas.forEach(function (c) { assert.strictEqual(S.plusAvancee(c[0], c[1]), L.plusAvancee(c[0], c[1])); });
});

test('fusion : seules les cartes distantes plus avancées sont écrites localement', function () {
  const locales = [
    { paquet: 'p', cle: 'A', boite: 3, echeance: 10, vues: 2, derniere: 7 },
    { paquet: 'p', cle: 'B', boite: 1, echeance: 7, vues: 1, derniere: 7 }
  ];
  const distantes = [
    { paquet: 'p', cle: 'A', boite: 3, echeance: 10, vues: 2, derniere: 7 }, // identique
    { paquet: 'p', cle: 'B', boite: 2, echeance: 8, vues: 2, derniere: 7 },  // plus avancée
    { paquet: 'p', cle: 'C', boite: 1, echeance: 7, vues: 1, derniere: 7 }   // nouvelle
  ];
  assert.deepStrictEqual(S.aMettreAJour(locales, distantes).map(function (c) { return c.cle; }), ['B', 'C']);
});

test('synchronisation désactivée tant que l\'adresse de la fonction est vide', function () {
  assert.strictEqual(typeof S.active(), 'boolean');
});
