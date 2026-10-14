// Strings keyed by the Chinese source text, same scheme as the homepage.
// Japanese carries furigana in <ruby>; plain() strips it for in-world signs.
const R = (k, r) => `<ruby>${k}<rt>${r}</rt></ruby>`;

export const I18N = {
  '发呆星': { en: 'Planet Daze', ja: `ぼーっと${R('星', 'ぼし')}` },
  '海边公路': { en: 'Coast Road', ja: `${R('海辺', 'うみべ')}の${R('道', 'みち')}` },
  '骑上自行车，沿着海边慢慢骑。路上有星星可以捡，也有居民在发呆。': {
    en: 'Hop on the bike and take the coast road slowly. There are stars to pick up and residents zoning out along the way.',
    ja: `${R('自転車', 'じてんしゃ')}に${R('乗', 'の')}って、${R('海辺', 'うみべ')}をゆっくり${R('走', 'はし')}ろう。${R('道', 'みち')}には${R('星', 'ほし')}が${R('落', 'お')}ちていて、ぼーっとしている${R('住人', 'じゅうにん')}もいる。` },
  '开始骑行': { en: 'Start riding', ja: 'こぎだす' },
  '‹ 奶蛙宇宙': { en: '‹ Naiwa Universe', ja: `‹ ナイワ${R('宇宙', 'うちゅう')}` },
  '正在把海铺好…': { en: 'Laying out the sea…', ja: `${R('海', 'うみ')}を${R('敷', 'し')}いています…` },
  '用力蹬': { en: 'Pedal harder', ja: `${R('強', 'つよ')}くこぐ` },
  '刹车': { en: 'Brake', ja: 'ブレーキ' },
  '转向': { en: 'Steer', ja: 'ハンドル' },
  '切换视角': { en: 'Switch view', ja: `${R('視点', 'してん')}${R('切替', 'きりかえ')}` },
  '发呆': { en: 'Zone out', ja: 'ぼーっとする' },
  '按铃': { en: 'Ring the bell', ja: `ベルを${R('鳴', 'な')}らす` },
  '换个时间': { en: 'Change the time', ja: `${R('時間', 'じかん')}を${R('変', 'か')}える` },
  '声音': { en: 'Sound', ja: 'サウンド' },
  '拖动画面可以四处看': { en: 'Drag to look around', ja: `ドラッグで${R('見回', 'みまわ')}せる` },
  '不按也会自己慢慢骑': { en: 'It keeps rolling gently on its own', ja: `${R('何', 'なに')}もしなくてもゆっくり${R('進', 'すす')}む` },
  '第一人称': { en: 'First person', ja: `${R('一人称', 'いちにんしょう')}` },
  '第三人称': { en: 'Third person', ja: `${R('三人称', 'さんにんしょう')}` },
  '已骑': { en: 'Ridden', ja: `${R('走行', 'そうこう')}` },
  '喜欢': { en: 'Love', ja: `${R('好', 'す')}き` },
  '圈': { en: 'Lap', ja: `${R('周', 'しゅう')}` },
  '发呆星时间': { en: 'Planet Daze time', ja: `ぼーっと${R('星', 'ぼし')}${R('時間', 'じかん')}` },
  '第 25 小时 · 发呆专用': { en: 'Hour 25 · reserved for zoning out', ja: `25 ${R('時間目', 'じかんめ')}・ぼーっと${R('専用', 'せんよう')}` },
  '清晨': { en: 'Dawn', ja: `${R('夜明', 'よあ')}け` },
  '正午': { en: 'Noon', ja: `${R('正午', 'しょうご')}` },
  '黄昏': { en: 'Dusk', ja: `${R('夕暮', 'ゆうぐ')}れ` },
  '夜晚': { en: 'Night', ja: `${R('夜', 'よる')}` },
  '发呆中': { en: 'Zoning out', ja: 'ぼーっと中' },
  '按任意键回过神来': { en: 'Press any key to snap out of it', ja: `${R('何', 'なに')}かキーを${R('押', 'お')}すと${R('我', 'われ')}に${R('返', 'かえ')}る` },
  '点一下回过神来': { en: 'Tap to snap out of it', ja: `タップで${R('我', 'われ')}に${R('返', 'かえ')}る` },
  '你发呆了 {a}。发呆星上过去了 {b}。': { en: 'You zoned out for {a}. {b} passed on Planet Daze.', ja: `{a} ぼーっとした。ぼーっと${R('星', 'ぼし')}では {b} ${R('過', 'す')}ぎた。` },
  '{m} 分 {s} 秒': { en: '{m}m {s}s', ja: '{m}分{s}秒' },
  '{h} 小时 {m} 分钟': { en: '{h}h {m}min', ja: '{h}時間{m}分' },
  '+1 喜欢': { en: '+1 love', ja: `+1 ${R('好', 'す')}き` },
  '收集了 {n} 份喜欢。夜空里多了 {n} 颗星星。': { en: '{n} loves collected. {n} new stars in the night sky.', ja: `${R('好', 'す')}きを {n} ${R('個', 'こ')}${R('集', 'あつ')}めた。${R('夜空', 'よぞら')}に${R('星', 'ほし')}が {n} ${R('個', 'こ')}${R('増', 'ふ')}えた。` },
  '第 {n} 圈。海还是那片海。': { en: 'Lap {n}. The sea is still the sea.', ja: `{n} ${R('周目', 'しゅうめ')}。${R('海', 'うみ')}は${R('相変', 'あいか')}わらず${R('海', 'うみ')}。` },
  '先停下来，才能好好发呆。': { en: 'Slowing down first. You can’t zone out properly while riding.', ja: `まず${R('止', 'と')}まろう。こぎながらではちゃんとぼーっとできない。` },
  '叮铃铃': { en: 'Ring-ring', ja: 'チリンチリン' },
  '画质': { en: 'Quality', ja: `${R('画質', 'がしつ')}` },
  '高': { en: 'High', ja: `${R('高', 'こう')}` },
  '低': { en: 'Low', ja: `${R('低', 'てい')}` },

  // landmarks
  '发呆星海边公路': { en: 'Planet Daze Coast Road', ja: `ぼーっと${R('星', 'ぼし')} ${R('海辺', 'うみべ')}の${R('道', 'みち')}` },
  '一圈 {km} 公里。限速：慢慢来。': { en: '{km} km per lap. Speed limit: slowly.', ja: `1${R('周', 'しゅう')} {km} km。${R('制限速度', 'せいげんそくど')}：ゆっくり。` },
  '抱肚沙滩': { en: 'Belly-Hug Beach', ja: `お${R('腹', 'なか')}ハグ・ビーチ` },
  '沙子是温的。樱花粉在这里负责晒太阳。': { en: 'The sand is warm. Sakura Pink is in charge of sunbathing here.', ja: `${R('砂', 'すな')}はあったかい。サクラピンクはここで${R('日光浴', 'にっこうよく')}${R('担当', 'たんとう')}。` },
  '钓鱼栈桥': { en: 'Fishing Pier', ja: `${R('釣', 'つ')}り${R('桟橋', 'さんばし')}` },
  '天空蓝每天都来钓鱼。一条也没钓到过，也不打算钓到。': { en: 'Sky Blue fishes here every day. Has never caught a thing, and doesn’t plan to.', ja: `スカイブルーは${R('毎日', 'まいにち')}ここで${R('釣', 'つ')}りをする。${R('一匹', 'いっぴき')}も${R('釣', 'つ')}れたことはないし、${R('釣', 'つ')}るつもりもない。` },
  '风车山坡': { en: 'Windmill Hill', ja: `${R('風車', 'ふうしゃ')}の${R('丘', 'おか')}` },
  '风车转得很慢，因为风也在发呆。': { en: 'The windmills turn slowly, because the wind is zoning out too.', ja: `${R('風車', 'ふうしゃ')}はゆっくり${R('回', 'まわ')}る。${R('風', 'かぜ')}もぼーっとしているから。` },
  '发呆星灯塔': { en: 'Planet Daze Lighthouse', ja: `ぼーっと${R('星', 'ぼし')}の${R('灯台', 'とうだい')}` },
  '天黑以后它会亮起来，提醒大家该发呆了。': { en: 'After dark it lights up to remind everyone it’s time to zone out.', ja: `${R('暗', 'くら')}くなると${R('灯', 'ひ')}がともって、ぼーっとする${R('時間', 'じかん')}を${R('知', 'し')}らせる。` },
  '发呆观景台': { en: 'Daze Lookout', ja: `ぼーっと${R('展望台', 'てんぼうだい')}` },
  '推荐发呆时长：随便。': { en: 'Recommended zone-out time: whatever.', ja: `おすすめのぼーっと${R('時間', 'じかん')}：ご${R('自由', 'じゆう')}に。` },
  '礁石海岸': { en: 'Rocky Shore', ja: `${R('岩', 'いわ')}の${R('海岸', 'かいがん')}` },
  '运气好的话，能看到鲸鱼。': { en: 'With a bit of luck, you’ll see a whale.', ja: `${R('運', 'うん')}がよければクジラが${R('見', 'み')}られる。` },
  '小花田': { en: 'Little Flower Field', ja: `${R('小', 'ちい')}さな${R('花畑', 'はなばたけ')}` },
  '花是奶蛙种的。种完它就忘了。': { en: 'Naiwa planted these flowers, then forgot about them.', ja: `${R('花', 'はな')}はナイワが${R('植', 'う')}えた。${R('植', 'う')}えたことは${R('忘', 'わす')}れた。` },
  '奶蛙大爆炸纪念碑': { en: 'Big Naiwa Bang Memorial', ja: `ナイワ・ビッグバン${R('記念碑', 'きねんひ')}` },
  '纪念宇宙第 0 秒的那一次抱肚子。': { en: 'In memory of the belly hug at second 0 of the universe.', ja: `${R('宇宙', 'うちゅう')} 0 ${R('秒目', 'びょうめ')}のお${R('腹', 'なか')}ハグを${R('記念', 'きねん')}して。` },
  '椰子林': { en: 'Coconut Grove', ja: `ヤシの${R('林', 'はやし')}` },
  '椰子不会掉下来，它们也在发呆。': { en: 'The coconuts never fall. They’re zoning out too.', ja: `ヤシの${R('実', 'み')}は${R('落', 'お')}ちてこない。${R('実', 'み')}もぼーっとしている。` },
  '发呆站': { en: 'Daze Stop', ja: `ぼーっと${R('停留所', 'ていりゅうじょ')}` },
  '末班车 25:00。': { en: 'Last bus at 25:00.', ja: `${R('終', 'しゅう')}バス 25:00。` },

  // signs (no furigana needed, these are drawn into textures)
  '限速：慢慢来': { en: 'SPEED LIMIT: SLOWLY', ja: '制限速度：ゆっくり' },
  '注意：奶蛙出没': { en: 'CAUTION: NAIWA CROSSING', ja: 'ナイワ とびだし注意' },
  '前方：发呆区': { en: 'AHEAD: DAZE ZONE', ja: 'この先 ぼーっとゾーン' },
  '请抱紧肚子': { en: 'PLEASE HUG YOUR BELLY', ja: 'お腹をしっかり抱えてね' },
  '本路段禁止着急': { en: 'NO HURRYING ON THIS STRETCH', ja: 'この区間 急ぐの禁止' },
  '距离午睡黑洞 3.8 光年': { en: 'NAP BLACK HOLE  3.8 LY', ja: 'お昼寝ブラックホールまで 3.8 光年' },
  '抱肚星云 · 抬头可见': { en: 'BELLY-HUG NEBULA · LOOK UP', ja: 'お腹ハグ星雲・見上げてね' },
  '奶蛙商店': { en: 'Naiwa Store', ja: 'ナイワストア' },
  '发呆星分店': { en: 'Planet Daze branch', ja: 'ぼーっと星店' },
  '今日营业：发呆': { en: 'TODAY: ZONING OUT', ja: '本日の営業：ぼーっと' },
  '欢迎来到发呆星': { en: 'WELCOME TO PLANET DAZE', ja: 'ようこそ ぼーっと星へ' },
  '末班车 25:00': { en: 'LAST BUS 25:00', ja: '終バス 25:00' },
  '推荐发呆时长：随便': { en: 'RECOMMENDED: AS LONG AS YOU LIKE', ja: 'おすすめ：ご自由に' },
  '第 0 秒': { en: 'SECOND 0', ja: '0 秒目' },

  // residents
  '樱花粉害羞地看向了别处。': { en: 'Sakura Pink shyly looks away.', ja: `サクラピンクは${R('恥', 'は')}ずかしそうに${R('目', 'め')}をそらした。` },
  '樱花粉被铃声吓了一跳，然后继续晒太阳。': { en: 'The bell startles Sakura Pink, who goes right back to sunbathing.', ja: `ベルにびっくりしたサクラピンクは、また${R('日光浴', 'にっこうよく')}にもどった。` },
  '天空蓝正在发呆，暂时没有回应。': { en: 'Sky Blue is zoning out and can’t respond right now.', ja: `スカイブルーはぼーっとしていて、${R('返事', 'へんじ')}がない。` },
  '鱼漂动了一下。天空蓝没有注意到。': { en: 'The float bobbed. Sky Blue didn’t notice.', ja: `ウキが${R('動', 'うご')}いた。スカイブルーは${R('気', 'き')}づいていない。` },
  '抹茶绿把肚子抱得更紧了一点。': { en: 'Matcha Green hugs its belly a little tighter.', ja: `${R('抹茶', 'まっちゃ')}グリーンはお${R('腹', 'なか')}を${R('少', 'すこ')}しだけ${R('強', 'つよ')}く${R('抱', 'かか')}えた。` },
  '抹茶绿向你挥了挥（抱着肚子的）手。': { en: 'Matcha Green waves at you (with a belly-hugging hand).', ja: `${R('抹茶', 'まっちゃ')}グリーンが（お${R('腹', 'なか')}を${R('抱', 'かか')}えたまま）${R('手', 'て')}を${R('振', 'ふ')}った。` },
  '看守员：今天的海，很海。': { en: 'Keeper: The sea is very sea-like today.', ja: `${R('灯台守', 'とうだいもり')}：${R('今日', 'きょう')}の${R('海', 'うみ')}は、とても${R('海', 'うみ')}だ。` },
  '看守员也按了一下灯塔的铃。叮——': { en: 'The keeper rings the lighthouse bell back. Ding—', ja: `${R('灯台守', 'とうだいもり')}も${R('灯台', 'とうだい')}の${R('鐘', 'かね')}を${R('鳴', 'な')}らした。カーン——` },
  '店员：今天只卖发呆，不要钱。': { en: 'Clerk: Today we only sell zoning out. It’s free.', ja: `${R('店員', 'てんいん')}：${R('本日', 'ほんじつ')}はぼーっとだけ${R('販売中', 'はんばいちゅう')}。${R('無料', 'むりょう')}です。` },
  '店员：叮铃是本店的会员暗号。': { en: 'Clerk: Ring-ring is our members’ password.', ja: `${R('店員', 'てんいん')}：チリンチリンは${R('会員', 'かいいん')}の${R('合言葉', 'あいことば')}です。` },
  '在等 25 点的那班车。': { en: 'Waiting for the 25 o’clock bus.', ja: `25 ${R('時', 'じ')}のバスを${R('待', 'ま')}っている。` },
  '车还没来。不着急。': { en: 'The bus isn’t here yet. No rush.', ja: `バスはまだ${R('来', 'こ')}ない。${R('急', 'いそ')}がない。` },

  '远处有一头鲸鱼跳了起来。': { en: 'A whale just leapt out of the sea in the distance.', ja: `${R('遠', 'とお')}くでクジラがはねた。` },
  '路上的星星是「喜欢」，捡起来会飞到夜空里。': { en: 'The stars on the road are “love”. Pick them up and they fly into the night sky.', ja: `${R('道', 'みち')}の${R('星', 'ほし')}は「${R('好', 'す')}き」。${R('拾', 'ひろ')}うと${R('夜空', 'よぞら')}へ${R('飛', 'と')}んでいく。` },
  '靠近居民时按铃，看看他们会怎样。': { en: 'Ring the bell near a resident and see what happens.', ja: `${R('住人', 'じゅうにん')}の${R('近', 'ちか')}くでベルを${R('鳴', 'な')}らしてみよう。` },
  '停下来按发呆，时间会过得飞快。': { en: 'Stop and zone out, and time flies.', ja: `${R('止', 'と')}まってぼーっとすると、${R('時間', 'じかん')}があっという${R('間', 'ま')}に${R('過', 'す')}ぎる。` },
  '视角': { en: 'View', ja: `${R('視点', 'してん')}` },
  '时间': { en: 'Time', ja: `${R('時間', 'じかん')}` },
  '开': { en: 'on', ja: 'オン' },
  '关': { en: 'off', ja: 'オフ' },
  '发呆星 · 海边骑行': { en: 'Planet Daze · Seaside Ride', ja: 'ぼーっと星・海辺サイクリング' },
  '奶蛙骑着自行车，沿着发呆星的海边公路慢慢骑。': { en: 'Naiwa rides a bicycle slowly along the coast road of Planet Daze.', ja: 'ナイワが自転車で、ぼーっと星の海辺の道をゆっくり走る。' },
  '你的浏览器好像不支持 WebGL，发呆星暂时看不到。': { en: 'Your browser doesn’t seem to support WebGL, so Planet Daze can’t be shown.', ja: `お${R('使', 'つか')}いのブラウザは WebGL に${R('対応', 'たいおう')}していないようです。` },
  // thoughts while zoning out
  '……': { en: '…', ja: '……' },
  '海好大。': { en: 'The sea is big.', ja: `${R('海', 'うみ')}、${R('大', 'おお')}きい。` },
  '今天也什么都没想。': { en: 'Thought about nothing again today.', ja: `${R('今日', 'きょう')}もなにも${R('考', 'かんが')}えなかった。` },
  '肚子软软的。': { en: 'Belly: soft.', ja: `お${R('腹', 'なか')}、やわらかい。` },
  '那朵云有点像奶蛙。': { en: 'That cloud looks a bit like a Naiwa.', ja: `あの${R('雲', 'くも')}、ちょっとナイワに${R('似', 'に')}てる。` },
  '风是咸的。': { en: 'The wind tastes salty.', ja: `${R('風', 'かぜ')}がしょっぱい。` },
  '要是一天有 26 个小时就好了。': { en: 'If only a day had 26 hours.', ja: `1${R('日', 'にち')}が 26 ${R('時間', 'じかん')}だったらいいのに。` },
  '海浪在数数：一、二、一、二……': { en: 'The waves are counting: one, two, one, two…', ja: `${R('波', 'なみ')}が${R('数', 'かぞ')}えてる：いち、に、いち、に……` },
  '刚才想到什么来着。算了。': { en: 'Was thinking of something just now. Never mind.', ja: `さっき${R('何', 'なに')}か${R('思', 'おも')}いついた${R('気', 'き')}がする。まあいいか。` },
  '（正在发呆，请勿打扰）': { en: '(Zoning out. Do not disturb.)', ja: `（ぼーっと${R('中', 'ちゅう')}。おかまいなく）` },
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
