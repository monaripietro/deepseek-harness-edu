/** Text normalization for the deterministic retriever (Italian-oriented). */

export const STOPWORDS_IT = new Set([
  'a', 'ad', 'al', 'allo', 'alla', 'alle', 'agli', 'ai', 'anche', 'che', 'chi', 'ci', 'come', 'con', 'col', 'da', 'dal',
  'dallo', 'dalla', 'dalle', 'dai', 'dagli', 'del', 'dello', 'della', 'delle', 'dei', 'degli', 'di', 'e', 'ed', 'è', 'e',
  'gli', 'ha', 'hanno', 'i', 'il', 'in', 'io', 'la', 'le', 'lo', 'ma', 'mi', 'ne', 'nel', 'nello', 'nella', 'nelle',
  'nei', 'negli', 'non', 'o', 'per', 'più', 'piu', 'può', 'puo', 'posso', 'quale', 'quali', 'quanto', 'quanti', 'quanta',
  'quante', 'se', 'si', 'sia', 'su', 'sul', 'sullo', 'sulla', 'sulle', 'sui', 'sono', 'è', 'un', 'una', 'uno', 'tra',
  'fra', 'tuo', 'mio', 'suo', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'essere', 'avere', 'fare',
  'devo', 'deve', 'dove', 'cosa', 'quando', 'perche', 'perché', 'oppure', 'loro', 'noi', 'voi', 'ho', 'vorrei',
].map(stripAccents))

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Lowercase + strip accents. */
export function normalize(s: string): string {
  return stripAccents(s.toLowerCase())
}

const SUFFIXES = [
  'amente', 'azioni', 'azione', 'mente', 'atori', 'atore', 'anze', 'anza', 'enze', 'enza', 'isti', 'ista',
  'ando', 'endo', 'ato', 'ata', 'ati', 'ate', 'uto', 'uta', 'uti', 'ute', 'ire', 'are', 'ere',
  'ali', 'ale', 'oni', 'one', 'ori', 'ore', 'ici', 'ico', 'ica', 'iche', 'ichi',
  'i', 'e', 'o', 'a',
]

/** Light Italian stemming: strips one common ending when the stem stays long enough. */
export function stem(word: string): string {
  if (word.length <= 4 || /\d/.test(word)) return word
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 4) return word.slice(0, -suf.length)
  }
  return word
}

/** Split into raw normalized tokens (keeps codes such as "nb-v14p" and "pol-it-04" split on '-'). */
export function tokenizeText(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean)
}

/** Tokenize + stopwords + stemming: the pipeline used both for indexing and for queries. */
export function analyze(text: string): string[] {
  const out: string[] = []
  for (const tok of tokenizeText(text)) {
    if (STOPWORDS_IT.has(tok)) continue
    out.push(stem(tok))
  }
  return out
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}
