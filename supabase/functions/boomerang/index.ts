// @ts-nocheck
/*
 * Boomerang : fonction de synchronisation et de publication (Supabase Edge Function, lots 5 bis et 5 ter).
 * Seul point d'accès aux tables : l'app n'a jamais accès direct à la base.
 * Ne journalise rien : aucun console.log des requêtes.
 *
 * Secrets à définir dans Supabase (Edge Functions > Secrets) :
 *   BOOMERANG_POIVRE           longue chaîne aléatoire, sert au calcul des empreintes
 *   BOOMERANG_CLE_ENSEIGNANT   clé d'administration (12 caractères au moins) : sert seulement à créer
 *                              une classe et à définir le code enseignant d'une classe
 *   BOOMERANG_ORIGINE          adresse(s) du site, séparées par des virgules, par exemple
 *                              https://boomerang.tableautablettes.fr,https://evottero.github.io
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

// --- LOGIQUE DÉBUT (testée hors Supabase par tests/serveur.test.js) ---

const ESSAIS_MAX = 5;
const BLOCAGE_MS = 60 * 60 * 1000;
const MAX_CARTES = 5000;
const CLE_MIN = 12;
const MAX_SEANCES = 100000;
const CODE_ENSEIGNANT_MIN = 12;
const TAILLE_PAQUET_MAX = 200000;
const RE_CLASSE = /^[A-HJ-NP-Z2-9]{6}$/;
const RE_AVATAR = /^[a-z]{2,20}-[a-z]{2,20}$/;
const RE_CODE = /^[0-9]{4}$/;
const RE_PAQUET = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Origines autorisées à appeler la fonction (en-tête CORS) : liste séparée par des virgules.
function listeOrigines(texte) {
  return String(texte || '').split(',').map(function (o) { return o.trim().replace(/\/+$/, ''); }).filter(Boolean);
}

function origineAutorisee(liste, origine) {
  return liste.indexOf(origine) !== -1 ? origine : liste[0];
}

function reponse(statut, corps) {
  return { statut: statut, corps: corps };
}

function codeRefuse(code) {
  return /^(\d)\1{3}$/.test(code) || code === '1234';
}

function hex(tampon) {
  return Array.from(new Uint8Array(tampon)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function selAleatoire() {
  const t = new Uint8Array(16);
  crypto.getRandomValues(t);
  return hex(t);
}

async function empreinte(poivre, classe, avatar, sel, code) {
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey('raw', enc.encode(poivre), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', cle, enc.encode(classe + '|' + avatar + '|' + sel + '|' + code)));
}

// Comparaison en temps constant.
function egal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Fusion carte par carte : la progression la plus avancée l'emporte
// (boîte la plus haute, puis révision la plus récente, puis nombre de vues).
function plusAvancee(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.boite !== b.boite) return a.boite > b.boite ? a : b;
  if (a.derniere !== b.derniere) return a.derniere > b.derniere ? a : b;
  return a.vues >= b.vues ? a : b;
}

function cleCarte(c) {
  return c.paquet + '\u0000' + c.cle;
}

function cartesValides(cartes) {
  if (!Array.isArray(cartes) || cartes.length > MAX_CARTES) return false;
  return cartes.every(function (c) {
    return c && typeof c.paquet === 'string' && RE_PAQUET.test(c.paquet) && c.paquet.length <= 60 &&
      typeof c.cle === 'string' && c.cle.length > 0 && c.cle.length <= 1000 &&
      Number.isInteger(c.boite) && c.boite >= 1 && c.boite <= 5 &&
      Number.isInteger(c.echeance) && Number.isInteger(c.vues) && c.vues >= 0 && Number.isInteger(c.derniere);
  });
}

// Vérifie le code d'un avatar, avec blocage d'une heure après 5 essais faux.
async function verifierCode(db, env, av, code, maintenant) {
  if (av.bloque_jusqua && Date.parse(av.bloque_jusqua) > maintenant) {
    return reponse(423, { erreur: 'bloque', jusqua: av.bloque_jusqua });
  }
  if (!av.empreinte) return reponse(200, { ok: true, nouveauCode: true });
  const e = await empreinte(env.poivre, av.classe, av.avatar, av.sel, code);
  if (egal(e, av.empreinte)) {
    if (av.essais_faux || av.bloque_jusqua) await db.majAvatar(av.classe, av.avatar, { essais_faux: 0, bloque_jusqua: null });
    return reponse(200, { ok: true });
  }
  const essais = (av.essais_faux || 0) + 1;
  if (essais >= ESSAIS_MAX) {
    const jusqua = new Date(maintenant + BLOCAGE_MS).toISOString();
    await db.majAvatar(av.classe, av.avatar, { essais_faux: 0, bloque_jusqua: jusqua });
    return reponse(423, { erreur: 'bloque', jusqua: jusqua });
  }
  await db.majAvatar(av.classe, av.avatar, { essais_faux: essais, bloque_jusqua: null });
  return reponse(401, { erreur: 'code', restants: ESSAIS_MAX - essais });
}

// Code enseignant de la classe (lot 5 ter) : même limitation d'essais que le code élève.
async function verifierEnseignant(db, env, cl, code, maintenant) {
  if (!cl.empreinte_enseignant) return reponse(403, { erreur: 'sans-code-enseignant' });
  if (cl.bloque_enseignant_jusqua && Date.parse(cl.bloque_enseignant_jusqua) > maintenant) {
    return reponse(423, { erreur: 'bloque', jusqua: cl.bloque_enseignant_jusqua });
  }
  if (typeof code === 'string' && code.length >= CODE_ENSEIGNANT_MIN && code.length <= 200) {
    const e = await empreinte(env.poivre, cl.code, '#enseignant', cl.sel_enseignant, code);
    if (egal(e, cl.empreinte_enseignant)) {
      if (cl.essais_faux_enseignant || cl.bloque_enseignant_jusqua) {
        await db.majClasse(cl.code, { essais_faux_enseignant: 0, bloque_enseignant_jusqua: null });
      }
      return reponse(200, { ok: true });
    }
  }
  const essais = (cl.essais_faux_enseignant || 0) + 1;
  if (essais >= ESSAIS_MAX) {
    const jusqua = new Date(maintenant + BLOCAGE_MS).toISOString();
    await db.majClasse(cl.code, { essais_faux_enseignant: 0, bloque_enseignant_jusqua: jusqua });
    return reponse(423, { erreur: 'bloque', jusqua: jusqua });
  }
  await db.majClasse(cl.code, { essais_faux_enseignant: essais, bloque_enseignant_jusqua: null });
  return reponse(401, { erreur: 'code-enseignant', restants: ESSAIS_MAX - essais });
}

async function nouveauCodeEnseignant(env, classe, code) {
  const sel = selAleatoire();
  return {
    sel_enseignant: sel,
    empreinte_enseignant: await empreinte(env.poivre, classe, '#enseignant', sel, code),
    essais_faux_enseignant: 0,
    bloque_enseignant_jusqua: null
  };
}

// Contrôle minimal côté serveur ; l'app valide chaque paquet en entier à l'ouverture.
function paquetPublie(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (typeof p.id !== 'string' || !RE_PAQUET.test(p.id) || p.id.length > 60) return false;
  if (typeof p.titre !== 'string' || !p.titre.trim() || p.relu !== true) return false;
  if (!Array.isArray(p.fiche) || !Array.isArray(p.cartes) || !Array.isArray(p.quiz)) return false;
  return JSON.stringify(p).length <= TAILLE_PAQUET_MAX;
}

// Clé d'administration : 12 caractères au moins, côté configuration comme côté saisie.
function cleEnseignantValide(env, cle) {
  return typeof env.cleEnseignant === 'string' && env.cleEnseignant.length >= CLE_MIN &&
    typeof cle === 'string' && cle.length >= CLE_MIN && egal(cle, env.cleEnseignant);
}

async function traiter(corps, db, env, maintenant) {
  if (!corps || typeof corps !== 'object') return reponse(400, { erreur: 'requete' });
  const action = corps.action;
  const classe = typeof corps.classe === 'string' ? corps.classe.toUpperCase() : '';
  if (!RE_CLASSE.test(classe)) return reponse(400, { erreur: 'classe' });

  // ----- Administration (clé d'administration) : créer une classe, définir son code enseignant -----
  if (action === 'admin-creer-classe' || action === 'admin-code-enseignant') {
    if (!cleEnseignantValide(env, corps.cle)) return reponse(403, { erreur: 'cle' });
    const codeEns = corps.codeEnseignant;
    if (typeof codeEns !== 'string' || codeEns.length < CODE_ENSEIGNANT_MIN || codeEns.length > 200) {
      return reponse(400, { erreur: 'code-enseignant-court' });
    }
    const champs = await nouveauCodeEnseignant(env, classe, codeEns);
    if (action === 'admin-creer-classe') {
      if (await db.classeExiste(classe)) return reponse(409, { erreur: 'existe' });
      await db.creerClasse(Object.assign({ code: classe }, champs));
      return reponse(200, { ok: true });
    }
    if (!(await db.classeExiste(classe))) return reponse(404, { erreur: 'classe' });
    await db.majClasse(classe, champs);
    return reponse(200, { ok: true });
  }

  // ----- Actions enseignant (code enseignant de la classe) -----
  if (typeof action === 'string' && action.indexOf('ens-') === 0) {
    const cl = await db.lireClasse(classe);
    if (!cl) return reponse(404, { erreur: 'classe' });
    const verif = await verifierEnseignant(db, env, cl, corps.codeEnseignant, maintenant);
    if (verif.statut !== 200) return verif;

    if (action === 'ens-connexion') return verif;
    if (action === 'ens-liste') {
      const liste = await db.listerAvatars(classe);
      return reponse(200, {
        ok: true,
        avatars: liste.map(function (a) {
          return {
            avatar: a.avatar,
            sansCode: !a.empreinte,
            bloque: !!(a.bloque_jusqua && Date.parse(a.bloque_jusqua) > maintenant)
          };
        })
      });
    }
    if (action === 'ens-publier') {
      if (!paquetPublie(corps.paquet)) return reponse(400, { erreur: 'paquet' });
      await db.ecrirePaquet({ classe: classe, id: corps.paquet.id, contenu: corps.paquet });
      return reponse(200, { ok: true });
    }
    if (typeof corps.avatar !== 'string' || !RE_AVATAR.test(corps.avatar)) return reponse(400, { erreur: 'avatar' });
    const cible = await db.lireAvatar(classe, corps.avatar);
    if (!cible) return reponse(404, { erreur: 'avatar' });
    if (action === 'ens-reinitialiser') {
      // Le code est effacé, la progression est conservée.
      await db.majAvatar(classe, corps.avatar, { empreinte: null, essais_faux: 0, bloque_jusqua: null });
      return reponse(200, { ok: true });
    }
    if (action === 'ens-effacer') {
      await db.effacerAvatar(classe, corps.avatar);
      return reponse(200, { ok: true });
    }
    return reponse(400, { erreur: 'action' });
  }

  // ----- Actions élève -----
  if (!(await db.classeExiste(classe))) return reponse(404, { erreur: 'classe' });

  if (action === 'classe') {
    const liste = await db.listerAvatars(classe);
    return reponse(200, { ok: true, avatars: liste.map(function (a) { return a.avatar; }) });
  }

  // Paquets publiés pour la classe : les élèves ne voient que ceux-là.
  if (action === 'paquets') {
    const liste = await db.listerPaquets(classe);
    return reponse(200, { ok: true, paquets: liste.map(function (p) { return p.contenu; }) });
  }

  const avatar = corps.avatar;
  if (typeof avatar !== 'string' || !RE_AVATAR.test(avatar)) return reponse(400, { erreur: 'avatar' });

  if (action === 'etat') {
    const av = await db.lireAvatar(classe, avatar);
    if (!av) return reponse(404, { erreur: 'avatar' });
    return reponse(200, {
      ok: true,
      sansCode: !av.empreinte,
      bloque: !!(av.bloque_jusqua && Date.parse(av.bloque_jusqua) > maintenant)
    });
  }

  const code = corps.code;
  if (typeof code !== 'string' || !RE_CODE.test(code)) return reponse(400, { erreur: 'code-format' });

  if (action === 'creer') {
    if (codeRefuse(code)) return reponse(400, { erreur: 'code-faible' });
    if (await db.lireAvatar(classe, avatar)) return reponse(409, { erreur: 'pris' });
    const sel = selAleatoire();
    const ok = await db.creerAvatar({
      classe: classe, avatar: avatar, sel: sel,
      empreinte: await empreinte(env.poivre, classe, avatar, sel, code),
      essais_faux: 0, bloque_jusqua: null, seances: 0
    });
    return ok ? reponse(200, { ok: true }) : reponse(409, { erreur: 'pris' });
  }

  const av = await db.lireAvatar(classe, avatar);
  if (!av) return reponse(404, { erreur: 'avatar' });

  if (action === 'definir-code') {
    // Seulement après une réinitialisation par l'enseignant.
    if (av.empreinte) return reponse(409, { erreur: 'code-existe' });
    if (codeRefuse(code)) return reponse(400, { erreur: 'code-faible' });
    const sel = selAleatoire();
    await db.majAvatar(classe, avatar, {
      sel: sel, empreinte: await empreinte(env.poivre, classe, avatar, sel, code), essais_faux: 0, bloque_jusqua: null
    });
    return reponse(200, { ok: true });
  }

  const verif = await verifierCode(db, env, av, code, maintenant);
  if (verif.statut !== 200) return verif;
  if (verif.corps.nouveauCode) return reponse(409, { erreur: 'nouveauCode' });

  if (action === 'verifier') return verif;

  if (action === 'synchroniser') {
    if (!cartesValides(corps.cartes)) return reponse(400, { erreur: 'cartes' });
    // Plante : un simple nombre de séances ; le plus grand l'emporte.
    const seancesClient = corps.seances === undefined ? 0 : corps.seances;
    if (!Number.isInteger(seancesClient) || seancesClient < 0 || seancesClient > MAX_SEANCES) {
      return reponse(400, { erreur: 'seances' });
    }
    const seances = Math.max(av.seances || 0, seancesClient);
    if (seances !== (av.seances || 0)) await db.majAvatar(classe, avatar, { seances: seances });
    const serveur = await db.lireCartes(classe, avatar);
    const fusion = {};
    serveur.forEach(function (c) { fusion[cleCarte(c)] = c; });
    const aEcrire = [];
    corps.cartes.forEach(function (c) {
      const k = cleCarte(c);
      const gagnante = plusAvancee(fusion[k], c);
      if (gagnante === c && fusion[k] !== c) {
        aEcrire.push({ classe: classe, avatar: avatar, paquet: c.paquet, cle: c.cle, boite: c.boite, echeance: c.echeance, vues: c.vues, derniere: c.derniere });
      }
      fusion[k] = gagnante;
    });
    if (aEcrire.length) await db.ecrireCartes(aEcrire);
    return reponse(200, {
      ok: true,
      seances: seances,
      cartes: Object.keys(fusion).map(function (k) {
        const c = fusion[k];
        return { paquet: c.paquet, cle: c.cle, boite: c.boite, echeance: c.echeance, vues: c.vues, derniere: c.derniere };
      })
    });
  }

  return reponse(400, { erreur: 'action' });
}

// --- LOGIQUE FIN ---

// Accès à la base avec la clé de service (jamais exposée à l'app).
function adaptateur(sb) {
  const verifier = function (r) { if (r.error) throw r.error; return r.data; };
  return {
    classeExiste: async function (code) {
      return verifier(await sb.from('classes').select('code').eq('code', code).maybeSingle()) !== null;
    },
    creerClasse: async function (ligne) {
      verifier(await sb.from('classes').insert(ligne));
    },
    lireClasse: async function (code) {
      return verifier(await sb.from('classes').select('*').eq('code', code).maybeSingle());
    },
    majClasse: async function (code, champs) {
      verifier(await sb.from('classes').update(champs).eq('code', code));
    },
    listerPaquets: async function (classe) {
      return verifier(await sb.from('paquets').select('contenu').eq('classe', classe).order('id'));
    },
    ecrirePaquet: async function (ligne) {
      verifier(await sb.from('paquets').upsert(ligne, { onConflict: 'classe,id' }));
    },
    listerAvatars: async function (classe) {
      return verifier(await sb.from('avatars').select('avatar, empreinte, bloque_jusqua').eq('classe', classe).order('avatar'));
    },
    lireAvatar: async function (classe, avatar) {
      return verifier(await sb.from('avatars').select('*').eq('classe', classe).eq('avatar', avatar).maybeSingle());
    },
    creerAvatar: async function (ligne) {
      const r = await sb.from('avatars').insert(ligne);
      if (r.error && r.error.code === '23505') return false; // déjà pris
      verifier(r);
      return true;
    },
    majAvatar: async function (classe, avatar, champs) {
      verifier(await sb.from('avatars').update(champs).eq('classe', classe).eq('avatar', avatar));
    },
    effacerAvatar: async function (classe, avatar) {
      verifier(await sb.from('avatars').delete().eq('classe', classe).eq('avatar', avatar));
    },
    lireCartes: async function (classe, avatar) {
      return verifier(await sb.from('cartes').select('paquet, cle, boite, echeance, vues, derniere').eq('classe', classe).eq('avatar', avatar));
    },
    ecrireCartes: async function (lignes) {
      for (let i = 0; i < lignes.length; i += 500) {
        verifier(await sb.from('cartes').upsert(lignes.slice(i, i + 500), { onConflict: 'classe,avatar,paquet,cle' }));
      }
    }
  };
}

// Clé de service fournie automatiquement par Supabase : ancien nom (SUPABASE_SERVICE_ROLE_KEY)
// ou nouveau système de clés (SUPABASE_SECRET_KEYS, objet JSON { "default": "sb_secret_…" }).
function cleService() {
  const ancienne = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (ancienne) return ancienne;
  try {
    const cles = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    return cles.default || Object.values(cles)[0] || '';
  } catch (e) {
    return '';
  }
}

const sb = createClient(Deno.env.get('SUPABASE_URL'), cleService(), {
  auth: { persistSession: false }
});
const db = adaptateur(sb);
const env = {
  poivre: Deno.env.get('BOOMERANG_POIVRE') || '',
  cleEnseignant: Deno.env.get('BOOMERANG_CLE_ENSEIGNANT') || ''
};
const ORIGINES = listeOrigines(Deno.env.get('BOOMERANG_ORIGINE') || 'https://boomerang.tableautablettes.fr');

Deno.serve(async function (req) {
  const entetes = {
    'Access-Control-Allow-Origin': origineAutorisee(ORIGINES, req.headers.get('origin') || ''),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: entetes });
  if (req.method !== 'POST') return new Response('{"erreur":"methode"}', { status: 405, headers: entetes });
  if (!env.poivre || env.poivre.length < 32) return new Response('{"erreur":"configuration"}', { status: 500, headers: entetes });

  let corps;
  try {
    corps = await req.json();
  } catch (e) {
    return new Response('{"erreur":"requete"}', { status: 400, headers: entetes });
  }
  try {
    const r = await traiter(corps, db, env, Date.now());
    return new Response(JSON.stringify(r.corps), { status: r.statut, headers: entetes });
  } catch (e) {
    return new Response('{"erreur":"serveur"}', { status: 500, headers: entetes });
  }
});
