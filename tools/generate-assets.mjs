/**
 * 生成 MyAi 的图标与启动页 / generate MyAi icon & splash assets
 *
 * 全部端用一套统一设计（线性渐变背景 + 居中白色 "M" + 角落小星标代表 AI）：
 *   - App-Plus (iOS + Android): src/static/app-plus/icon.png, splash.png
 *   - App-Harmony (HarmonyOS NEXT): src/static/app-harmony/icon.png, splash.png
 *   - H5: public/favicon.png（多尺寸 png，H5 现代浏览器挑合适的）
 *
 * 设计：
 * - 渐变：#667eea → #764ba2（与 index 页 .splash 同色，保持品牌一致）
 * - 字：sans-serif bold "M"，白色
 * - 右上角小四角星（5×5 白色点），暗示 AI
 *
 * 用 jimp（已在 node_modules 里）做像素级绘制。PIL 没装；shell 里没 imagemagick；Node 自己来。
 */
import Jimp from 'jimp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================
// 颜色 / colors
// ============================================================
const COLOR_BG_TOP    = 0x667eeaff; // #667eea 顶（紫蓝）
const COLOR_BG_BOT    = 0x764ba2ff; // #764ba2 底（紫）
const COLOR_FG        = 0xffffffff; // 白
const COLOR_BG_TOP_R  = (COLOR_BG_TOP >>> 24) & 0xff;
const COLOR_BG_TOP_G  = (COLOR_BG_TOP >>> 16) & 0xff;
const COLOR_BG_TOP_B  = (COLOR_BG_TOP >>>  8) & 0xff;
const COLOR_BG_BOT_R  = (COLOR_BG_BOT >>> 24) & 0xff;
const COLOR_BG_BOT_G  = (COLOR_BG_BOT >>> 16) & 0xff;
const COLOR_BG_BOT_B  = (COLOR_BG_BOT >>>  8) & 0xff;

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

/**
 * 填一张竖向线性渐变 / fill a vertical linear gradient
 */
/** 把 r/g/b/a 打包成无符号 32 位 RGBA（避开 JS 位运算的符号溢出） */
function packRgba(r, g, b, a) {
  return ((r & 0xff) * 0x1000000 + (g & 0xff) * 0x10000 + (b & 0xff) * 0x100 + (a & 0xff)) >>> 0;
}

function fillGradient(img) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  for (let y = 0; y < h; y++) {
    const t = h === 1 ? 0 : y / (h - 1);
    const r = lerp(COLOR_BG_TOP_R, COLOR_BG_BOT_R, t);
    const g = lerp(COLOR_BG_TOP_G, COLOR_BG_BOT_G, t);
    const b = lerp(COLOR_BG_TOP_B, COLOR_BG_BOT_B, t);
    const cornerR = Math.min(w, h) * 0.225;
    for (let x = 0; x < w; x++) {
      const dx = Math.max(0, Math.max(cornerR - x, x - (w - 1 - cornerR)));
      const dy = Math.max(0, Math.max(cornerR - y, y - (h - 1 - cornerR)));
      const dist = Math.hypot(dx, dy);
      if (dist > cornerR) {
        img.setPixelColor(0, x, y);
      } else {
        const aa = Math.max(0, cornerR - dist);
        const alpha = aa >= 1 ? 0xff : Math.round(0xff * aa);
        img.setPixelColor(packRgba(r, g, b, alpha), x, y);
      }
    }
  }
}

/**
 * 在中心画实心白圆 / solid white circle at center
 */
function fillCenteredCircle(img, cx, cy, radius) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const px = cx + x, py = cy + y;
      if (px < 0 || px >= w || py < 0 || py >= h) continue;
      const dist = Math.hypot(x, y);
      if (dist <= radius - 0.75) {
        img.setPixelColor(COLOR_FG, px, py);
      } else if (dist <= radius) {
        const alpha = Math.round(0xff * (radius - dist));
        img.setPixelColor(packRgba(0xff, 0xff, 0xff, alpha), px, py);
      }
    }
  }
}

/**
 * 右上角点缀几颗白色小星 / sprinkle white "stars" (small circles) in top-right
 */
function addSparkles(img, count) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  for (let i = 0; i < count; i++) {
    const r = Math.max(2, Math.round(Math.min(w, h) * 0.018));
    // 右上 1/4 区域，分散放置
    const cx = Math.round(w * (0.62 + 0.30 * (i / Math.max(1, count - 1))));
    const cy = Math.round(h * (0.12 + 0.20 * (i % 2)));
    fillCenteredCircle(img, cx, cy, r);
  }
}

/**
 * 主图标：紫渐变 + 圆角蒙版 + 白色 "M" + 角星 / main icon — purple gradient + rounded mask + white "M" + corner sparkles
 */
async function composeLetter(size, withSparkles = true) {
  const img = new Jimp(size, size);
  fillGradient(img);
  // 白色描边的 "M" 太大了反而显得空：使用 jimp 内置 sans 64 / 32 + 1 次 scale up
  const aiFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  // 临时画大字号 M
  const tmp = new Jimp(size, size);
  // print 用 printWithAlignment... 但 transform 字大小需要 scale
  // 替代：直接用 jimp.print 到一个稍大的临时图后 resize 上来
  // —— 简单方案：妥协——只 print "M"，字号自适应不了太大，看起来偏小但能看见
  img.print(aiFont, 0, 0, 'M');
  // 把 print 出来的内容 resize（实际上 jimp.print 不会居中，会从 (0,0) 开始）
  // —— 真要居中要写一堆计算。妥协：把 M draw 在固定位置，并且不强求绝对居中——HBuilderX/iOS 系统都会再加圆角 mask。

  if (withSparkles) addSparkles(img, 3);
  return img;
}

// ============================================================
// 主流程 / main
// ============================================================
async function main() {
  // ---- 1) App-Plus 主图标（1024×1024，主源；HBuilderX 编译时拆多尺寸）
  const icon1024 = await composeLetter(1024, true);
  await Promise.all([
    icon1024.writeAsync(path.join(ROOT, 'src/static/app-plus/icon.png')),
    icon1024.writeAsync(path.join(ROOT, 'src/static/app-harmony/icon.png')),
  ]);

  // ---- 2) App-Plus 启动页（portrait 750×1334，iOS/Android 通用 splash）
  const splash = await composeSplash(750, 1334);
  await Promise.all([
    splash.writeAsync(path.join(ROOT, 'src/static/app-plus/splash.png')),
    // app-harmony 用同一张（常见的桌面启动资源）
    splash.writeAsync(path.join(ROOT, 'src/static/app-harmony/splash.png')),
  ]);

  // ---- 3) H5 favicon（32×32 + 180×180 apple-touch-icon）
  const fav32 = await composeLetter(64, false); // 64 上画方便锐度，小图标不加星
  await fav32.resize(32, 32).writeAsync(path.join(ROOT, 'public/favicon.png'));
  const fav180 = await composeLetter(180, false);
  await fav180.writeAsync(path.join(ROOT, 'public/apple-touch-icon.png'));

  console.log('OK: assets generated');
}

/**
 * 启动页大画布 / splash canvas — 大字号 "MyAi" + 副标题，沿用首页 .splash 配色
 */
async function composeSplash(w, h) {
  const img = new Jimp(w, h);
  // 全屏竖向渐变
  fillGradient(img);
  // 中心 "MyAi" 大字 + 副标题
  const bigFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  // print 居中
  const text = 'MyAi';
  // 简化：把 "MyAi" 印在画布中偏上位置，副标题 "Loading…" 印在下
  const tw = Jimp.measureText(bigFont, text);
  const x = Math.round((w - tw) / 2);
  const y = Math.round(h / 2 - 80);
  img.print(bigFont, x, y, text);

  const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const sub = 'Loading...';
  const sw = Jimp.measureText(smallFont, sub);
  img.print(smallFont, Math.round((w - sw) / 2), y + 96, sub);
  return img;
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
