// Page d'accueil (index.html), pages publiques et accès par code de classe.
// Lancer depuis la racine du dépôt : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const lire = function (f) { return fs.readFileSync(path.join(racine, f), 'utf8'); };
const accueil = lire('index.html');
const css = lire('accueil.css');
const js = lire('accueil.js');

test('accueil : textes du cahier des charges, à l\'identique', function () {
  [
    '<h1>Boomerang</h1>',
    'href="https://tableautablettes.fr"',
    'Les cartes qu\'on ne sait pas reviennent. Jusqu\'à ce qu\'on les sache.',
    'Se tester plutôt que relire',
    'Revoir juste avant d\'oublier',
    'Pensé pour tous les élèves : voix, police Luciole, aucun chronomètre',
    'Aucun nom, aucun compte, aucune publicité. Un avatar et un code suffisent.',
    'Entrer dans Boomerang',
    '>Code de classe</label>',
    '>Entrer</button>',
    'Boomerang est réservé aux classes participantes. Vous êtes enseignant et l\'outil vous intéresse ?',
    '>Me contacter</a>',
    '>Confidentialité</a>',
    '>Mentions légales</a>'
  ].forEach(function (t) { assert.ok(accueil.indexOf(t) !== -1, 'texte absent : ' + t); });
  assert.ok(js.indexOf('Code inconnu. Vérifie auprès de ton enseignant.') !== -1);
});

test('accueil : ordre des éléments (en-tête, accroche, blocs, promesse, accès, pied)', function () {
  const ordre = ['class="entete"', 'class="accroche"', 'class="atouts"', 'class="promesse"', 'class="acces"', 'class="pied"']
    .map(function (m) { return accueil.indexOf(m); });
  ordre.forEach(function (p) { assert.ok(p !== -1); });
  ordre.slice(1).forEach(function (p, i) { assert.ok(p > ordre[i]); });
  // Logo iCARE local, en haut à droite (dans l'en-tête, après le titre)
  assert.ok(accueil.indexOf('icons/logo-icare.png') > accueil.indexOf('<h1>Boomerang</h1>'));
  assert.ok(fs.existsSync(path.join(racine, 'icons/logo-icare.png')));
});

test('accueil : aucune ressource extérieure, aucun cookie, aucun traceur', function () {
  [accueil, lire('mentions-legales.html'), lire('confidentialite.html')].forEach(function (page) {
    (page.match(/<(script|link|img)[^>]+(src|href)="([^"]+)"/g) || []).forEach(function (balise) {
      assert.ok(!/(src|href)="https?:\/\//.test(balise), 'ressource extérieure : ' + balise);
    });
    assert.ok(/Content-Security-Policy/.test(page));
  });
  assert.ok(!/document\.cookie|localStorage|gtag|analytics/i.test(js));
  (css.match(/url\(([^)]*)\)/g) || []).forEach(function (u) { assert.ok(/url\('polices\//.test(u), u); });
});

test('accueil : couleurs de la charte Sable, texte toujours à l\'encre', function () {
  assert.ok(/--fond: #f6e7ce/i.test(css) && /--encre: #3d2b1f/i.test(css) && /--ambre: #e8a860/i.test(css));
  (css.match(/(?:^|[;{\s])color:\s*([^;}]+)/g) || []).forEach(function (d) {
    assert.ok(/var\(--encre\)/.test(d), d);
  });
  const L = function (h) {
    return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; })
      .map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  };
  const R = function (a, b) { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  assert.ok(R('#3d2b1f', '#f6e7ce') >= 4.5);
  assert.ok(R('#3d2b1f', '#e8a860') >= 4.5);
});

test('accès : l\'app renvoie à l\'accueil sans code de classe ; l\'icône ouvre l\'app', function () {
  const app = lire('app.js');
  assert.ok(/!accesAccorde && !accesSession\(\)\) \{\s*location\.replace\('\.\/' \+ location\.hash\)/.test(app));
  const manifeste = JSON.parse(lire('manifest.webmanifest'));
  assert.strictEqual(manifeste.start_url, 'app.html');
  assert.strictEqual(manifeste.name, 'Boomerang');
  // Même limitation d'essais que les autres codes : 5, puis une heure
  assert.ok(/ESSAIS_MAX = 5/.test(js) && /BLOCAGE_MS = 60 \* 60 \* 1000/.test(js));
  // Un code valide ouvre l'app et est retenu par l'appareil
  assert.ok(/ecrireReglage\('acces', true\)/.test(js) && /location\.replace\('app\.html' \+ location\.hash\)/.test(js));
});

test('mentions légales : texte fourni par Eric, deux zones restant à compléter', function () {
  const m = lire('mentions-legales.html');
  ['Éditeur du site', 'Eric Vottero, entrepreneur individuel, sous la marque iCARE by Eric.', 'Statut du site',
    'GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis. Service GitHub Pages.',
    'Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513.',
    'Responsable du traitement : Eric Vottero.', 'effacées automatiquement chaque 31 août',
    'href="https://www.cnil.fr"', 'Propriété intellectuelle'
  ].forEach(function (t) { assert.ok(m.indexOf(t) !== -1, t); });
  assert.deepStrictEqual((m.match(/class="a-completer">\[([^\]]+)\]/g) || []).map(function (z) { return z.replace(/.*\[/, '').replace(']', ''); }),
    ['adresse e-mail de contact', 'date de mise en ligne']);
});

test('en-têtes publics : icône officielle Boomerang, plus de plante', function () {
  ['index.html', 'mentions-legales.html', 'confidentialite.html'].forEach(function (f) {
    const p = lire(f);
    assert.ok(p.indexOf('src="icons/boomerang.png"') !== -1, f);
    assert.ok(p.indexOf('<img src="icons/icon-192.png"') === -1, f);
  });
  assert.ok(fs.existsSync(path.join(racine, 'icons/boomerang.png')));
});

test('hors ligne : les nouvelles pages sont mises en cache par le service worker', function () {
  const sw = lire('sw.js');
  ['app.html', 'accueil.js', 'accueil.css', 'confidentialite.html', 'mentions-legales.html', 'icons/logo-icare.png'].forEach(function (f) {
    assert.ok(sw.indexOf("'" + f + "'") !== -1, f);
  });
});
