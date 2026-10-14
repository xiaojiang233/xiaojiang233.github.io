# 奶蛙宇宙宣传片

用 [Remotion](https://www.remotion.dev/) 做的 奶蛙.space 宣传片，1920×1080，30 fps，约 60 秒。

## BGM

BGM 是 Terror Jr 的《3 Strikes》，属于商业曲目，所以**没有放进仓库**（`public/bgm.mp3` 已在 `.gitignore` 里）。
渲染前把自己的那份 mp3 放到：

```
promo/public/bgm.mp3
```

视频用的是歌曲 1:47.8 – 2:47.5 这一段（`src/beat.ts` 里的 `SONG_START`）。
节拍是从音频里测出来的：约 80.5 BPM，一小节 2.981 秒，所有转场都落在小节线或拍点上，2:11.7 的副歌爆点对应四颗星球的第一个镜头。

## 画面素材

`public/footage/` 也不进仓库，用脚本从网站本身录：

```bash
cd ..            # 仓库根目录
python3 -m http.server 8765 &
cd promo
npm install
node capture/pages.mjs        # 主页、商店的整页截图
node capture/capture.mjs      # 发呆星 / 抱肚星云 / 午睡黑洞 的逐帧录像
```

`capture.mjs` 用 Playwright 的假时钟逐帧推进（每帧正好 1/30 秒），没有显卡也能录出流畅的画面，只是慢。
需要先装好 Playwright（`npm i -D playwright`），或者用环境变量 `PLAYWRIGHT` 指向已有的 Playwright。

## 预览和渲染

```bash
npm run studio     # 打开 Remotion Studio 预览
npm run render     # 输出 out/naiwa-promo.mp4
```

## 分镜

| 小节 | 时间 | 内容 |
| --- | --- | --- |
| 0–3 | 0:00–0:12 | 很久很久以前……第一颗星星亮了 → 奶蛙宇宙 标题 |
| 4–7 | 0:12–0:24 | 主页、四颗星球点名、停顿：“四颗星球，一种心情。” |
| 8–15 | 0:24–0:48 | 副歌：奶蛙商店、发呆星、抱肚星云、午睡黑洞，每颗两小节，跟拍点切 |
| 16–19 | 0:48–1:00 | 四宫格 → “宇宙很大。抱紧肚子，慢慢逛。” → 奶蛙.space |
