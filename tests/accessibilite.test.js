// Grille d'accessibilité (section 8), pour ce qui se vérifie dans le code.
// Lancer depuis la racine du dépôt : node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(racine, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(racine, 'styles.css'), 'utf8');

// ---------- Consignes ----------

const VERBES = ['Choisis', 'Touche', 'Crée', 'Lis', 'Trouve', 'Dis', 'Écris', 'Montre', 'Connecte-toi', 'Reviens', 'Ouvre'];

function consignes() {
  const liste = [];
  const re = /class="consigne">([^<']*(?:\\'[^<']*)*)</g;
  let m;
  while ((m = re.exec(app))) liste.push(m[1].replace(/\\'/g, '\''));
  return liste.filter(function (c) { return c.trim() !== ''; });
}

test('consignes : au moins 15 trouvées dans le code', function () {
  assert.ok(consignes().length >= 15, JSON.stringify(consignes()));
});

test('consignes : 12 mots maximum', function () {
  consignes().forEach(function (c) {
    const mots = c.split(/\s+/).filter(function (m) { return /[\wÀ-ÿ]/.test(m); });
    assert.ok(mots.length <= 12, c + ' (' + mots.length + ' mots)');
  });
});

test('consignes : un verbe d\'action en tête, au tutoiement', function () {
  consignes().forEach(function (c) {
    const premier = c.trim().split(/[\s,:]+/)[0];
    assert.ok(VERBES.indexOf(premier) !== -1, c);
  });
});

// ---------- Couleurs et contrastes ----------

function variables() {
  const v = {};
  const bloc = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const re = /--([\w-]+):\s*(#[0-9a-fA-F]{6})/g;
  let m;
  while ((m = re.exec(bloc))) v[m[1]] = m[2];
  return v;
}

function luminance(hex) {
  const c = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16) / 255; })
    .map(function (x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contraste(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('couleurs : encre #3D2B1F et café assombri depuis #8C6A4A', function () {
  const v = variables();
  assert.strictEqual(v.encre.toLowerCase(), '#3d2b1f');
  // Même teinte que #8C6A4A, seulement assombrie (composantes proportionnelles).
  const cafe = [1, 3, 5].map(function (i) { return parseInt(v.cafe.slice(i, i + 2), 16); });
  const k = cafe[0] / 0x8c;
  assert.ok(k < 1);
  assert.ok(Math.abs(cafe[1] - 0x6a * k) <= 1 && Math.abs(cafe[2] - 0x4a * k) <= 1, v.cafe);
});

test('texte : seules l\'encre et le café sont utilisées comme couleur de texte', function () {
  const re = /(?:^|[;{\s])color:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    assert.ok(['var(--encre)', 'var(--cafe)', 'inherit'].indexOf(m[1].trim()) !== -1, 'color: ' + m[1]);
  }
});

test('contraste AA : encre sur tous les fonds, au moins 4,5:1', function () {
  const v = variables();
  const fonds = ['sable', 'sable-clair', 'blanc', 'terracotta-clair', 'terracotta-pale', 'ciel', 'ciel-pale', 'ambre', 'ambre-pale'];
  fonds.forEach(function (f) {
    assert.ok(contraste(v.encre, v[f]) >= 4.5, 'encre sur ' + f + ' : ' + contraste(v.encre, v[f]).toFixed(2));
  });
  const avatars = css.match(/--fond-avatar:\s*#[0-9a-fA-F]{6}/g).map(function (d) { return d.slice(-7); });
  assert.strictEqual(avatars.length, 6);
  avatars.forEach(function (f) { assert.ok(contraste(v.encre, f) >= 4.5, 'encre sur avatar ' + f); });
});

test('contraste AA : café sur les fonds sable, sable clair et blanc, au moins 4,5:1', function () {
  const v = variables();
  ['sable', 'sable-clair', 'blanc'].forEach(function (f) {
    assert.ok(contraste(v.cafe, v[f]) >= 4.5, 'café sur ' + f + ' : ' + contraste(v.cafe, v[f]).toFixed(2));
  });
});

test('terracotta pleine : jamais en fond de bouton (encre dessus sous 4,5:1)', function () {
  assert.ok(!/background:\s*var\(--terracotta\)/.test(css));
});

// ---------- Mise en page du texte ----------

test('texte jamais justifié', function () {
  assert.ok(!/text-align:\s*justify/.test(css));
});

test('interligne : 1,5 minimum pour le texte', function () {
  const re = /([^{}]+)\{[^}]*line-height:\s*([\d.]+)(rem|px)?\s*[;}]/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[3]) continue; // hauteur de pastille (chiffre dans un rond), pas un interligne de texte
    const selecteur = m[1].trim().split('\n').pop();
    if (selecteur === '.avatar-icone') continue; // émoji seul
    assert.ok(Number(m[2]) >= 1.5, selecteur + ' : ' + m[2]);
  }
});

test('trois tailles de texte réglables', function () {
  assert.ok(/html\[data-taille="2"\]/.test(css) && /html\[data-taille="3"\]/.test(css));
});

test('polices embarquées : Luciole par défaut, Lexend en alternative, aucune URL externe', function () {
  assert.ok(/font-family: 'Luciole'/.test(css) && /font-family: 'Lexend'/.test(css));
  (css.match(/url\(([^)]*)\)/g) || []).forEach(function (u) {
    assert.ok(/url\('polices\//.test(u), u);
  });
  const index = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  assert.ok(/data-police="luciole"/.test(index));
});

// ---------- Voix ----------

test('voix : la lecture ne démarre que sur un appui', function () {
  assert.ok(!/\.speak\(/.test(app), 'app.js ne doit jamais appeler speak directement');
  const lignes = app.split('\n');
  const appels = [];
  lignes.forEach(function (l, i) { if (/VX\.lire\(/.test(l)) appels.push(i); });
  assert.ok(appels.length >= 1);
  appels.forEach(function (i) {
    const avant = lignes.slice(Math.max(0, i - 3), i + 1).join('\n');
    assert.ok(/addEventListener\('click'/.test(avant), 'VX.lire hors d\'un appui, ligne ' + (i + 1));
  });
});

test('voix : uniquement les voix de l\'appareil (aucun envoi réseau)', function () {
  const voix = fs.readFileSync(path.join(racine, 'voix.js'), 'utf8');
  assert.ok(/localService !== false/.test(voix));
});

test('polices : tous les fichiers déclarés sont présents et mis en cache hors ligne', function () {
  const sw = fs.readFileSync(path.join(racine, 'sw.js'), 'utf8');
  (css.match(/url\('polices\/[^']+'\)/g) || []).forEach(function (u) {
    const fichier = u.slice(5, -2);
    assert.ok(fs.existsSync(path.join(racine, fichier)), fichier + ' manquant');
    assert.ok(sw.indexOf("'" + fichier + "'") !== -1, fichier + ' absent du cache hors ligne');
  });
  assert.ok(fs.existsSync(path.join(racine, 'polices/LICENCE-Luciole.txt')));
  assert.ok(fs.existsSync(path.join(racine, 'polices/LICENCE-Lexend.txt')));
});
