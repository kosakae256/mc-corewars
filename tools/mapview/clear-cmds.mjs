/**
 * 置いた構造物を消すための /fill コマンドを作る。
 *
 * **1コマンドあたり 32768 ブロックまで**という上限があるので、
 * 高さで分割する。手で計算すると必ず間違える。
 *
 * 使い方: node clear-cmds.mjs <x> <y> <z> <幅> <高さ> <奥行>
 */
const LIMIT = 32768;

const [x0, y0, z0, sx, sy, sz] = process.argv.slice(2).map(Number);
if ([x0, y0, z0, sx, sy, sz].some(Number.isNaN)) {
  console.error("使い方: node clear-cmds.mjs <x> <y> <z> <幅> <高さ> <奥行>");
  process.exit(1);
}

const perLayer = sx * sz;
const maxLayers = Math.max(1, Math.floor(LIMIT / perLayer));

console.log(`範囲: (${x0}, ${y0}, ${z0}) から ${sx} x ${sy} x ${sz}  = ${sx * sy * sz} ブロック`);
console.log(`1層 ${perLayer} ブロック → 1コマンドあたり最大 ${maxLayers} 層\n`);

for (let y = 0; y < sy; y += maxLayers) {
  const h = Math.min(maxLayers, sy - y);
  console.log(
    `/fill ${x0} ${y0 + y} ${z0} ${x0 + sx - 1} ${y0 + y + h - 1} ${z0 + sz - 1} air`
  );
}
