// Tests de l'atelier (import, relecture, export) et du QR code.
// Lancer depuis la racine du dépôt : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../validation.js');
const QR = require('../qrcode.js');
const Atelier = require('../atelier.js').Atelier;

const A = Atelier.installer({ V: V });
const DOSSIER = path.join(__dirname, '..', 'paquets');

// Réponse type de Claude au prompt de l'atelier (avec balises de code, que l'import tolère).
const REPONSE_CLAUDE = '```json\n' + JSON.stringify({
  version: 1, id: 'conj-passe-compose', titre: 'Le passé composé', discipline: 'conjugaison',
  periode: 'P3', niveau: 'accompagne', relu: false, accents: true,
  fiche: ['Le **passé composé** parle d\'une action finie.', 'Il se forme avec **avoir** ou **être**.',
    'On ajoute le **participe passé**.', 'Avec **être**, le participe s\'accorde avec le sujet.', 'Exemple : **j\'ai chanté**.'],
  cartes: [{ recto: 'Auxiliaires', verso: 'Avoir ou être' }],
  quiz: [
    { type: 'qcm', question: 'Quel auxiliaire pour « aller » ?', choix: ['avoir', 'être', 'faire'], reponse: 1, explication: 'Aller se conjugue avec être.' },
    { type: 'vraifaux', question: 'Le passé composé a deux mots.', reponse: true, explication: 'Auxiliaire et participe passé.' },
    { type: 'trous', texte: 'Hier, j\'ai ___ une chanson.', reponse: 'chanté', explication: 'Participe passé de chanter.' },
    { type: 'ordre', question: 'Range les mots.', elements: ['Nous', 'sommes', 'partis'], explication: 'Sujet, auxiliaire, participe.' }
  ]
}, null, 2) + '\n```';

test('prompt : intègre la règle du titre et le format attendu', function () {
  assert.ok(Atelier.PROMPT.indexOf('Le titre ne reprend pas le nom de la discipline.') !== -1);
  assert.ok(Atelier.PROMPT.indexOf('Discipline, période et niveau : [à compléter]') !== -1);
  ['nombres', 'grandeurs', 'emc', 'accompagne'].forEach(function (m) { assert.ok(Atelier.PROMPT.indexOf(m) !== -1, m); });
});

test('prompt : toutes ses disciplines sont acceptées par le validateur', function () {
  const ligne = Atelier.PROMPT.split('\n').find(function (l) { return l.indexOf('"discipline"') !== -1; });
  const liste = ligne.split('"')[3].split(' | ');
  assert.strictEqual(liste.length, 11);
  liste.forEach(function (d) { assert.ok(V.DISCIPLINES.indexOf(d) !== -1, d); });
});

test('import : balises de code tolérées, JSON cassé refusé avec un message clair', function () {
  assert.strictEqual(A.extraireJSON(REPONSE_CLAUDE).id, 'conj-passe-compose');
  assert.throws(function () { A.extraireJSON('Voici le paquet : { "version": 1, }'); }, /pas valide/);
  assert.throws(function () { A.extraireJSON('Désolé, je ne peux pas.'); }, /Aucun objet JSON/);
});

test('relecture : un paquet importé part décoché, et une fois tout relu il est conforme', function () {
  const m = A.versModele(A.extraireJSON(REPONSE_CLAUDE), false, 'import');
  assert.strictEqual(m.metaRelu, false);
  assert.ok(m.fiche.concat(m.cartes, m.quiz).every(function (e) { return e.relu === false; }));
  const p = A.versPaquet(m);
  assert.strictEqual(p.relu, true);
  assert.strictEqual(p.accents, true);
  assert.deepStrictEqual(V.validerPaquet(p, p.id), []);
});

test('export : aller-retour sans perte pour les paquets du site', function () {
  ['hist-symboles-republique', 'geom-u1-vocabulaire'].forEach(function (id) {
    const source = JSON.parse(fs.readFileSync(path.join(DOSSIER, id + '.json'), 'utf8'));
    const p = A.versPaquet(A.versModele(source, true, 'site'));
    const attendu = Object.assign({ accents: false }, source);
    assert.deepStrictEqual(p, attendu, id);
  });
});

test('import : champs inconnus signalés et retirés', function () {
  const m = A.versModele({ titre: 'x', eleve: 'Léa', note: 3 }, false, 'import');
  assert.deepStrictEqual(m.ignores, ['eleve', 'note']);
  assert.ok(!('eleve' in A.versPaquet(m)));
});

test('identifiant proposé : discipline et mots du titre, sans accents', function () {
  assert.strictEqual(A.proposerId('histoire', 'Les symboles de la République'), 'histoire-symboles-republique');
  assert.ok(V.ID_VALIDE.test(A.proposerId('geometrie', 'Vocabulaire et notations')));
});

test('format : niveau accompagne (et ancienne écriture), accents du paquet', function () {
  const base = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'hist-symboles-republique.json'), 'utf8'));
  ['accompagne', 'accompagné', 'standard', 'approfondi'].forEach(function (n) {
    assert.deepStrictEqual(V.validerPaquet(Object.assign({}, base, { niveau: n }), base.id), [], n);
  });
  assert.deepStrictEqual(V.validerPaquet(Object.assign({}, base, { accents: true }), base.id), []);
  assert.ok(V.validerPaquet(Object.assign({}, base, { accents: 'non' }), base.id).some(function (e) { return /accents/.test(e); }));
  assert.ok(V.validerPaquet(Object.assign({}, base, { discipline: 'mesures' }), base.id).some(function (e) { return /discipline/.test(e); }));
});

test('QR code : taille et version selon la longueur du lien', function () {
  const court = QR.encoder('https://evottero.github.io/revision-cm2/#/p/hist-symboles-republique', 'M');
  assert.strictEqual(court.taille, court.version * 4 + 17);
  assert.ok(court.version >= 4 && court.version <= 5);
  assert.throws(function () { QR.encoder('x'.repeat(400), 'M'); }, /trop long/);
});

test('QR code : motifs de repérage dans les trois coins', function () {
  const q = QR.encoder('https://exemple.test/#/p/abc', 'M');
  const n = q.taille;
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (c) {
    for (let i = 0; i < 7; i++) {
      assert.ok(q.modules[c[1]][c[0] + i], 'bord haut');
      assert.ok(q.modules[c[1] + 6][c[0] + i], 'bord bas');
    }
    assert.ok(!q.modules[c[1] + 1][c[0] + 1], 'anneau blanc');
    assert.ok(q.modules[c[1] + 3][c[0] + 3], 'centre noir');
  });
});

test('QR code : SVG autonome, sans aucune ressource externe', function () {
  const svg = QR.svg('https://exemple.test/#/p/abc', { libelle: 'QR' });
  assert.ok(/^<svg /.test(svg));
  assert.ok(!/href|url\(|<image/.test(svg));
});
