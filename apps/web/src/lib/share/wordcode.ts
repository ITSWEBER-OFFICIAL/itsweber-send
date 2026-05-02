/**
 * Deterministic 4-word code for a share id. Used as a memorable alias
 * shown in the share UI; the link itself remains the source of truth.
 *
 * The wordlist is a small set of common, easy-to-spell German nouns. Four
 * words give ~32 bits of indexing — same order of magnitude as the share-id
 * collision space (96 bits) is reduced to via salted SHA-256 here, which is
 * fine for "you read this aloud" purposes, not for security.
 */

const WORDS = [
  'apfel', 'wolke', 'pferd', 'hut', 'baum', 'stein', 'fluss', 'berg', 'meer', 'wind',
  'sonne', 'mond', 'stern', 'feuer', 'erde', 'blatt', 'blume', 'gras', 'sand', 'eis',
  'schnee', 'regen', 'sturm', 'donner', 'blitz', 'tag', 'nacht', 'morgen', 'abend', 'jahr',
  'woche', 'stunde', 'minute', 'haus', 'tor', 'fenster', 'tisch', 'stuhl', 'bett', 'lampe',
  'buch', 'feder', 'tinte', 'brief', 'paket', 'koffer', 'tasche', 'schluessel', 'schloss', 'kette',
  'ring', 'kamm', 'spiegel', 'uhr', 'glas', 'flasche', 'krug', 'kanne', 'teller', 'loeffel',
  'gabel', 'messer', 'topf', 'pfanne', 'ofen', 'herd', 'brot', 'kaese', 'milch', 'honig',
  'salz', 'pfeffer', 'kraut', 'beere', 'kirsche', 'birne', 'pflaume', 'traube', 'nuss', 'zimt',
  'zucker', 'sahne', 'butter', 'salat', 'gurke', 'tomate', 'kartoffel', 'mohrrübe', 'zwiebel', 'knoblauch',
  'hund', 'katze', 'maus', 'fuchs', 'wolf', 'baer', 'reh', 'hirsch', 'hase', 'igel',
  'eichhorn', 'biber', 'otter', 'dachs', 'specht', 'eule', 'falke', 'adler', 'taube', 'schwalbe',
  'amsel', 'sperling', 'meise', 'fink', 'rabe', 'krähe', 'storch', 'kranich', 'reiher', 'schwan',
  'ente', 'gans', 'huhn', 'hahn', 'fisch', 'forelle', 'lachs', 'aal', 'krebs', 'muschel',
  'koralle', 'qualle', 'delfin', 'wal', 'hai', 'rochen', 'auto', 'rad', 'bus', 'zug',
  'schiff', 'boot', 'segel', 'anker', 'flugzeug', 'rakete', 'ballon', 'drachen', 'wagen', 'kutsche',
  'sattel', 'zaeumchen', 'helm', 'panzer', 'schwert', 'schild', 'bogen', 'pfeil', 'speer', 'lanze',
  'krone', 'thron', 'burg', 'turm', 'mauer', 'bruecke', 'pfad', 'strasse', 'platz', 'park',
  'wiese', 'wald', 'feld', 'weide', 'koppel', 'stall', 'scheune', 'hof', 'garten', 'beet',
  'zaun', 'gatter', 'pforte', 'kamin', 'rauch', 'asche', 'kohle', 'glut', 'flamme', 'kerze',
  'docht', 'lampe2', 'leuchte', 'fackel', 'laterne', 'spiegel2', 'glas2', 'kristall', 'edelstein', 'gold',
  'silber', 'kupfer', 'eisen', 'stahl', 'zinn', 'blei', 'bronze', 'messing', 'platin', 'titan',
  'malve', 'rose', 'tulpe', 'lilie', 'mohn', 'aster', 'krokus', 'narzisse', 'veilchen', 'klee',
  'farn', 'moos', 'pilz', 'wurzel', 'rinde', 'zweig', 'ast', 'krone2', 'samen', 'frucht',
  'kern', 'knospe', 'bluete', 'duft', 'aroma', 'geist', 'seele', 'herz', 'kopf', 'hand',
  'fuss', 'arm', 'bein', 'auge', 'ohr', 'mund', 'zahn', 'lippe', 'wange', 'stirn',
  'haar', 'flechte', 'krone3', 'tropfen', 'welle',
];

const TOTAL = WORDS.length; // 255

export async function wordCodeFromId(id: string): Promise<string> {
  const enc = new TextEncoder().encode(`itsweber-send/wordcode/${id}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc));
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = digest[i * 2]! * 256 + digest[i * 2 + 1]!;
    out.push(WORDS[idx % TOTAL]!);
  }
  return out.join('-');
}
