/**
 * batchMovesetCounter
 *
 * Reads per-species moveset data (created by batchLogReader) from gzipped
 * intermediate files and generates human-readable moveset stats, as well as
 * JSON "chaos" stats for a more complete picture.
 *
 * Usage:
 *   node dist/batchMovesetCounter.js <tier> [cutoff] [teamtype]
 *   node dist/batchMovesetCounter.js gen9ou > Stats/moveset/gen9ou.txt
 *   node dist/batchMovesetCounter.js gen9ou 1695 > Stats/moveset/gen9ou-1695.txt
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { keyify, weighting, readTable, reverseAliases, victoryChance } from './common';
import { nmod, statFormula, baseStats } from './TA';

interface MovesetEntry {
  trainer: string;
  level: number;
  ability: string;
  item: string;
  teraType: string;
  nature: string;
  ivs: Record<string, number>;
  evs: Record<string, number>;
  moves: string[];
  happiness: number;
  tags: string[];
  rating?: { rpr?: number; rprd?: number };
  outcome?: 'win' | 'loss';
}

interface ChecksCountersEntry {
  n: number;
  p: number;
  d: number;
}

interface MovesetStuffOutput {
  'Raw count': number;
  'Viability Ceiling': [number, number, number, number];
  Abilities: Record<string, number>;
  Items: Record<string, number>;
  Spreads: Record<string, number>;
  Moves: Record<string, number>;
  'Tera Types': Record<string, number>;
  Happiness: Record<number, number>;
  Teammates: Record<string, number>;
  'Checks and Counters': Record<string, ChecksCountersEntry>;
  usage?: number;
}

const keyLookup: Record<string, string> = JSON.parse(fs.readFileSync('keylookup.json', 'utf-8'));
keyLookup['nothing'] = 'Nothing';
keyLookup[''] = 'Nothing';

const EV_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const NATURE_STAT_IDS = { hp: -1, atk: 0, def: 1, spa: 2, spd: 3, spe: 4 };
const NEUTRAL_NATURES = new Set(['serious', 'docile', 'quirky', 'bashful']);

// worker threads do not inherit process.argv from the main thread
interface WorkerConfig {
  tier: string;
  cutoff: number;
  teamtype: string | null;
}

let tier: string;
let cutoff: number;
let teamtype: string | null;

if (!isMainThread) {
  const cfg = (workerData as WorkerInput).config;
  tier = cfg.tier;
  cutoff = cfg.cutoff;
  teamtype = cfg.teamtype;
} else {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    process.stderr.write('Usage: batchMovesetCounter.ts <tier> [cutoff] [teamtype]\n');
    process.exit(1);
  }
  tier = args[0];
  cutoff = args.length > 1 ? parseFloat(args[1]) : 1500;
  teamtype = args.length > 2 ? keyify(args[2]) : null;
}

const cutoffDeviation = 0;

let specs = '-';
if (teamtype) specs += teamtype + '-';
specs += Math.round(cutoff).toString();

function loadJSON<T>(filepath: string): T {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
}
const teammateMatrix: Record<string, Record<string, number>> = loadJSON(
  `Raw/moveset/${tier}/teammate${specs}.json`
);
const encounterMatrix: Record<string, Record<string, number[]>> = loadJSON(
  `Raw/moveset/${tier}/encounterMatrix${specs}.json`
);

const [usage, nBattles] = readTable(`Stats/${tier}${specs}.txt`);

function movesetCounter(
  filename: string,
  cutoffArg: number,
  teamtypeArg: string | null,
  usageArg: Record<string, number>,
  outLines: string[]
): MovesetStuffOutput {
  const rawBuffer = zlib.gunzipSync(fs.readFileSync(filename));
  const split = Buffer.from('][');
  const chunks: Buffer[] = [];
  let start = 0;
  let idx: number;
  while ((idx = rawBuffer.indexOf(split, start)) !== -1) {
    chunks.push(rawBuffer.subarray(start, idx + 1));
    start = idx + 1;
  }
  chunks.push(rawBuffer.subarray(start));

  const species = keyLookup[path.basename(filename)];
  const speciesName = reverseAliases[species] ?? species;
  const speciesKey = keyify(speciesName);

  const abilities: Record<string, number> = {};
  const items: Record<string, number> = {};
  const happinesses: Record<number, number> = {};
  const spreads: Record<string, number> = {};
  const moves: Record<string, number> = {};
  const teraTypes: Record<string, number> = {};
  let weightSum = 0;
  let weightCount = 0;
  const gxes: Record<string, number> = {};
  let rawCount = 0;

  for (const chunk of chunks) {
    const movesets: MovesetEntry[] = JSON.parse(chunk.toString('utf-8'));
    for (const moveset of movesets) {
      if (teamtypeArg && !moveset.tags.includes(teamtypeArg)) continue;

      rawCount++;
      let weight = weighting(1500.0, 130.0, cutoffArg);

      if (moveset.rating) {
        const { rpr, rprd } = moveset.rating;
        if (rpr !== undefined && rprd !== undefined) {
          const gxe = Math.round(100 * victoryChance(rpr, rprd, 1500.0, 130.0));

          let addMe = true;
          if (moveset.trainer in gxes && gxes[moveset.trainer] > gxe) addMe = false;
          if (addMe) gxes[moveset.trainer] = gxe;

          if (rprd !== 0.0) {
            weight = weighting(rpr, rprd, cutoffArg);
            weightSum += weight;
            weightCount++;
          }
        }
      } else if (moveset.outcome) {
        if (moveset.outcome === 'win')
          weight = weighting(1540.16061434, 122.858308077, cutoffArg);
        else if (moveset.outcome === 'loss')
          weight = weighting(1459.83938566, 122.858308077, cutoffArg);
      } // else it's a tie, and we use 1500

      if (!(moveset.ability in keyLookup)) moveset.ability = 'illuminate';
      abilities[moveset.ability] = (abilities[moveset.ability] ?? 0) + weight;

      if (!(moveset.item in keyLookup)) moveset.item = 'nothing';
      items[moveset.item] = (items[moveset.item] ?? 0) + weight;

      let nature = moveset.nature;
      if (NEUTRAL_NATURES.has(nature) || !(nature in keyLookup)) {
        nature = 'hardy';
      }

      // round the EVs
      if (!tier.startsWith('gen9champions')) {
        for (const stat of EV_STATS) {
          const natIdx = NATURE_STAT_IDS[stat];
          const n = natIdx === -1 ? -1 : nmod[nature][natIdx];
          const base = baseStats[speciesKey][stat];
          const iv = moveset.ivs[stat];
          let ev = Math.floor(moveset.evs[stat] / 4) * 4;
          const targetStat = statFormula(base, moveset.level, n, iv, ev);
          while (ev >= 4) {
            ev -= 4;
            if (targetStat !== statFormula(base, moveset.level, n, iv, ev)) {
              ev += 4;
              break;
            }
          }
          moveset.evs[stat] = ev;
        }
      }

      const spreadNature = keyLookup[nature] ?? nature;
      const { hp, atk, def, spa, spd, spe } = moveset.evs;
      const spread = `${spreadNature}:${hp}/${atk}/${def}/${spa}/${spd}/${spe}`;
      spreads[spread] = (spreads[spread] ?? 0) + weight;

      for (const move of moveset.moves) {
        if (move in keyLookup) {
          moves[move] = (moves[move] ?? 0) + weight;
        }
      }

      happinesses[moveset.happiness] = (happinesses[moveset.happiness] ?? 0) + weight;

      const tera = moveset.teraType;
      teraTypes[tera] = (teraTypes[tera] ?? 0) + weight;
    }
  }

  // avoid NaN if every weight was 0
  const rawTotal = Object.values(abilities).reduce((a, b) => a + b, 0);
  const count = rawTotal || 1;
  const sortedGXEs = Object.values(gxes).sort((a, b) => b - a);

  // teammate stats
  let teammates: Record<string, number>;
  if (speciesName in teammateMatrix) {
    teammates = { ...teammateMatrix[speciesName] };
  } else {
    process.stderr.write(`No teammates data for ${filename} (${cutoffArg})\n`);
    teammates = {};
  }
  for (const s of Object.keys(teammates)) {
    if (!(s in usageArg)) teammates[s] = 0.0;
  }

  // checks and counters
  const cc: Record<string, ChecksCountersEntry> = {};
  if (speciesName in encounterMatrix) {
    for (const [s, matchup] of Object.entries(encounterMatrix[speciesName])) {
      // number of times species is KOed by s + number of times species switches out against s over number
      // of times either (or both) is switched out or KOed (don't count u-turn KOs or force-outs)
      const n = matchup.slice(0, 6).reduce((a, b) => a + b, 0);
      if (n > 20) {
        const p = (matchup[0] + matchup[3]) / n;
        const d = Math.sqrt(p * (1.0 - p) / n);
        // cc[s] = p - 4 * d; // using a CRE-style calculation
        cc[s] = { n, p, d };
      }
    }
  }

  const maxGXE: [number, number, number, number] = [0, 0, 0, 0];
  if (sortedGXEs.length > 0) {
    maxGXE[0] = sortedGXEs.length;
    maxGXE[1] = sortedGXEs[0];
    maxGXE[2] = sortedGXEs[Math.ceil(0.01 * sortedGXEs.length) - 1];
    maxGXE[3] = sortedGXEs[Math.ceil(0.20 * sortedGXEs.length) - 1];
  }

  const stuff: MovesetStuffOutput = {
    'Raw count': rawCount,
    'Viability Ceiling': maxGXE,
    Abilities: abilities,
    Items: items,
    Spreads: spreads,
    Moves: moves,
    'Tera Types': teraTypes,
    Happiness: happinesses,
    Teammates: teammates,
    'Checks and Counters': cc,
  };

  // print tables
  const tablewidth = 40;
  const separator = '+' + '-'.repeat(tablewidth) + '+';
  const padLine = (s: string) => s.padEnd(tablewidth + 1) + '|';

  outLines.push(separator);
  outLines.push(padLine(`| ${speciesName}`));
  outLines.push(separator);
  outLines.push(padLine(`| Raw count: ${rawCount}`));
  outLines.push(padLine(`| Avg. weight: ${weightCount > 0 ? (weightSum / weightCount).toString() : '---'}`));
  outLines.push(padLine(`| Viability Ceiling: ${maxGXE[1]}`));
  outLines.push(separator);

  const sections = ['Abilities','Items','Spreads','Moves','Tera Types','Teammates','Checks and Counters'] as const;

  const rowLimits: Partial<Record<typeof sections[number], number>> = {
    Abilities: 5, Spreads: 5, Teammates: 9, 'Checks and Counters': 10,
  };

  for (const x of sections) {
    // skip Tera Types if the only entry is "Nothing"
    if (x === 'Tera Types') {
      const teraEntries = Object.entries(stuff['Tera Types']);
      const onlyNothing = teraEntries.length === 1 && keyify(teraEntries[0][0]) === 'nothing';
      if (onlyNothing) continue;
    }

    // skip Checks and Counters if it would be empty
    if (x === 'Checks and Counters') {
      const hasEntries = Object.values(cc).some(entry => entry.p - 4.0 * entry.d >= 0.5);
      if (!hasEntries) continue;
    }

    outLines.push(`| ${x}`.padEnd(tablewidth + 1) + '|');

    type TableRow = [string, number | ChecksCountersEntry];
    let table: TableRow[];

    if (x === 'Checks and Counters') {
      table = Object.entries(cc).map(([k, v]) => [k, v] as TableRow);
      table.sort((a, b) => {
        const av = a[1] as ChecksCountersEntry;
        const bv = b[1] as ChecksCountersEntry;
        return (bv.p - 4.0 * bv.d) - (av.p - 4.0 * av.d);
      });
    } else if (x === 'Tera Types') {
      table = Object.entries(stuff[x]).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v] as TableRow);
      table.sort((a, b) => (b[1] as number) - (a[1] as number));
    } else if (x === 'Spreads' || x === 'Teammates') {
      table = Object.entries(stuff[x]).map(([k, v]) => [k, v] as TableRow);
      table.sort((a, b) => (b[1] as number) - (a[1] as number));
    } else {
      const src = stuff[x] as Record<string, number>;
      table = Object.entries(src).map(([k, v]) => [keyLookup[k] ?? k, v] as TableRow);
      table.sort((a, b) => (b[1] as number) - (a[1] as number));
    }

    const limit = rowLimits[x] ?? Infinity;
    let total = 0.0;

    for (let i = 0; i < table.length; i++) {
      const [name, val] = table[i];
      const isCapped = i > limit || (total > 0.95 && x !== 'Abilities');

      if (isCapped) {
        if (x !== 'Teammates' && x !== 'Checks and Counters') {
          const otherPct = x === 'Moves' ? 400.0 * (1.0 - total) : 100.0 * (1.0 - total);
          outLines.push(padLine(`| Other ${otherPct.toFixed(3)}%`));
        }
        break;
      }

      let line: string;
      if (x === 'Checks and Counters') {
        const ccEntry = val as ChecksCountersEntry;
        const score = ccEntry.p - 4.0 * ccEntry.d;
        if (score < 0.5) break;
        const matchup = encounterMatrix[speciesName]?.[name] ?? [];
        const n = matchup.slice(0, 6).reduce((a, b) => a + b, 0);
        const koRate    = 100.0 * matchup[0] / n;
        const switchRate = 100.0 * matchup[3] / n;
        line = `| ${name} ${(100.0 * score).toFixed(3)} (${(100.0 * ccEntry.p).toFixed(2)}\u00b1${(100 * ccEntry.d).toFixed(2)})`.padEnd(tablewidth + 1) + '|';
        line += `\n|\t(${koRate.toFixed(1)}% KOed / ${switchRate.toFixed(1)}% switched out)`;
        if (koRate    < 10.0) line += ' ';
        if (switchRate < 10.0) line += ' ';
      } else if (x === 'Teammates') {
        const numVal = val as number;
        if (numVal < 0.005 * count) break;
        line = padLine(`| ${name} ${(100.0 * numVal / count).toFixed(3)}%`);
      } else {
        line = padLine(`| ${name} ${(100.0 * (val as number) / count).toFixed(3)}%`);
      }

      outLines.push(line);

      if (x === 'Moves') total += (val as number) / count / 4.0;
      else if (x === 'Teammates') total += (val as number) / count / 5.0;
      else if (x !== 'Checks and Counters') total += (val as number) / count;
    }

    outLines.push(separator);
  }

  return stuff;
}

// write chaos files

interface SpeciesResult {
  pokeName: string;
  output: string;
  stuffResult: MovesetStuffOutput;
}

// A single species' raw file being unreadable/corrupt is logged
// and skipped instead of aborting the whole tier's output.
function processPokeList(pokeList: [string, number][]): SpeciesResult[] {
  const results: SpeciesResult[] = [];
  for (const [pokeName, pct] of pokeList) {
    const filename = `Raw/moveset/${tier}/${keyify(pokeName)}`;
    const outLines: string[] = [];
    try {
      const stuffResult = movesetCounter(filename, cutoff, teamtype, usage, outLines);
      stuffResult.usage = pct;
      results.push({ pokeName, output: outLines.length ? outLines.join('\n') + '\n' : '', stuffResult });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Skipping ${pokeName} (${filename}): ${message}\n`);
    }
  }
  return results;
}

interface WorkerInput {
  pokeList: [string, number][];
  config: WorkerConfig;
}

if (!isMainThread) {
  const { pokeList } = workerData as WorkerInput;
  const results = processPokeList(pokeList);
  parentPort!.postMessage(results);
} else {
  main();
}

function finalize(results: SpeciesResult[]): void {
  const chaos: {
    info: { metagame: string; cutoff: number; 'cutoff deviation': number; 'team type': string | null; 'number of battles': number };
    data: Record<string, MovesetStuffOutput>;
  } = {
    info: {
      metagame: tier,
      cutoff,
      'cutoff deviation': cutoffDeviation,
      'team type': teamtype,
      'number of battles': nBattles,
    },
    data: {},
  };

  const outParts: string[] = [];
  for (const r of results) {
    outParts.push(r.output);
    chaos.data[r.pokeName] = r.stuffResult;
  }
  process.stdout.write(outParts.join(''));

  const chaosFilename = `Stats/chaos/${tier}${specs}.json`;
  const chaosDir = path.dirname(chaosFilename);
  if (!fs.existsSync(chaosDir)) fs.mkdirSync(chaosDir, { recursive: true });
  fs.writeFileSync(chaosFilename, JSON.stringify(chaos));
}

function main(): void {
  let pokes: [string, number][] = Object.entries(usage);
  if (['randombattle','challengecup','challengecup1v1','seasonal'].includes(tier)) {
    pokes.sort((a, b) => a[0].localeCompare(b[0]));
  } else {
    pokes.sort((a, b) => b[1] - a[1]);
  }

  const pokesToProcess: [string, number][] = [];
  for (const [pokeName, pct] of pokes) {
    if (pct < 0.0001) break; // 1/100th of a percent
    pokesToProcess.push([pokeName, pct]);
  }

  if (pokesToProcess.length === 0) {
    finalize([]);
    return;
  }

  const numCpus = os.cpus().length;
  const load = os.loadavg()[0];
  const availableCores = Math.max(1, Math.floor(numCpus - load));
  const numWorkers = Math.min(availableCores, pokesToProcess.length);

  if (numWorkers <= 1) {
    finalize(processPokeList(pokesToProcess));
    return;
  }

  const chunkSize = Math.ceil(pokesToProcess.length / numWorkers);
  const chunks: [string, number][][] = [];
  for (let i = 0; i < pokesToProcess.length; i += chunkSize) {
    chunks.push(pokesToProcess.slice(i, i + chunkSize));
  }

  const chunkResults: SpeciesResult[][] = new Array(chunks.length);
  let done = 0;

  chunks.forEach((chunk, idx) => {
    const input: WorkerInput = { pokeList: chunk, config: { tier, cutoff, teamtype } };
    const worker = new Worker(__filename, { workerData: input });
    worker.on('message', (msg: SpeciesResult[]) => {
      chunkResults[idx] = msg;
      if (++done === chunks.length) {
        finalize(chunkResults.flat());
      }
    });
    worker.on('error', err => {
      process.stderr.write(`Worker error: ${err}\n`);
      process.exit(1);
    });
  });
}
