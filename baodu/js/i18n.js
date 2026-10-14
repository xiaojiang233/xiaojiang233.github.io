// Strings keyed by the Chinese source text, same scheme as the homepage and Planet Daze.
// Japanese carries furigana in <ruby>; plain() strips it for attributes and the page title.
const R = (k, r) => `<ruby>${k}<rt>${r}</rt></ruby>`;

export const I18N = {
  '‹ 奶蛙宇宙': { en: '‹ Naiwa Universe', ja: `‹ ナイワ${R('宇宙', 'うちゅう')}` },
  '抱肚星云': { en: 'Belly-Hug Nebula', ja: `お${R('腹', 'なか')}ハグ${R('星雲', 'せいうん')}` },
  '抱肚星云 · 银河模拟器': { en: 'Belly-Hug Nebula · Galaxy Simulator', ja: `お腹ハグ星雲・${R('銀河', 'ぎんが')}シミュレーター`.replace(/<[^>]+>/g, '') },
  '抱肚星云是一台 3D 银河模拟器。生成星系、恒星和黑洞，也可以引爆超新星，把一切都抱进肚子里。': {
    en: 'The Belly-Hug Nebula is a 3D galaxy simulator. Create galaxies, stars and black holes, set off supernovae, and hug everything into the belly.',
    ja: 'お腹ハグ星雲は 3D 銀河シミュレーター。銀河や恒星、ブラックホールを作ったり、超新星を爆発させたり、全部お腹に抱え込んだり。' },
  '你的浏览器好像不支持 WebGL，抱肚星云暂时看不到。': { en: 'Your browser doesn’t seem to support WebGL, so the Belly-Hug Nebula can’t be shown.', ja: 'お使いのブラウザは WebGL に対応していないようです。' },

  // modes
  '观察': { en: 'Look', ja: `${R('観察', 'かんさつ')}` },
  '生成': { en: 'Create', ja: `${R('生成', 'せいせい')}` },
  '破坏': { en: 'Destroy', ja: `${R('破壊', 'はかい')}` },
  '暂停': { en: 'Pause', ja: `${R('一時停止', 'いちじていし')}` },
  '继续': { en: 'Play', ja: `${R('再開', 'さいかい')}` },
  '声音': { en: 'Sound', ja: 'サウンド' },
  '开': { en: 'on', ja: 'オン' },
  '关': { en: 'off', ja: 'オフ' },
  '设置': { en: 'Settings', ja: `${R('設定', 'せってい')}` },
  '收起': { en: 'Hide', ja: `${R('閉', 'と')}じる` },

  // panel
  '星系': { en: 'Galaxy', ja: `${R('銀河', 'ぎんが')}` },
  '放置': { en: 'Placing', ja: `${R('配置', 'はいち')}` },
  '规模': { en: 'Size', ja: 'サイズ' },
  '高度': { en: 'Height', ja: `${R('高', 'たか')}さ` },
  '自动入轨（新天体绕着最近的引力中心转）': { en: 'Auto-orbit (new objects circle the nearest gravity well)', ja: `${R('自動周回', 'じどうしゅうかい')}（${R('新', 'あたら')}しい${R('天体', 'てんたい')}は${R('近', 'ちか')}くの${R('重力源', 'じゅうりょくげん')}を${R('回', 'まわ')}る）` },
  '参考环': { en: 'Reference rings', ja: `${R('目安', 'めやす')}のリング` },
  '镜头缓慢自转': { en: 'Slowly orbit the camera', ja: `カメラをゆっくり${R('回転', 'かいてん')}` },
  '时间': { en: 'Time', ja: `${R('時間', 'じかん')}` },
  '速度': { en: 'Speed', ja: `${R('速度', 'そくど')}` },
  '宇宙': { en: 'Universe', ja: `${R('宇宙', 'うちゅう')}` },
  '重新生成': { en: 'Regenerate', ja: `${R('作', 'つく')}り${R('直', 'なお')}す` },
  '大坍缩': { en: 'Big Crunch', ja: `${R('大収縮', 'だいしゅうしゅく')}` },
  '清空宇宙': { en: 'Clear universe', ja: `${R('宇宙', 'うちゅう')}を${R('空', 'から')}にする` },
  '回到中心': { en: 'Recenter', ja: `${R('中心', 'ちゅうしん')}へ${R('戻', 'もど')}る` },
  '现状': { en: 'Status', ja: `${R('現状', 'げんじょう')}` },
  '星星': { en: 'Stars', ja: `${R('星', 'ほし')}` },
  '天体': { en: 'Bodies', ja: `${R('天体', 'てんたい')}` },
  '被吞噬': { en: 'Swallowed', ja: `${R('吸収', 'きゅうしゅう')}` },
  '被抱住': { en: 'Hugged', ja: 'ハグ' },
  '画质': { en: 'Quality', ja: `${R('画質', 'がしつ')}` },
  '低': { en: 'Low', ja: `${R('低', 'てい')}` },
  '中': { en: 'Mid', ja: `${R('中', 'ちゅう')}` },
  '高': { en: 'High', ja: `${R('高', 'こう')}` },
  '{t} 百万年': { en: '{t} Myr', ja: '{t} 百万年' },

  // presets
  '银河系': { en: 'Milky Way', ja: `${R('天', 'あま')}の${R('川', 'がわ')}${R('銀河', 'ぎんが')}` },
  '双旋臂星系': { en: 'Two-arm spiral', ja: `${R('二本腕', 'にほんうで')}の${R('渦巻銀河', 'うずまきぎんが')}` },
  '棒旋星系': { en: 'Barred spiral', ja: `${R('棒渦巻銀河', 'ぼううずまきぎんが')}` },
  '椭圆星系': { en: 'Elliptical', ja: `${R('楕円銀河', 'だえんぎんが')}` },
  '环状星系': { en: 'Ring galaxy', ja: `${R('環状銀河', 'かんじょうぎんが')}` },
  '星系碰撞': { en: 'Collision', ja: `${R('銀河衝突', 'ぎんがしょうとつ')}` },
  '大爆炸': { en: 'Big Bang', ja: 'ビッグバン' },
  '空白宇宙': { en: 'Empty space', ja: `${R('空', 'から')}っぽの${R('宇宙', 'うちゅう')}` },
  '碰撞': { en: 'Collision', ja: `${R('衝突', 'しょうとつ')}` },

  // tools
  '恒星': { en: 'Star', ja: `${R('恒星', 'こうせい')}` },
  '星团': { en: 'Cluster', ja: `${R('星団', 'せいだん')}` },
  '黑洞': { en: 'Black hole', ja: 'ブラックホール' },
  '星云': { en: 'Nebula', ja: `${R('星雲', 'せいうん')}` },
  '奶蛙': { en: 'Naiwa', ja: 'ナイワ' },
  '超新星': { en: 'Supernova', ja: `${R('超新星', 'ちょうしんせい')}` },
  '橡皮擦': { en: 'Eraser', ja: `${R('消', 'け')}しゴム` },
  '移除天体': { en: 'Remove', ja: `${R('天体', 'てんたい')}を${R('消', 'け')}す` },
  '引力抓取': { en: 'Gravity grab', ja: `${R('重力', 'じゅうりょく')}グラブ` },
  '星系核心': { en: 'Galaxy core', ja: `${R('銀河', 'ぎんが')}の${R('核', 'かく')}` },

  '放下一个小星系。按住拖动再松开，可以把它扔出去。': { en: 'Drop a small galaxy. Drag and release to throw it.', ja: `${R('小', 'ちい')}さな${R('銀河', 'ぎんが')}を${R('置', 'お')}く。ドラッグして${R('離', 'はな')}すと${R('投', 'な')}げられる。` },
  '放下一颗恒星，身边带着几颗小行星。': { en: 'Drop a star, with a few little planets around it.', ja: `${R('恒星', 'こうせい')}をひとつ${R('置', 'お')}く。まわりに${R('小', 'ちい')}さな${R('惑星', 'わくせい')}もついてくる。` },
  '放下一团密密的星团。': { en: 'Drop a tight cluster of stars.', ja: `${R('星', 'ほし')}がぎゅっと${R('集', 'あつ')}まった${R('星団', 'せいだん')}を${R('置', 'お')}く。` },
  '放下一个黑洞。离它太近的星星都会被吞掉。': { en: 'Drop a black hole. Any star that gets too close is swallowed.', ja: `ブラックホールを${R('置', 'お')}く。${R('近', 'ちか')}づきすぎた${R('星', 'ほし')}は${R('飲', 'の')}み${R('込', 'こ')}まれる。` },
  '放下一团星云，里面会慢慢长出新的蓝色星星。': { en: 'Drop a nebula. New blue stars slowly grow inside it.', ja: `${R('星雲', 'せいうん')}を${R('置', 'お')}く。ゆっくり${R('青', 'あお')}い${R('星', 'ほし')}が${R('生', 'う')}まれる。` },
  '放下一只奶蛙。它会把路过的星星都抱进肚子里。': { en: 'Drop a Naiwa. It hugs every passing star into its belly.', ja: `ナイワを${R('置', 'お')}く。${R('通', 'とお')}りかかった${R('星', 'ほし')}を、みんなお${R('腹', 'なか')}に${R('抱', 'かか')}え${R('込', 'こ')}む。` },
  '点一下引爆超新星，把周围的星星炸飞。点中恒星会让它消失。': { en: 'Tap to set off a supernova and blast nearby stars away. Hit a star to blow it up.', ja: `タップで${R('超新星', 'ちょうしんせい')}を${R('爆発', 'ばくはつ')}。まわりの${R('星', 'ほし')}を${R('吹', 'ふ')}き${R('飛', 'と')}ばす。` },
  '按住拖动，擦掉经过的星星。': { en: 'Hold and drag to rub out the stars you pass.', ja: `${R('押', 'お')}したままなぞって、${R('星', 'ほし')}を${R('消', 'け')}す。` },
  '点一个天体把它拿走。拿走星系核心后，星星会四散飞出。': { en: 'Tap a body to take it away. Remove a galaxy core and its stars fly apart.', ja: `${R('天体', 'てんたい')}をタップして${R('取', 'と')}り${R('除', 'のぞ')}く。${R('銀河', 'ぎんが')}の${R('核', 'かく')}を${R('消', 'け')}すと、${R('星', 'ほし')}が${R('散', 'ち')}らばる。` },
  '按住不放，用一个看不见的引力源把星星拽向光标。': { en: 'Hold to drag stars toward the cursor with an invisible gravity source.', ja: `${R('押', 'お')}し${R('続', 'つづ')}けると、${R('見', 'み')}えない${R('重力源', 'じゅうりょくげん')}で${R('星', 'ほし')}を${R('引', 'ひ')}き${R('寄', 'よ')}せる。` },
  '右键拖动转动镜头': { en: 'right-drag to rotate', ja: `${R('右', 'みぎ')}ドラッグでカメラ${R('回転', 'かいてん')}` },
  '双指转动镜头、缩放': { en: 'two fingers to rotate / zoom', ja: `${R('二本指', 'にほんゆび')}で${R('回転', 'かいてん')}・ズーム` },

  // toasts
  '拖动旋转，点「生成」放下新的星系、黑洞和奶蛙。': { en: 'Drag to rotate. Tap “Create” to drop new galaxies, black holes and Naiwa.', ja: `ドラッグで${R('回転', 'かいてん')}。「${R('生成', 'せいせい')}」で${R('新', 'あたら')}しい${R('銀河', 'ぎんが')}やブラックホール、ナイワを${R('置', 'お')}こう。` },
  '拖动旋转，滚轮缩放。点下面的「生成」放下新的星系、黑洞和奶蛙。': { en: 'Drag to rotate, scroll to zoom. Hit “Create” below to drop new galaxies, black holes and Naiwa.', ja: `ドラッグで${R('回転', 'かいてん')}、ホイールでズーム。「${R('生成', 'せいせい')}」で${R('新', 'あたら')}しい${R('銀河', 'ぎんが')}やブラックホール、ナイワを${R('置', 'お')}こう。` },
  '新星系诞生了。试试把它扔向另一个星系。': { en: 'A new galaxy is born. Try throwing it at another one.', ja: `${R('新', 'あたら')}しい${R('銀河', 'ぎんが')}が${R('生', 'う')}まれた。ほかの${R('銀河', 'ぎんが')}に${R('投', 'な')}げつけてみよう。` },
  '一颗新的恒星亮起来了。': { en: 'A new star lights up.', ja: `${R('新', 'あたら')}しい${R('恒星', 'こうせい')}が${R('灯', 'とも')}った。` },
  '星团：几百颗星星挤在一起取暖。': { en: 'A cluster: hundreds of stars huddled together for warmth.', ja: `${R('星団', 'せいだん')}：${R('何百', 'なんびゃく')}もの${R('星', 'ほし')}が${R('寄', 'よ')}り${R('添', 'そ')}って${R('暖', 'あたた')}まっている。` },
  '小心。黑洞什么都吃，包括它自己的邻居。': { en: 'Careful. Black holes eat everything, neighbours included.', ja: `${R('気', 'き')}をつけて。ブラックホールは${R('何', 'なん')}でも${R('食', 'た')}べる。${R('隣人', 'りんじん')}だって。` },
  '星云里会长出新的星星，等一会儿。': { en: 'New stars will grow inside the nebula. Give it a moment.', ja: `${R('星雲', 'せいうん')}の${R('中', 'なか')}に${R('新', 'あたら')}しい${R('星', 'ほし')}が${R('生', 'う')}まれる。ちょっと${R('待', 'ま')}って。` },
  '奶蛙：肚子是用来抱的。': { en: 'Naiwa: bellies are for hugging.', ja: `ナイワ：お${R('腹', 'なか')}は${R('抱', 'かか')}えるためにある。` },
  '宇宙已经装不下更多星星了。可以先清空一些。': { en: 'The universe can’t hold any more stars. Clear some out first.', ja: `${R('宇宙', 'うちゅう')}にはもう${R('星', 'ほし')}が${R('入', 'はい')}らない。まず${R('少', 'すこ')}し${R('消', 'け')}そう。` },
  '天体太多了，先拿走一些吧。': { en: 'Too many bodies. Remove a few first.', ja: `${R('天体', 'てんたい')}が${R('多', 'おお')}すぎる。まず${R('少', 'すこ')}し${R('取', 'と')}り${R('除', 'のぞ')}こう。` },
  '两个星系合并成了一个。': { en: 'Two galaxies merged into one.', ja: `ふたつの${R('銀河', 'ぎんが')}がひとつに${R('合体', 'がったい')}した。` },
  '星系的心被拿走了，星星四散飞去。': { en: 'The galaxy’s heart was taken away. The stars scatter.', ja: `${R('銀河', 'ぎんが')}の${R('心', 'こころ')}が${R('消', 'き')}えて、${R('星', 'ほし')}が${R('散', 'ち')}らばっていく。` },
  '点一个天体的光点，把它拿走。': { en: 'Tap the glow of a body to take it away.', ja: `${R('天体', 'てんたい')}の${R('光', 'ひかり')}をタップして${R('取', 'と')}り${R('除', 'のぞ')}く。` },
  '宇宙正在坍缩。再见了，所有的星星。': { en: 'The universe is collapsing. Goodbye, every star.', ja: `${R('宇宙', 'うちゅう')}が${R('収縮', 'しゅうしゅく')}していく。さよなら、すべての${R('星', 'ほし')}。` },
  '宇宙清空了。从第一颗星开始吧。': { en: 'The universe is empty. Start with the first star.', ja: `${R('宇宙', 'うちゅう')}は${R('空', 'から')}っぽ。ひとつめの${R('星', 'ほし')}から${R('始', 'はじ')}めよう。` },
  '抱肚星云：两条旋臂，正在抱着它的肚子。': { en: 'Belly-Hug Nebula: two arms, hugging its belly.', ja: `お${R('腹', 'なか')}ハグ${R('星雲', 'せいうん')}：${R('二', 'ふた')}つの${R('腕', 'うで')}で、お${R('腹', 'なか')}を${R('抱', 'かか')}えている。` },
  '两个星系正在互相靠近。': { en: 'Two galaxies are drifting toward each other.', ja: `ふたつの${R('銀河', 'ぎんが')}が${R('近', 'ちか')}づいていく。` },
  '正在跟随：{n}': { en: 'Following: {n}', ja: `${R('追跡中', 'ついせきちゅう')}：{n}` },

  // look-mode hints
  '拖动旋转，双指缩放，点一颗星星看看它的文明。': { en: 'Drag to rotate, pinch to zoom, tap a star to see its civilization.', ja: `ドラッグで${R('回転', 'かいてん')}、ピンチでズーム、${R('星', 'ほし')}をタップして${R('文明', 'ぶんめい')}をのぞく。` },
  '拖动旋转，滚轮缩放，点一颗星星看看它的文明，Shift 拖动平移。': { en: 'Drag to rotate, scroll to zoom, click a star to see its civilization, Shift-drag to pan.', ja: `ドラッグで${R('回転', 'かいてん')}、ホイールでズーム、${R('星', 'ほし')}をクリックして${R('文明', 'ぶんめい')}をのぞく、Shift ドラッグで${R('移動', 'いどう')}。` },

  // civilizations: panel and card
  '文明系统（关闭后是纯物理模拟）': { en: 'Civilizations (turn off for pure physics)', ja: `${R('文明', 'ぶんめい')}システム（オフにすると${R('純粋', 'じゅんすい')}な${R('物理', 'ぶつり')}シミュレーション）` },
  '文明': { en: 'Civs', ja: `${R('文明', 'ぶんめい')}` },
  '星际文明': { en: 'Star-faring', ja: `${R('星間', 'せいかん')}${R('文明', 'ぶんめい')}` },
  '文明毁灭': { en: 'Collapsed', ja: `${R('滅亡', 'めつぼう')}` },
  '战争': { en: 'Wars', ja: `${R('戦争', 'せんそう')}` },
  '人口': { en: 'Population', ja: `${R('人口', 'じんこう')}` },
  '送一个抱抱': { en: 'Send a hug', ja: 'ハグを送る' },
  '挑起战争': { en: 'Start a war', ja: `${R('戦争', 'せんそう')}をしかける` },
  '降下陨石': { en: 'Drop a meteor', ja: `${R('隕石', 'いんせき')}を${R('落', 'お')}とす` },
  '{n}族': { en: '{n} folk', ja: '{n}族' },
  '荒芜，等待新生命': { en: 'Barren. Waiting for new life', ja: `${R('荒', 'あ')}れ${R('地', 'ち')}。${R('新', 'あたら')}しい${R('命', 'いのち')}を${R('待', 'ま')}っている` },
  '第 {n} 纪元': { en: 'Era {n}', ja: `${R('第', 'だい')} {n} ${R('紀', 'き')}` },
  '正在与 {n} 交战': { en: 'At war with {n}', ja: '{n} と交戦中' },
  '正在与 {n} 通商': { en: 'Trading with {n}', ja: '{n} と交易中' },
  '一片寂静': { en: 'Silence', ja: `${R('静', 'しず')}まり${R('返', 'かえ')}っている` },
  '和平': { en: 'At peace', ja: `${R('平和', 'へいわ')}` },
  '石器时代': { en: 'Stone Age', ja: `${R('石器', 'せっき')}${R('時代', 'じだい')}` },
  '农耕时代': { en: 'Farming Age', ja: `${R('農耕', 'のうこう')}${R('時代', 'じだい')}` },
  '蒸汽时代': { en: 'Steam Age', ja: `${R('蒸気', 'じょうき')}${R('時代', 'じだい')}` },
  '电气时代': { en: 'Electric Age', ja: `${R('電気', 'でんき')}${R('時代', 'じだい')}` },
  '信息时代': { en: 'Information Age', ja: `${R('情報', 'じょうほう')}${R('時代', 'じだい')}` },
  '行星文明': { en: 'Planetary civilization', ja: `${R('惑星', 'わくせい')}${R('文明', 'ぶんめい')}` },
  '星际文明': { en: 'Star-faring', ja: `${R('星間', 'せいかん')}${R('文明', 'ぶんめい')}` },
  '升维文明': { en: 'Ascended', ja: `${R('高次元', 'こうじげん')}${R('文明', 'ぶんめい')}` },
  '蛙人': { en: 'Frogfolk', ja: 'カエル人' },
  '鱼人': { en: 'Fishfolk', ja: `${R('魚人', 'ぎょじん')}` },
  '云团': { en: 'Cloudlings', ja: `${R('雲', 'くも')}の${R('民', 'たみ')}` },
  '晶体': { en: 'Crystalline', ja: `${R('結晶', 'けっしょう')}${R('生命', 'せいめい')}` },
  '机械': { en: 'Mechanical', ja: `${R('機械', 'きかい')}${R('生命', 'せいめい')}` },
  '藤蔓': { en: 'Vinefolk', ja: `つる${R('草', 'ぐさ')}の${R('民', 'たみ')}` },
  '光': { en: 'Beings of light', ja: `${R('光', 'ひかり')}の${R('民', 'たみ')}` },
  '石头人': { en: 'Rockfolk', ja: `${R('岩', 'いわ')}の${R('民', 'たみ')}` },
  '爱发呆': { en: 'dreamy', ja: 'ぼんやり好き' },
  '好客': { en: 'welcoming', ja: `${R('客', 'きゃく')}${R('好', 'ず')}き` },
  '爱睡觉': { en: 'sleepy', ja: `${R('寝', 'ね')}ぼすけ` },
  '好奇': { en: 'curious', ja: `${R('好奇心', 'こうきしん')}いっぱい` },
  '害羞': { en: 'shy', ja: `${R('恥', 'は')}ずかしがり` },
  '爱热闹': { en: 'festive', ja: `にぎやか${R('好', 'ず')}き` },
  '爱收集': { en: 'collectors', ja: `${R('集', 'あつ')}めるのが${R('好', 'す')}き` },
  '爱抱肚子': { en: 'belly-huggers', ja: `お${R('腹', 'なか')}を${R('抱', 'かか')}えがち` },
  '佛系': { en: 'laid-back', ja: 'のんびり' },
  '普通': { en: 'average', ja: `${R('普通', 'ふつう')}` },
  '好战': { en: 'bellicose', ja: `${R('好戦的', 'こうせんてき')}` },
  '节日是每年一次的集体抱肚子。': { en: 'Their big holiday is an annual group belly hug.', ja: `${R('年', 'とし')}に${R('一度', 'いちど')}、みんなでお${R('腹', 'なか')}を${R('抱', 'かか')}える${R('祭', 'まつ')}りがある。` },
  '把发呆列为国家级运动。': { en: 'Zoning out is an official national sport.', ja: `ぼーっとすることが${R('国技', 'こくぎ')}になっている。` },
  '货币单位是一次拥抱。': { en: 'Their currency is one hug.', ja: `${R('通貨', 'つうか')}の${R('単位', 'たんい')}は「ハグ１${R('回', 'かい')}」。` },
  '至今没人解释得清，一天为什么有 25 个小时。': { en: 'Nobody can explain why a day has 25 hours.', ja: `なぜ１${R('日', 'にち')}が 25 ${R('時間', 'じかん')}なのか、${R('誰', 'だれ')}にも${R('説明', 'せつめい')}できない。` },
  '最高的建筑是一张沙发。': { en: 'Their tallest building is a sofa.', ja: `いちばん${R('高', 'たか')}い${R('建物', 'たてもの')}はソファ。` },
  '国歌只有一个音，要唱很久。': { en: 'Their anthem is a single note, held for a very long time.', ja: `${R('国歌', 'こっか')}は１${R('音', 'おん')}だけ。とても${R('長', 'なが')}く${R('歌', 'うた')}う。` },
  '相信宇宙起源于一次抱肚子。': { en: 'They believe the universe began with a belly hug.', ja: `${R('宇宙', 'うちゅう')}はひとつのお${R('腹', 'なか')}ハグから${R('始', 'はじ')}まったと${R('信', 'しん')}じている。` },
  '每年有一天全星球午睡。': { en: 'One day a year, the whole planet naps.', ja: `${R('年', 'とし')}に１${R('日', 'にち')}、${R('星', 'ほし')}じゅうがお${R('昼寝', 'ひるね')}をする。` },
  '最大的争论：奶蛙到底是不是青蛙。': { en: 'Their biggest debate: is Naiwa a frog or not?', ja: `${R('最大', 'さいだい')}の${R('論争', 'ろんそう')}：ナイワはカエルなのか。` },
  '天文台主要用来看云。': { en: 'The observatory is mostly used for watching clouds.', ja: `${R('天文台', 'てんもんだい')}は${R('主', 'おも')}に${R('雲', 'くも')}を${R('見', 'み')}るためにある。` },
  '对黑洞很好奇，但保持着礼貌的距离。': { en: 'Curious about black holes, from a polite distance.', ja: `ブラックホールが${R('気', 'き')}になるけれど、${R('礼儀', 'れいぎ')}ある${R('距離', 'きょり')}を${R('保', 'たも')}つ。` },
  '图书馆里只有一本书，名叫《肚子》。': { en: 'The library holds one book, titled “Belly”.', ja: `${R('図書館', 'としょかん')}にある${R('本', 'ほん')}は１${R('冊', 'さつ')}だけ。『お${R('腹', 'なか')}』という。` },

  // civilizations: toasts and news
  '这颗星星熄灭了。': { en: 'This star has gone out.', ja: `この${R('星', 'ほし')}は${R('消', 'き')}えてしまった。` },
  '每一颗星星上都有自己的文明。看看它们过得怎么样。': { en: 'Every star has a civilization of its own. See how they’re doing.', ja: `どの${R('星', 'ほし')}にも${R('自分', 'じぶん')}たちの${R('文明', 'ぶんめい')}がある。どうしているか、のぞいてみよう。` },
  '文明系统开启了。每颗星星上都有人在生活。': { en: 'Civilizations are on. Every star has someone living on it.', ja: `${R('文明', 'ぶんめい')}システムをオンにした。どの${R('星', 'ほし')}にも${R('誰', 'だれ')}かが${R('暮', 'く')}らしている。` },
  '文明系统关闭了，现在是纯物理模拟。': { en: 'Civilizations are off. Pure physics from here on.', ja: `${R('文明', 'ぶんめい')}システムをオフにした。ここからは${R('純粋', 'じゅんすい')}な${R('物理', 'ぶつり')}シミュレーション。` },
  '{n}收到了抱抱，进步了一点。': { en: 'The {n} received a hug and made some progress.', ja: '{n}はハグをもらって、少し進歩した。' },
  '附近没有能开战的邻居，或者它已经在打仗了。': { en: 'No neighbour in range to fight, or it is already at war.', ja: `${R('近', 'ちか')}くに${R('戦', 'たたか')}える${R('隣人', 'りんじん')}がいない、またはもう${R('戦争中', 'せんそうちゅう')}。` },
  '{n}的恒星熄灭了。': { en: 'The sun of the {n} went out.', ja: '{n}の恒星が消えた。' },
  '一颗陨石砸中了{n}的家园。': { en: 'A meteor struck the home of the {n}.', ja: '{n}の故郷に隕石が落ちた。' },
  '{a}向{b}宣战了！': { en: 'The {a} declared war on the {b}!', ja: '{a}が{b}に宣戦布告した！' },
  '{a}与{b}开始通商。': { en: 'The {a} and the {b} began to trade.', ja: '{a}と{b}が交易を始めた。' },
  '{a}与{b}的贸易让双方都学到了新东西。': { en: 'Trade taught both the {a} and the {b} something new.', ja: '{a}と{b}は交易でお互いに新しいことを学んだ。' },
  '{a}击碎了{b}的恒星。一团光吞没了附近的世界。': { en: 'The {a} shattered the sun of the {b}. A blaze of light swallowed the worlds nearby.', ja: '{a}が{b}の恒星を砕いた。光が近くの世界をのみ込んだ。' },
  '{a}击败了{b}，{b}的文明陷入废墟。': { en: 'The {a} defeated the {b}. Their civilization lies in ruins.', ja: '{a}が{b}を破った。{b}の文明は廃墟になった。' },
  '{b}击退了{a}的进攻，{a}的文明陷入废墟。': { en: 'The {b} repelled the {a}, whose civilization now lies in ruins.', ja: '{b}が{a}の攻撃をはね返し、{a}の文明は廃墟になった。' },
  '{a}与{b}同归于尽，两颗星球一片荒芜。': { en: 'The {a} and the {b} destroyed each other. Both worlds are barren.', ja: '{a}と{b}は相討ちになり、二つの星は荒れ地になった。' },
  '{a}与{b}签订了停战协议。': { en: 'The {a} and the {b} signed a truce.', ja: '{a}と{b}は停戦協定を結んだ。' },
  '{n}进入了{t}。': { en: 'The {n} entered the {t}.', ja: '{n}は「{t}」に入った。' },
  '{n}的文明毁灭了。': { en: 'The civilization of the {n} has collapsed.', ja: '{n}の文明が滅びた。' },
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
