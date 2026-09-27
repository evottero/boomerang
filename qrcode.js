/*
 * Générateur de QR code embarqué (aucun service en ligne).
 * Mode octets (UTF-8), versions 1 à 10, masque choisi par pénalité (norme ISO/IEC 18004).
 *
 * Adapté de « QR Code generator library » de Project Nayuki.
 * Copyright (c) Project Nayuki. (MIT License) https://www.nayuki.io/page/qr-code-generator-library
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions: the above copyright notice and this
 * permission notice shall be included in all copies or substantial portions of the Software.
 * The Software is provided "as is", without warranty of any kind, express or implied.
 */
(function (racine) {
  'use strict';

  const VERSION_MAX = 10;

  // Niveaux de correction : bits de format et index dans les tables.
  const NIVEAUX = {
    L: { ordinal: 0, formatBits: 1 },
    M: { ordinal: 1, formatBits: 0 },
    Q: { ordinal: 2, formatBits: 3 },
    H: { ordinal: 3, formatBits: 2 }
  };

  // Index 0 inutilisé ; versions 1 à 10.
  const ECC_PAR_BLOC = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],  // L
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], // M
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24], // Q
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]  // H
  ];
  const NB_BLOCS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4], // L
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5], // M
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8], // Q
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]  // H
  ];

  function bit(x, i) {
    return ((x >>> i) & 1) !== 0;
  }

  function nbModulesDonnees(version) {
    let n = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const nbAlign = Math.floor(version / 7) + 2;
      n -= (25 * nbAlign - 10) * nbAlign - 55;
      if (version >= 7) n -= 36;
    }
    return n;
  }

  function nbOctetsDonnees(version, niveau) {
    return Math.floor(nbModulesDonnees(version) / 8) -
      ECC_PAR_BLOC[niveau.ordinal][version] * NB_BLOCS[niveau.ordinal][version];
  }

  // ---------- Reed-Solomon sur GF(256), polynôme 0x11D ----------

  function multiplier(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function diviseur(degre) {
    const res = new Array(degre).fill(0);
    res[degre - 1] = 1;
    let racineRS = 1;
    for (let i = 0; i < degre; i++) {
      for (let j = 0; j < res.length; j++) {
        res[j] = multiplier(res[j], racineRS);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      racineRS = multiplier(racineRS, 0x02);
    }
    return res;
  }

  function reste(donnees, div) {
    const res = div.map(function () { return 0; });
    donnees.forEach(function (b) {
      const facteur = b ^ res.shift();
      res.push(0);
      div.forEach(function (coef, i) { res[i] ^= multiplier(coef, facteur); });
    });
    return res;
  }

  // ---------- Encodage ----------

  function octetsUtf8(texte) {
    const enc = encodeURI(texte);
    const res = [];
    for (let i = 0; i < enc.length; i++) {
      if (enc.charAt(i) !== '%') res.push(enc.charCodeAt(i));
      else { res.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2; }
    }
    return res;
  }

  function encoder(texte, lettreNiveau) {
    const niveau = NIVEAUX[lettreNiveau || 'M'];
    const octets = octetsUtf8(texte);

    // Plus petite version qui contient le texte (mode octets).
    let version = 1;
    for (; version <= VERSION_MAX; version++) {
      const bitsCompteur = version <= 9 ? 8 : 16;
      if (4 + bitsCompteur + octets.length * 8 <= nbOctetsDonnees(version, niveau) * 8) break;
    }
    if (version > VERSION_MAX) throw new Error('Texte trop long pour le QR code.');

    const capacite = nbOctetsDonnees(version, niveau) * 8;
    const bits = [];
    const ajouter = function (valeur, longueur) {
      for (let i = longueur - 1; i >= 0; i--) bits.push((valeur >>> i) & 1);
    };
    ajouter(0x4, 4); // mode octets
    ajouter(octets.length, version <= 9 ? 8 : 16);
    octets.forEach(function (b) { ajouter(b, 8); });
    ajouter(0, Math.min(4, capacite - bits.length)); // terminaison
    ajouter(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacite; pad ^= 0xEC ^ 0x11) ajouter(pad, 8);

    const donnees = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      donnees.push(b);
    }
    return construire(version, niveau, donnees);
  }

  function avecCorrection(version, niveau, donnees) {
    const nbBlocs = NB_BLOCS[niveau.ordinal][version];
    const eccBloc = ECC_PAR_BLOC[niveau.ordinal][version];
    const brut = Math.floor(nbModulesDonnees(version) / 8);
    const nbCourts = nbBlocs - brut % nbBlocs;
    const longCourt = Math.floor(brut / nbBlocs);

    const blocs = [];
    const div = diviseur(eccBloc);
    for (let i = 0, k = 0; i < nbBlocs; i++) {
      const dat = donnees.slice(k, k + longCourt - eccBloc + (i < nbCourts ? 0 : 1));
      k += dat.length;
      const ecc = reste(dat, div);
      if (i < nbCourts) dat.push(0);
      blocs.push(dat.concat(ecc));
    }
    const res = [];
    for (let i = 0; i < blocs[0].length; i++) {
      blocs.forEach(function (bloc, j) {
        if (i !== longCourt - eccBloc || j >= nbCourts) res.push(bloc[i]);
      });
    }
    return res;
  }

  // ---------- Dessin de la matrice ----------

  function construire(version, niveau, donnees) {
    const taille = version * 4 + 17;
    const modules = [];
    const fonction = [];
    for (let i = 0; i < taille; i++) {
      modules.push(new Array(taille).fill(false));
      fonction.push(new Array(taille).fill(false));
    }
    const poser = function (x, y, noir) { modules[y][x] = noir; fonction[y][x] = true; };

    // Motifs de synchronisation
    for (let i = 0; i < taille; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }

    // Motifs de repérage (3 coins) et séparateurs
    [[3, 3], [taille - 4, 3], [3, taille - 4]].forEach(function (c) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = c[0] + dx, y = c[1] + dy;
          if (x >= 0 && x < taille && y >= 0 && y < taille) poser(x, y, d !== 2 && d !== 4);
        }
      }
    });

    // Motifs d'alignement
    const positions = positionsAlignement(version, taille);
    const n = positions.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            poser(positions[i] + dx, positions[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }

    function dessinerFormat(masque) {
      const d = niveau.formatBits << 3 | masque;
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = (d << 10 | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) poser(8, i, bit(b, i));
      poser(8, 7, bit(b, 6));
      poser(8, 8, bit(b, 7));
      poser(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) poser(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) poser(taille - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) poser(8, taille - 15 + i, bit(b, i));
      poser(8, taille - 8, true); // module toujours noir
    }

    dessinerFormat(0); // réserve la zone, redessinée après le choix du masque

    // Informations de version (versions 7 et plus)
    if (version >= 7) {
      let r = version;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = version << 12 | r;
      for (let i = 0; i < 18; i++) {
        const noir = bit(b, i);
        const a = taille - 11 + i % 3, c = Math.floor(i / 3);
        poser(a, c, noir);
        poser(c, a, noir);
      }
    }

    // Données en zigzag
    const mots = avecCorrection(version, niveau, donnees);
    let i = 0;
    for (let droite = taille - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let vert = 0; vert < taille; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = droite - j;
          const montant = ((droite + 1) & 2) === 0;
          const y = montant ? taille - 1 - vert : vert;
          if (!fonction[y][x] && i < mots.length * 8) {
            modules[y][x] = bit(mots[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }

    // Choix du masque le moins pénalisant
    function appliquerMasque(m) {
      for (let y = 0; y < taille; y++) {
        for (let x = 0; x < taille; x++) {
          let inv;
          switch (m) {
            case 0: inv = (x + y) % 2 === 0; break;
            case 1: inv = y % 2 === 0; break;
            case 2: inv = x % 3 === 0; break;
            case 3: inv = (x + y) % 3 === 0; break;
            case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: inv = x * y % 2 + x * y % 3 === 0; break;
            case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
            default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
          }
          if (!fonction[y][x] && inv) modules[y][x] = !modules[y][x];
        }
      }
    }

    let meilleur = 0;
    let penaliteMin = Infinity;
    for (let m = 0; m < 8; m++) {
      appliquerMasque(m);
      dessinerFormat(m);
      const p = penalite(modules, taille);
      if (p < penaliteMin) { meilleur = m; penaliteMin = p; }
      appliquerMasque(m); // annule (XOR)
    }
    appliquerMasque(meilleur);
    dessinerFormat(meilleur);

    return { version: version, taille: taille, masque: meilleur, modules: modules };
  }

  function positionsAlignement(version, taille) {
    if (version === 1) return [];
    const nb = Math.floor(version / 7) + 2;
    const pas = Math.ceil((version * 4 + 4) / (nb * 2 - 2)) * 2;
    const res = [6];
    for (let pos = taille - 7; res.length < nb; pos -= pas) res.splice(1, 0, pos);
    return res;
  }

  // ---------- Pénalités (choix du masque) ----------

  function penalite(m, taille) {
    let total = 0;

    function ajouterHistorique(longueur, h) {
      if (h[0] === 0) longueur += taille;
      h.pop();
      h.unshift(longueur);
    }
    function compterMotifs(h) {
      const n = h[1];
      const coeur = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (coeur && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (coeur && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    }
    function terminer(couleur, longueur, h) {
      if (couleur) { ajouterHistorique(longueur, h); longueur = 0; }
      longueur += taille;
      ajouterHistorique(longueur, h);
      return compterMotifs(h);
    }

    // Lignes puis colonnes : suites de même couleur et motifs ressemblant aux repères
    for (let sens = 0; sens < 2; sens++) {
      for (let a = 0; a < taille; a++) {
        let couleur = false;
        let longueur = 0;
        const h = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < taille; b++) {
          const v = sens === 0 ? m[a][b] : m[b][a];
          if (v === couleur) {
            longueur++;
            if (longueur === 5) total += 3;
            else if (longueur > 5) total++;
          } else {
            ajouterHistorique(longueur, h);
            if (!couleur) total += compterMotifs(h) * 40;
            couleur = v;
            longueur = 1;
          }
        }
        total += terminer(couleur, longueur, h) * 40;
      }
    }

    // Carrés 2×2 de même couleur
    for (let y = 0; y < taille - 1; y++) {
      for (let x = 0; x < taille - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) total += 3;
      }
    }

    // Équilibre noir / blanc
    let noirs = 0;
    m.forEach(function (ligne) { ligne.forEach(function (v) { if (v) noirs++; }); });
    const n = taille * taille;
    total += (Math.ceil(Math.abs(noirs * 20 - n * 10) / n) - 1) * 10;
    return total;
  }

  // ---------- Sortie SVG ----------

  // Renvoie un SVG carré, avec la marge blanche de 4 modules exigée par la norme.
  function svg(texte, options) {
    const o = options || {};
    const qr = encoder(texte, o.niveau || 'M');
    const marge = 4;
    const cote = qr.taille + marge * 2;
    let chemin = '';
    for (let y = 0; y < qr.taille; y++) {
      for (let x = 0; x < qr.taille; x++) {
        if (qr.modules[y][x]) chemin += 'M' + (x + marge) + ',' + (y + marge) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + cote + ' ' + cote + '"' +
      ' shape-rendering="crispEdges"' + (o.classe ? ' class="' + o.classe + '"' : '') +
      (o.libelle ? ' role="img" aria-label="' + o.libelle + '"' : ' aria-hidden="true"') + '>' +
      '<rect width="' + cote + '" height="' + cote + '" fill="#ffffff"/>' +
      '<path d="' + chemin + '" fill="' + (o.couleur || '#000000') + '"/></svg>';
  }

  const api = { encoder: encoder, svg: svg, VERSION_MAX: VERSION_MAX };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.QRCode = api;
})(this);
