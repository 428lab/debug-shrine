// リズムゲームの曲の一覧。id はハイスコアの保存にも使うので変えない。
const Kagura = require("./rhythmSong");
const Shippu = require("./rhythmSongShippu");
const Matsuri = require("./rhythmSongMatsuri");
const Ten = require("./rhythmSongTen");

const SONGS = [
  { id: "kagura", title: "御神楽", genre: "和 × ボカロ", bpm: Kagura.BPM, build: Kagura.buildSong },
  { id: "shippu", title: "疾風迅雷", genre: "疾走和ロック", bpm: Shippu.BPM, build: Shippu.buildSong },
  { id: "matsuri", title: "祭ノ宵", genre: "祭り EDM", bpm: Matsuri.BPM, build: Matsuri.buildSong },
  { id: "ten", title: "天ノ調", genre: "雅楽トランス", bpm: Ten.BPM, build: Ten.buildSong },
];

module.exports = { SONGS };
