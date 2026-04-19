/**
 * TA (Team Analyzer)
 *
 * Contains the analyzeTeam function, which returns bias, stalliness, and team tags
 * for an inputted team. Exports lookup tables (nmod, megas, baseStats, types)
 * and the statFormula function used by batchMovesetCounter.
 */

import * as fs from 'fs';
import { keyify } from './common';

export const baseStats: Record<string, Record<string, number>> = JSON.parse(
  fs.readFileSync('baseStats.json', 'utf-8').split('\n')[0]
);

export const types: Record<string, string[]> = JSON.parse(
  fs.readFileSync('types.json', 'utf-8').split('\n')[0]
);

export function statFormula(base: number, lv: number, nat: number, iv: number, ev: number): number {
  if (nat === -1) { // for HP
    return Math.floor((iv + 2 * base + ev / 4 + 100) * lv / 100 + 10);
  }
  return Math.floor(((iv + 2 * base + ev / 4) * lv / 100 + 5) * nat / 10);
}

export const nmod: Record<string, number[]> = {
  // neutral
  hardy:   [10,10,10,10,10],
  docile:  [10,10,10,10,10],
  serious: [10,10,10,10,10],
  bashful: [10,10,10,10,10],
  quirky:  [10,10,10,10,10],
  // +atk
  lonely:  [11, 9,10,10,10], // -def
  adamant: [11,10, 9,10,10], // -spa
  naughty: [11,10,10, 9,10], // -spd
  brave:   [11,10,10,10, 9], // -spe
  // +def
  bold:    [ 9,11,10,10,10], // -atk
  impish:  [10,11, 9,10,10], // -spa
  lax:     [10,11,10, 9,10], // -spd
  relaxed: [10,11,10,10, 9], // -spe
  // +spa
  modest:  [ 9,10,11,10,10], // -atk
  mild:    [10, 9,11,10,10], // -def
  rash:    [10,10,11, 9,10], // -spd
  quiet:   [10,10,11,10, 9], // -spe
  // +spd
  calm:    [ 9,10,10,11,10], // -atk
  gentle:  [10, 9,10,11,10], // -def
  careful: [10,10, 9,11,10], // -spa
  sassy:   [10,10,10,11, 9], // -spe
  // +spe
  timid:   [ 9,10,10,10,11], // -atk
  hasty:   [10, 9,10,10,11], // -def
  jolly:   [10,10, 9,10,11], // -spa
  naive:   [10,10,10, 9,11], // -spd
};

const megaTable: [[string, string], string][] = [
  [['abomasnow',        'abomasite'],     'snowwarning'],
  [['absol',            'absolite'],      'magicbounce'],
  [['aerodactyl',       'aerodactylite'], 'toughclaws'],
  [['aggron',           'aggronite'],     'filter'],
  [['alakazam',         'alakazite'],     'trace'],
  [['altaria',          'altarianite'],   'pixilate'],
  [['ampharos',         'ampharosite'],   'moldbreaker'],
  [['audino',           'audinite'],      'healer'],
  [['banette',          'banettite'],     'prankster'],
  [['beedrill',         'beedrillite'],   'adaptability'],
  [['blastoise',        'blastoisinite'], 'megalauncher'],
  [['blaziken',         'blazikenite'],   'speedboost'],
  [['camerupt',         'cameruptite'],   'sheerforce'],
  [['charizard',        'charizarditex'], 'toughclaws'],
  [['charizard',        'charizarditey'], 'drought'],
  [['diancie',          'diancite'],      'magicbounce'],
  [['gallade',          'galladite'],     'innerfocus'],
  [['garchomp',         'garchompite'],   'sandforce'],
  [['gardevoir',        'gardevoirite'],  'pixilate'],
  [['gengar',           'gengarite'],     'shadowtag'],
  [['glalie',           'glalitite'],     'refrigerate'],
  [['gyarados',         'gyaradosite'],   'moldbreaker'],
  [['heracross',        'heracronite'],   'skilllink'],
  [['houndoom',         'houndoominite'], 'solarpower'],
  [['kangaskhan',       'kangaskhanite'], 'parentalbond'],
  [['latias',           'latiasite'],     'levitate'],
  [['latios',           'latiosite'],     'levitate'],
  [['lopunny',          'lopunnite'],     'scrappy'],
  [['lucario',          'lucarionite'],   'adaptability'],
  [['manectric',        'manectite'],     'intimidate'],
  [['mawile',           'mawilite'],      'hugepower'],
  [['medicham',         'medichamite'],   'purepower'],
  [['metagross',        'metagrossite'],  'toughclaws'],
  [['mewtwo',           'mewtwonitex'],   'steadfast'],
  [['mewtwo',           'mewtwonitey'],   'insomnia'],
  [['pidgeot',          'pidgeotite'],    'noguard'],
  [['pinsir',           'pinsirite'],     'aerilate'],
  [['sableye',          'sablenite'],     'magicbounce'],
  [['salamence',        'salamencite'],   'aerilate'],
  [['sceptile',         'sceptilite'],    'lightningrod'],
  [['scizor',           'scizorite'],     'technician'],
  [['sharpedo',         'sharpedonite'],  'strongjaw'],
  [['slowbro',          'slowbronite'],   'shellarmor'],
  [['steelix',          'steelixite'],    'sandforce'],
  [['swampert',         'swampertite'],   'swiftswim'],
  [['tyranitar',        'tyranitarite'],  'sandstream'],
  [['venusaur',         'venusaurite'],   'thickfat'],
  [['kyogre',           'blueorb'],       'primordialsea'],
  [['groudon',          'redorb'],        'desolateland'],
  [['crucibelle',       'crucibellite'],  'magicguard'],
  // Z-A
  [['barbaracle',       'barbaracite'],   'noability'],
  [['chandelure',       'chandelurite'],  'infiltrator'],
  [['chesnaught',       'chesnaughtite'], 'bulletproof'],
  [['clefable',         'clefablite'],    'magicbounce'],
  [['delphox',          'delphoxite'],    'levitate'],
  [['dragalge',         'dragalgite'],    'noability'],
  [['dragonite',        'dragoninite'],   'multiscale'],
  [['drampa',           'drampanite'],    'berserk'],
  [['eelektross',       'eelektrossite'], 'noability'],
  [['emboar',           'emboarite'],     'moldbreaker'],
  [['excadrill',        'excadrite'],     'piercingdrill'],
  [['falinks',          'falinksite'],    'noability'],
  [['feraligatr',       'feraligite'],    'dragonize'],
  [['floetteeternal',   'floettite'],     'fairyaura'],
  [['froslass',         'froslassite'],   'snowwarning'],
  [['greninja',         'greninjite'],    'protean'],
  [['hawlucha',         'hawluchanite'],  'noguard'],
  [['malamar',          'malamarite'],    'noability'],
  [['meganium',         'meganiumite'],   'megasol'],
  [['pyroar',           'pyroarite'],     'noability'],
  [['scolipede',        'scolipite'],     'noability'],
  [['scrafty',          'scraftinite'],   'noability'],
  [['skarmory',         'skarmorite'],    'stalwart'],
  [['starmie',          'starminite'],    'hugepower'],
  [['victreebel',       'victreebelite'], 'innardsout'],
  [['zygarde',          'zygardite'],     'noability'],
  // DLC
  [['absol',            'absolitez'],     'noability'],
  [['baxcalibur',       'baxcalibrite'],  'noability'],
  [['chimecho',         'chimechite'],    'levitate'],
  [['crabominable',     'crabominite'],   'ironfist'],
  [['darkrai',          'darkranite'],    'noability'],
  [['garchomp',         'garchompitez'],  'noability'],
  [['glimmora',         'glimmoranite'],  'adaptability'],
  [['golisopod',        'golisopite'],    'noability'],
  [['golurk',           'golurkite'],     'unseenfist'],
  [['heatran',          'heatranite'],    'noability'],
  [['lucario',          'lucarionitez'],  'noability'],
  [['magearna',         'magearnite'],    'noability'],
  [['magearnaoriginal', 'magearnite'],    'noability'],
  [['meowstic',         'meowsticite'],   'trace'],
  [['meowsticf',        'meowsticite'],   'trace'],
  [['raichu',           'raichunitex'],   'noability'],
  [['raichu',           'raichunitey'],   'noability'],
  [['scovillain',       'scovillainite'], 'spicyspray'],
  [['staraptor',        'staraptite'],    'noability'],
  [['tatsugiri',        'tatsugirinite'], 'noability'],
  [['tatsugiridroopy',  'tatsugirinite'], 'noability'],
  [['tatsugiristretchy','tatsugirinite'], 'noability'],
  [['zeraora',          'zeraorite'],     'noability'],
];

const megas: Map<string, string> = new Map(
  megaTable.map(([[s, i], a]) => [`${s}|${i}`, a])
);

export function getMegaAbility(species: string, item: string): string | undefined {
  return megas.get(`${species}|${item}`);
}

// Sets of moves, Abilities, items

// analyzePoke
const healingMoves        = new Set(['recover','slackoff','healorder','milkdrink','roost','moonlight','morningsun','synthesis','wish','aquaring','rest','softboiled','swallow','leechseed']);
const healBellMoves       = new Set(['healbell','aromatherapy']);
const offensiveAbilities  = new Set(['chlorophyll','download','hustle','moxie','reckless','sandrush','solarpower','swiftswim','technician','tintedlens','darkaura','fairyaura','infiltrator','parentalbond','protean','strongjaw','sweetveil','toughclaws','aerilate','normalize','pixilate','refrigerate']);
const trappingMoves       = new Set(['block','meanlook','spiderweb','pursuit']);
const defensiveAbilities  = new Set(['dryskin','filter','hydration','icebody','intimidate','ironbarbs','marvelscale','naturalcure','magicguard','multiscale','raindish','roughskin','solidrock','thickfat','unaware','aromaveil','bulletproof','cheekpouch','gooey']);
const strongSetupMoves    = new Set(['curse','dragondance','growth','shiftgear','swordsdance','fierydance','nastyplot','tailglow','quiverdance','geomancy']);
const weakSetupMoves      = new Set(['acupressure','bulkup','coil','howl','workup','meditate','sharpen','calmmind','chargebeam','agility','autotomize','flamecharge','rockpolish','doubleteam','minimize','tailwind','poweruppunch','rototiller']);
const protectMoves        = new Set(['protect','detect','kingsshield','matblock','spikyshield']);
const phazingMoves        = new Set(['whirlwind','roar','circlethrow','dragontail']);
const hazeMoves           = new Set(['haze','clearsmog']);
const paraMoves           = new Set(['thunderwave','stunspore','glare','nuzzle']);
const confusionMoves      = new Set(['supersonic','confuseray','swagger','flatter','teeterdance','yawn']);
const sleepMoves          = new Set(['darkvoid','grasswhistle','hypnosis','lovelykiss','sing','sleeppowder','spore']);
const consumableItems     = new Set(['firegem','watergem','electricgem','grassgem','icegem','fightinggem','poisongem','groundgem','flyinggem','psychicgem','buggem','rockgem','ghostgem','darkgem','steelgem','normalgem','focussash','mentalherb','powerherb','whiteherb','absorbbulb','berserkgene','cellbattery','redcard','airballoon','ejectbutton','shedshell','aguavberry','apicotberry','aspearberry','babiriberry','chartiberry','cheriberry','chestoberry','chilanberry','chopleberry','cobaberry','custapberry','enigmaberry','figyberry','ganlonberry','habanberry','iapapaberry','jabocaberry','kasibberry','kebiaberry','lansatberry','leppaberry','liechiberry','lumberry','magoberry','micleberry','occaberry','oranberry','passhoberry','payapaberry','pechaberry','persimberry','petayaberry','rawstberry','rindoberry','rowapberry','salacberry','shucaberry','sitrusberry','starfberry','tangaberry','wacanberry','wikiberry','yacheberry','keeberry','marangaberry','roseliberry','snowball']);
const recoilMoves         = new Set(['jumpkick','doubleedge','submission','petaldance','hijumpkick','outrage','volttackle','closecombat','flareblitz','bravebird','woodhammer','headsmash','headcharge','wildcharge','takedown','dragonascent']);
const sacrificeMoves      = new Set(['selfdestruct','explosion','destinybond','perishsong','memento','healingwish','lunardance','finalgambit']);
const ohkoMoves           = new Set(['guillotine','fissure','sheercold']);
const boostItems          = new Set(['expertbelt','wiseglasses','muscleband','dracoplate','dreadplate','earthplate','fistplate','flameplate','icicleplate','insectplate','ironplate','meadowplate','mindplate','skyplate','splashplate','spookyplate','stoneplate','toxicplate','zapplate','blackglasses','charcoal','dragonfang','hardstone','magnet','metalcoat','miracleseed','mysticwater','nevermeltice','poisonbarb','sharpbeak','silkscarf','silverpowder','softsand','spelltag','twistedspoon','pixieplate']);

// analyzeTeam
const batonpassSetupMoves = new Set(['acupressure','bellydrum','bulkup','coil','curse','dragondance','growth','honeclaws','howl','meditate','sharpen','shellsmash','shiftgear','swordsdance','workup','calmmind','chargebeam','fierydance','nastyplot','tailglow','quiverdance','agility','autotomize','flamecharge','rockpolish','doubleteam','minimize','substitute','acidarmor','barrier','cosmicpower','cottonguard','defendorder','defensecurl','harden','irondefense','stockpile','withdraw','amnesia','charge','ingrain']);
const batonpassAbilities  = new Set(['angerpoint','contrary','moody','moxie','speedboost']);
const gravityInaccurateMoves = new Set(['guillotine','fissure','sheercold','dynamicpunch','inferno','zapcannon','grasswhistle','sing','supersonic','hypnosis','blizzard','focusblast','gunkshot','hurricane','smog','thunder','clamp','dragonrush','eggbomb','irontail','lovelykiss','magmastorm','megakick','poisonpowder','slam','sleeppowder','stunspore','sweetkiss','willowisp','crosschop','darkvoid','furyswipes','headsmash','hydropump','kinesis','psywave','rocktomb','stoneedge','submission','boneclub','bonerush','bonemerang','bulldoze','dig','drillrun','earthpower','earthquake','magnitude','mudbomb','mudshot','mudslap','sandattack','spikes','toxicspikes']);
const voltturnMoves       = new Set(['voltswitch','uturn','batonpass']);
const trappingMovesTeam   = new Set(['block','meanlook','spiderweb']);
const trappingAbilities   = new Set(['magnetpull','arenatrap','shadowtag']);
const dragonSpecies       = new Set(['dratini','dragonair','bagon','shelgon','axew','fraxure','haxorus','druddigon','dragonite','altaria','salamence','latias','latios','rayquaza','gible','gabite','garchomp','reshiram','zekrom','kyurem','kyuremwhite','kyuremblack','kingdra','vibrava','flygon','dialga','palkia','giratina','giratinaorigin','deino','zweilous','hydreigon']);
const swagplayMoves       = new Set(['foulplay','swagger']);

// team type detection
interface PokeInput {
  species: string;
  nature: string;
  item: string;
  ability: string;
  level: number;
  ivs: Record<string, number>;
  evs: Record<string, number>;
  moves: string[];
  happiness: number;
  teraType?: string | null;
}

export function analyzePoke(poke: PokeInput): [number, number] | null {
  const species = keyify(poke.species);

  if (!(species in baseStats)) {
    process.stderr.write(`${species} is not listed in baseStats.json\nYou may want to fix that.\n`);
    return null;
  }

  const moves = new Set(poke.moves);

  const stats: number[] = [];
  if (species === 'shedinja') {
    stats.push(1);
  } else {
    stats.push(statFormula(baseStats[species]['hp'], poke.level, -1, poke.ivs['hp'], poke.evs['hp']));
  }
  stats.push(statFormula(baseStats[species]['atk'], poke.level, nmod[poke.nature][0], poke.ivs['atk'], poke.evs['atk']));
  stats.push(statFormula(baseStats[species]['def'], poke.level, nmod[poke.nature][1], poke.ivs['def'], poke.evs['def']));
  stats.push(statFormula(baseStats[species]['spa'], poke.level, nmod[poke.nature][3], poke.ivs['spa'], poke.evs['spa']));
  stats.push(statFormula(baseStats[species]['spd'], poke.level, nmod[poke.nature][4], poke.ivs['spd'], poke.evs['spd']));
  stats.push(statFormula(baseStats[species]['spe'], poke.level, nmod[poke.nature][2], poke.ivs['spe'], poke.evs['spe']));

  if (species === 'aegislash' && poke.ability === 'stancechange') { // check for attacking move as well?
    stats[1]  = statFormula(baseStats['aegislashblade']['atk'], poke.level, nmod[poke.nature][0], poke.ivs['atk'], poke.evs['atk']);
    stats[2] += statFormula(baseStats['aegislashblade']['def'], poke.level, nmod[poke.nature][1], poke.ivs['def'], poke.evs['def']);
    stats[3]  = statFormula(baseStats['aegislashblade']['spa'], poke.level, nmod[poke.nature][3], poke.ivs['spa'], poke.evs['spa']);
    stats[4] += statFormula(baseStats['aegislashblade']['spd'], poke.level, nmod[poke.nature][4], poke.ivs['spd'], poke.evs['spd']);
    stats[2] /= 2;
    stats[4] /= 2;
  }

  // calculate base stalliness
  const bias = poke.evs['atk'] + poke.evs['spa'] - poke.evs['hp'] - poke.evs['def'] - poke.evs['spd'];
  let stalliness: number;

  if (species === 'shedinja') {
    stalliness = 0;
  } else if (species === 'ditto') {
    stalliness = Math.log2(3); // eventually I'll want to replace this with mean stalliness for the tier
  } else {
    try {
      stalliness = -Math.log2(
        ((2.0 * poke.level + 10) / 250 * Math.max(stats[1], stats[3]) / Math.max(stats[2], stats[4]) * 120 + 2) * 0.925 / stats[0]
      );
    } catch {
      process.stderr.write(`Got a problem with a ${species}\n`);
      return null;
    }
  }

  // moveset modifications
  if (['purepower','hugepower'].includes(poke.ability)) stalliness -= 1.0;
  if (['choiceband','choicescarf','choicespecs','lifeorb'].includes(poke.item)) stalliness -= 0.5;
  if (poke.item === 'eviolite') stalliness += 0.5;
  if (moves.has('spikes')) stalliness += 0.5;
  if (moves.has('toxicspikes')) stalliness += 0.5;
  if (moves.has('toxic')) stalliness += 1.0;
  if (moves.has('willowisp')) stalliness += 0.5;
  if ([...healingMoves].some(m => moves.has(m))) stalliness += 1.0;
  if (poke.ability === 'regenerator') stalliness += 0.5;
  if ([...healBellMoves].some(m => moves.has(m))) stalliness += 0.5;
  if (offensiveAbilities.has(poke.ability)) stalliness -= 0.5;
  if (['flareboost','guts','quickfeet'].includes(poke.ability) && poke.item === 'flameorb') stalliness -= 1.0;
  if (['toxicboost','guts','quickfeet'].includes(poke.ability) && poke.item === 'toxicorb') stalliness -= 1.0;
  if (['speedboost','moody'].includes(poke.ability)) stalliness -= 1.0;
  if (['arenatrap','magnetpull','shadowtag'].includes(poke.ability)) stalliness -= 1.0;
  else if ([...trappingMoves].some(m => moves.has(m))) stalliness -= 0.5;
  if (defensiveAbilities.has(poke.ability)) stalliness += 0.5;
  if (poke.ability === 'poisonheal' && poke.item === 'toxicorb') stalliness += 0.5;
  if (['slowstart','truant','furcoat'].includes(poke.ability)) stalliness += 1.0;
  if (poke.item === 'lightclay') stalliness -= 1.0;
  if (moves.has('bellydrum')) stalliness -= 2.0;
  else if (moves.has('shellsmash')) stalliness -= 1.5;
  else if ([...strongSetupMoves].some(m => moves.has(m))) stalliness -= 1.0;
  else if ([...weakSetupMoves].some(m => moves.has(m))) stalliness -= 0.5;
  if (moves.has('substitute')) stalliness -= 0.5;
  if ([...protectMoves].some(m => moves.has(m))) stalliness += 1.0;
  if (moves.has('endeavor')) stalliness -= 1.0;
  if (moves.has('superfang')) stalliness -= 0.5;
  if (moves.has('trick')) stalliness -= 0.5;
  if (moves.has('psychoshift')) stalliness += 0.5;
  if ([...phazingMoves].some(m => moves.has(m))) stalliness += 0.5;
  if ([...hazeMoves].some(m => moves.has(m))) stalliness += 0.5;
  if ([...paraMoves].some(m => moves.has(m))) stalliness += 0.5;
  if ([...confusionMoves].some(m => moves.has(m))) stalliness += 0.5;
  if ([...sleepMoves].some(m => moves.has(m))) stalliness -= 0.5;
  if (poke.item === 'redcard') stalliness += 0.5;
  if (poke.item === 'rockyhelmet') stalliness += 0.5;
  if (consumableItems.has(poke.item)) stalliness -= 0.5;
  if (poke.ability === 'harvest' || moves.has('recycle')) stalliness += 1.0;
  if ([...recoilMoves].some(m => moves.has(m))) stalliness -= 0.5;
  if ([...sacrificeMoves].some(m => moves.has(m))) stalliness -= 1.0;
  if ([...ohkoMoves].some(m => moves.has(m))) stalliness -= 1.0;
  if (['sandstream','snowwarning'].includes(poke.ability) || moves.has('sandstorm') || moves.has('hail')) stalliness += 0.5;
  if (['latios','latias'].includes(species) && poke.item === 'souldew') stalliness -= 0.5;
  if (species === 'pikachu' && poke.item === 'lightball') stalliness -= 1.0;
  if (['cubone','marowak'].includes(species) && poke.item === 'thickclub') stalliness -= 1.0;
  if (species === 'clamperl' && poke.item === 'deepseatooth') stalliness -= 1.0;
  if (species === 'clamperl' && poke.item === 'deepseascale') stalliness += 1.0;
  if (boostItems.has(poke.item)) stalliness -= 0.25;
  if (species === 'dialga' && poke.item === 'adamantorb') stalliness -= 0.25;
  if (species === 'palkia' && poke.item === 'lustrousorb') stalliness -= 0.25;
  if (species === 'giratinaorigin' && poke.item === 'griseousorb') stalliness -= 0.25;
  if (poke.item === 'weaknesspolicy') stalliness -= 1.0;

  return [stalliness, bias];
}

export interface TeamAnalysis {
  bias: number;
  stalliness: number;
  tags: string[];
}

export function analyzeTeam(team: PokeInput[]): TeamAnalysis | null {
  let tbias = 0;
  const stallinessValues: number[] = [];
  let possibleTypes: Set<string> | null = null;

  for (const p of team) {
    if (!p.species) continue;
    // for stats and moveset purposes, we're now counting mega Pokemon separately.
    // But for Team Analysis, we still want to consider the base (this presumably
    // breaks for hackmons, but w/e--hackmons has always been broken)
    const poke: PokeInput = { ...p, ivs: { ...p.ivs }, evs: { ...p.evs }, moves: [...p.moves] };
    if (
      poke.species.endsWith('-Mega') || poke.species.endsWith('-Mega-X') ||
      poke.species.endsWith('-Mega-Y') || poke.species.endsWith('-Mega-Z') ||
      poke.species.endsWith('-Primal')
    ) {
      poke.species = poke.species.slice(0, poke.species.indexOf('-'));
    }

    const species = keyify(poke.species);

    if (possibleTypes === null) {
      possibleTypes = new Set(types[species] ?? []);
    } else {
      const speciesTypes = new Set<string>(types[species] ?? []);
      const current: Set<string> = possibleTypes;
      possibleTypes = new Set<string>([...current].filter(t => speciesTypes.has(t)));
    }

    const analysis = analyzePoke(poke);
    if (analysis === null) return null;
    let [stalliness, bias] = analysis;

    if (species === 'meloetta' && poke.moves.includes('relicsong')) {
      const mega: PokeInput = { ...poke, species: 'meloettapirouette' };
      const r = analyzePoke(mega);
      if (r) { stalliness = (stalliness + r[0]) / 2.0; }
    } else if (species === 'darmanitan' && poke.ability === 'zenmode') {
      const mega: PokeInput = { ...poke, species: 'darmanitanzen' };
      const r = analyzePoke(mega);
      if (r) { stalliness = (stalliness + r[0]) / 2.0; }
    } else if (species === 'rayquaza' && poke.moves.includes('dragonascent')) {
      const mega: PokeInput = { ...poke, species: 'rayquazamega', ability: 'deltastream' };
      const r = analyzePoke(mega);
      if (r) { stalliness = (stalliness + r[0]) / 2.0; }
    } else {
      const megaAbility = getMegaAbility(species, poke.item);
      if (megaAbility !== undefined) {
        let megaSpecies = species + 'mega';
        if (poke.item.endsWith('x')) megaSpecies += 'x';
        else if (poke.item.endsWith('y')) megaSpecies += 'y';
        else if (poke.item.endsWith('z')) megaSpecies += 'z';
        if (['kyogremega','groudonmega'].includes(megaSpecies)) megaSpecies = megaSpecies.slice(0,-4) + 'primal';
        if (megaSpecies === 'floetteeternalmega') megaSpecies = 'floettemega';
        if (megaSpecies === 'zygarde10mega') megaSpecies = 'zygardemega';
        if (megaSpecies === 'meowsticmega') megaSpecies = 'meowsticmmega';
        if (megaSpecies === 'tatsugirimega') megaSpecies = 'tatsugiricurlymega';

        const mega: PokeInput = { ...poke, species: megaSpecies, ability: megaAbility };
        const r = analyzePoke(mega);
        if (r) { stalliness = (stalliness + r[0]) / 2.0; }
      }
    }

    stalliness -= Math.log2(3); // final correction
    tbias += bias;
    stallinessValues.push(stalliness);
  }

  // team-type detection
  const tstalliness = stallinessValues.reduce((a, b) => a + b, 0) / stallinessValues.length;
  const tags: string[] = [];

  // don't put anything before weather
  let count: number;
  let detected: boolean;

  // rain
  count = 0; detected = false;
  for (const poke of team) {
    if (['drizzle','primordialsea'].includes(poke.ability)) { detected = true; break; }
    if (poke.item === 'damprock' && poke.moves.includes('raindance')) { detected = true; break; }
    if (poke.moves.includes('raindance')) { count++; if (count > 1) { detected = true; break; } }
  }
  if (detected) tags.push('rain');

  // sun
  count = 0; detected = false;
  for (const poke of team) {
    if (['drought','desolateland'].includes(poke.ability)) { detected = true; break; }
    if ([keyify(poke.species), poke.item].join(',') === 'charizard,charizarditey') { detected = true; break; }
    if (poke.item === 'heatrock' && poke.moves.includes('sunnyday')) { detected = true; break; }
    if (poke.moves.includes('sunnyday')) { count++; if (count > 1) { detected = true; break; } }
  }
  if (detected) tags.push('sun');

  // sand
  count = 0; detected = false;
  for (const poke of team) {
    if (poke.ability === 'sandstream') { detected = true; break; }
    if (poke.item === 'smoothrock' && poke.moves.includes('sandstorm')) { detected = true; break; }
    if (poke.moves.includes('sandstorm')) { count++; if (count > 1) { detected = true; break; } }
  }
  if (detected) tags.push('sand');

  // hail
  count = 0; detected = false;
  for (const poke of team) {
    if (poke.ability === 'snowwarning') { detected = true; break; }
    if (poke.item === 'icyrock' && poke.moves.includes('hail')) { detected = true; break; }
    if (poke.moves.includes('hail')) { count++; if (count > 1) { detected = true; break; } }
  }
  if (detected) tags.push('hail');

  if (tags.length === 4) tags.push('allweather');
  else if (tags.length > 1) tags.push('multiweather');
  else if (tags.length === 0) tags.push('weatherless');

  // baton pass
  count = 0;
  for (const poke of team) {
    if (poke.moves.includes('batonpass')) {
      if (poke.moves.some(m => batonpassSetupMoves.has(m)) || batonpassAbilities.has(poke.ability)) {
        count++;
        if (count > 1) break;
      }
    }
  }
  if (count > 1) tags.push('batonpass');

  // tailwind
  count = 0;
  for (const poke of team) {
    if (poke.moves.includes('tailwind')) { count++; if (count > 1) break; }
  }
  if (count > 1) tags.push('tailwind');

  // trick room
  const trCount = [0, 0];
  for (const poke of team) {
    if (poke.moves.includes('trickroom') && !poke.moves.includes('imprison')) trCount[0]++;
    else if (
      ['brave','relaxed','quiet','sassy'].includes(poke.nature) ||
      (baseStats[keyify(poke.species)]?.['spe'] ?? 999) <= 50
    ) {
      if ((poke.evs['spe'] ?? 0) < 5) trCount[1]++; // or I could just use actual stats and speed factor
    }
  }
  if ((trCount[0] > 1 && trCount[1] > 1) || trCount[0] > 2) {
    tags.push('trickroom');
    if (tags.includes('sun')) tags.push('tricksun');
    if (tags.includes('rain')) tags.push('trickrain');
    if (tags.includes('sand')) tags.push('tricksand');
    if (tags.includes('hail')) tags.push('trickhail');
  }

  // gravity
  const gravCount = [0, 0];
  for (const poke of team) {
    if (poke.moves.includes('gravity')) gravCount[0]++;
    if (poke.moves.some(m => gravityInaccurateMoves.has(m))) gravCount[1]++;
  }
  if ((gravCount[0] > 1 && gravCount[1] > 1) || gravCount[0] > 2) tags.push('gravity');

  // voltturn
  count = 0;
  for (const poke of team) {
    if (poke.moves.some(m => voltturnMoves.has(m)) || poke.item === 'ejectbutton') {
      count++;
      if (count > 2) break;
    }
  }
  if (count > 2 && !tags.includes('batonpass')) tags.push('voltturn');

  // dragmag and trapper
  const dmCount = [0, 0];
  for (const poke of team) {
    if (trappingAbilities.has(poke.ability) || poke.moves.some(m => trappingMovesTeam.has(m))) dmCount[0]++;
    else if (dragonSpecies.has(keyify(poke.species))) dmCount[1]++;
  }
  if (dmCount[0] > 0 && dmCount[1] > 1) tags.push('dragmag');
  if (dmCount[0] > 2) tags.push('trapper');

  // F.E.A.R.
  const fearCount = [0, 0];
  for (const poke of team) {
    if (poke.ability === 'magicbounce' || poke.moves.includes('rapidspin')) fearCount[0]++;
    else if ((poke.ability === 'sturdy' || poke.item === 'focussash') && poke.moves.includes('endeavor')) fearCount[1]++;
  }
  if (fearCount[0] > 1 && fearCount[1] > 2) {
    tags.push('fear');
    if (tags.includes('sand')) tags.push('sandfear');
    if (tags.includes('hail')) tags.push('hailfear');
    if (tags.includes('trickroom')) tags.push('trickfear');
  }

  // choice
  count = 0;
  for (const poke of team) {
    if (['choiceband','choicescarf','choicespecs'].includes(poke.item) && poke.ability !== 'klutz') {
      count++;
      if (count > 3) break;
    }
  }
  if (count > 3) tags.push('choice');

  // swagplay
  count = 0;
  for (const poke of team) {
    if (poke.moves.filter(m => swagplayMoves.has(m)).length > 1) {
      count++;
      if (count > 1) break;
    }
  }
  if (count > 1) tags.push('swagplay');

  // monotype
  if (possibleTypes && (possibleTypes as Set<string>).size > 0) {
    tags.push('monotype');
    for (const monotype of (possibleTypes as Set<string>)) {
      tags.push('mono' + monotype.toLowerCase());
    }
  }

  // stalliness stuff
  if (tstalliness <= -1.0) {
    tags.push('hyperoffense');
    if (!tags.includes('multiweather') && !tags.includes('allweather') && !tags.includes('weatherless')) {
      if (tags.includes('rain')) tags.push('rainoffense');
      else if (tags.includes('sun')) tags.push('sunoffense');
      else if (tags.includes('sand')) tags.push('sandoffense');
      else tags.push('hailoffense');
    }
  } else if (tstalliness <= 0.0) {
    tags.push('offense');
  } else if (tstalliness <= 1.0) {
    tags.push('balance');
  } else if (tstalliness <= Math.log2(3)) {
    tags.push('semistall');
  } else {
    tags.push('stall');
    if (!tags.includes('multiweather') && !tags.includes('allweather') && !tags.includes('weatherless')) {
      if (tags.includes('rain')) tags.push('rainstall');
      else if (tags.includes('sun')) tags.push('sunstall');
      else if (tags.includes('sand')) tags.push('sandstall');
      else tags.push('hailstall');
    }
  }

  return { bias: tbias, stalliness: tstalliness, tags };
}
