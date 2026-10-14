// Strings keyed by the Chinese source text, same scheme as the homepage and Belly-Hug Nebula.
// Japanese carries furigana in <ruby>; plain() strips it for attributes and the page title.
const R = (k, r) => `<ruby>${k}<rt>${r}</rt></ruby>`;

export const I18N = {
  '‹ 奶蛙宇宙': { en: '‹ Naiwa Universe', ja: `‹ ナイワ${R('宇宙', 'うちゅう')}` },
  '午睡黑洞': { en: 'The Nap Black Hole', ja: `お${R('昼寝', 'ひるね')}ブラックホール` },
  '午睡黑洞 · 午睡舱': { en: 'The Nap Black Hole · Nap Pod', ja: 'お昼寝ブラックホール・お昼寝ポッド' },
  '午睡黑洞是一个让你慢下来的地方。选 10、20 或 30 分钟，奶蛙在黑洞边上陪你打个盹；睡醒时，外面已经过去了几百年。': {
    en: 'The Nap Black Hole is a place to slow down. Pick 10, 20 or 30 minutes and Naiwa naps beside you at the edge of a black hole. When you wake up, a few hundred years have gone by outside.',
    ja: 'お昼寝ブラックホールは、ゆっくりするための場所。10・20・30分から選ぶと、ナイワがブラックホールのそばで一緒にお昼寝。目が覚めたころ、外では数百年が過ぎている。' },
  '你的浏览器好像不支持 WebGL，午睡黑洞暂时看不到。': { en: 'Your browser doesn’t seem to support WebGL, so the Nap Black Hole can’t be shown.', ja: 'お使いのブラウザは WebGL に対応していないようで、お昼寝ブラックホールを表示できません。' },

  // setup
  '午睡舱': { en: 'Nap Pod', ja: `お${R('昼寝', 'ひるね')}ポッド` },
  '小睡中': { en: 'Napping', ja: `お${R('昼寝中', 'ひるねちゅう')}` },
  '坠落中': { en: 'Falling', ja: `${R('落下中', 'らっかちゅう')}` },
  '小睡多久': { en: 'How long', ja: `${R('時間', 'じかん')}` },
  '{n} 分钟': { en: '{n} min', ja: '{n}分' },
  '背景声音': { en: 'Sound', ja: 'サウンド' },
  '黑洞低鸣': { en: 'Black hole hum', ja: `ブラックホールの${R('低音', 'ていおん')}` },
  '雨声': { en: 'Rain', ja: `${R('雨音', 'あまおと')}` },
  '海浪': { en: 'Waves', ja: `${R('波音', 'なみおと')}` },
  '白噪音': { en: 'White noise', ja: 'ホワイトノイズ' },
  '安静': { en: 'Silence', ja: `${R('静', 'しず')}か` },
  '开始午睡': { en: 'Start napping', ja: `お${R('昼寝', 'ひるね')}を${R('始', 'はじ')}める` },
  '时间到了，轻轻叫醒我': { en: 'Wake me gently when time is up', ja: `${R('時間', 'じかん')}になったらそっと${R('起', 'お')}こして` },
  '黑洞里的 1 分钟 ≈ 外面的 15 年': { en: '1 minute in here ≈ 15 years out there', ja: `ここでの1${R('分', 'ふん')}≈ ${R('外', 'そと')}の15${R('年', 'ねん')}` },
  '把烦心事打在这里，丢进黑洞': { en: 'Type a worry here and throw it in', ja: `${R('悩', 'なや')}みをここに${R('書', 'か')}いて、ブラックホールへ` },
  '丢进去': { en: 'Throw in', ja: `${R('投', 'な')}げ${R('込', 'こ')}む` },
  '先写点烦心事吧。': { en: 'Write a worry first.', ja: `まず${R('悩', 'なや')}みを${R('書', 'か')}いてね。` },
  '这件烦心事被拉成面条了，不会被保存，也不会被上传。': { en: 'That worry was stretched into noodles. It is not saved or uploaded anywhere.', ja: `その${R('悩', 'なや')}みは${R('麺', 'めん')}のように${R('伸', 'の')}びた。${R('保存', 'ほぞん')}もアップロードもされない。` },
  '已经丢进黑洞的烦恼：{n}': { en: 'Worries thrown in so far: {n}', ja: `これまでに${R('投', 'な')}げ${R('込', 'こ')}んだ${R('悩', 'なや')}み：{n}` },
  '欢迎来到午睡舱。先选一个时长。': { en: 'Welcome to the nap pod. Pick how long first.', ja: `お${R('昼寝', 'ひるね')}ポッドへようこそ。まず${R('時間', 'じかん')}を${R('選', 'えら')}んでね。` },

  // hints
  '选好时长和声音，就可以睡了。': { en: 'Pick a length and a sound, then sleep.', ja: `${R('時間', 'じかん')}とサウンドを${R('選', 'えら')}んだら、おやすみ。` },
  '有烦心事？先丢进黑洞，它会把字拉成面条。': { en: 'Something on your mind? Throw it in. The hole will stretch the words into noodles.', ja: `${R('悩', 'なや')}みがあるなら、ブラックホールへ。${R('文字', 'もじ')}が${R('麺', 'めん')}みたいに${R('伸', 'の')}びるよ。` },
  '戳奶蛙三下试试。': { en: 'Try poking Naiwa three times.', ja: 'ナイワを3回つついてみて。' },
  '闭上眼睛，跟着光环慢慢呼吸。': { en: 'Close your eyes and breathe slowly with the ring.', ja: `${R('目', 'め')}を${R('閉', 'と')}じて、リングに${R('合', 'あ')}わせてゆっくり${R('呼吸', 'こきゅう')}。` },
  '不用做任何事。时间到了，我会叫醒你。': { en: 'You don’t have to do anything. I’ll wake you when time is up.', ja: `なにもしなくていいよ。${R('時間', 'じかん')}になったら${R('起', 'お')}こすね。` },
  '黑洞里的时间比外面慢得多。': { en: 'Time runs far slower in here than outside.', ja: `ブラックホールの${R('中', 'なか')}は、${R('外', 'そと')}よりずっと${R('時間', 'じかん')}がゆっくり。` },
  '吸气': { en: 'breathe in', ja: `${R('吸', 'す')}って` },
  '呼气': { en: 'breathe out', ja: `${R('吐', 'は')}いて` },

  // nap
  '提前醒来': { en: 'Wake up early', ja: `${R('早', 'はや')}めに${R('起', 'お')}きる` },
  '黑洞外面已过去 {y}': { en: 'Outside: {y} have passed', ja: `${R('外', 'そと')}では {y} が${R('経', 'た')}った` },
  '睡醒了': { en: 'Awake', ja: `${R('目覚', 'めざ')}め` },
  '你睡了 {m} 分钟': { en: 'You slept {m} minutes', ja: '{m}分 眠った' },
  '你只睡了一小会儿': { en: 'You only slept a little while', ja: `ほんの${R('少', 'すこ')}しだけ${R('眠', 'ねむ')}った` },
  '黑洞外面已经过去了 {y}': { en: 'Outside the black hole, {y} have passed.', ja: `ブラックホールの${R('外', 'そと')}では、もう {y} が${R('経', 'た')}った。` },
  '{y} 后': { en: '{y} later', ja: '{y}後' },
  '{d} 天': { en: '{d} days', ja: '{d}日' },
  '{y} 年': { en: '{y} years', ja: '{y}年' },
  '再睡一会儿': { en: 'Sleep a bit more', ja: `もう${R('少', 'すこ')}し${R('寝', 'ね')}る` },
  '起床': { en: 'Get up', ja: `${R('起', 'お')}きる` },
  '发呆星的海边多了 {n} 盏路灯，其中 {m} 盏还亮着。': { en: 'The coast of Planet Daze has {n} more street lamps now. {m} are still lit.', ja: 'ぼんやり星の海辺に街灯が{n}本増えた。そのうち{m}本はまだ点いている。' },
  '抱肚星云里长出了 {n} 颗新的星星，{m} 颗有了自己的文明，已经打了 {w} 场仗。': { en: 'The Belly-Hug Nebula grew {n} new stars. {m} of them have civilizations, and they have already fought {w} wars.', ja: 'お腹ハグ星雲に新しい星が{n}個生まれた。{m}個には文明ができて、もう{w}回も戦争をした。' },
  '奶蛙家族传到了第 {n} 代，大家依然抱着肚子。': { en: 'The Naiwa family is now in its {n}th generation. Everyone is still hugging their bellies.', ja: 'ナイワ一族は{n}代目になった。みんな今もお腹を抱えている。' },
  '你点的外卖已经凉了 {y}。建议不要再吃了。': { en: 'Your takeout has been cooling for {y}. We recommend not eating it.', ja: '頼んだデリバリーは{y}前から冷めている。もう食べないほうがいい。' },
  '手机里多了 {n} 条未读消息，其中 0 条是重要的。': { en: 'Your phone has {n} new unread messages. 0 of them are important.', ja: 'スマホに未読メッセージが{n}件たまった。大事なものは0件。' },
  '你睡前想不通的那件事，现在已经没有人记得了。': { en: 'That thing you couldn’t figure out before your nap? Nobody remembers it anymore.', ja: '眠る前に悩んでいたあのこと、今はもう誰も覚えていない。' },
  '你丢进来的 {n} 件烦心事被拉成了面条，现在正在黑洞的另一头晾着。': { en: 'The {n} worries you threw in were stretched into noodles. They are drying on the far side of the hole.', ja: '投げ込んだ{n}件の悩みは麺のように伸びて、ブラックホールの向こう側で干されている。' },
  '你原来的那些烦恼，已经过期 {y}了，不用再想了。': { en: 'Your old worries expired {y} ago. You can stop thinking about them.', ja: '前の悩みは{y}前に期限切れ。もう考えなくていい。' },

  // dream
  '奶蛙翻了个身，你们一起掉了下去。': { en: 'Naiwa rolled over, and you both fell in.', ja: 'ナイワが寝返りを打って、二人で一緒に落ちていった。' },
  '你睡着了，正在往下掉。动一动鼠标或手指，就能接管方向。': { en: 'You fell asleep and you are falling. Move the mouse or a finger to take the wheel.', ja: 'あなたは眠って、落ちている。マウスか指を動かせば、操縦できる。' },
  '躲开灰色的碎片，收集发光的梦境碎片。动一动鼠标或手指来控制方向。': { en: 'Dodge the grey debris and collect the glowing dream shards. Move the mouse or a finger to steer.', ja: '灰色のかけらをよけて、光る夢のかけらを集めよう。マウスか指で方向を操作。' },
  '你在梦里醒了过来。躲开灰色的碎片，收集发光的梦境碎片，一直掉到最深处。': { en: 'You woke up inside the dream. Dodge the grey debris, collect dream shards, and fall all the way to the bottom.', ja: '夢の中で目が覚めた。灰色のかけらをよけて、夢のかけらを集めて、一番深いところまで落ちよう。' },
  '你又睡着了，梦自己往下掉。动一动就能接管。': { en: 'You dozed off again and the dream falls on its own. Move to take over.', ja: 'また眠ってしまって、夢がひとりで落ちていく。動かせば操縦できる。' },
  '光越来越亮了……': { en: 'The light is getting brighter…', ja: '光がどんどん明るくなってきた……' },
  '你被碎片撞醒了。': { en: 'The debris knocked you awake.', ja: 'かけらにぶつかって目が覚めた。' },
  '奶蛙给了你一个抱抱，多了一颗心。': { en: 'Naiwa gave you a hug. One more heart.', ja: 'ナイワがハグしてくれた。ハートが1つ増えた。' },
  '{n} 米': { en: '{n} m', ja: '{n}m' },
  '醒来': { en: 'Wake', ja: `${R('起', 'お')}きる` },
  '醒在奶蛙的床上': { en: 'Waking up in Naiwa’s bed', ja: 'ナイワのベッドで目が覚めた' },
  '你掉到了最深处，然后发现自己躺在奶蛙的床上。被子是暖的，奶蛙还在打呼。再睡一会儿也没关系。': { en: 'You fell all the way to the bottom and found yourself lying in Naiwa’s bed. The blanket is warm and Naiwa is still snoring. It’s fine to sleep a little more.', ja: '一番深いところまで落ちたら、ナイワのベッドで寝ていた。布団はあったかくて、ナイワはまだいびきをかいている。もう少し寝ても大丈夫。' },
  '回到黑洞': { en: 'Back to the hole', ja: 'ブラックホールへ戻る' },
};

export const LANGS = ['zh', 'en', 'ja'];
export let lang = 'zh';
export const tr = (zh, vars) => {
  let s = (lang !== 'zh' && I18N[zh] && I18N[zh][lang]) || zh;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
};
export const plain = html => html.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '');
export const trp = (zh, vars) => plain(tr(zh, vars));

export function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) return q;
  try { const s = localStorage.getItem('lang'); if (LANGS.includes(s)) return s; } catch (e) {}
  const first = ((navigator.languages || [navigator.language || 'zh'])[0] || 'zh').toLowerCase();
  return first.startsWith('zh') ? 'zh' : first.startsWith('ja') ? 'ja' : 'en';
}
export function setLang(l, save) {
  lang = LANGS.includes(l) ? l : 'zh';
  document.documentElement.lang = { zh: 'zh-CN', en: 'en', ja: 'ja' }[lang];
  if (save) { try { localStorage.setItem('lang', lang); } catch (e) {} }
}
