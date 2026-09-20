/**
 * batchLogReader
 *
 * Reads a directory of Pokemon Showdown JSON battle logs and writes gzipped
 * intermediate files to be used by batchMovesetCounter and StatCounter.
 *
 * Each day's logs are split evenly across available CPU cores, writing to
 * per-worker temp files. They are then merged into the final Raw/ output.
 *
 * Usage:
 *   node dist/batchLogReader.js <log-dir> <tier>
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import * as os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { keyify, reverseAliases, nonSinglesFormats } from './common';
import { nmod, getMegaAbility, analyzeTeam } from './TA';

interface RatingInfo {
  r?: number;
  rd?: number;
  rpr?: number;
  rprd?: number;
}

interface PokeData {
  species: string;
  nature: string;
  item: string;
  evs: Record<string, number>;
  ivs: Record<string, number>;
  moves: string[];
  ability: string;
  level: number;
  happiness: number;
  teraType: string | null;
}

interface TeamAnalysisResult {
  bias: number;
  stalliness: number;
  tags: string[];
  outcome?: string;
  rating?: RatingInfo;
}

type TeamEntry = PokeData | TeamAnalysisResult;

interface Teams {
  p1team: TeamEntry[];
  p2team: TeamEntry[];
}

interface WriteableMatchup {
  trainer: string;
  level: number;
  ability: string;
  item: string;
  teraType: string | null;
  nature: string;
  ivs: Record<string, number>;
  evs: Record<string, number>;
  moves: string[];
  happiness: number;
  tags: string[];
  rating?: RatingInfo;
  outcome?: string;
}

interface MatchupRecord {
  0: string;
  1: string;
  2: number | boolean;
}

interface BattleRecord {
  p1: {
    trainer: string;
    bias?: number;
    stalliness?: number;
    tags?: string[];
    outcome?: string;
    rating?: RatingInfo;
    team: { species: string; KOs: number; turnsOut: number }[];
  };
  p2: {
    trainer: string;
    bias?: number;
    stalliness?: number;
    tags?: string[];
    outcome?: string;
    rating?: RatingInfo;
    team: { species: string; KOs: number; turnsOut: number }[];
  };
  matchups: MatchupRecord[];
  turns: number;
  endType?: string;
}

interface WorkerInput {
  files: string[];
  logDir: string;
  tier: string;
  workerId: number;
  tmpDir: string;
}

const keyLookup: Record<string, string> = JSON.parse(fs.readFileSync('keylookup.json', 'utf-8'));
const asciiLetters = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));

// Sanitize player names
const latin1ToAscii: string[] = Array.from({ length: 256 }, (_, i) =>
  (i >= 0x20 && i <= 0x7e) ? String.fromCharCode(i) : ''
);

function sanitiseTrainer(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c < 256 ? latin1ToAscii[c] : '';
  }
  return out;
}

function gzipAsync(data: string | Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    zlib.gzip(data, (err, buf) => err ? reject(err) : resolve(buf))
  );
}

function getBaseSpecies(species: string): string {
  if (species === 'Greninja-Ash') return 'Greninja';
  if (species === 'Zygarde-Complete') return 'Zygarde';
  if (species.startsWith('Mimikyu')) return 'Mimikyu';
  if (species === 'Necrozma-Ultra') return 'Necrozma';
  if (species === 'Zacian-Crowned') return 'Zacian';
  if (species === 'Zamazenta-Crowned') return 'Zamazenta';
  if (species.startsWith('Floette')) return 'Floette';
  if (species.startsWith('Meowstic')) return 'Meowstic';
  if (species.startsWith('Tatsugiri')) return 'Tatsugiri';
  if (
    species.endsWith('-Mega') || species.endsWith('-Mega-X') || species.endsWith('-Mega-Y') ||
    species.endsWith('-Mega-Z') || species.endsWith('-Primal')
  ) {
    return species.endsWith('-Mega') ? species.slice(0, -5) : species.slice(0, -7);
  }
  return species;
}

function getTeamsFromLog(
  log: Record<string, unknown>,
  mrayAllowed: boolean,
  filename: string
): Teams | false {
  const teams: Teams = { p1team: [], p2team: [] };

  for (const team of ['p1team', 'p2team'] as const) {
    const rawTeam = log[team] as Record<string, unknown>[];

    for (const pkmn of rawTeam) {
      let species = (pkmn['species'] as string | undefined) || (pkmn['name'] as string);
      if (!species || species.length === 0) {
        process.stderr.write(`Problem with ${filename} (1)\n`);
        return false;
      }

      if (!asciiLetters.has(species[0])) species = species.slice(1);
      while (')". '.includes(species[species.length - 1])) species = species.slice(0, -1);
      species = keyify(species);

      let item = keyify((pkmn['item'] as string | null | undefined) ?? '');
      if (item === '') item = 'nothing';

      const happiness = (pkmn['happiness'] as number | null | undefined) ?? 255;

      let nature: string;
      if ('nature' in pkmn && pkmn['nature'] != null) {
        nature = keyify(pkmn['nature'] as string);
        if (!(nature in nmod)) nature = 'hardy';
      } else {
        nature = 'hardy';
      }

      const evs: Record<string, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      if ('evs' in pkmn) {
        for (const [stat, val] of Object.entries(pkmn['evs'] as Record<string, number>)) {
          evs[stat] = parseInt(String(val), 10);
        }
      }

      const ivs: Record<string, number> = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      if ('ivs' in pkmn) {
        for (const [stat, val] of Object.entries(pkmn['ivs'] as Record<string, number>)) {
          ivs[stat] = parseInt(String(val), 10);
        }
      }

      const movesRaw: string[] = [...((pkmn['moves'] as string[]) ?? [])];
      while (movesRaw.length < 4) movesRaw.push('');
      const moves: string[] = movesRaw.map(m => {
        try { return keyify(String(m)); }
        catch { return ''; }
      });

      const hpIdx = moves.indexOf('hiddenpower');
      if (hpIdx !== -1) {
        const hpType = Math.floor(
          15 * (ivs['hp'] % 2 + 2 * (ivs['atk'] % 2) + 4 * (ivs['def'] % 2) +
                8 * (ivs['spe'] % 2) + 16 * (ivs['spa'] % 2) + 32 * (ivs['spd'] % 2)) / 63
        );
        const hpTypes = ['fighting','flying','poison','ground','rock','bug','ghost','steel',
                         'fire','water','grass','electric','psychic','ice','dragon','dark'];
        moves.splice(hpIdx, 1);
        moves.unshift('hiddenpower' + hpTypes[hpType]);
      }

      const ability = ('ability' in pkmn && pkmn['ability'] != null)
        ? keyify(pkmn['ability'] as string) : 'unknown';

      let level: number;
      if ('forcedLevel' in pkmn) level = parseInt(String(pkmn['forcedLevel']), 10);
      else if ('level' in pkmn) level = parseInt(String(pkmn['level']), 10);
      else level = 100;

      let teraType: string | null = null;
      if ('teraType' in pkmn && pkmn['teraType'] != null) {
        const tt = keyify(pkmn['teraType'] as string);
        teraType = (tt === '' || item.endsWith('iumz')) ? 'nothing' : tt;
      } else {
        teraType = 'nothing';
      }

      let resolvedSpecies = species;
      let resolvedAbility = ability;

      if (species === 'rayquaza' && moves.includes('dragonascent') && mrayAllowed) {
        resolvedSpecies = 'rayquazamega';
        resolvedAbility = 'deltastream';
        teraType = 'nothing';
      } else if (species === 'greninja' && ability === 'battlebond') {
        resolvedSpecies = 'greninjaash';
      } else if (species === 'zacian' && item === 'rustedsword') {
        resolvedSpecies = 'zaciancrowned';
      } else if (species === 'zamazenta' && item === 'rustedshield') {
        resolvedSpecies = 'zamazentacrowned';
      } else {
        const megaAbility = getMegaAbility(species, item);
        if (megaAbility !== undefined) {
          let ms = species + 'mega';
          if (item.endsWith('x')) ms += 'x';
          else if (item.endsWith('y')) ms += 'y';
          else if (item.endsWith('z')) ms += 'z';
          if (['kyogremega','groudonmega'].includes(ms)) ms = ms.slice(0, -4) + 'primal';
          if (ms === 'floetteeternalmega') ms = 'floettemega';
          if (ms === 'zygarde10mega') ms = 'zygardemega';
          if (ms === 'meowsticmega') ms = 'meowsticmmega';
          if (ms === 'tatsugirimega') ms = 'tatsugiricurlymega';
          resolvedSpecies = ms;
          resolvedAbility = megaAbility;
          teraType = 'nothing';
        }
      }

      if (
        asciiLetters.has(resolvedSpecies[0]) ||
        (resolvedSpecies.length > 1 && asciiLetters.has(resolvedSpecies[1]))
      ) {
        resolvedSpecies = resolvedSpecies.slice(0, 1).toUpperCase() + resolvedSpecies.slice(1);
      }
      resolvedSpecies = reverseAliases[resolvedSpecies] ?? resolvedSpecies; // combine appearance-only variations and weird PS quirks
      const lookedUp = keyLookup[keyify(resolvedSpecies)];
      if (lookedUp === undefined) {
        process.stderr.write(`${resolvedSpecies} not in keyLookup.\n`);
      } else {
        resolvedSpecies = lookedUp;
      }
      resolvedSpecies = reverseAliases[resolvedSpecies] ?? resolvedSpecies; // this 2nd one is needed to deal with Nidoran

      (teams[team] as PokeData[]).push({
        species: resolvedSpecies,
        nature,
        item,
        evs: { ...evs },
        happiness,
        teraType,
        moves: [...moves],
        ability: resolvedAbility,
        level,
        ivs: { ...ivs },
      });
    }
  }

  return teams;
}

async function readLogFile(filename: string): Promise<string | false> {
  try {
    const raw = await fsp.readFile(filename, 'utf-8');
    return raw.split('\n')[0];
  } catch {
    return false;
  }
}

function LogReader(
  raw: string,
  filename: string,
  tier: string,
  movesets: Record<string, WriteableMatchup[]>
): BattleRecord | false {
  const mrayAllowed = tier === '';

  if (raw === '"log"') return false;

  let log: Record<string, unknown>;
  try {
    log = JSON.parse(raw);
  } catch {
    process.stderr.write(`${filename} is not a valid log.\n`);
    return false;
  }

  if (!('turns' in log)) {
    console.log(`${filename} has no turn count`);
    return false;
  }

  const logLines: string[] = Array.isArray(log['log']) ? log['log'] as string[] : [];

  let whowon = 0; // 0 for tie/unknown, 1 for p1, 2 for p2
  const p1 = log['p1'] as string;
  const p2 = log['p2'] as string;
  const winP1 = '|win|' + p1;
  const winP2 = '|win|' + p2;
  for (const line of logLines) {
    if (line === winP1) { whowon = 1; break; }
    if (line === winP2) { whowon = 2; break; }
  }
  if (whowon !== 0 && logLines.includes(whowon === 1 ? winP2 : winP1)) {
    process.stderr.write(filename + '\nThis battle had two winners.\n');
    return false;
  }

  // get info on the players & pokes involved
  const rating: Record<string, RatingInfo> = {};
  for (const [ratingKey, teamKey] of [['p1rating','p1team'], ['p2rating','p2team']]) {
    if (ratingKey in log && typeof log[ratingKey] === 'object' && log[ratingKey] !== null) {
      rating[teamKey] = {};
      for (const j of ['r','rd','rpr','rprd']) {
        if (j in (log[ratingKey] as Record<string, unknown>)) {
          try {
            (rating[teamKey] as Record<string, number>)[j] =
              parseFloat(String((log[ratingKey] as Record<string, unknown>)[j]));
          } catch { /* skip */ }
        }
      }
    }
  }

  // get pokemon info
  const teams = getTeamsFromLog(log, mrayAllowed, filename);
  if (teams === false) {
    process.stderr.write(`Skipping log:\n${filename}\n`);
    return false;
  }

  const ts: [string, string][] = [];

  for (const team of ['p1team', 'p2team'] as const) {
    const trainer = log[team.slice(0, 2)] as string;
    for (const poke of (teams[team] as PokeData[]).filter(e => e.species != null)) {
      ts.push([trainer, poke.species]);
    }
    const rawTeam = log[team] as unknown[];
    if (rawTeam.length < 6) {
      for (let i = 0; i < 6 - rawTeam.length; i++) ts.push([trainer, 'empty']);
    }

    const pokeSlice = (teams[team] as PokeData[]).filter(e => e.species !== undefined);
    const analysis = analyzeTeam(pokeSlice as unknown as Parameters<typeof analyzeTeam>[0]);
    if (analysis === null) {
      process.stderr.write(`Problem with ${filename} (2)\n`);
      return false;
    }
    (teams[team] as TeamEntry[]).push({
      bias: analysis.bias,
      stalliness: analysis.stalliness,
      tags: analysis.tags,
    });

    const sanitisedTrainer = sanitiseTrainer(trainer);
    for (const poke of (teams[team] as PokeData[]).slice(0, -1)) {
      if (keyify(poke.species) === 'meloettapirouette') console.log(filename);
      const entry: WriteableMatchup = {
        trainer: sanitisedTrainer,
        level: poke.level,
        ability: poke.ability,
        item: poke.item,
        teraType: poke.teraType,
        nature: poke.nature,
        ivs: poke.ivs,
        evs: poke.evs,
        moves: poke.moves,
        happiness: poke.happiness,
        tags: analysis.tags,
      };
      if (team in rating) entry.rating = rating[team];
      if ((team === 'p1team' && whowon === 1) || (team === 'p2team' && whowon === 2)) {
        entry.outcome = 'win';
      } else if (whowon !== 0) {
        entry.outcome = 'loss';
      }

      const speciesKey = keyify(poke.species);
      if (!speciesKey) continue;
      if (!(speciesKey in movesets)) movesets[speciesKey] = [];
      movesets[speciesKey].push(entry);
    }

    const lastEntry = (teams[team] as TeamEntry[])[(teams[team] as TeamEntry[]).length - 1] as TeamAnalysisResult;
    if ((team === 'p1team' && whowon === 1) || (team === 'p2team' && whowon === 2)) {
      lastEntry.outcome = 'win';
    } else if (whowon !== 0) {
      lastEntry.outcome = 'loss';
    }
    if (team in rating) lastEntry.rating = rating[team];
  }

  if (ts[0][0] === ts[11][0]) {
    process.stderr.write(`${filename} had a trainer battling him/herself.\n`);
    return false;
  }

  const tsIndex: Map<string, number> = new Map(ts.map((e, i) => [`${e[0]}|||${e[1]}`, i]));
  const tsKey = (trainer: string, species: string) => `${trainer}|||${species}`;

  // metrics get declared here
  const turnsOut: number[] = new Array(12).fill(0); // turns out on the field (a measure of stall)
  const KOs: number[] = new Array(12).fill(0);      // number of KOs in the battle
  const matchups: MatchupRecord[] = [];             // poke1, poke2, what happened

  if (logLines.length > 0 && !nonSinglesFormats.has(tier)) {
    const active: number[] = [-1, -1];
    let startIdx = 0;

    for (let lineIdx = 0; lineIdx < logLines.length; lineIdx++) {
      const line = logLines[lineIdx];
      if (!line.startsWith('|')) continue;
      const parsed = line.split('|').map(s => s.trim());
      if (parsed.length < 2) continue;

      if (parsed[1] === 'switch' && parsed[2].startsWith('p1')) {
        if (parsed.length < 4) {
          process.stderr.write(`Problem with ${filename} (3)\n`);
          return false;
        }
        let species = parsed[3].split(',')[0]; // remove gender
        species = reverseAliases[species] ?? species;
        const key = tsKey(ts[0][0], species);
        if (tsIndex.has(key)) {
          active[0] = tsIndex.get(key)!;
        } else {
          const base = getBaseSpecies(species);
          let found = false;
          for (let i = 0; i < 6; i++) {
            if (ts[i][1].startsWith(base)) {
              species = ts[i][1];
              active[0] = i;
              found = true;
              break;
            }
          }
          if (!found) {
            process.stderr.write(`Problem with ${filename}\n(${species} not in ts) (1)\n`);
            return false;
          }
        }
      }

      if (parsed[1] === 'switch' && parsed[2].startsWith('p2')) {
        if (parsed.length < 4) {
          process.stderr.write(`Problem with ${filename} (4)\n`);
          return false;
        }
        let species = parsed[3].split(',')[0];
        species = reverseAliases[species] ?? species;
        const key = tsKey(ts[11][0], species);
        if (tsIndex.has(key)) {
          active[1] = tsIndex.get(key)!;
        } else {
          const base = getBaseSpecies(species);
          let found = false;
          for (let i = 6; i < 12; i++) {
            if (ts[i][1].startsWith(base)) {
              species = ts[i][1];
              active[1] = i;
              found = true;
              break;
            }
          }
          if (!found) {
            process.stderr.write(`Problem with ${filename}\n(${species} not in ts) (2)\n`);
            return false;
          }
        }
        startIdx = lineIdx + 1;
        break;
      }
    }

    // parse the log
    let roar = false, uturn = false, fodder = false, hazard = false, uturnko = false;
    let ko: [boolean, boolean] = [false, false];
    let switchFlag: [boolean, boolean] = [false, false];
    let mtemp: MatchupRecord[] = [];

    for (const line of logLines.slice(startIdx)) {
      if (!line.startsWith('|')) continue;
      const parsed = line.split('|').map(s => s.trim());
      if (parsed.length < 2) continue;
      const linetype = parsed[1];

      if (linetype === 'turn') {
        matchups.push(...mtemp);
        mtemp = [];
        // reset for start of turn
        roar = uturn = uturnko = fodder = hazard = false;
        ko = [false, false];
        switchFlag = [false, false];
        // mark each poke as having been out for an additional turn
        turnsOut[active[0]]++;
        turnsOut[active[1]]++;

      } else if (linetype === 'win' || linetype === 'tie') {
        // close out last matchup
        if (ko[0] || ko[1]) { // if neither poke was KOed, match ended in forfeit, and we don't care
          const matchup: MatchupRecord = [ts[active[0]][1], ts[active[1]][1], 12];
          if (ko[0] && ko[1]) {
            KOs[active[0]]++;
            KOs[active[1]]++;
            matchup[2] = 2; // double down
          } else {
            KOs[active[ko[0] ? 0 : 1]]++;
            matchup[2] = ko[1] ? 1 : 0; // 0: poke1 was KOed, 1: poke2 was KOed
            if (uturnko) {
              mtemp.splice(-1, 1);
              matchup[2] = (matchup[2] as number) + 8; // 8: poke1 was u-turn KOed, 9: poke2 was u-turn KOed
            }
          }
          mtemp.push(matchup);
        }
        matchups.push(...mtemp);
        mtemp = [];

      } else if (linetype === 'move') { // check for Roar, etc.; U-Turn, etc.
        hazard = false;
        const move = parsed[3] ?? '';
        if (['Roar','Whirlwind','Circle Throw','Dragon Tail'].includes(move)) roar = true;
        else if (['U-Turn','U-turn','Volt Switch','Baton Pass'].includes(move)) uturn = true;

      } else if (linetype === '-enditem') { // search for relevant items
        const detail = parsed[3] ?? '';
        if (detail.includes('Red Card')) roar = true;
        else if (detail.includes('Eject Button')) uturn = true;

      } else if (linetype === 'faint') { // KO
        const p = parseInt(parsed[2][1]) - 1;
        ko[p] = true;
        if (switchFlag[p]) fodder = true; // fainted on the same turn that it was switched in
        if (uturn) { uturn = false; uturnko = true; }

      } else if (linetype === 'replace') { // it was Zorua/Zoroark all along!
        if (parsed.length < 4) {
          process.stderr.write(`Problem with ${filename} (5)\n`);
          return false;
        }
        let species = parsed[3].split(',')[0];
        species = reverseAliases[species] ?? species;
        const p = parseInt(parsed[2][1]) - 1;
        const trainer = ts[11 * p][0];
        const key = tsKey(trainer, species);
        if (!tsIndex.has(key)) {
          const base = getBaseSpecies(species);
          let found = false;
          for (let i = 6 * p; i < 6 * (p + 1); i++) {
            if (ts[i][1].startsWith(base)) {
              species = ts[i][1];
              found = true;
              break;
            }
          }
          if (!found) {
            process.stderr.write(`Problem with ${filename}\n(${species} not in ts) (3)\n`);
            return false;
          }
        }
        active[p] = tsIndex.get(tsKey(trainer, species)) ?? active[p];

      } else if (linetype === 'switch' || linetype === 'drag') { // switch out: new matchup!
        const p = parseInt(parsed[2][1]) - 1;
        switchFlag[p] = true;

        if (switchFlag[0] && switchFlag[1] && !fodder) {
          const matchup = mtemp[mtemp.length - 1];
          matchup[2] = 12;
          if (!ko[0] && !ko[1]) { // double switch
            matchup[2] = 5;
          } else if (ko[0] && ko[1]) { // double down
            KOs[active[ko[0] ? 0 : 1]]++;
            matchup[2] = 2;
          } else { // u-turn KO (note that this includes hit-by-red-card-and-dies and roar-then-die-by-residual-dmg)
            KOs[active[ko[0] ? 0 : 1]]++;
            matchup[2] = (ko[1] ? 1 : 0) + 8;
          }
        } else {
          // close out old matchup
          // it is utterly imperative that the p1 poke goes first and the p2 poke second
          const matchup: MatchupRecord = [ts[active[0]][1], ts[active[1]][1], 12];
          if (ko[0] || ko[1]) {
            if (fodder && hazard) { // if dies on switch-in due to an attack, it's still "KOed"
              matchup[2] = (ko[1] ? 1 : 0) + 10;
            } else {
              KOs[active[ko[0] ? 0 : 1]]++;
              matchup[2] = ko[1] ? 1 : 0;
            }
          } else {
            matchup[2] = 3 + (switchFlag[1] ? 1 : 0); // 3: poke1 switched out, 4: poke2 switched out
            if (roar) matchup[2] = (matchup[2] as number) + 3; // 6: poke1 was forced out, 7: poke2 was forced out
          }
          mtemp.push(matchup);
        }

        // new matchup!
        uturn = roar = fodder = false;
        hazard = true;

        if (parsed.length < 4) {
          process.stderr.write(`Problem with ${filename} (6)\n`);
          return false;
        }
        let species = parsed[3].split(',')[0];
        species = reverseAliases[species] ?? species;
        const trainer = ts[11 * p][0];
        const key = tsKey(trainer, species);
        if (!tsIndex.has(key)) {
          const base = getBaseSpecies(species);
          let found = false;
          for (let i = 6 * p; i < 6 * (p + 1); i++) {
            if (ts[i][1].startsWith(base)) {
              species = ts[i][1];
              found = true;
              break;
            }
          }
          if (!found) {
            process.stderr.write(`Problem with ${filename}\n(${species} not in ts) (4)\n`);
            return false;
          }
        }
        active[p] = tsIndex.get(tsKey(trainer, species)) ?? active[p];
      }
    }
  }

  for (const m of matchups) {
    if (m[2] === false) m[2] = 0;
  }

  const p1Trainer = ts[0][0];
  const p1Team = teams['p1team'] as TeamEntry[];
  const p1Tags = p1Team[p1Team.length - 1] as TeamAnalysisResult;
  const p2Trainer = ts[ts.length - 1][0];
  const p2Team = teams['p2team'] as TeamEntry[];
  const p2Tags = p2Team[p2Team.length - 1] as TeamAnalysisResult;

  let i = 0;
  const p1TeamOut: { species: string; KOs: number; turnsOut: number }[] = [];
  while (i < ts.length && ts[i][0] === p1Trainer) {
    p1TeamOut.push({ species: ts[i][1], KOs: KOs[i], turnsOut: turnsOut[i] });
    i++;
    if (i >= ts.length) {
      process.stderr.write("Something's wrong here.\n");
      return false;
    }
  }
  const p2TeamOut: { species: string; KOs: number; turnsOut: number }[] = [];
  for (let j = i; j < ts.length; j++) {
    p2TeamOut.push({ species: ts[j][1], KOs: KOs[j], turnsOut: turnsOut[j] });
  }

  return {
    p1: {
      trainer: p1Trainer,
      bias: p1Tags.bias,
      stalliness: p1Tags.stalliness,
      tags: p1Tags.tags,
      ...(p1Tags.outcome ? { outcome: p1Tags.outcome } : {}),
      ...(p1Tags.rating ? { rating: p1Tags.rating } : {}),
      team: p1TeamOut,
    },
    p2: {
      trainer: p2Trainer,
      bias: p2Tags.bias,
      stalliness: p2Tags.stalliness,
      tags: p2Tags.tags,
      ...(p2Tags.outcome ? { outcome: p2Tags.outcome } : {}),
      ...(p2Tags.rating ? { rating: p2Tags.rating } : {}),
      team: p2TeamOut,
    },
    matchups,
    turns: parseInt(String(log['turns']), 10),
    ...('endType' in log ? { endType: log['endType'] as string } : {}),
  };
}


// gzip all movesets in parallel
async function flushAsync(
  outBattle: string,
  msDirPath: string,
  writeme: BattleRecord[],
  movesets: Record<string, WriteableMatchup[]>
): Promise<void> {
  if (writeme.length > 0) {
    const compressed = await gzipAsync(JSON.stringify(writeme) + '\n');
    await fsp.appendFile(outBattle, compressed);
  }
  await Promise.all(
    Object.keys(movesets).map(async species => {
      if (!species || species.includes('/') || species.includes('\\')) {
        delete movesets[species];
        return;
      }
      const data = await gzipAsync(JSON.stringify(movesets[species]));
      await fsp.appendFile(path.join(msDirPath, species), data);
      delete movesets[species];
    })
  );
}

interface WorkerResult {
  workerId: number;
  count: number;
  tmpBattle: string;
  tmpMsDir: string;
}

async function runWorker(input: WorkerInput): Promise<WorkerResult> {
  const { files, logDir, tier, workerId, tmpDir } = input;

  const tmpBattle = path.join(tmpDir, `battle_${workerId}`);
  const tmpMsDir  = path.join(tmpDir, `ms_${workerId}`);
  fs.mkdirSync(tmpMsDir, { recursive: true });

  let writeme: BattleRecord[] = [];
  const movesets: Record<string, WriteableMatchup[]> = {};
  let count = 0;

  const BATCH = 16; // reasonable in production, higher values increase load
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const raws = await Promise.all(
      batch.map(f => readLogFile(path.join(logDir, f)))
    );
    for (let j = 0; j < batch.length; j++) {
      const raw = raws[j];
      if (raw === false) continue;
      const x = LogReader(raw, path.join(logDir, batch[j]), tier, movesets);
      if (x) {
        writeme.push(x);
        count++;
        if (count % 5000 === 0) { // write to moveset file
          await flushAsync(tmpBattle, tmpMsDir, writeme, movesets);
          writeme = [];
        }
      }
    }
  }
  await flushAsync(tmpBattle, tmpMsDir, writeme, movesets);

  return { workerId, count, tmpBattle, tmpMsDir };
}

// Merge output into final Raw/ files
async function mergeWorkerOutput(
  tier: string,
  results: { tmpBattle: string; tmpMsDir: string }[]
): Promise<void> {
  const outBattle = `Raw/${tier}`;
  const outMsDir  = `Raw/moveset/${tier}`;
  await fsp.mkdir('Raw', { recursive: true }).catch(() => {});
  await fsp.mkdir(outMsDir, { recursive: true }).catch(() => {});

  // append each worker's output in order
  const battleHandle = await fsp.open(outBattle, 'a');
  for (const { tmpBattle } of results) {
    try {
      await battleHandle.write(await fsp.readFile(tmpBattle));
    } catch { /* worker had no output */ }
  }
  await battleHandle.close();

  const allSpecies = new Set<string>();
  for (const { tmpMsDir } of results) {
    try {
      for (const f of fs.readdirSync(tmpMsDir)) allSpecies.add(f);
    } catch { /* empty worker */ }
  }

  await Promise.all([...allSpecies].map(async species => {
    const handle = await fsp.open(path.join(outMsDir, species), 'a');
    for (const { tmpMsDir } of results) {
      const src = path.join(tmpMsDir, species);
      try {
        await handle.write(await fsp.readFile(src));
      } catch { /* species not in this worker */ }
    }
    await handle.close();
  }));
}

async function main(argv: string[]): Promise<void> {
  if (argv.length < 4) {
    process.stderr.write('Usage: node dist/batchLogReader.js <log-dir> <tier>\n');
    process.exit(1);
  }

  const logDir = argv[2];
  const tier = argv[3];

  await fsp.mkdir('Raw', { recursive: true });
  await fsp.mkdir(`Raw/moveset/${tier}`, { recursive: true });

  const allFiles = fs.readdirSync(logDir);
  if (allFiles.length === 0) {
    console.log('No files to process.');
    return;
  }

  const numCpus = os.cpus().length;
  const load = os.loadavg()[0];
  const availableCores = Math.max(1, Math.floor(numCpus - load));
  const numWorkers = Math.min(availableCores, allFiles.length);

  const chunkSize = Math.ceil(allFiles.length / numWorkers);
  const chunks: string[][] = [];
  for (let i = 0; i < allFiles.length; i += chunkSize) chunks.push(allFiles.slice(i, i + chunkSize));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-stats-'));

  let workerResults: WorkerResult[];
  if (numWorkers <= 1) {
    const input: WorkerInput = { files: chunks[0], logDir, tier, workerId: 0, tmpDir };
    workerResults = [await runWorker(input)];
  } else {
    workerResults = await new Promise<WorkerResult[]>((resolve, reject) => {
      const results: WorkerResult[] = [];
      let done = 0;
      for (let w = 0; w < chunks.length; w++) {
        const input: WorkerInput = { files: chunks[w], logDir, tier, workerId: w, tmpDir };
        const worker = new Worker(__filename, { workerData: input });
        worker.on('message', (msg: WorkerResult) => {
          results.push(msg);
          if (++done === chunks.length) resolve(results);
        });
        worker.on('error', reject);
      }
    });
  }

  await mergeWorkerOutput(tier, workerResults);

  fs.rmSync(tmpDir, { recursive: true, force: true });

  // const total = workerResults.reduce((s, r) => s + r.count, 0);
  // console.log(`Total logs processed: ${total}`);
}

if (!isMainThread) {
  runWorker(workerData as WorkerInput).then(result => {
    parentPort!.postMessage(result);
  }).catch(err => {
    process.stderr.write(`Worker error: ${err}\n`);
    process.exit(1);
  });
} else {
  main(process.argv).catch(err => {
    process.stderr.write(`${err}\n`);
    process.exit(1);
  });
}
