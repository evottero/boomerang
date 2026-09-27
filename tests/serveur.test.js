// Tests de la fonction de synchronisation (logique de supabase/functions/boomerang/index.ts).
// Lancer depuis la racine du dépôt : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const outils = require('./outils-serveur.js');
const L = outils.chargerLogique();

const ENV = { poivre: 'p'.repeat(40), cleEnseignant: 'cle-enseignant-test' };
const CLASSE = 'K7MQ4X';
const CODE_ENS = 'code-enseignant-de-test';
let db;
let maintenant;

function appel(corps) { return L.traiter(corps, db, ENV, maintenant); }
function carte(paquet, cle, boite, derniere, vues) {
  return { paquet: paquet, cle: cle, boite: boite, echeance: derniere + 1, vues: vues || 1, derniere: derniere };
}

test.beforeEach(async function () {
  db = outils.baseMemoire();
  maintenant = Date.parse('2026-10-05T08:00:00Z');
  await appel({ action: 'admin-creer-classe', classe: CLASSE, cle: ENV.cleEnseignant, codeEnseignant: CODE_ENS });
});

test('classe : créée par l\'enseignant seulement, format de 6 caractères', async function () {
  assert.strictEqual((await appel({ action: 'admin-creer-classe', classe: 'ABCDEF', cle: 'mauvaise-cle', codeEnseignant: CODE_ENS })).statut, 403);
  assert.strictEqual((await appel({ action: 'classe', classe: 'ABCDEF' })).statut, 404);
  assert.strictEqual((await appel({ action: 'classe', classe: 'AB0DEF' })).statut, 400); // 0 exclu
  assert.strictEqual((await appel({ action: 'classe', classe: 'k7mq4x' })).statut, 200);  // minuscules acceptées
});

test('données stockées : jamais le code élève en clair', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'renard-bleu', code: '4827' });
  const ligne = db.donnees.avatars.get(CLASSE + '|renard-bleu');
  // Données autorisées (section 3) : classe, avatar, empreinte, séances ; champs techniques : sel, essais_faux, bloque_jusqua.
  assert.deepStrictEqual(Object.keys(ligne).sort(), ['avatar', 'bloque_jusqua', 'classe', 'empreinte', 'essais_faux', 'seances', 'sel']);
  assert.ok(!JSON.stringify(ligne).includes('4827'));
  assert.strictEqual(ligne.empreinte.length, 64);
});

test('code élève : chiffres identiques et 1234 refusés', async function () {
  for (const code of ['0000', '7777', '1234']) {
    assert.strictEqual((await appel({ action: 'creer', classe: CLASSE, avatar: 'renard-bleu', code: code })).corps.erreur, 'code-faible');
  }
  assert.strictEqual((await appel({ action: 'creer', classe: CLASSE, avatar: 'renard-bleu', code: '12a4' })).statut, 400);
});

test('avatars uniques dans la classe', async function () {
  assert.strictEqual((await appel({ action: 'creer', classe: CLASSE, avatar: 'chat-vert', code: '4827' })).statut, 200);
  const r = await appel({ action: 'creer', classe: CLASSE, avatar: 'chat-vert', code: '9051' });
  assert.strictEqual(r.statut, 409);
  assert.deepStrictEqual((await appel({ action: 'classe', classe: CLASSE })).corps.avatars, ['chat-vert']);
});

test('5 codes faux bloquent l\'avatar une heure, le bon code ne passe plus pendant ce temps', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'lion-rouge', code: '4827' });
  for (let i = 1; i <= 4; i++) {
    const r = await appel({ action: 'verifier', classe: CLASSE, avatar: 'lion-rouge', code: '0001' });
    assert.strictEqual(r.statut, 401);
    assert.strictEqual(r.corps.restants, 5 - i);
  }
  const bloque = await appel({ action: 'verifier', classe: CLASSE, avatar: 'lion-rouge', code: '0001' });
  assert.strictEqual(bloque.statut, 423);
  assert.strictEqual((await appel({ action: 'verifier', classe: CLASSE, avatar: 'lion-rouge', code: '4827' })).statut, 423);
  maintenant += 59 * 60 * 1000;
  assert.strictEqual((await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'lion-rouge', code: '4827', cartes: [] })).statut, 423);
  maintenant += 2 * 60 * 1000;
  assert.strictEqual((await appel({ action: 'verifier', classe: CLASSE, avatar: 'lion-rouge', code: '4827' })).statut, 200);
});

test('un bon code remet le compteur d\'essais à zéro', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'lion-rouge', code: '4827' });
  for (let i = 0; i < 4; i++) await appel({ action: 'verifier', classe: CLASSE, avatar: 'lion-rouge', code: '0001' });
  await appel({ action: 'verifier', classe: CLASSE, avatar: 'lion-rouge', code: '4827' });
  assert.strictEqual((await appel({ action: 'verifier', classe: CLASSE, avatar: 'lion-rouge', code: '0001' })).corps.restants, 4);
});

test('synchronisation : la progression la plus avancée l\'emporte, carte par carte', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'tortue-jaune', code: '4827' });
  // Maison : carte A en boîte 3, carte B en boîte 1
  let r = await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'tortue-jaune', code: '4827',
    cartes: [carte('hist', 'A', 3, 100), carte('hist', 'B', 1, 100)] });
  assert.strictEqual(r.statut, 200);
  // Classe : carte A en boîte 2 (moins avancée), carte B en boîte 4, carte C nouvelle
  r = await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'tortue-jaune', code: '4827',
    cartes: [carte('hist', 'A', 2, 105), carte('hist', 'B', 4, 104), carte('geom', 'C', 2, 104)] });
  const parCle = {};
  r.corps.cartes.forEach(function (c) { parCle[c.cle] = c; });
  assert.strictEqual(parCle.A.boite, 3);
  assert.strictEqual(parCle.B.boite, 4);
  assert.strictEqual(parCle.C.boite, 2);
  assert.strictEqual(r.corps.cartes.length, 3);
});

test('synchronisation : à boîte égale, la révision la plus récente l\'emporte', function () {
  const vieille = carte('p', 'A', 2, 100, 3);
  const recente = carte('p', 'A', 2, 104, 2);
  assert.strictEqual(L.plusAvancee(vieille, recente), recente);
  assert.strictEqual(L.plusAvancee(recente, vieille), recente);
});

test('synchronisation : mauvais code refusé, cartes invalides refusées', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'tortue-jaune', code: '4827' });
  assert.strictEqual((await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'tortue-jaune', code: '9999', cartes: [] })).statut, 401);
  const r = await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'tortue-jaune', code: '4827', cartes: [{ paquet: 'x', cle: 'y', boite: 9 }] });
  assert.strictEqual(r.corps.erreur, 'cartes');
});

test('atelier : réinitialiser le code élève (code enseignant) conserve la progression', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'hibou-vert', code: '4827' });
  await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'hibou-vert', code: '4827', cartes: [carte('hist', 'A', 4, 100)] });
  assert.strictEqual((await appel({ action: 'ens-reinitialiser', classe: CLASSE, avatar: 'hibou-vert', codeEnseignant: 'faux-code-enseignant' })).statut, 401);
  assert.strictEqual((await appel({ action: 'ens-reinitialiser', classe: CLASSE, avatar: 'hibou-vert', codeEnseignant: CODE_ENS })).statut, 200);
  assert.strictEqual((await appel({ action: 'etat', classe: CLASSE, avatar: 'hibou-vert' })).corps.sansCode, true);
  // L'ancien code ne marche plus ; l'élève choisit un nouveau code
  assert.strictEqual((await appel({ action: 'verifier', classe: CLASSE, avatar: 'hibou-vert', code: '4827' })).corps.erreur, 'nouveauCode');
  assert.strictEqual((await appel({ action: 'definir-code', classe: CLASSE, avatar: 'hibou-vert', code: '5061' })).statut, 200);
  assert.strictEqual((await appel({ action: 'definir-code', classe: CLASSE, avatar: 'hibou-vert', code: '7092' })).statut, 409);
  const r = await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'hibou-vert', code: '5061', cartes: [] });
  assert.strictEqual(r.corps.cartes[0].boite, 4);
});

test('atelier : liste des avatars (bloqués, sans code) et effacement serveur', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'chat-bleu', code: '4827' });
  await appel({ action: 'creer', classe: CLASSE, avatar: 'lapin-rouge', code: '4827' });
  await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'chat-bleu', code: '4827', cartes: [carte('hist', 'A', 2, 100)] });
  for (let i = 0; i < 5; i++) await appel({ action: 'verifier', classe: CLASSE, avatar: 'lapin-rouge', code: '0001' });
  const liste = (await appel({ action: 'ens-liste', classe: CLASSE, codeEnseignant: CODE_ENS })).corps.avatars;
  assert.deepStrictEqual(liste, [
    { avatar: 'chat-bleu', sansCode: false, bloque: false },
    { avatar: 'lapin-rouge', sansCode: false, bloque: true }
  ]);
  assert.strictEqual((await appel({ action: 'ens-effacer', classe: CLASSE, avatar: 'chat-bleu', codeEnseignant: CODE_ENS })).statut, 200);
  assert.strictEqual(db.donnees.cartes.size, 0);
  assert.strictEqual((await appel({ action: 'verifier', classe: CLASSE, avatar: 'chat-bleu', code: '4827' })).statut, 404);
});

test('purge du 31 août : plus aucune donnée', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'chat-bleu', code: '4827' });
  db.purger();
  assert.strictEqual((await appel({ action: 'classe', classe: CLASSE })).statut, 404);
});

test('requêtes malformées : refusées sans planter', async function () {
  for (const corps of [null, 'x', {}, { action: 'classe' }, { action: 'inconnue', classe: CLASSE, avatar: 'chat-bleu', code: '4827' },
    { action: 'creer', classe: CLASSE, avatar: '../x', code: '4827' }]) {
    const r = await appel(corps);
    assert.ok(r.statut >= 400 && r.statut < 500, JSON.stringify(corps));
  }
});

test('clé d\'administration : 12 caractères au moins, côté saisie comme côté configuration', async function () {
  const courte = { poivre: ENV.poivre, cleEnseignant: 'cle-11-cara' };
  assert.strictEqual(courte.cleEnseignant.length, 11);
  const r1 = await L.traiter({ action: 'admin-creer-classe', classe: 'ABCDEF', cle: 'cle-11-cara', codeEnseignant: CODE_ENS }, db, courte, maintenant);
  assert.strictEqual(r1.statut, 403, 'clé configurée trop courte : refusée même si identique');
  const r2 = await appel({ action: 'admin-creer-classe', classe: 'ABCDEF', cle: ENV.cleEnseignant.slice(0, 11), codeEnseignant: CODE_ENS });
  assert.strictEqual(r2.statut, 403);
});

test('plante : le nombre de séances est synchronisé, le plus grand l\'emporte', async function () {
  await appel({ action: 'creer', classe: CLASSE, avatar: 'chat-rouge', code: '4827' });
  let r = await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'chat-rouge', code: '4827', seances: 7, cartes: [] });
  assert.strictEqual(r.corps.seances, 7);
  r = await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'chat-rouge', code: '4827', seances: 3, cartes: [] });
  assert.strictEqual(r.corps.seances, 7);
  r = await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'chat-rouge', code: '4827', cartes: [] });
  assert.strictEqual(r.corps.seances, 7, 'sans séances envoyées, le serveur garde sa valeur');
  assert.strictEqual((await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'chat-rouge', code: '4827', seances: -1, cartes: [] })).statut, 400);
  assert.strictEqual((await appel({ action: 'synchroniser', classe: CLASSE, avatar: 'chat-rouge', code: '4827', seances: '9', cartes: [] })).statut, 400);
  // Rien d'autre que le nombre : ni date ni lieu
  const ligne = db.donnees.avatars.get(CLASSE + '|chat-rouge');
  assert.strictEqual(typeof ligne.seances, 'number');
});

// ---------- Lot 5 ter : code enseignant par classe, publication ----------

function paquet(id, titre) {
  return { version: 1, id: id, titre: titre, discipline: 'histoire', periode: 'P1', niveau: 'standard', relu: true,
    accents: false, fiche: ['a', 'b', 'c', 'd', 'e'], cartes: [{ recto: 'r', verso: 'v' }],
    quiz: [{ type: 'vraifaux', question: 'Q', reponse: true, explication: 'E' }] };
}

test('code enseignant : 12 caractères au moins, stocké seulement en empreinte', async function () {
  const r = await appel({ action: 'admin-creer-classe', classe: 'ABCDEF', cle: ENV.cleEnseignant, codeEnseignant: 'onze-carac' });
  assert.strictEqual(r.corps.erreur, 'code-enseignant-court');
  const ligne = db.donnees.classes.get(CLASSE);
  assert.ok(!JSON.stringify(ligne).includes(CODE_ENS));
  assert.strictEqual(ligne.empreinte_enseignant.length, 64);
  assert.strictEqual((await appel({ action: 'ens-connexion', classe: CLASSE, codeEnseignant: CODE_ENS })).statut, 200);
});

test('code enseignant : 5 essais faux bloquent la classe une heure', async function () {
  for (let i = 1; i <= 4; i++) {
    const r = await appel({ action: 'ens-connexion', classe: CLASSE, codeEnseignant: 'mauvais-code-ens' });
    assert.strictEqual(r.statut, 401);
    assert.strictEqual(r.corps.restants, 5 - i);
  }
  assert.strictEqual((await appel({ action: 'ens-connexion', classe: CLASSE, codeEnseignant: 'mauvais-code-ens' })).statut, 423);
  assert.strictEqual((await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: CODE_ENS, paquet: paquet('hist-a', 'A') })).statut, 423);
  maintenant += 61 * 60 * 1000;
  assert.strictEqual((await appel({ action: 'ens-connexion', classe: CLASSE, codeEnseignant: CODE_ENS })).statut, 200);
});

test('code enseignant d\'une classe existante : défini avec la clé d\'administration', async function () {
  const nouveau = 'nouveau-code-enseignant';
  assert.strictEqual((await appel({ action: 'admin-code-enseignant', classe: CLASSE, cle: 'mauvaise-cle-admin', codeEnseignant: nouveau })).statut, 403);
  assert.strictEqual((await appel({ action: 'admin-code-enseignant', classe: CLASSE, cle: ENV.cleEnseignant, codeEnseignant: nouveau })).statut, 200);
  assert.strictEqual((await appel({ action: 'ens-connexion', classe: CLASSE, codeEnseignant: CODE_ENS })).statut, 401);
  assert.strictEqual((await appel({ action: 'ens-connexion', classe: CLASSE, codeEnseignant: nouveau })).statut, 200);
});

test('publier : le paquet est visible par la classe, republier le remplace', async function () {
  assert.strictEqual((await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: CODE_ENS, paquet: paquet('hist-a', 'Premier') })).statut, 200);
  let liste = (await appel({ action: 'paquets', classe: CLASSE })).corps.paquets;
  assert.deepStrictEqual(liste.map(function (p) { return p.titre; }), ['Premier']);
  await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: CODE_ENS, paquet: paquet('hist-a', 'Corrigé') });
  liste = (await appel({ action: 'paquets', classe: CLASSE })).corps.paquets;
  assert.deepStrictEqual(liste.map(function (p) { return p.titre; }), ['Corrigé']);
});

test('publier : refusé sans le bon code enseignant, ou si le paquet n\'est pas relu', async function () {
  assert.strictEqual((await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: 'mauvais-code-ens', paquet: paquet('hist-a', 'A') })).statut, 401);
  const nonRelu = Object.assign(paquet('hist-a', 'A'), { relu: false });
  assert.strictEqual((await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: CODE_ENS, paquet: nonRelu })).corps.erreur, 'paquet');
  assert.strictEqual((await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: CODE_ENS, paquet: paquet('../x', 'A') })).corps.erreur, 'paquet');
  assert.strictEqual((await appel({ action: 'paquets', classe: CLASSE })).corps.paquets.length, 0);
});

test('multi-classes : chaque classe ne voit que ses paquets', async function () {
  await appel({ action: 'admin-creer-classe', classe: 'BCDEFG', cle: ENV.cleEnseignant, codeEnseignant: 'autre-code-enseignant' });
  await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: CODE_ENS, paquet: paquet('hist-a', 'Classe 1') });
  await appel({ action: 'ens-publier', classe: 'BCDEFG', codeEnseignant: 'autre-code-enseignant', paquet: paquet('geo-b', 'Classe 2') });
  assert.deepStrictEqual((await appel({ action: 'paquets', classe: CLASSE })).corps.paquets.map(function (p) { return p.id; }), ['hist-a']);
  assert.deepStrictEqual((await appel({ action: 'paquets', classe: 'BCDEFG' })).corps.paquets.map(function (p) { return p.id; }), ['geo-b']);
  // Le code enseignant d'une classe n'ouvre pas l'autre
  assert.strictEqual((await appel({ action: 'ens-publier', classe: 'BCDEFG', codeEnseignant: CODE_ENS, paquet: paquet('x', 'X') })).statut, 401);
});

test('purge du 31 août : les paquets publiés disparaissent aussi', async function () {
  await appel({ action: 'ens-publier', classe: CLASSE, codeEnseignant: CODE_ENS, paquet: paquet('hist-a', 'A') });
  db.purger();
  assert.strictEqual(db.donnees.paquets.size, 0);
});

test('origines autorisées : nouvelle adresse et ancienne pendant la transition', function () {
  const liste = L.listeOrigines(' https://boomerang.tableautablettes.fr/ , https://evottero.github.io ');
  assert.deepStrictEqual(liste, ['https://boomerang.tableautablettes.fr', 'https://evottero.github.io']);
  assert.strictEqual(L.origineAutorisee(liste, 'https://evottero.github.io'), 'https://evottero.github.io');
  assert.strictEqual(L.origineAutorisee(liste, 'https://boomerang.tableautablettes.fr'), 'https://boomerang.tableautablettes.fr');
  // Origine inconnue : on renvoie la première, le navigateur bloquera l'appel
  assert.strictEqual(L.origineAutorisee(liste, 'https://site-inconnu.example'), 'https://boomerang.tableautablettes.fr');
});
