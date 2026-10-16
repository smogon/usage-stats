/**
 * StatCounter
 *
 * Reads the gzipped intermediate files produced by batchLogReader and compiles:
 *   Usage stats        - Stats/<tier><specs>.txt
 *   Lead stats         - Stats/leads/<tier><specs>.txt
 *   Metagame analysis  - Stats/metagame/<tier><specs>.txt
 *   Teammate matrix    - Raw/moveset/<tier>/teammate<specs>.json
 *   Encounter matrix   - Raw/moveset/<tier>/encounterMatrix<specs>.json
 *
 * Usage:
 *   node dist/StatCounter.js <tier> [cutoff] [teamtype]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as readline from 'readline';
import { keyify, weighting, reverseAliases, nonSinglesFormats, non6v6Formats } from './common';

/**
 * encounterMatrix key: for entries encounterMatrix[poke1][poke2][i], i=...
 * 0: poke1 was KOed
 * 1: poke2 was KOed
 * 2: double down
 * 3: poke1 was switched out
 * 4: poke2 was switched out
 * 5: double switch
 * 6: poke1 was forced out
 * 7: poke2 was forced out
 * 8: poke1 was u-turn KOed
 * 9: poke2 was u-turn KOed
 * 10: poke1 was foddered
 * 11: poke2 was foddered
 * 12: no clue what happened
 */

// outcomes if poke1 and poke2 were swapped
const otherGuy: number[] = [1, 0, 2, 4, 3, 5, 7, 6, 9, 8, 11, 10, 12];

interface RatingInfo { rpr?: number; rprd?: number; r?: number; rd?: number; }

interface PokeEntry { species: string; turnsOut: number; KOs: number; }

interface PlayerRecord {
  tags: string[]; stalliness: number; team: PokeEntry[];
  rating?: RatingInfo; outcome?: 'win' | 'loss';
  isBot?: boolean;
}

interface BattleRecord {
  turns?: number;
  p1: PlayerRecord; p2: PlayerRecord;
  matchups: [string, string, number][];
}


const args = process.argv.slice(2);
if (args.length < 1) {
  process.stderr.write('Usage: node dist/StatCounter.js <tier> [cutoff] [teamtype]\n');
  process.exit(1);
}

const tier     = args[0];
const cutoff   = args.length > 1 ? parseFloat(args[1]) : 1500;
const teamtype = args.length > 2 ? keyify(args[2]) : null;

let specs = '-';
if (teamtype) specs += teamtype + '-';
specs += Math.round(cutoff).toString();

let t = tier; // support legacy format suffixes
if (t.endsWith('suspecttest')) t = t.slice(0, -11);

function ensureDir(filepath: string): void {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const usageFilename    = `Stats/${tier}${specs}.txt`;
const metagameFilename = `Stats/metagame/${tier}${specs}.txt`;
ensureDir(usageFilename);
ensureDir(metagameFilename);

const writeMetagame = !['1v1', 'challengecup1v1'].includes(tier);

let battleCount = 0; // battles with at least one non-bot team
let teamCount = 0;   // non-bot teams

const counter: Record<'raw' | 'real' | 'weighted', Map<string, number>> = {
  raw: new Map(), real: new Map(), weighted: new Map(),
};
const leadCounter: Record<'raw' | 'weighted', Map<string, number>> = {
  raw: new Map(), weighted: new Map(),
};
const tagCounter: Map<string, number> = new Map();
const stallCounter: [number, number][]   = [];
const ratingCounter: RatingInfo[]        = [];
const weightCounter: number[]            = [];
const WLratings: Record<'win'|'loss', [number,number,number][]> = { win: [], loss: [] };
const teammateMatrix:  Record<string, Record<string, number>>   = {};
const encounterMatrix: Record<string, Record<string, number[]>> = {};

// monotype matchup chart stuff
const MONOTYPES = [
  'mononormal', 'monofighting', 'monoflying', 'monopoison', 'monoground',
  'monorock', 'monobug', 'monoghost', 'monosteel', 'monofire', 'monowater',
  'monograss', 'monoelectric', 'monopsychic', 'monoice', 'monodragon',
  'monodark', 'monofairy',
] as const;
const MONOTYPE_LABELS = MONOTYPES.map(s => s.slice(4));
const monoTypeIndex: Record<string, number> = Object.fromEntries(MONOTYPES.map((mt, i) => [mt, i]));
const N_MONO = MONOTYPES.length;

const monoUsage:       number[]   = new Array(N_MONO).fill(0);
const monoMtxWeighted: number[][] = Array.from({ length: N_MONO }, () => new Array(N_MONO).fill(0));
const writeMonotype = (t === 'gen9monotype' || t === 'gen9nationaldexmonotype') && !teamtype;

function processBattle(battle: BattleRecord): void {
  if ('turns' in battle && !non6v6Formats.has(t)) {
    if (battle.turns! < 3 && !nonSinglesFormats.has(t)) return;
    else if (battle.turns! < 2) return;
  }

  const bots = (['p1', 'p2'] as const).filter(p => battle[p].isBot);
  if (bots.length === 2) return;

  const weight: Record<string, number> = {};

  for (const player of ['p1', 'p2'] as const) {
    if (battle[player].isBot) continue;
    teamCount++; // counted before the teamtype filter, matching the old battleCount * 2
    if (teamtype && !battle[player].tags.includes(teamtype)) continue;

    const team: string[] = [];

    if (battle[player].rating) {
      const { rpr, rprd } = battle[player].rating!;
      if (rpr !== undefined && rprd !== undefined && rprd !== 0.0) {
        weight[player] = weighting(rpr, rprd, cutoff);
        ratingCounter.push(battle[player].rating!);
        if (battle[player].outcome) {
          WLratings[battle[player].outcome!].push([rpr, rprd, weight[player]]);
        }
      }
    }

    // if there's a ladder error, we have no idea what the player's rating is, so treat like a new player
    if (!(player in weight)) {
      weight[player] = weighting(1500, 130.0, cutoff);
      if (battle[player].outcome === 'win') {
        weight[player] = weighting(1540.16061434, 122.858308077, cutoff);
      } else if (battle[player].outcome === 'loss') {
        weight[player] = weighting(1459.83938566, 122.858308077, cutoff);
      }
    }

    weightCounter.push(weight[player]);

    if (writeMetagame) {
      // count metagame stuff
      const playerWeight = weight[player];
      for (const tag of battle[player].tags) {
        tagCounter.set(tag, (tagCounter.get(tag) ?? 0) + playerWeight);
      }
      stallCounter.push([battle[player].stalliness, playerWeight]);
    }

    for (const poke of battle[player].team) {
      let species = poke.species;
      species = reverseAliases[species] ?? species;
      team.push(species);

      // if species not already in the tables, you gotta add them
      if (!counter.raw.has(species))      counter.raw.set(species, 0);
      if (!counter.real.has(species))     counter.real.set(species, 0);
      if (!counter.weighted.has(species)) counter.weighted.set(species, 0);

      // count usage
      counter.raw.set(species, counter.raw.get(species)! + 1);
      if (poke.turnsOut > 0) counter.real.set(species, counter.real.get(species)! + 1);
      counter.weighted.set(species, counter.weighted.get(species)! + weight[player]);
    }

    // teammate stats
    for (let i = 0; i < team.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = team[i], b = team[j];
        if (!(a in teammateMatrix)) teammateMatrix[a] = {};
        if (!(b in teammateMatrix)) teammateMatrix[b] = {};
        if (!(b in teammateMatrix[a])) teammateMatrix[a][b] = 0.0;
        teammateMatrix[a][b] += weight[player]; // teammate stats are weighted
        teammateMatrix[b][a] = teammateMatrix[a][b]; // nice symmetric matrix
      }
    }
  }

  if (!nonSinglesFormats.has(t)) { // lead stats for doubles is not currently supported
    const leads: string[] = ['empty', 'empty'];
    if (battle.matchups.length === 0) {
      // this happens if the player forfeits after six turns and no switches--rare but possible
      for (let i = 0; i < 2; i++) {
        const playerKey = (['p1', 'p2'] as const)[i];
        for (const poke of battle[playerKey].team) {
          if (poke.turnsOut > 0) { leads[i] = poke.species; break; }
        }
      }
    } else {
      // it is utterly imperative that the p1 lead is first and the p2 lead second
      for (let i = 0; i < 2; i++) leads[i] = battle.matchups[0][i] as string;
    }

    if (leads.includes('empty')) {
      if (battle.matchups.length === 0) return; // 1v1 (or similiar) battle forfeited before started
      console.log('Something went wrong.'); console.log(battle);
    }

    for (let i = 0; i < 2; i++) {
      const playerKey = (['p1', 'p2'] as const)[i];
      if (!(playerKey in weight)) continue;
      let species = leads[i];
      species = reverseAliases[species] ?? species;
      leadCounter.raw.set(species, (leadCounter.raw.get(species) ?? 0) + 1);
      leadCounter.weighted.set(species, (leadCounter.weighted.get(species) ?? 0) + weight[playerKey]);
    }

    // encounter Matrix
    if (!teamtype && bots.length === 0) { // matchups involve both teams, skip any battle with a bot
      const w = Math.min(...Object.values(weight));
      for (const matchup of battle.matchups) {
        const [poke1, poke2, outcome] = matchup;
        if (!(poke1 in encounterMatrix)) encounterMatrix[poke1] = {};
        if (!(poke2 in encounterMatrix)) encounterMatrix[poke2] = {};
        if (!(poke2 in encounterMatrix[poke1])) {
          encounterMatrix[poke1][poke2] = new Array(13).fill(0);
          encounterMatrix[poke2][poke1] = new Array(13).fill(0);
        }
        if (outcome >= 0 && outcome <= 12) {
          encounterMatrix[poke1][poke2][outcome]           += w; // encounter Matrix is weighted
          encounterMatrix[poke2][poke1][otherGuy[outcome]] += w; // by the inferior player
        }
      }
    }
  }

  // monotype matchup matrix
  if (writeMonotype && bots.length === 0) {
    const p1Type = battle.p1.tags.find(tag => tag in monoTypeIndex);
    const p2Type = battle.p2.tags.find(tag => tag in monoTypeIndex);
    if (p1Type !== undefined && p2Type !== undefined) {
      const i = monoTypeIndex[p1Type];
      const j = monoTypeIndex[p2Type];
      if (i !== j) {
        monoUsage[i]++;
        monoUsage[j]++;
      }
      const w = Math.min(...Object.values(weight));
      if (battle.p1.outcome === 'win') {
        monoMtxWeighted[i][j] += w;
      } else if (battle.p2.outcome === 'win') {
        monoMtxWeighted[j][i] += w;
      }
    }
  }

  battleCount++;
}

async function streamBattles(filename: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createReadStream(filename);
    const gunzip     = zlib.createGunzip();
    const rl = readline.createInterface({ input: fileStream.pipe(gunzip), crlfDelay: Infinity });

    // find which file was being read and how far it got before failing
    const wrapError = (err: unknown): Error => {
      const reason = err instanceof Error ? err.message : String(err);
      const wrapped = new Error(
        `streamBattles failed for tier "${tier}" reading ${filename} ` +
        `(processed ${battleCount} battles before failure): ${reason}`
      );
      if (err instanceof Error && err.stack) wrapped.stack = wrapped.message + '\n' + err.stack;
      return wrapped;
    };

    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      const battles: BattleRecord[] = JSON.parse(line);
      for (const battle of battles) processBattle(battle);
    });

    rl.on('close', resolve);
    rl.on('error', (err) => reject(wrapError(err)));
    fileStream.on('error', (err) => reject(wrapError(err)));
    gunzip.on('error', (err) => reject(wrapError(err)));
  });
}

function writeOutput(): void {
  const total: Record<string, number> = {
    raw:      [...counter.raw.values()].reduce((a, b) => a + b, 0),
    real:     [...counter.real.values()].reduce((a, b) => a + b, 0),
    weighted: [...counter.weighted.values()].reduce((a, b) => a + b, 0),
  };

  type PokeRow = [string, number, number, number];
  let pokes: PokeRow[] = [...counter.raw.keys()]
    .filter(s => s !== 'empty') // delete no-entry slot
    .map(s => [s, counter.raw.get(s)!, counter.real.get(s) ?? 0, counter.weighted.get(s) ?? 0]);

  // write teammates and encounter matrix to file
  const matrixDir = `Raw/moveset/${tier}`;
  if (!fs.existsSync(matrixDir)) fs.mkdirSync(matrixDir, { recursive: true });
  fs.writeFileSync(`${matrixDir}/teammate${specs}.json`,       JSON.stringify(teammateMatrix));
  fs.writeFileSync(`${matrixDir}/encounterMatrix${specs}.json`, JSON.stringify(encounterMatrix));

  // sort by weighted usage
  if (['challengecup1v1', '1v1'].includes(tier)) {
    pokes.sort((a, b) => b[2] - a[2]);
  } else {
    pokes.sort((a, b) => b[3] - a[3]);
  }

  const usageLines: string[] = [];
  usageLines.push(`Total battles: ${battleCount}`);
  const avgWeight = teamCount > 0 ? (total['weighted'] / teamCount / 6).toFixed(3) : '0';
  usageLines.push(`Avg. weight/team: ${avgWeight}`);
  usageLines.push('+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- +');
  usageLines.push('| Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       |');
  usageLines.push('+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- +');
  for (let i = 0; i < pokes.length; i++) {
    const [name, raw, real, weighted] = pokes[i];
    if (raw === 0) break;
    usageLines.push(
      `| ${String(i + 1).padEnd(4)} | ${name.padEnd(18)} | ` +
      `${(total['weighted'] > 0 ? 100.0 * weighted / total['weighted'] * 6.0 : 0).toFixed(5).padStart(8)}% | ` +
      `${String(raw).padEnd(6)} | ${(100.0 * raw / total['raw'] * 6.0).toFixed(3).padStart(6)}% | ` +
      `${String(real).padEnd(6)} | ${(total['real'] > 0 ? 100.0 * real / total['real'] * 6.0 : 0).toFixed(3).padStart(6)}% |`
    );
  }
  usageLines.push('+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- +');
  fs.writeFileSync(usageFilename, usageLines.join('\n') + '\n');

  // leads
  if (!nonSinglesFormats.has(t)) { // lead stats for doubles is not currently supported
    const leadsFilename = `Stats/leads/${tier}${specs}.txt`;
    ensureDir(leadsFilename);
    const leadsLines: string[] = [];
    type LeadRow = [string, number, number];
    let leadPokes: LeadRow[] = [...leadCounter.raw.keys()]
      .filter(s => s !== 'empty') // delete no-entry slot
      .map(s => [s, leadCounter.raw.get(s)!, leadCounter.weighted.get(s) ?? 0]);
    leadPokes.sort((a, b) => b[2] - a[2]);
    const totalLeadWeighted = Math.max([...leadCounter.weighted.values()].reduce((a, b) => a + b, 0), 1.0);
    const totalLeadRaw      = Math.max([...leadCounter.raw.values()].reduce((a, b) => a + b, 0), 1.0);
    leadsLines.push(`Total leads: ${teamCount}`);
    leadsLines.push('+ ---- + ------------------ + --------- + ------ + ------- +');
    leadsLines.push('| Rank | Pokemon            | Usage %   | Raw    | %       |');
    leadsLines.push('+ ---- + ------------------ + --------- + ------ + ------- +');
    for (let i = 0; i < leadPokes.length; i++) {
      const [name, raw, weighted] = leadPokes[i];
      if (raw === 0) break;
      leadsLines.push(
        `| ${String(i + 1).padEnd(4)} | ${name.padEnd(18)} | ` +
        `${(100.0 * weighted / totalLeadWeighted).toFixed(5).padStart(8)}% | ` +
        `${String(raw).padEnd(6)} | ${(100.0 * raw / totalLeadRaw).toFixed(3).padStart(6)}% |`
      );
    }
    leadsLines.push('+ ---- + ------------------ + --------- + ------ + ------- +');
    fs.writeFileSync(leadsFilename, leadsLines.join('\n') + '\n');
  }

  // metagame analysis
  if (writeMetagame) {
    const metagameLines: string[] = [];
    const tags: [string, number][] = [...tagCounter.entries()].sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of tags) {
      const dots = '.'.repeat(Math.max(0, 18 - tag.length));
      metagameLines.push(`${tag}${dots}${(total['weighted'] > 0 ? 100.0 * count / total['weighted'] * 6.0 : 0).toFixed(5)}%`);
    }
    metagameLines.push('');

    // stalliness
    stallCounter.sort((a, b) => a[0] - b[0]);
    if (stallCounter.length > 0) {
      // figure out a good bin range by looking at .1% and 99.9% points
      const lowIdx  = Math.floor(stallCounter.length / 1000);
      const highIdx = stallCounter.length - lowIdx - 1;
      let low  = stallCounter[lowIdx][0];
      let high = stallCounter[highIdx][0];
      if (low > 0)  low  = 0.0;
      if (high < 0) high = 0.0;

      const nbinsTarget = 13; // this is actually only a rough idea--I think it might be the minimum?
      let binSize = (high - low) / (nbinsTarget - 1);
      // this is bound to be an ugly number, so let's make it pretty
      for (const x of [10, 5, 2.5, 2, 1.5, 1, 0.5, 0.25, 0.2, 0.1, 0.05]) {
        if (binSize > x) { binSize = x; break; }
      }
      if (binSize < 0.05) binSize = 0.05;

      const histogram: [number, number][] = [[0.0, 0]];
      let x = binSize;
      while (x + binSize / 2 < high) { histogram.push([x, 0]); x += binSize; }
      x = -binSize;
      while (x - binSize / 2 > low)  { histogram.push([x, 0]); x -= binSize; }
      histogram.sort((a, b) => a[0] - b[0]);

      let j = 0;
      for (const [stalliness, weight] of stallCounter) {
        while (j < histogram.length - 1 && stalliness > histogram[j][0] + binSize * 0.5) j++;
        if (j >= histogram.length) break;
        histogram[j][1] += weight;
      }

      const maximum   = Math.max(...histogram.map(h => h[1]));
      const nblocks   = 30;
      const blockSize = maximum / nblocks;

      if (blockSize > 0) {
        let wx = 0.0, wy = 0.0;
        for (const [stalliness, weight] of stallCounter) { wx += stalliness * weight; wy += weight; }
        // print(histogram)
        metagameLines.push(`Stalliness (mean: ${(wx / wy).toFixed(3)})`);
        for (const [binVal, binCount] of histogram) {
          let line: string;
          if (Math.abs(binVal % (2.0 * binSize)) < binSize / 2) {
            const sign = binVal > 0 ? '+' : binVal === 0 ? ' ' : '';
            line = `${sign}${binVal.toFixed(1)}|`;
          } else {
            line = '    |';
          }
          line += '#'.repeat(Math.round(binCount / blockSize));
          metagameLines.push(line);
        }
        metagameLines.push('more negative = more offensive, more positive = more stall');
        metagameLines.push(`one # = ${(100.0 * blockSize / (stallCounter.reduce((s, [, w]) => s + w, 0))).toFixed(2)}%`);
      }
    }
    fs.writeFileSync(metagameFilename, metagameLines.join('\n') + '\n');
  }

  // monotype matchup chart
  if (writeMonotype) {
    const monoMtxWeightedPct: number[][] = Array.from({ length: N_MONO }, () => new Array(N_MONO).fill(0));
    for (let i = 0; i < N_MONO; i++) {
      for (let j = 0; j < i; j++) {
        const weightedTotal = Math.max(monoMtxWeighted[i][j] + monoMtxWeighted[j][i], 1);
        monoMtxWeightedPct[i][j] = monoMtxWeighted[i][j] / weightedTotal;
        monoMtxWeightedPct[j][i] = monoMtxWeighted[j][i] / weightedTotal;
      }
    }

    const totalUsage = Math.max(monoUsage.reduce((a, b) => a + b, 0), 1);
    const usageFrac  = monoUsage.map(u => u / totalUsage);

    const scoreWeighted: number[] = new Array(N_MONO).fill(0);
    for (let i = 0; i < N_MONO; i++) {
      for (let j = 0; j < N_MONO; j++) {
        if (i === j) continue;
        scoreWeighted[i] += usageFrac[i] * monoMtxWeightedPct[i][j];
      }
    }

    const rankByWeighted = [...scoreWeighted.keys()].sort((a, b) => scoreWeighted[b] - scoreWeighted[a]);

    const muLines: string[] = [];

    muLines.push(`Matchup Chart and Type Ranking (${Math.round(cutoff)}-weighted)`);
    printMUTable(muLines, monoMtxWeighted, v => v.toFixed(2), monoMtxWeightedPct, v => (v * 100).toFixed(3) + '%');
    muLines.push('Type.....ViabilityScore');
    for (const i of rankByWeighted) {
      const label = MONOTYPE_LABELS[i];
      const dots  = '.'.repeat(Math.max(0, 18 - label.length));
      muLines.push(`${label}${dots}${(scoreWeighted[i] * 100 / N_MONO).toFixed(3)}`);
    }
    muLines.push('');

    const muFilename = `Stats/${tier}-matchup_chart-${Math.round(cutoff)}.txt`;
    ensureDir(muFilename);
    fs.writeFileSync(muFilename, muLines.join('\n') + '\n');
  }
}

// monotype matchup chart output
function printMUTable(
  lines: string[],
  mtx1: number[][], fmt1: (v: number) => string,
  mtx2: number[][], fmt2: (v: number) => string,
): void {
  const COL   = 8;
  const hline = '+' + ('-'.repeat(COL) + '+').repeat(N_MONO + 1);
  lines.push(hline);
  lines.push('|' + ' '.repeat(COL) + '|' + MONOTYPE_LABELS.map(l => l.padEnd(COL)).join('|') + '|');
  lines.push(hline);
  for (let i = 0; i < N_MONO; i++) {
    lines.push('|' + MONOTYPE_LABELS[i].padEnd(COL) + '|' + mtx1[i].map(v => fmt1(v).padStart(COL)).join('|') + '|');
    lines.push('|' + ' '.repeat(COL)                 + '|' + mtx2[i].map(v => fmt2(v).padStart(COL)).join('|') + '|');
    lines.push(hline);
  }
  lines.push('');
}

(async () => {
  try {
    await streamBattles(`Raw/${tier}`);
    writeOutput();
  } catch (err) {
    process.stderr.write(`${err}\n`);
    process.exit(1);
  }
})();
