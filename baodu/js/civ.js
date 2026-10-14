// Every star hosts a civilization. Nothing is stored per species: the whole description is a pure
// function of the star's 32-bit seed, so 30k civilizations cost four numbers each.

// age (in sim time, already scaled by the species' curiosity) needed to reach each tech level
export const TECH_T = [0, 25, 60, 110, 170, 250, 350, 480, Infinity];
export const TECHS = ['石器时代', '农耕时代', '蒸汽时代', '电气时代', '信息时代', '行星文明', '星际文明', '升维文明'];
export const FORMS = ['蛙人', '鱼人', '云团', '晶体', '机械', '藤蔓', '光', '石头人'];
export const TEMPERS = ['爱发呆', '好客', '爱睡觉', '好奇', '害羞', '爱热闹', '爱收集', '爱抱肚子'];
export const QUIRKS = [
  '节日是每年一次的集体抱肚子。',
  '把发呆列为国家级运动。',
  '货币单位是一次拥抱。',
  '至今没人解释得清，一天为什么有 25 个小时。',
  '最高的建筑是一张沙发。',
  '国歌只有一个音，要唱很久。',
  '相信宇宙起源于一次抱肚子。',
  '每年有一天全星球午睡。',
  '最大的争论：奶蛙到底是不是青蛙。',
  '天文台主要用来看云。',
  '对黑洞很好奇，但保持着礼貌的距离。',
  '图书馆里只有一本书，名叫《肚子》。',
];
export const SYL = {
  zh: ['波', '米', '噜', '咕', '啾', '嘟', '咪', '噗', '滴', '布', '啵', '哒', '呜', '蓬'],
  en: ['po', 'mi', 'ru', 'gu', 'ju', 'do', 'mu', 'pu', 'di', 'bu', 'bo', 'da', 'wu', 'pon'],
  ja: ['ポ', 'ミ', 'ル', 'グ', 'ジュ', 'ド', 'ム', 'プ', 'ディ', 'ブ', 'ボ', 'ダ', 'ウ', 'ポン'],
};

export function techLevel(age) {
  if (age < 0) return -1;
  let l = 0;
  while (age >= TECH_T[l + 1]) l++;
  return l;
}
// how fast this species learns: 0.55 .. 1.8
export const curiosityOf = seed => 0.55 + ((seed >>> 11) & 255) / 255 * 1.25;

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function describe(seed) {
  const r = rng(seed ^ 0x9E3779B9);
  const n = r() < 0.4 ? 3 : 2;
  const syl = Array.from({ length: n }, () => (r() * SYL.zh.length) | 0);
  return { syl, form: (r() * FORMS.length) | 0, temper: (r() * TEMPERS.length) | 0, quirk: (r() * QUIRKS.length) | 0, popExp: r() };
}
export function speciesName(d, lang) {
  const t = SYL[lang] || SYL.zh;
  const w = d.syl.map(i => t[i]).join('');
  return lang === 'en' ? w[0].toUpperCase() + w.slice(1) : w;
}
// population for a tech level (log scale)
export function population(d, lvl) {
  return lvl < 0 ? 0 : Math.pow(10, 4.6 + lvl * 0.85 + d.popExp * 0.8);
}
export function fmtPop(n, lang) {
  if (n <= 0) return '0';
  if (lang === 'en') {
    for (const [v, s] of [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million'], [1e3, ' thousand']]) if (n >= v) return (n / v).toFixed(1).replace(/\.0$/, '') + s;
    return String(Math.round(n));
  }
  const ja = lang === 'ja', f = x => x.toFixed(1).replace(/\.0$/, '');
  if (n >= 1e12) return f(n / 1e12) + (ja ? ' 兆' : ' 万亿');
  if (n >= 1e8) return f(n / 1e8) + (ja ? ' 億' : ' 亿');
  if (n >= 1e4) return f(n / 1e4) + ' 万';
  return String(Math.round(n));
}

// 0 = mild ... 1 = bellicose; decides how often contact turns into war
export const aggressionOf = seed => ((seed >>> 19) & 255) / 255;
export const ATTITUDES = ['佛系', '普通', '好战'];
export const attitudeIdx = a => (a < 0.45 ? 0 : a < 0.82 ? 1 : 2);
// military power of a civilization at a tech level
export const powerOf = (lvl, seed) => Math.pow(1.45, lvl) * (0.7 + 0.6 * aggressionOf(seed));
