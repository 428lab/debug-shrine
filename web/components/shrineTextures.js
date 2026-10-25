// 境内の演出(弾き玉・だるま落とし)で共通に使う模様(canvas のテクスチャ)とレア度の色。
// three.js は使う側が渡す(この演出の時だけ読み込む)。

const TIER_COLORS = {
  超吉: "#ffcc33",
  大吉: "#e83a3a",
  中吉: "#e8743a",
  小吉: "#3aa860",
  末吉: "#3a78c8",
  凶: "#555566",
  大凶: "#5a2a7a",
};

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSkyTexture(THREE) {
  return canvasTex(THREE, 16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#3a4a8a");
    grad.addColorStop(0.45, "#c87a6a");
    grad.addColorStop(0.62, "#f0b070");
    grad.addColorStop(1, "#f6d0a0");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function makeGroundTexture(THREE) {
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    // 白っぽい砂利
    g.fillStyle = "#b8b2a8";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) {
      const v = 130 + Math.floor(Math.random() * 90);
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.7)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  });
}

function makePathTexture(THREE) {
  return canvasTex(THREE, 128, 256, (g, w, h) => {
    g.fillStyle = "#6f6a64";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      for (let x = (y / 64) % 2 ? -32 : 0; x < w; x += 64) {
        const v = 140 + Math.floor(Math.random() * 30);
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.fillRect(x + 2, y + 2, 60, 60);
      }
    }
  });
}

function makeWoodTexture(THREE, base, grain) {
  return canvasTex(THREE, 64, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = grain;
    g.globalAlpha = 0.35;
    for (let x = 2; x < w; x += 5 + Math.random() * 6) {
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.05 + x) * 1.5, y);
      g.stroke();
    }
  });
}

function makeLeafTexture(THREE) {
  return canvasTex(THREE, 32, 32, (g) => {
    g.translate(16, 16);
    g.fillStyle = "#d8401c";
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
      const b = a + Math.PI / 5;
      g.lineTo(Math.cos(b) * 5, Math.sin(b) * 5);
    }
    g.closePath();
    g.fill();
  });
}

function makeSoftTexture(THREE) {
  return canvasTex(THREE, 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

module.exports = {
  TIER_COLORS,
  canvasTex,
  makeSkyTexture,
  makeGroundTexture,
  makePathTexture,
  makeWoodTexture,
  makeLeafTexture,
  makeSoftTexture,
};
