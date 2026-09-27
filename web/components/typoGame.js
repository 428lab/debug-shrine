// ミニゲーム「誤字祓い」のルール(描画も音も含まない純関数)。
//
// 上から誤字を含む言葉が落ちてくる。間違っている文字をタップすると、らぼみがお祓いして
// 正しい文字に直る。正しい文字をタップするとお手つき(コンボが切れる)。直せないまま
// しめ縄(LINE_Y)まで落ちると命が 1 つ減り、3 つなくなったら終わり。
// 直すたびにお祓いゲージがたまり、満タンで「一斉お祓い」(画面の誤字をまとめて直す)。
//
// 言葉は "ret{ru|ur}n" のように書く({間違い|正しい})。間違いの側は 1 文字以上。
// 座標は論理の大きさ(W × H)。文字の幅は、半角 = FS × 0.6、全角 = FS として並べる
// (描く側も同じ幅のマスに 1 文字ずつ描く)。
//
// 検証は scripts/test-typo-game.js。

const W = 420;
const H = 700;
const LINE_Y = 500; // しめ縄の高さ。言葉の下端がここを越えたら漏れ
const FS = 32; // 文字の大きさ
const STEP = 1 / 60;
const LIVES = 3;
const GAUGE_MAX = 10;
const HIT_PAD = 6; // 間違いのマスの左右に足す、当たりの余裕

// ---- 言葉(tier: 1 = 最初から、2 = 25 秒から、3 = 60 秒から) ----
const WORDS = [
  // プログラミング
  { s: "ret{ru|ur}n", tier: 1, kind: "code" },
  { s: "fu{cn|nc}tion", tier: 1, kind: "code" },
  { s: "leng{ht|th}", tier: 1, kind: "code" },
  { s: "imp{ro|or}t", tier: 1, kind: "code" },
  { s: "con{ts|st}", tier: 1, kind: "code" },
  { s: "con{os|so}le", tier: 1, kind: "code" },
  { s: "fa{sl|ls}e", tier: 1, kind: "code" },
  { s: "tr{eu|ue}", tier: 1, kind: "code" },
  { s: "pr{ni|in}t", tier: 1, kind: "code" },
  { s: "Str{ni|in}g", tier: 1, kind: "code" },
  { s: "whi{el|le}", tier: 1, kind: "code" },
  { s: "c{al|la}ss", tier: 1, kind: "code" },
  { s: "Java{s|S}cript", tier: 1, kind: "code" },
  { s: "Git{h|H}ub", tier: 1, kind: "code" },
  { s: "com{mti|mit}", tier: 1, kind: "code" },
  { s: "m{re|er}ge", tier: 1, kind: "code" },
  { s: "stat{su|us}", tier: 1, kind: "code" },
  { s: "def{ua|au}lt", tier: 1, kind: "code" },
  { s: "undefi{en|ne}d", tier: 1, kind: "code" },
  { s: "ob{ej|je}ct", tier: 1, kind: "code" },
  { s: "arr{ya|ay}", tier: 1, kind: "code" },
  { s: "stri{gn|ng}", tier: 1, kind: "code" },
  { s: "num{eb|be}r", tier: 1, kind: "code" },
  { s: "bool{ae|ea}n", tier: 1, kind: "code" },
  { s: "swi{ct|tc}h", tier: 1, kind: "code" },
  { s: "ca{ct|tc}h", tier: 1, kind: "code" },
  { s: "thr{wo|ow}", tier: 1, kind: "code" },
  { s: "asy{cn|nc}", tier: 1, kind: "code" },
  { s: "aw{ia|ai}t", tier: 1, kind: "code" },
  { s: "br{ae|ea}k", tier: 1, kind: "code" },
  { s: "contin{eu|ue}", tier: 1, kind: "code" },
  { s: "pub{il|li}c", tier: 1, kind: "code" },
  { s: "priv{ta|at}e", tier: 1, kind: "code" },
  { s: "stat{ci|ic}", tier: 1, kind: "code" },
  { s: "exp{ro|or}t", tier: 1, kind: "code" },
  { s: "req{iu|ui}re", tier: 1, kind: "code" },
  { s: "mod{lu|ul}e", tier: 1, kind: "code" },
  { s: "par{ma|am}s", tier: 1, kind: "code" },
  { s: "resp{no|on}se", tier: 1, kind: "code" },
  { s: "requ{se|es}t", tier: 1, kind: "code" },
  { s: "h{ae|ea}der", tier: 1, kind: "code" },
  { s: "tok{ne|en}", tier: 1, kind: "code" },
  { s: "que{yr|ry}", tier: 1, kind: "code" },
  { s: "sel{ce|ec}t", tier: 1, kind: "code" },
  { s: "ins{re|er}t", tier: 1, kind: "code" },
  { s: "upd{ta|at}e", tier: 1, kind: "code" },
  { s: "d{le|el}ete", tier: 1, kind: "code" },
  { s: "tab{el|le}", tier: 1, kind: "code" },
  { s: "ind{xe|ex}", tier: 1, kind: "code" },
  { s: "val{eu|ue}", tier: 1, kind: "code" },
  { s: "k{ye|ey}s", tier: 1, kind: "code" },
  { s: "t{py|yp}e", tier: 1, kind: "code" },
  { s: "fi{el|le}", tier: 1, kind: "code" },
  { s: "pa{ht|th}", tier: 1, kind: "code" },
  { s: "se{vr|rv}er", tier: 1, kind: "code" },
  { s: "cl{ei|ie}nt", tier: 1, kind: "code" },
  { s: "rout{re|er}", tier: 1, kind: "code" },
  { s: "midd{el|le}ware", tier: 1, kind: "code" },
  { s: "compo{en|ne}nt", tier: 1, kind: "code" },
  { s: "temp{al|la}te", tier: 1, kind: "code" },
  { s: "sc{ir|ri}pt", tier: 1, kind: "code" },
  { s: "sty{el|le}", tier: 1, kind: "code" },
  { s: "rend{re|er}", tier: 1, kind: "code" },
  { s: "pro{sp|ps}", tier: 1, kind: "code" },
  { s: "sta{et|te}", tier: 1, kind: "code" },
  { s: "ev{ne|en}t", tier: 1, kind: "code" },
  { s: "cl{ci|ic}k", tier: 1, kind: "code" },
  { s: "butt{no|on}", tier: 1, kind: "code" },
  { s: "wid{ht|th}", tier: 1, kind: "code" },
  { s: "h{ie|ei}ght", tier: 1, kind: "code" },
  { s: "col{ro|or}", tier: 1, kind: "code" },
  { s: "paddi{gn|ng}", tier: 1, kind: "code" },
  { s: "mar{ig|gi}n", tier: 1, kind: "code" },
  { s: "disp{al|la}y", tier: 1, kind: "code" },
  { s: "posit{oi|io}n", tier: 1, kind: "code" },
  { s: "fo{tn|nt}", tier: 1, kind: "code" },
  { s: "pr{mo|om}ise", tier: 1, kind: "code" },
  { s: "fe{ct|tc}h", tier: 1, kind: "code" },
  { s: "respo{s|ns}e", tier: 1, kind: "code" },
  { s: "len{t|gt}h", tier: 1, kind: "code" },
  { s: "fun{t|ct}ion", tier: 1, kind: "code" },
  { s: "ret{r|ur}n", tier: 1, kind: "code" },
  { s: "p{ir|ri}nt", tier: 1, kind: "code" },
  { s: "v{ra|ar}", tier: 1, kind: "code" },
  { s: "s{le|el}f", tier: 1, kind: "code" },
  { s: "t{ih|hi}s", tier: 1, kind: "code" },
  { s: "nul{ll|l}", tier: 1, kind: "code" },
  { s: "t{ur|ru}e", tier: 1, kind: "code" },
  { s: "f{la|al}se", tier: 1, kind: "code" },
  { s: "e{sl|ls}e", tier: 1, kind: "code" },
  { s: "d{co|oc}ker", tier: 1, kind: "code" },
  { s: "kuber{en|ne}tes", tier: 1, kind: "code" },
  { s: "py{ht|th}on", tier: 1, kind: "code" },
  { s: "R{su|us}t", tier: 1, kind: "code" },
  { s: "J{va|av}a", tier: 1, kind: "code" },
  { s: "Lin{xu|ux}", tier: 1, kind: "code" },
  { s: "Ubun{ut|tu}", tier: 1, kind: "code" },
  { s: "S{LQ|QL}", tier: 1, kind: "code" },
  { s: "HT{LM|ML}", tier: 1, kind: "code" },
  { s: "J{OS|SO}N", tier: 1, kind: "code" },
  { s: "Rea{tc|ct}", tier: 1, kind: "code" },
  { s: "N{xu|ux}t", tier: 1, kind: "code" },
  { s: "V{eu|ue}", tier: 1, kind: "code" },
  { s: "G{ti|it}", tier: 1, kind: "code" },
  { s: "Sla{kc|ck}", tier: 1, kind: "code" },
  { s: "Fi{mg|gm}a", tier: 1, kind: "code" },
  { s: "Ch{or|ro}me", tier: 1, kind: "code" },
  { s: "Safa{ir|ri}", tier: 1, kind: "code" },
  { s: "And{or|ro}id", tier: 1, kind: "code" },
  { s: "console.l{go|og}()", tier: 2, kind: "code" },
  { s: "imp{ro|or}t React", tier: 2, kind: "code" },
  { s: "npm i{sn|ns}tall", tier: 2, kind: "code" },
  { s: "git che{kc|ck}out", tier: 2, kind: "code" },
  { s: "docker bu{li|il}d", tier: 2, kind: "code" },
  { s: "sudo a{tp|pt}", tier: 2, kind: "code" },
  { s: "README.{dm|md}", tier: 2, kind: "code" },
  { s: "localh{so|os}t", tier: 2, kind: "code" },
  { s: "Type{s|S}cript", tier: 2, kind: "code" },
  { s: "e{sl|ls}e if", tier: 2, kind: "code" },
  { s: "git pu{hs|sh}", tier: 2, kind: "code" },
  { s: "git co{m|mm}it", tier: 2, kind: "code" },
  { s: "git stat{su|us}", tier: 2, kind: "code" },
  { s: "git reb{sa|as}e", tier: 2, kind: "code" },
  { s: "npm r{nu|un} dev", tier: 2, kind: "code" },
  { s: "yarn b{iu|ui}ld", tier: 2, kind: "code" },
  { s: "echo $PA{HT|TH}", tier: 2, kind: "code" },
  { s: "cat REA{MD|DM}E.md", tier: 2, kind: "code" },
  { s: "print(\"Hel{ol|lo}\")", tier: 2, kind: "code" },
  { s: "x.leng{ht|th}", tier: 2, kind: "code" },
  { s: "arr.p{su|us}h(x)", tier: 2, kind: "code" },
  { s: "JSON.p{ra|ar}se", tier: 2, kind: "code" },
  { s: "Math.r{na|an}dom()", tier: 2, kind: "code" },
  { s: "setTi{em|me}out", tier: 2, kind: "code" },
  { s: "addEventList{n|en}er", tier: 2, kind: "code" },
  { s: "querySel{ce|ec}tor", tier: 2, kind: "code" },
  { s: "innerH{MT|TM}L", tier: 2, kind: "code" },
  { s: "localSt{ro|or}age", tier: 2, kind: "code" },
  { s: "async fu{cn|nc}tion", tier: 2, kind: "code" },
  { s: "await fe{ct|tc}h()", tier: 2, kind: "code" },
  { s: "export def{ua|au}lt", tier: 2, kind: "code" },
  { s: "SELECT * F{OR|RO}M t", tier: 2, kind: "code" },
  { s: "W{EH|HE}RE id = 1", tier: 2, kind: "code" },
  { s: "INSERT IN{OT|TO}", tier: 2, kind: "code" },
  { s: "sudo re{ob|bo}ot", tier: 2, kind: "code" },
  { s: "ssh-k{ye|ey}gen", tier: 2, kind: "code" },
  { s: "pip i{sn|ns}tall", tier: 2, kind: "code" },
  { s: "def __in{ti|it}__", tier: 2, kind: "code" },
  { s: "self.n{ma|am}e", tier: 2, kind: "code" },
  { s: "impo{tr|rt} os", tier: 2, kind: "code" },
  { s: "fmt.Pri{tn|nt}ln", tier: 2, kind: "code" },
  { s: "func m{ia|ai}n()", tier: 2, kind: "code" },
  { s: "pa{kc|ck}age main", tier: 2, kind: "code" },
  { s: "nu{1|l}l", tier: 3, kind: "code" },
  { s: "c{0|o}nst", tier: 3, kind: "code" },
  { s: "fa{1|l}se", tier: 3, kind: "code" },
  { s: "{I|l}ength", tier: 3, kind: "code" },
  { s: "if (x {=|==} 1)", tier: 3, kind: "code" },
  { s: "ret{ru|ur}n fa{sl|ls}e", tier: 3, kind: "code" },
  { s: "fu{cn|nc}tion ma{ni|in}", tier: 3, kind: "code" },
  { s: "con{ts|st} ok = tr{eu|ue}", tier: 3, kind: "code" },
  { s: "retu{m|rn}", tier: 3, kind: "code" },
  { s: "c{1|l}ass", tier: 3, kind: "code" },
  { s: "whi{1|l}e", tier: 3, kind: "code" },
  { s: "{0|O}bject", tier: 3, kind: "code" },
  { s: "ret{ru|ur}n tr{eu|ue}", tier: 3, kind: "code" },
  { s: "imp{ro|or}t Rea{tc|ct}", tier: 3, kind: "code" },
  { s: "if (a {=|===} b)", tier: 3, kind: "code" },
  { s: "x {=!|!=} y", tier: 3, kind: "code" },
  { s: "i {=+|+=} 1", tier: 3, kind: "code" },
  { s: "c{0|o}unt", tier: 3, kind: "code" },
  { s: "va{1|l}ue", tier: 3, kind: "code" },
  { s: "{rn|m}ain", tier: 3, kind: "code" },
  { s: "undef{l|i}ned", tier: 3, kind: "code" },
  { s: "t{n|h}is", tier: 3, kind: "code" },
  { s: "Ma{f|t}h.max", tier: 3, kind: "code" },
  { s: "{I|i}OS", tier: 3, kind: "code" },
  { s: "{M|m}acOS", tier: 3, kind: "code" },
  // 日本語
  { s: "デバッ{ク|グ}", tier: 1, kind: "ja" },
  { s: "シ{ュミ|ミュ}レーション", tier: 1, kind: "ja" },
  { s: "コミ{ニュ|ュニ}ケーション", tier: 1, kind: "ja" },
  { s: "アボ{ガ|カ}ド", tier: 1, kind: "ja" },
  { s: "ベッ{ト|ド}", tier: 1, kind: "ja" },
  { s: "ふ{いん|んい}き", tier: 1, kind: "ja" },
  { s: "こんにち{わ|は}", tier: 1, kind: "ja" },
  { s: "シ{ュチ|チ}ュエーション", tier: 1, kind: "ja" },
  { s: "プログラミン{ク|グ}", tier: 1, kind: "ja" },
  { s: "アップデー{ド|ト}", tier: 1, kind: "ja" },
  { s: "デ{ィスク|スク}トップ", tier: 1, kind: "ja" },
  { s: "バック{ア|アッ}プ", tier: 1, kind: "ja" },
  { s: "パスワー{ト|ド}", tier: 1, kind: "ja" },
  { s: "ブラ{ザウ|ウザ}", tier: 1, kind: "ja" },
  { s: "ダウ{ロン|ンロ}ード", tier: 1, kind: "ja" },
  { s: "アップロー{ト|ド}", tier: 1, kind: "ja" },
  { s: "スマート{ホ|フォ}ン", tier: 1, kind: "ja" },
  { s: "コンピ{ュタ|ュータ}ー", tier: 1, kind: "ja" },
  { s: "キーボー{ト|ド}", tier: 1, kind: "ja" },
  { s: "インターネッ{ド|ト}", tier: 1, kind: "ja" },
  { s: "ハー{ト|ド}ウェア", tier: 1, kind: "ja" },
  { s: "リファクタリン{ク|グ}", tier: 1, kind: "ja" },
  { s: "ビル{ト|ド}", tier: 1, kind: "ja" },
  { s: "コー{ト|ド}", tier: 1, kind: "ja" },
  { s: "{テ|デ}プロイ", tier: 1, kind: "ja" },
  { s: "ド{ュキ|キュ}メント", tier: 1, kind: "ja" },
  { s: "エン{ニジ|ジニ}ア", tier: 1, kind: "ja" },
  { s: "プロ{ジュ|ジェ}クト", tier: 1, kind: "ja" },
  { s: "スケ{ジ|ジュ}ール", tier: 1, kind: "ja" },
  { s: "キャッ{シ|シュ}", tier: 1, kind: "ja" },
  { s: "セキュ{ティリ|リティ}", tier: 1, kind: "ja" },
  { s: "アクセ{サ|シ}ビリティ", tier: 1, kind: "ja" },
  { s: "エレ{ベ|ベー}ター", tier: 1, kind: "ja" },
  { s: "コミ{ニュ|ュニ}ティ", tier: 1, kind: "ja" },
  { s: "リリー{ズ|ス}", tier: 1, kind: "ja" },
  { s: "コミッ{ド|ト}", tier: 1, kind: "ja" },
  { s: "プルリ{グ|ク}", tier: 1, kind: "ja" },
  { s: "ログアウ{ド|ト}", tier: 1, kind: "ja" },
  { s: "こんばん{わ|は}", tier: 1, kind: "ja" },
  { s: "す{い|み}ません", tier: 1, kind: "ja" },
  { s: "少し{づ|ず}つ", tier: 1, kind: "ja" },
  { s: "お{う|お}きい", tier: 1, kind: "ja" },
  { s: "と{う|お}り", tier: 1, kind: "ja" },
  { s: "こ{う|お}り", tier: 1, kind: "ja" },
  { s: "と{ゆ|い}う", tier: 1, kind: "ja" },
  { s: "危機一{発|髪}", tier: 2, kind: "ja" },
  { s: "絶{対|体}絶命", tier: 2, kind: "ja" },
  { s: "五里{夢|霧}中", tier: 2, kind: "ja" },
  { s: "{短|単}刀直入", tier: 2, kind: "ja" },
  { s: "意味深{重|長}", tier: 2, kind: "ja" },
  { s: "責任転{化|嫁}", tier: 2, kind: "ja" },
  { s: "異{句|口}同音", tier: 2, kind: "ja" },
  { s: "専{問|門}家", tier: 2, kind: "ja" },
  { s: "講{議|義}を受ける", tier: 2, kind: "ja" },
  { s: "{感|関}心を持つ", tier: 2, kind: "ja" },
  { s: "サー{パ|バ}ー", tier: 2, kind: "ja" },
  { s: "単純明{解|快}", tier: 2, kind: "ja" },
  { s: "無我{無|夢}中", tier: 2, kind: "ja" },
  { s: "自{我|画}自賛", tier: 2, kind: "ja" },
  { s: "以心{電信|伝心}", tier: 2, kind: "ja" },
  { s: "温{古|故}知新", tier: 2, kind: "ja" },
  { s: "言語{同|道}断", tier: 2, kind: "ja" },
  { s: "心機一{点|転}", tier: 2, kind: "ja" },
  { s: "興味{深深|津々}", tier: 2, kind: "ja" },
  { s: "起承転{決|結}", tier: 2, kind: "ja" },
  { s: "厚顔無{知|恥}", tier: 2, kind: "ja" },
  { s: "{口|舌}先三寸", tier: 2, kind: "ja" },
  { s: "{不|付}和雷同", tier: 2, kind: "ja" },
  { s: "無病{則|息}災", tier: 2, kind: "ja" },
  { s: "一騎当{選|千}", tier: 2, kind: "ja" },
  { s: "{清|青}天白日", tier: 2, kind: "ja" },
  { s: "完全無{決|欠}", tier: 2, kind: "ja" },
  { s: "{検討|健闘}を祈る", tier: 2, kind: "ja" },
  { s: "{異常|以上}です", tier: 2, kind: "ja" },
  { s: "保{障|証}書", tier: 2, kind: "ja" },
  { s: "{侵|進}入禁止", tier: 2, kind: "ja" },
  { s: "体{制|勢}を崩す", tier: 2, kind: "ja" },
  { s: "{天|添}付ファイル", tier: 2, kind: "ja" },
  { s: "{変身|返信}を待つ", tier: 2, kind: "ja" },
  { s: "お{突|疲}れ様です", tier: 2, kind: "ja" },
  { s: "よろしくお願いしま{う|す}", tier: 2, kind: "ja" },
  { s: "{機能|昨日}は休み", tier: 2, kind: "ja" },
  { s: "バグを{終生|修正}", tier: 2, kind: "ja" },
  { s: "{使用|仕様}です", tier: 2, kind: "ja" },
  { s: "{布|不}具合", tier: 2, kind: "ja" },
  { s: "{生涯|障害}対応", tier: 2, kind: "ja" },
  { s: "{能|納}期", tier: 2, kind: "ja" },
  { s: "データ{ペ|ベ}ース", tier: 2, kind: "ja" },
  { s: "完{壁|璧}", tier: 3, kind: "ja" },
  { s: "一{諸|緒}に", tier: 3, kind: "ja" },
  { s: "特{微|徴}", tier: 3, kind: "ja" },
  { s: "{遇|偶}然", tier: 3, kind: "ja" },
  { s: "{ツ|シ}ステム", tier: 3, kind: "ja" },
  { s: "ログイ{ソ|ン}", tier: 3, kind: "ja" },
  { s: "メ{ツ|ッ}セージ", tier: 3, kind: "ja" },
  { s: "デバッ{ク|グ}の{シ|ツ}ール", tier: 3, kind: "ja" },
  { s: "マー{シ|ジ}", tier: 3, kind: "ja" },
  { s: "レビ{ユ|ュ}ー", tier: 3, kind: "ja" },
  { s: "{ン|ソ}フト", tier: 3, kind: "ja" },
  { s: "テ{ギ|キ}スト", tier: 3, kind: "ja" },
  { s: "ミ{ユ|ュ}ージック", tier: 3, kind: "ja" },
  { s: "{ツ|シ}ンプル", tier: 3, kind: "ja" },
  { s: "{ン|ソ}ース", tier: 3, kind: "ja" },
  { s: "エラ{一|ー}", tier: 3, kind: "ja" },
  { s: "サ{一|ー}バー", tier: 3, kind: "ja" },
  { s: "{夕|タ}イトル", tier: 3, kind: "ja" },
  { s: "{力|カ}ード", tier: 3, kind: "ja" },
  { s: "{口|ロ}グイン", tier: 3, kind: "ja" },
  { s: "{工|エ}ラー", tier: 3, kind: "ja" },
  { s: "{二|ニ}ュース", tier: 3, kind: "ja" },
  { s: "{八|ハ}ッシュ", tier: 3, kind: "ja" },
  { s: "{卜|ト}ークン", tier: 3, kind: "ja" },
  { s: "{未|末}尾", tier: 3, kind: "ja" },
  { s: "{土|士}気", tier: 3, kind: "ja" },
  { s: "自{已|己}紹介", tier: 3, kind: "ja" },
  { s: "{網|綱}引き", tier: 3, kind: "ja" },
  { s: "{険|検}索", tier: 3, kind: "ja" },
  { s: "{侍|待}ち合わせ", tier: 3, kind: "ja" },
  { s: "{問|間}違い", tier: 3, kind: "ja" },
  { s: "{拾|捨}てる", tier: 3, kind: "ja" },
  { s: "{績|積}極的", tier: 3, kind: "ja" },
  { s: "{講|購}入", tier: 3, kind: "ja" },
];

// "ret{ru|ur}n" → 文字の並び(間違い)と、直す所(segs)
function parse(s) {
  const glyphs = [];
  const segs = [];
  const re = /\{([^|}]*)\|([^}]*)\}|([^{]+)/g;
  let mm;
  while ((mm = re.exec(s))) {
    if (mm[3] != null) {
      glyphs.push(...Array.from(mm[3]));
    } else {
      const wrong = Array.from(mm[1]);
      if (!wrong.length) throw new Error(`間違いの側が空: ${s}`);
      segs.push({ from: glyphs.length, to: glyphs.length + wrong.length, fix: Array.from(mm[2]) });
      glyphs.push(...wrong);
    }
  }
  const right = s.replace(/\{([^|}]*)\|([^}]*)\}/g, "$2");
  const wrongText = s.replace(/\{([^|}]*)\|([^}]*)\}/g, "$1");
  return { glyphs, segs, right, wrong: wrongText };
}

// 全角(日本語)は 1 マス、半角は 0.6 マス
function isWide(ch) {
  return /[^\x20-\x7e]/.test(ch);
}
function glyphW(ch) {
  return isWide(ch) ? FS : FS * 0.6;
}
function widthOf(glyphs) {
  return glyphs.reduce((a, ch) => a + glyphW(ch), 0);
}

// 乱数(種から毎回同じ並び。検証しやすいように)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// 時間(秒)ごとの難しさ
function speedAt(t) {
  return Math.min(150, 55 + t * 1.2); // 落ちる速さ(px/秒)
}
function intervalAt(t) {
  return Math.max(0.9, 2.4 - t * 0.017); // 次の言葉までの秒数
}
function tierAt(t) {
  return t < 25 ? 1 : t < 60 ? 2 : 3;
}

function newGame(seed = Date.now()) {
  return {
    rand: rng(seed),
    t: 0,
    nextSpawn: 0.6,
    items: [],
    nextId: 1,
    score: 0,
    lives: LIVES,
    combo: 0,
    maxCombo: 0,
    gauge: 0,
    fixed: 0, // 直した言葉の数
    misses: 0, // お手つき
    leaks: 0, // 漏れ
    recent: [],
    over: false,
    events: [], // 描画側が演出に使う出来事(毎フレーム取り出す)
  };
}

function spawn(g) {
  const tier = tierAt(g.t);
  let pool = WORDS.filter((w) => w.tier <= tier && !g.recent.includes(w.s));
  // 難しくなってきたら、新しい言葉を多めに
  if (tier >= 2 && g.rand() < 0.5) {
    const newer = pool.filter((w) => w.tier === tier);
    if (newer.length) pool = newer;
  }
  if (!pool.length) pool = WORDS.filter((w) => w.tier <= tier);
  const w = pool[Math.floor(g.rand() * pool.length)];
  g.recent.push(w.s);
  if (g.recent.length > 8) g.recent.shift();
  const p = parse(w.s);
  const width = widthOf(p.glyphs);
  // 横の位置: 上の方にいる言葉と重ならない所を何回か探す
  let x = 10;
  for (let k = 0; k < 8; k++) {
    x = 10 + g.rand() * Math.max(0, W - 20 - width);
    const clash = g.items.some((it) => !it.done && it.y < FS * 2.2 && x < it.x + it.width + 12 && it.x < x + width + 12);
    if (!clash) break;
  }
  const item = {
    id: g.nextId++,
    src: w.s,
    kind: w.kind,
    glyphs: p.glyphs,
    segs: p.segs.map((s) => Object.assign({ fixed: false }, s)),
    right: p.right,
    x,
    y: -8, // 文字の下端(ベースライン)
    width,
    vy: speedAt(g.t) * (0.9 + g.rand() * 0.2),
    done: false,
    leaked: false,
  };
  g.items.push(item);
  g.events.push({ type: "spawn", id: item.id });
}

// 言葉の i 文字目の左端の x
function glyphX(item, i) {
  let x = item.x;
  for (let k = 0; k < i; k++) x += glyphW(item.glyphs[k]);
  return x;
}

// タップした点を札に含む言葉(下 = 急ぐものから順に)
function itemsAt(g, px, py) {
  return g.items
    .filter((it) => {
      if (it.done || it.leaked) return false;
      const top = it.y - FS * 0.95 - 10;
      const bottom = it.y + FS * 0.3 + 10;
      return px >= it.x - 10 && px <= it.x + it.width + 10 && py >= top && py <= bottom;
    })
    .sort((a, b) => b.y - a.y);
}
function itemAt(g, px, py) {
  return itemsAt(g, px, py)[0] || null;
}
// 言葉の中で、x に当たる直す所(fixed: 直したものを探すか)
function segAt(it, px, fixed) {
  for (const s of it.segs) {
    if (s.fixed !== fixed) continue;
    const x0 = glyphX(it, s.from) - (fixed ? 0 : HIT_PAD);
    const x1 = glyphX(it, s.to) + (fixed ? 0 : HIT_PAD);
    if (px >= x0 && px <= x1) return s;
  }
  return null;
}

// タップ。返り値: { result: "fix" | "miss" | "none", item, seg }
function tap(g, px, py) {
  if (g.over) return { result: "none" };
  const cands = itemsAt(g, px, py);
  if (!cands.length) return { result: "none" };
  // 言葉が重なっていたら、間違いの文字に当たっている方を選ぶ
  let it = cands[0];
  let hit = null;
  for (const c of cands) {
    const s = segAt(c, px, false);
    if (s) {
      it = c;
      hit = s;
      break;
    }
  }
  // 直したばかりの金の文字をもう一度押しただけなら、お手つきにしない
  if (!hit && cands.some((c) => segAt(c, px, true))) return { result: "none" };
  if (!hit) {
    g.misses++;
    g.combo = 0;
    g.events.push({ type: "miss", id: it.id, x: px, y: py });
    return { result: "miss", item: it };
  }
  fixSeg(g, it, hit, "tap");
  return { result: "fix", item: it, seg: hit };
}

function fixSeg(g, it, seg, how) {
  seg.fixed = true;
  g.events.push({ type: "fixSeg", id: it.id, from: seg.from, to: seg.to, fix: seg.fix, how });
  if (it.segs.every((s) => s.fixed)) finishItem(g, it, how);
}

// 言葉を直し終えた: 点(高い所で直すほど多い、コンボで増える)
function finishItem(g, it, how) {
  it.done = true;
  g.fixed++;
  g.combo++;
  g.maxCombo = Math.max(g.maxCombo, g.combo);
  if (how !== "special") g.gauge = Math.min(GAUGE_MAX, g.gauge + 1);
  const base = 100 + 50 * (it.segs.length - 1);
  const height = Math.round(60 * Math.max(0, 1 - it.y / LINE_Y));
  const mult = 1 + Math.min(g.combo, 50) * 0.02;
  const pts = Math.round((base + height) * mult * (how === "special" ? 0.5 : 1));
  g.score += pts;
  g.events.push({ type: "done", id: it.id, pts, combo: g.combo, how });
}

// 一斉お祓い(ゲージ満タンの時だけ)。画面の誤字をすべて直す
function special(g) {
  if (g.over || g.gauge < GAUGE_MAX) return false;
  g.gauge = 0;
  g.events.push({ type: "special" });
  for (const it of g.items) {
    if (it.done || it.leaked) continue;
    for (const s of it.segs) if (!s.fixed) fixSeg(g, it, s, "special");
  }
  return true;
}

function step(g, dt = STEP) {
  if (g.over) return;
  g.t += dt;
  g.nextSpawn -= dt;
  if (g.nextSpawn <= 0) {
    spawn(g);
    g.nextSpawn = intervalAt(g.t);
  }
  for (const it of g.items) {
    if (it.done || it.leaked) continue;
    it.y += it.vy * dt;
    if (it.y >= LINE_Y) {
      it.leaked = true;
      g.leaks++;
      g.lives--;
      g.combo = 0;
      g.events.push({ type: "leak", id: it.id, x: it.x + it.width / 2 });
      if (g.lives <= 0) {
        g.over = true;
        g.events.push({ type: "over" });
        break; // 同じ瞬間に落ちた言葉で、命がマイナスにならないように
      }
    }
  }
  // 片付いた言葉は、演出が終わるころに消す(描画側が t と doneAt で使う)
  g.items = g.items.filter((it) => {
    if (!(it.done || it.leaked)) return true;
    if (it.endT == null) it.endT = g.t;
    return g.t - it.endT < 1.8;
  });
}

// 称号(点で)
const TITLES = [
  { min: 0, name: "見習い巫女" },
  { min: 3000, name: "誤字ハンター" },
  { min: 8000, name: "校正の達人" },
  { min: 15000, name: "言霊の守り手" },
  { min: 25000, name: "誤字祓いの神" },
];
function titleOf(score) {
  let t = TITLES[0].name;
  for (const x of TITLES) if (score >= x.min) t = x.name;
  return t;
}

module.exports = {
  W,
  H,
  LINE_Y,
  FS,
  STEP,
  LIVES,
  GAUGE_MAX,
  WORDS,
  TITLES,
  parse,
  isWide,
  glyphW,
  widthOf,
  glyphX,
  speedAt,
  intervalAt,
  tierAt,
  newGame,
  step,
  tap,
  itemAt,
  special,
  titleOf,
};
