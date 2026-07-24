// おみくじ装置パターンの一覧プレビューHTML生成(#200)。
//
// 全パターンを並べて自動再生する自己完結型のHTMLを書き出す。
// パターン追加・調整時の目視確認に使う(掃引テストと併用すること)。
//
// 使い方(web/ ディレクトリで実行):
//   node scripts/preview-omikuji.js            # /tmp/omikuji-preview.html に出力
//   node scripts/preview-omikuji.js out.html   # 出力先を指定
// 出力されたHTMLをブラウザで開くと、全パターンが2秒後に玉を放って動き出す。
// 各セルの「もう一回」ボタン、または18秒ごとの自動リプレイで繰り返し見られる。

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const webRoot = path.join(__dirname, "..");

// ブラウザ用に CommonJS モジュール群を素朴にバンドルする
// (webpackを通さずに単体HTMLで動かすための最小シム)
const MODULE_FILES = [
  "components/omikujiPatterns/frame.js",
  "components/omikujiPatterns/pattern01Karakuri.js",
  "components/omikujiPatterns/pattern02Zigzag.js",
  "components/omikujiPatterns/pattern03Billiard.js",
  "components/omikujiPatterns/index.js",
  "components/omikujiMachine.js",
];

function bundleModules() {
  let out = 'window.__mods = {};\nfunction __req(p){ return window.__mods[p.split("/").pop()]; }\n';
  for (const rel of MODULE_FILES) {
    const src = fs.readFileSync(path.join(webRoot, rel), "utf8");
    const name = path.basename(rel);
    out +=
      "(function(){ const module = { exports: {} }; const require = __req;\n" +
      src +
      "\nwindow.__mods[" + JSON.stringify(name) + "] = module.exports; })();\n";
  }
  out += 'window.omikujiMachine = window.__mods["omikujiMachine.js"];\n';
  return out;
}

function main() {
  const outPath = process.argv[2] || "/tmp/omikuji-preview.html";
  const matterSrc = fs.readFileSync(path.join(webRoot, "assets/js/matter.js"), "utf8");
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>おみくじ装置パターン一覧</title>
<style>
  body { margin: 0; padding: 16px; background: #221d1d; color: #fff; font-family: sans-serif; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .grid { display: flex; flex-wrap: wrap; gap: 16px; }
  .cell { background: radial-gradient(circle at 50% 30%, #5a5050, #221d1d 72%); border-radius: 8px; padding: 8px; }
  .cell h2 { font-size: 14px; margin: 0 0 6px; display: flex; justify-content: space-between; align-items: center; }
  .cell h2 button { font-size: 12px; }
  .stage { width: 336px; height: 532px; overflow: hidden; }
  .stage > div { transform: scale(0.7); transform-origin: top left; }
</style>
</head>
<body>
<h1>おみくじ装置パターン一覧(2秒後に玉が落ちます・18秒ごとに自動リプレイ)</h1>
<div class="grid" id="grid"></div>
<script>${matterSrc}</script>
<script>${bundleModules()}</script>
<script>
  const machine = window.omikujiMachine;
  machine.PATTERNS.forEach((pattern, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    const h = document.createElement("h2");
    h.innerHTML = '<span>' + (index + 1) + '. ' + pattern.name + ' <small>(' + pattern.id + ')</small></span>';
    const btn = document.createElement("button");
    btn.textContent = "もう一回";
    h.appendChild(btn);
    const stage = document.createElement("div");
    stage.className = "stage";
    const inner = document.createElement("div");
    stage.appendChild(inner);
    cell.appendChild(h);
    cell.appendChild(stage);
    document.getElementById("grid").appendChild(cell);

    let render = null;
    let raf = null;
    let timer = null;
    function start() {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      if (render) {
        Matter.Render.stop(render);
        render.canvas.remove();
        render = null;
      }
      const built = machine.buildMachineWorld(Matter, { patternIndex: index });
      machine.installChainAssist(Matter, built.engine);
      render = Matter.Render.create({
        element: inner,
        engine: built.engine,
        options: { width: 480, height: 760, wireframes: false, background: "transparent" },
      });
      Matter.Render.run(render);
      let steps = 0;
      const step = () => {
        Matter.Engine.update(built.engine, 1000 / 60, 1);
        steps++;
        if (steps === 120) machine.spawnBall(Matter, built.engine.world, 0.35);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      timer = setTimeout(start, 18000); // 自動リプレイ
    }
    btn.addEventListener("click", start);
    start();
  });
</script>
</body>
</html>`;
  fs.writeFileSync(outPath, html);
  console.log("wrote " + outPath);
  console.log("ブラウザで開いてください: file://" + path.resolve(outPath));
}

main();
