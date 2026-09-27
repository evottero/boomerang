// Tests de la logique du quiz. Lancer depuis la racine du dépôt : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Q = require('../quiz.js');
const M = require('../moteur.js');

const qcm = { type: 'qcm', question: 'Q', choix: ['a', 'b', 'c'], reponse: 1, explication: 'E' };
const vf = { type: 'vraifaux', question: 'Q', reponse: false, explication: 'E' };
const trou = { type: 'trous', texte: 'Liberté, ___, Fraternité.', reponse: 'Égalité', explication: 'E' };
const ordre = { type: 'ordre', question: 'Q', elements: ['1789', '1794', '1880'], explication: 'E' };

test('qcm et vrai/faux', function () {
  assert.strictEqual(Q.corriger(qcm, 1).juste, true);
  assert.strictEqual(Q.corriger(qcm, 0).juste, false);
  assert.strictEqual(Q.corriger(vf, false).juste, true);
  assert.strictEqual(Q.corriger(vf, true).juste, false);
});

test('trous : majuscules et espaces en trop ignorés', function () {
  assert.deepStrictEqual(Q.corriger(trou, 'Égalité'), { juste: true, orthographe: false });
  assert.deepStrictEqual(Q.corriger(trou, '  égalité '), { juste: true, orthographe: false });
  assert.deepStrictEqual(Q.corriger(trou, 'ÉGALITÉ'), { juste: true, orthographe: false });
  const deuxMots = { type: 'trous', texte: '___', reponse: 'la Marseillaise', explication: 'E' };
  assert.strictEqual(Q.corriger(deuxMots, 'La   marseillaise').juste, true);
});

test('trous : apostrophe courbe du clavier iPad = apostrophe droite', function () {
  const q = { type: 'trous', texte: '___', reponse: 'l\'eau', explication: 'E' };
  assert.strictEqual(Q.corriger(q, 'l’eau').juste, true);
});

test('trous : un mot faux reste faux', function () {
  assert.strictEqual(Q.corriger(trou, 'Liberté').juste, false);
  assert.strictEqual(Q.corriger(trou, '').juste, false);
  assert.strictEqual(Q.corriger(trou, 'Égalité.').juste, false); // ponctuation non ignorée
});

test('trous, accents absent ou false : accents manquants acceptés, orthographe signalée', function () {
  assert.deepStrictEqual(Q.corriger(trou, 'egalite'), { juste: true, orthographe: true });
  assert.deepStrictEqual(Q.corriger(trou, 'Egalité'), { juste: true, orthographe: true });
  const faux = Object.assign({}, trou, { accents: false });
  assert.deepStrictEqual(Q.corriger(faux, 'egalite'), { juste: true, orthographe: true });
});

test('trous, accents true : l\'accent est exigé', function () {
  const exige = Object.assign({}, trou, { accents: true });
  assert.deepStrictEqual(Q.corriger(exige, 'egalite'), { juste: false, orthographe: false });
  assert.deepStrictEqual(Q.corriger(exige, 'ÉGALITÉ'), { juste: true, orthographe: false });
});

test('trous : accents composés (saisie décomposée) = accents précomposés', function () {
  const exige = Object.assign({}, trou, { accents: true });
  assert.strictEqual(Q.corriger(exige, 'Égalité').juste, true);
});

test('ordre : juste seulement dans le bon ordre complet', function () {
  assert.strictEqual(Q.corriger(ordre, ['1789', '1794', '1880']).juste, true);
  assert.strictEqual(Q.corriger(ordre, ['1794', '1789', '1880']).juste, false);
  assert.strictEqual(Q.corriger(ordre, ['1789', '1794']).juste, false);
});

test('ordre : le mélange n\'est jamais déjà dans le bon ordre', function () {
  for (let i = 0; i < 200; i++) {
    const m = Q.melangerOrdre(ordre.elements);
    assert.notDeepStrictEqual(m, ordre.elements);
    assert.deepStrictEqual(m.slice().sort(), ordre.elements.slice().sort());
  }
  // Même avec un hasard qui renverrait toujours l'ordre d'origine.
  assert.notDeepStrictEqual(Q.melangerOrdre(ordre.elements, function () { return 0.999; }), ordre.elements);
});

// Joue un quiz : resultats[i] = liste des réponses successives (vrai/faux) pour la question i.
function jouer(n, resultats) {
  const d = Q.creerDeroule(n);
  const essais = {};
  const vues = [];
  do {
    const i = Q.questionCourante(d);
    vues.push(i);
    essais[i] = (essais[i] || 0);
    Q.repondre(d, resultats[i][essais[i]++]);
  } while (Q.suivante(d));
  return { d: d, vues: vues };
}

test('les questions ratées reviennent en fin de quiz, une seule fois', function () {
  const r = jouer(4, [[true], [false, true], [true], [false, false]]);
  assert.deepStrictEqual(r.vues, [0, 1, 2, 3, 1, 3]);
});

test('une question réussie ne revient pas', function () {
  const r = jouer(3, [[true], [true], [true]]);
  assert.deepStrictEqual(r.vues, [0, 1, 2]);
});

test('repondre signale si la question reviendra', function () {
  const d = Q.creerDeroule(2);
  assert.strictEqual(Q.repondre(d, false), true);
  Q.suivante(d); Q.repondre(d, true); Q.suivante(d);
  assert.strictEqual(Q.questionCourante(d), 0);
  assert.strictEqual(Q.repondre(d, false), false); // deuxième échec : ne revient plus
  assert.strictEqual(Q.suivante(d), false);
});

test('bilan : réussites du premier coup, rattrapées, à revoir', function () {
  const r = jouer(4, [[true], [false, true], [true], [false, false]]);
  assert.deepStrictEqual(Q.bilan(r.d), { total: 4, reussites: 2, rattrapees: 1, aRevoir: [3] });
});

test('plante : grandit au fil des séances', function () {
  assert.strictEqual(M.etapePlante(0).nom, 'une graine');
  assert.strictEqual(M.etapePlante(1).nom, 'une pousse');
  assert.strictEqual(M.etapePlante(2).numero, 1);
  assert.strictEqual(M.etapePlante(3).numero, 2);
  assert.strictEqual(M.etapePlante(15).nom, 'une plante en fleur');
  assert.strictEqual(M.etapePlante(100).numero, 5);
});
