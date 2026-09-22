package gofunctions

var omikujiEntries = []omikujiEntry{
	// 超吉(出現率2%)は「ちょっと良い日」ではなく、エンジニア伝説として
	// 酒の席で語れるレベルの宇宙規模の豪運を書く。無茶が全部セーフになる系・
	// ありえない奇跡系で構成する(#177でユーザーフィードバックにより全面改稿)。
	{ID: "chokichi-001", Tier: TierChokichi, Fortune: "WHERE句を忘れたUPDATEが、なぜか対象1行だった。神は実在する。", Lines: []omikujiLine{
		{Category: "障害運", Text: "障害が起きない。起こしたのにだ。"},
		{Category: "デプロイ運", Text: "金曜17時にデプロイしたのに、月曜になっても何も起きていない。"},
		{Category: "願望", Text: "願う前に叶っている。むしろ叶ってから願っている。"},
	}},
	{ID: "chokichi-002", Tier: TierChokichi, Fortune: "DROP TABLE した直後、そのテーブルが3年前から誰にも使われていなかったと判明。", Lines: []omikujiLine{
		{Category: "対人運", Text: "Slackの全リアクションが🎉。アンチも今日は休業する。"},
		{Category: "金運", Text: "昇給の連絡が、査定面談より先に来る。"},
		{Category: "願望", Text: "書いただけの妄想Issueに『実装しました』とリプが付く。"},
	}},
	{ID: "chokichi-003", Tier: TierChokichi, Fortune: "依存クラウドのリージョンが全滅する中、うちのサービスだけ無傷だった。理由は不明。", Lines: []omikujiLine{
		{Category: "障害運", Text: "障害対応に駆けつけたら、もう直っていて議事録だけが残っている。"},
		{Category: "対人運", Text: "『あの人に聞けば分かる』の『あの人』に、今日はあなたがなっている。"},
		{Category: "待ち人", Text: "来る。Approveと差し入れを両手に。"},
	}},
	{ID: "chokichi-004", Tier: TierChokichi, Fortune: "秘密鍵をpublicリポにpushしてしまったが、その鍵は昨日ローテ済みで無効だった。", Lines: []omikujiLine{
		{Category: "失物", Text: "無くしたドングルが、次に行く場所で先回りして待っている。"},
		{Category: "障害運", Text: "アラートが鳴らない。テスト送信ですら遠慮してくる。"},
		{Category: "願望", Text: "『無かったことにしたい』まで含めて叶う。"},
	}},
	{ID: "chokichi-005", Tier: TierChokichi, Fortune: "タイムゾーンのバグが別のバグと相殺して、3年間ずっと正しい時刻を表示していた。", Lines: []omikujiLine{
		{Category: "学問", Text: "適当に開いた論文が、そのまま今日のタスクの答えだった。"},
		{Category: "レビュー運", Text: "レビュアーが指摘を書こうとして、賞賛しか出てこない。"},
		{Category: "金運", Text: "クラウドの無料枠が今日だけ2倍になっている。問い合わせても『正規です』。"},
	}},
	{ID: "chokichi-006", Tier: TierChokichi, Fortune: "バグ報告のissueを立てたら、3分後に作者本人が修正PR付きで現れた。", Lines: []omikujiLine{
		{Category: "対人運", Text: "雲の上の人が『いいね』ではなく『一緒にやろう』と言ってくる。"},
		{Category: "願望", Text: "OSSにスターが付く速度が、通知を読む速度を超える。"},
		{Category: "デプロイ運", Text: "デプロイ直後に依存の脆弱性が公表される。あなたの入れたバージョンだけ無傷。"},
	}},
	{ID: "chokichi-007", Tier: TierChokichi, Fortune: "本番データを消したが、レプリケーション遅延のおかげでレプリカに無傷で残っていた。", Lines: []omikujiLine{
		{Category: "失物", Text: "消したはずのログが、誰も覚えていないバックアップから無傷で出てくる。"},
		{Category: "健康運", Text: "腰痛が椅子ごと治る。"},
		{Category: "待ち人", Text: "返信が来る。こちらが送るより先に。"},
	}},
	{ID: "chokichi-008", Tier: TierChokichi, Fortune: "本番サーバーを誤って落とした瞬間、館内放送が『ただいまより電源工事を行います』と告げた。", Lines: []omikujiLine{
		{Category: "対人運", Text: "隣のチームが『例の件、直しときました』と言ってくる。二回も。"},
		{Category: "障害運", Text: "エラーバジェットが余りすぎて、繰り越しを申し出てくる。"},
		{Category: "願望", Text: "口に出した願いから順に、その日のうちに叶っていく。"},
	}},
	{ID: "chokichi-009", Tier: TierChokichi, Fortune: "締切当日の朝、要件そのものがキャンセルになった。まだ1行も書いていなかった。", Lines: []omikujiLine{
		{Category: "願望", Text: "『時間が欲しい』と願うと、締切のほうが消える。"},
		{Category: "対人運", Text: "進捗を聞いてくる人が、聞く直前に長期休暇に入る。"},
		{Category: "健康運", Text: "買い置きの胃薬のほうが、先に賞味期限を迎える。"},
	}},
	{ID: "chokichi-010", Tier: TierChokichi, Fortune: "git blame したら、あの伝説の事故の犯人が自分ではなかった。", Lines: []omikujiLine{
		{Category: "失物", Text: "探し物が、最初に開けた引き出しにある。全部。"},
		{Category: "レビュー運", Text: "コンフリクトがあなたを見て、道を譲る。"},
		{Category: "金運", Text: "ガチャを引く前に天井が来る。"},
	}},
	{ID: "chokichi-011", Tier: TierChokichi, Fortune: "「動くけど理由が分からないコード」の理由が分かった。しかも正しかった。", Lines: []omikujiLine{
		{Category: "失物", Text: "謎の設定ファイルの存在理由が判明する。消さなくてよかった。"},
		{Category: "学問", Text: "チェスタトンのフェンスを、今日は堂々と撤去できる。"},
		{Category: "願望", Text: "技術的負債が音を立てて資産に変わる。"},
	}},
	{ID: "chokichi-012", Tier: TierChokichi, Fortune: "面接で「趣味はOSSです」と言ったら、面接官がそのユーザーだった。", Lines: []omikujiLine{
		{Category: "対人運", Text: "初対面の全員が、あなたの作った何かのユーザー。"},
		{Category: "金運", Text: "提示年収が希望額の上を行く。値切られる気配がない。"},
		{Category: "待ち人", Text: "内定が来る。歩いて。"},
	}},
	{ID: "chokichi-013", Tier: TierChokichi, Fortune: "クラウド請求が想定の100倍届いたが、サポートが『弊社のミスです』と全額返金+お詫びクレジットをくれた。", Lines: []omikujiLine{
		{Category: "金運", Text: "経費で落ちるか微妙なものが、今日は全部落ちる。"},
		{Category: "障害運", Text: "監視ダッシュボードが緑を通り越して、なんだか輝いて見える。"},
		{Category: "健康運", Text: "健康診断の結果が全部A。座りっぱなしなのにだ。"},
	}},
	{ID: "chokichi-014", Tier: TierChokichi, Fortune: "徹夜明けに出したプルリクが、人生最高のコードと評された。", Lines: []omikujiLine{
		{Category: "健康運", Text: "徹夜明けなのに肌ツヤが良い。医学が困惑している。"},
		{Category: "レビュー運", Text: "指摘ゼロ。コメントは🚀の絵文字ひとつ。"},
		{Category: "デプロイ運", Text: "CIオール緑。あのフレーキーなテストまで緑。"},
	}},
	{ID: "chokichi-015", Tier: TierChokichi, Fortune: "キーボードに珈琲をこぼしたら、保険で最新モデルに化けた。", Lines: []omikujiLine{
		{Category: "失物", Text: "失ったものが全部、アップグレードされて帰ってくる。"},
		{Category: "金運", Text: "ポイント還元が謎に二重で付く。問い合わせても『正規です』。"},
		{Category: "対人運", Text: "総務が今日だけ神対応。備品申請が音速で通る。"},
	}},

	{ID: "daikichi-001", Tier: TierDaikichi, Fortune: "詰まってたバグ、散歩から戻ったら直し方が降ってくる。", Lines: []omikujiLine{
		{Category: "失物", Text: "見失っていた原因が、コーヒー片手にふと見える。"},
		{Category: "デプロイ運", Text: "リリースは無風。ヒヤリともせず終わる。"},
		{Category: "健康運", Text: "早めに寝られて、翌朝の頭が冴える。"},
	}},
	{ID: "daikichi-002", Tier: TierDaikichi, Fortune: "レビューで褒められ、ついでに一つ学ぶ。", Lines: []omikujiLine{
		{Category: "レビュー運", Text: "指摘は一つだけ。しかも勉強になる良い指摘。"},
		{Category: "学問", Text: "積んでた技術書がスラスラ頭に入る日。"},
		{Category: "対人運", Text: "MTGが早めに終わり、実装時間が増える。"},
	}},
	{ID: "daikichi-003", Tier: TierDaikichi, Fortune: "テストが全部緑。CI待ちのコーヒーが旨い。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "デプロイ後の監視が平和。安心して昼食へ。"},
		{Category: "待ち人", Text: "頼んだレビューが昼までに返ってくる。"},
		{Category: "願望", Text: "小さな願いから順に、着実に叶っていく。"},
	}},
	{ID: "daikichi-004", Tier: TierDaikichi, Fortune: "本番の値が想定通り。胸を撫でおろす一日。", Lines: []omikujiLine{
		{Category: "障害運", Text: "ヒヤリはあったが、監視が先に気づいて事なきを得る。"},
		{Category: "金運", Text: "査定コメントが好意的。昇給の芽が育つ。"},
		{Category: "健康運", Text: "肩こりが軽い。ストレッチが効いてくる。"},
	}},
	{ID: "daikichi-005", Tier: TierDaikichi, Fortune: "書いたスクリプトが一発で通り、作業が半分に。", Lines: []omikujiLine{
		{Category: "学問", Text: "新しいツールが手に馴染み、生産性が上がる。"},
		{Category: "レビュー運", Text: "小さな改善提案が『いいね』を集める。"},
		{Category: "対人運", Text: "雑談から良いアイデアが生まれる好調な会議。"},
	}},
	{ID: "daikichi-006", Tier: TierDaikichi, Fortune: "ログを見たら、原因が親切に自白していた。", Lines: []omikujiLine{
		{Category: "失物", Text: "探していた不具合が、エラーメッセージに全部書いてある。"},
		{Category: "デプロイ運", Text: "リリースノートが自分でも綺麗に書ける。"},
		{Category: "願望", Text: "こつこつ進めた願いが、形になり始める。"},
	}},
	{ID: "daikichi-007", Tier: TierDaikichi, Fortune: "仕様の疑問がSlackで秒で解決する。", Lines: []omikujiLine{
		{Category: "対人運", Text: "認識合わせがスムーズ。手戻りが起きない。"},
		{Category: "健康運", Text: "水をよく飲めて、午後もだれない。"},
		{Category: "障害運", Text: "アラートは静か。オンコールも穏やかに過ぎる。"},
	}},
	{ID: "daikichi-008", Tier: TierDaikichi, Fortune: "先輩が通りがかりに詰まりを一言で解いてくれる。", Lines: []omikujiLine{
		{Category: "待ち人", Text: "頼れるレビュアーが今日は機嫌も手も空いている。"},
		{Category: "学問", Text: "写経していたサンプルが、突然腹落ちする。"},
		{Category: "金運", Text: "資格手当の申請が通り、来月の給与に反映。"},
	}},
	{ID: "daikichi-009", Tier: TierDaikichi, Fortune: "リファクタが気持ちよく進み、心もすっきり。", Lines: []omikujiLine{
		{Category: "レビュー運", Text: "diffが読みやすいと褒められ、承認も早い。"},
		{Category: "デプロイ運", Text: "段階リリースが順調に緑を伸ばす。"},
		{Category: "健康運", Text: "昼寝15分で午後が完全復活する。"},
	}},
	{ID: "daikichi-010", Tier: TierDaikichi, Fortune: "手が空いた瞬間に、やりたかった改善が捗る。", Lines: []omikujiLine{
		{Category: "願望", Text: "温めていた提案が、上司にすんなり通る。"},
		{Category: "学問", Text: "勉強会の内容が、そのまま今日の実務に効く。"},
		{Category: "対人運", Text: "他チームとの連携が驚くほど噛み合う。"},
	}},
	{ID: "daikichi-011", Tier: TierDaikichi, Fortune: "怖くて後回しにしてた作業が、案外あっさり終わる。", Lines: []omikujiLine{
		{Category: "失物", Text: "長年の懸念だった箇所が、静かに片付く。"},
		{Category: "障害運", Text: "予兆を先に潰せて、障害が未然に消える。"},
		{Category: "金運", Text: "評価面談で来期の期待値をしっかり伝えられる。"},
	}},
	{ID: "daikichi-012", Tier: TierDaikichi, Fortune: "ドキュメントが充実していて、詰まりゼロで進む。", Lines: []omikujiLine{
		{Category: "学問", Text: "公式チュートリアルが親切で、迷わず進む。"},
		{Category: "レビュー運", Text: "レビューコメントが建設的で、実装がよくなる。"},
		{Category: "健康運", Text: "背筋が伸びて、一日を通して調子が良い。"},
	}},
	{ID: "daikichi-013", Tier: TierDaikichi, Fortune: "デプロイ後の数字がじわっと良い方向に伸びる。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "反映後のメトリクスが素直に改善する。"},
		{Category: "待ち人", Text: "レビュアーが快く追加レビューを引き受ける。"},
		{Category: "対人運", Text: "定例が短く終わり、みんな上機嫌。"},
	}},
	{ID: "daikichi-014", Tier: TierDaikichi, Fortune: "運用の面倒が一つ自動化され、心が軽くなる。", Lines: []omikujiLine{
		{Category: "障害運", Text: "夜間バッチが無事完走。朝の確認が平和。"},
		{Category: "金運", Text: "評価が一段上がり、昇給の内示がちらつく。"},
		{Category: "願望", Text: "地道な積み重ねが、良い形で報われ始める。"},
	}},
	{ID: "daikichi-015", Tier: TierDaikichi, Fortune: "難所を越え、久々に達成感で一日を終える。", Lines: []omikujiLine{
		{Category: "健康運", Text: "肩の荷が下りて、夜はぐっすり眠れる。"},
		{Category: "学問", Text: "苦手だった分野が、今日ひとつ得意になる。"},
		{Category: "レビュー運", Text: "自信のPRが、期待通りすんなり通る。"},
	}},

	{ID: "chukichi-001", Tier: TierChukichi, Fortune: "だいたい順調。たまに詰まるが、まあ進む。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "リリースは無事。だが緊張で肩に力が入る。"},
		{Category: "レビュー運", Text: "軽微な指摘が三つ。直せば通る範囲。"},
		{Category: "健康運", Text: "睡眠はそこそこ。午後に眠気が来る。"},
	}},
	{ID: "chukichi-002", Tier: TierChukichi, Fortune: "動く。理由も分かる。だが少し腑に落ちない。", Lines: []omikujiLine{
		{Category: "失物", Text: "原因は掴めたが、対処に少し時間がかかる。"},
		{Category: "学問", Text: "新技術は7割理解。残り3割は明日の自分へ。"},
		{Category: "対人運", Text: "MTGは長いが、結論はちゃんと出る。"},
	}},
	{ID: "chukichi-003", Tier: TierChukichi, Fortune: "可もなく不可もなく。平穏が一番のご褒美。", Lines: []omikujiLine{
		{Category: "障害運", Text: "小さなアラートが一度。すぐ収まる。"},
		{Category: "待ち人", Text: "レビューは夕方に返ってくる。焦らず待て。"},
		{Category: "願望", Text: "願いは半分ほど。残りは来週に持ち越し。"},
	}},
	{ID: "chukichi-004", Tier: TierChukichi, Fortune: "コピペが動いた。中身の理解は後回しでヨシ。", Lines: []omikujiLine{
		{Category: "学問", Text: "サンプル通りに書けば動く。応用は要努力。"},
		{Category: "デプロイ運", Text: "デプロイは通るが、確認に地味に手間取る。"},
		{Category: "金運", Text: "昇給は据え置き。だが賞与に少し期待。"},
	}},
	{ID: "chukichi-005", Tier: TierChukichi, Fortune: "タスクは進むが、Slackの通知に何度も溶ける。", Lines: []omikujiLine{
		{Category: "対人運", Text: "急な差し込み会議が一つ。予定が少しずれる。"},
		{Category: "健康運", Text: "コーヒーの飲みすぎで、地味に胃が重い。"},
		{Category: "失物", Text: "軽いバグを一つ踏むが、想定の範囲内。"},
	}},
	{ID: "chukichi-006", Tier: TierChukichi, Fortune: "見積もり通り。誤差は許容範囲に収まる。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "本番反映は静か。だが念のため何度も確認する。"},
		{Category: "レビュー運", Text: "レビューは無難に通る。絶賛はされない。"},
		{Category: "願望", Text: "小さな願いが一つ叶う。欲張らなければ吉。"},
	}},
	{ID: "chukichi-007", Tier: TierChukichi, Fortune: "詰まっては進み、進んでは詰まる。それが日常。", Lines: []omikujiLine{
		{Category: "失物", Text: "探し物は見つかるが、別の粗が一つ見える。"},
		{Category: "学問", Text: "ドキュメントは古いが、issueに答えがある。"},
		{Category: "健康運", Text: "肩が少し重い。ストレッチで持ち直す。"},
	}},
	{ID: "chukichi-008", Tier: TierChukichi, Fortune: "波風は立たない。だが退屈も少しある。", Lines: []omikujiLine{
		{Category: "障害運", Text: "監視は概ね平和。たまにグラフが揺れる程度。"},
		{Category: "対人運", Text: "定例は淡々。特筆すべき事件は起きない。"},
		{Category: "待ち人", Text: "レビュアーは忙しそうだが、ちゃんと返す。"},
	}},
	{ID: "chukichi-009", Tier: TierChukichi, Fortune: "並の一日。可もなく不可もなく退勤できる。", Lines: []omikujiLine{
		{Category: "金運", Text: "臨時収入はないが、出費もない堅実な日。"},
		{Category: "デプロイ運", Text: "リリースは無事。祝杯までは行かない。"},
		{Category: "健康運", Text: "目薬を差せば、午後もそこそこ戦える。"},
	}},
	{ID: "chukichi-010", Tier: TierChukichi, Fortune: "半分終わって半分残る。ちょうど真ん中の日。", Lines: []omikujiLine{
		{Category: "願望", Text: "願いは道半ば。焦らず続ければ叶う兆し。"},
		{Category: "レビュー運", Text: "軽い手戻りが一度。直せばすぐ承認。"},
		{Category: "学問", Text: "写経は進むが、応用問題で少し悩む。"},
	}},
	{ID: "chukichi-011", Tier: TierChukichi, Fortune: "そこそこ捗る。だがコンテキストスイッチが多い。", Lines: []omikujiLine{
		{Category: "対人運", Text: "会議と実装が交互に来て、集中が細切れ。"},
		{Category: "失物", Text: "見つけたバグは軽微。優先度は低めでヨシ。"},
		{Category: "健康運", Text: "昼食が重く、午後の立ち上がりが鈍い。"},
	}},
	{ID: "chukichi-012", Tier: TierChukichi, Fortune: "特に問題なし。ただ達成感も控えめ。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "デプロイは平穏。だが手順書を三度見返す。"},
		{Category: "金運", Text: "評価は現状維持。次の四半期に期待。"},
		{Category: "待ち人", Text: "レビューは翌朝一番に返ってくる見込み。"},
	}},
	{ID: "chukichi-013", Tier: TierChukichi, Fortune: "地味だが着実。積み上げが後で効いてくる。", Lines: []omikujiLine{
		{Category: "学問", Text: "新しい概念が、ぼんやりと輪郭を持ち始める。"},
		{Category: "障害運", Text: "小さな警告が一つ。原因は既知で対処済み。"},
		{Category: "願望", Text: "叶うかは五分。行動次第で吉に転ぶ。"},
	}},
	{ID: "chukichi-014", Tier: TierChukichi, Fortune: "普通の火曜日みたいな穏やかさ。", Lines: []omikujiLine{
		{Category: "健康運", Text: "睡眠は6時間。ぎりぎり戦えるライン。"},
		{Category: "レビュー運", Text: "指摘は二つ。どちらも納得のいく内容。"},
		{Category: "対人運", Text: "打ち合わせは平和。結論は無難に着地。"},
	}},
	{ID: "chukichi-015", Tier: TierChukichi, Fortune: "山も谷も浅い。安定運転の一日。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "反映は無事。だが確認画面を三回リロードする。"},
		{Category: "失物", Text: "探し物はほどなく見つかる。慌てなくてよい。"},
		{Category: "金運", Text: "小さな精算が通り、財布が少しだけ潤う。"},
	}},

	{ID: "shokichi-001", Tier: TierShokichi, Fortune: "動く。だが『なぜ動くか』は説明できない。", Lines: []omikujiLine{
		{Category: "失物", Text: "直したはずのバグが、別の顔で戻ってくる。"},
		{Category: "レビュー運", Text: "指摘は多いが、どれも一理あって反論できない。"},
		{Category: "健康運", Text: "睡眠不足で、変数名がなかなか出てこない。"},
	}},
	{ID: "shokichi-002", Tier: TierShokichi, Fortune: "小さな勝ち。ただし喜ぶ前にまた一つ課題。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "リリースは通るが、直後に軽い手直しが入る。"},
		{Category: "対人運", Text: "会議が延び、実装時間がじわっと削られる。"},
		{Category: "願望", Text: "願いは少しだけ前進。過度な期待は禁物。"},
	}},
	{ID: "shokichi-003", Tier: TierShokichi, Fortune: "コーヒーはうまい。コードはまあまあ。", Lines: []omikujiLine{
		{Category: "学問", Text: "チュートリアルの途中でバージョンが食い違う。"},
		{Category: "失物", Text: "凡ミスを一つ埋め込むが、自分で気づいて助かる。"},
		{Category: "待ち人", Text: "レビュアーが会議続きで、承認は夕方以降。"},
	}},
	{ID: "shokichi-004", Tier: TierShokichi, Fortune: "そこそこの出来。だが心のどこかが引っかかる。", Lines: []omikujiLine{
		{Category: "障害運", Text: "小さなアラートが数回。原因は毎回同じキャッシュ。"},
		{Category: "健康運", Text: "肩こりが地味に効いてくる。湿布が欲しい。"},
		{Category: "金運", Text: "昇給の話は先送り。だが期待は繋がれる。"},
	}},
	{ID: "shokichi-005", Tier: TierShokichi, Fortune: "進みはするが、YAMLのインデントで15分溶ける。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "設定ミスで一度こける。二度目で無事通る。"},
		{Category: "対人運", Text: "議題が多く、最後は駆け足で終わる。"},
		{Category: "願望", Text: "願いはちょっとだけ。過信せず地道に。"},
	}},
	{ID: "shokichi-006", Tier: TierShokichi, Fortune: "悪くはない。ただ絶好調とも言えない一日。", Lines: []omikujiLine{
		{Category: "失物", Text: "軽いバグを踏むが、被害は自分だけで済む。"},
		{Category: "レビュー運", Text: "細かい指摘が続くが、コードは着実に良くなる。"},
		{Category: "健康運", Text: "目の疲れが早い。こまめに休憩を取ると吉。"},
	}},
	{ID: "shokichi-007", Tier: TierShokichi, Fortune: "小さな成功と小さなつまずきが交互に来る。", Lines: []omikujiLine{
		{Category: "学問", Text: "新ツールは便利だが、設定に一手間かかる。"},
		{Category: "障害運", Text: "監視は概ね静か。夜間に一度だけ軽く鳴る。"},
		{Category: "対人運", Text: "認識のズレが一つ発覚。すぐ埋められる範囲。"},
	}},
	{ID: "shokichi-008", Tier: TierShokichi, Fortune: "帳尻は合う。だが途中の遠回りが多め。", Lines: []omikujiLine{
		{Category: "待ち人", Text: "レビュアーが多忙で、返事は明日に持ち越し。"},
		{Category: "金運", Text: "臨時の出費が一つ。だが痛手ではない。"},
		{Category: "デプロイ運", Text: "リリースは無事だが、直前に肝を冷やす。"},
	}},
	{ID: "shokichi-009", Tier: TierShokichi, Fortune: "無難に終わる。だが後半で集中力が切れる。", Lines: []omikujiLine{
		{Category: "健康運", Text: "夕方にガス欠。糖分補給で何とか持ち直す。"},
		{Category: "失物", Text: "探し物はあるが、見つけるまで遠回りする。"},
		{Category: "願望", Text: "願いはわずかに前進。焦らず続ければよい。"},
	}},
	{ID: "shokichi-010", Tier: TierShokichi, Fortune: "小吉らしい、ほどほどの一日。", Lines: []omikujiLine{
		{Category: "レビュー運", Text: "承認は出るが、条件付き。次回に宿題が残る。"},
		{Category: "学問", Text: "理解は進むが、腹落ちまであと一歩。"},
		{Category: "対人運", Text: "会議は無難。だが結論が少し曖昧に終わる。"},
	}},
	{ID: "shokichi-011", Tier: TierShokichi, Fortune: "動いたので良しとする。深追いは禁物。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "反映後に軽い違和感。だが実害はなく済む。"},
		{Category: "障害運", Text: "小さな警告を一つ見逃しかけるが、間に合う。"},
		{Category: "健康運", Text: "水分不足で頭が重い。意識して飲むと回復。"},
	}},
	{ID: "shokichi-012", Tier: TierShokichi, Fortune: "地味な前進。手応えは薄いが確かに進む。", Lines: []omikujiLine{
		{Category: "失物", Text: "原因の当たりはつくが、確証まで少しかかる。"},
		{Category: "金運", Text: "評価コメントは無難。昇給は次の機会に。"},
		{Category: "願望", Text: "願いは半歩。続ければ中吉に近づく。"},
	}},
	{ID: "shokichi-013", Tier: TierShokichi, Fortune: "小さな幸運が一つ。だが浮かれると足元をすくわれる。", Lines: []omikujiLine{
		{Category: "待ち人", Text: "レビュアーが軽い指摘だけで通してくれる。"},
		{Category: "対人運", Text: "打ち合わせは短いが、宿題が一つ増える。"},
		{Category: "健康運", Text: "夜更かしを一日だけ。翌朝に少し響く。"},
	}},
	{ID: "shokichi-014", Tier: TierShokichi, Fortune: "帳尻は合うが、気は抜けない一日。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "リリースは通るが、確認作業が地味に長い。"},
		{Category: "学問", Text: "サンプルは動くが、本番適用に一工夫要る。"},
		{Category: "失物", Text: "軽微な不具合を一つ発見。優先度は低めでよい。"},
	}},
	{ID: "shokichi-015", Tier: TierShokichi, Fortune: "ほどほどの手応え。欲を出さなければ吉。", Lines: []omikujiLine{
		{Category: "健康運", Text: "睡眠はそこそこ。昼にコーヒーで持ち直す。"},
		{Category: "レビュー運", Text: "指摘は少なめ。だが一つだけ根が深い。"},
		{Category: "願望", Text: "小さな望みが一つ叶う。感謝を忘れずに。"},
	}},

	{ID: "suekichi-001", Tier: TierSuekichi, Fortune: "動いた。理由は分からないが動いた。触るな。", Lines: []omikujiLine{
		{Category: "失物", Text: "直った気配はあるが、根本原因は闇の中。"},
		{Category: "デプロイ運", Text: "反映は通る。だが二度と同じ手順を再現できない。"},
		{Category: "健康運", Text: "寝不足気味。カフェインで無理やり起動する。"},
	}},
	{ID: "suekichi-002", Tier: TierSuekichi, Fortune: "今日は種まきの日。芽が出るのは、ずっと先。", Lines: []omikujiLine{
		{Category: "レビュー運", Text: "レビューは戻ってこない。既読はついている。"},
		{Category: "学問", Text: "分厚い本を開くが、3ページで力尽きる。"},
		{Category: "対人運", Text: "結論の出ない会議が、また来週に持ち越される。"},
	}},
	{ID: "suekichi-003", Tier: TierSuekichi, Fortune: "微妙。悪くはないが、良くもない。無風の凪。", Lines: []omikujiLine{
		{Category: "願望", Text: "願いはまだ遠い。今は耐える時期と心得よ。"},
		{Category: "失物", Text: "探し物は見つからず。たぶん別ブランチにある。"},
		{Category: "健康運", Text: "肩が重い。だが病院に行くほどでもない。"},
	}},
	{ID: "suekichi-004", Tier: TierSuekichi, Fortune: "ローカルでは動く。それだけが心の支え。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "本番だけ挙動が違う。環境差の沼が待つ。"},
		{Category: "障害運", Text: "軽いアラートが断続的。無視はできない微妙さ。"},
		{Category: "対人運", Text: "MTGが伸びて、集中の糸が切れる。"},
	}},
	{ID: "suekichi-005", Tier: TierSuekichi, Fortune: "耐える日。派手なことはせず、静かに過ごせ。", Lines: []omikujiLine{
		{Category: "レビュー運", Text: "指摘が抽象的で、どう直せばいいか分からない。"},
		{Category: "金運", Text: "昇給の話は霧の中。今は実績を貯める時。"},
		{Category: "健康運", Text: "目の奥が重い。画面を少し離して見ると楽。"},
	}},
	{ID: "suekichi-006", Tier: TierSuekichi, Fortune: "終わりかけて、また一つ仕様が生えてくる。", Lines: []omikujiLine{
		{Category: "願望", Text: "ゴールが動く。追いかけ続けるしかない。"},
		{Category: "失物", Text: "潰したバグの隣で、新しいバグが目を覚ます。"},
		{Category: "対人運", Text: "『ちょっといい?』が三回。作業が細切れになる。"},
	}},
	{ID: "suekichi-007", Tier: TierSuekichi, Fortune: "今は下積み。派手さはないが無駄でもない。", Lines: []omikujiLine{
		{Category: "学問", Text: "新技術は難解。今日は雰囲気だけ掴めれば上出来。"},
		{Category: "待ち人", Text: "頼れる人は出張中。返信は数日後になる。"},
		{Category: "デプロイ運", Text: "リリースは延期。準備だけ淡々と進める。"},
	}},
	{ID: "suekichi-008", Tier: TierSuekichi, Fortune: "小さな不運が続くが、致命傷はない。", Lines: []omikujiLine{
		{Category: "障害運", Text: "夜中に一度だけ軽く鳴る。眠りは浅くなる。"},
		{Category: "健康運", Text: "座りっぱなしで腰が固まる。立って伸びると吉。"},
		{Category: "金運", Text: "予定外の小出費。財布がじわっと軽くなる。"},
	}},
	{ID: "suekichi-009", Tier: TierSuekichi, Fortune: "報われるのはもう少し先。今日は仕込みに徹せ。", Lines: []omikujiLine{
		{Category: "願望", Text: "願いは保留。焦って動くと空回りする。"},
		{Category: "レビュー運", Text: "承認は保留。追加資料を求められる。"},
		{Category: "学問", Text: "理解は進まず足踏み。明日に期待をつなぐ。"},
	}},
	{ID: "suekichi-010", Tier: TierSuekichi, Fortune: "とりあえず動く状態でコミット。未来の自分に託す。", Lines: []omikujiLine{
		{Category: "失物", Text: "TODOコメントだけが静かに増えていく。"},
		{Category: "デプロイ運", Text: "反映は先送り。理由を説明する資料が要る。"},
		{Category: "健康運", Text: "肩と目が同時に疲れる。今日は早く寝るべし。"},
	}},
	{ID: "suekichi-011", Tier: TierSuekichi, Fortune: "地味な停滞。だが腐らず続ければ道は開く。", Lines: []omikujiLine{
		{Category: "対人運", Text: "決めたい事が決まらず、次回に持ち越し。"},
		{Category: "障害運", Text: "監視のグラフが微妙に揺れ、気が休まらない。"},
		{Category: "願望", Text: "叶うまで、あと一歩の我慢が必要。"},
	}},
	{ID: "suekichi-012", Tier: TierSuekichi, Fortune: "うまくいかない日ほど、後で効いてくる学びがある。", Lines: []omikujiLine{
		{Category: "学問", Text: "つまずいた分だけ、理解は少しずつ深まる。"},
		{Category: "レビュー運", Text: "指摘は厳しめ。だが受け止めれば力になる。"},
		{Category: "健康運", Text: "疲れが抜けにくい。無理せず休むが勝ち。"},
	}},
	{ID: "suekichi-013", Tier: TierSuekichi, Fortune: "波は低い。だが焦らなければ沈みはしない。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "リリースはお預け。準備を丁寧に整える日。"},
		{Category: "失物", Text: "原因の尻尾は掴めない。ログを増やして次に備える。"},
		{Category: "金運", Text: "臨時収入はなし。堅実に守るが吉。"},
	}},
	{ID: "suekichi-014", Tier: TierSuekichi, Fortune: "今日は動かない方が正解、という日もある。", Lines: []omikujiLine{
		{Category: "待ち人", Text: "レビュアーは繁忙。急かさず待つのが賢明。"},
		{Category: "対人運", Text: "議論は平行線。時間を置くと収まる兆し。"},
		{Category: "健康運", Text: "気圧のせいか頭が重い。深呼吸で立て直す。"},
	}},
	{ID: "suekichi-015", Tier: TierSuekichi, Fortune: "小さな我慢の先に、ようやく末広がりの兆し。", Lines: []omikujiLine{
		{Category: "願望", Text: "叶うのは遅いが、方向は間違っていない。"},
		{Category: "学問", Text: "少しずつ手応え。焦らず積み上げれば実る。"},
		{Category: "レビュー運", Text: "何度目かの修正で、ようやく承認が見えてくる。"},
	}},

	{ID: "kyo-001", Tier: TierKyo, Fortune: "再現しないバグの再現に半日溶ける。原因はキャッシュ。", Lines: []omikujiLine{
		{Category: "失物", Text: "手元では絶対に再現しない。本番でだけ静かに壊れる。"},
		{Category: "デプロイ運", Text: "反映後にエラー率が上がり、ロールバックで一日終わる。"},
		{Category: "健康運", Text: "根詰めすぎて、夕方には目がしょぼしょぼ。"},
	}},
	{ID: "kyo-002", Tier: TierKyo, Fortune: "『すぐ終わる』と踏んだ修正が、丸一日を飲み込む。", Lines: []omikujiLine{
		{Category: "レビュー運", Text: "大量の指摘で赤コメントの壁。心が折れかける。"},
		{Category: "対人運", Text: "急な差し込み会議が三連続。実装時間が消滅。"},
		{Category: "健康運", Text: "昼食を取り損ね、集中力が地に落ちる。"},
	}},
	{ID: "kyo-003", Tier: TierKyo, Fortune: "マージ直前に大型コンフリクト。解消でまた半日。", Lines: []omikujiLine{
		{Category: "失物", Text: "解消のどさくさで、消したはずのバグが復活する。"},
		{Category: "待ち人", Text: "頼みのレビュアーが休暇。承認は誰も押せない。"},
		{Category: "願望", Text: "願いは届かず。今日は嵐が過ぎるのを待て。"},
	}},
	{ID: "kyo-004", Tier: TierKyo, Fortune: "本番のログが英語で叫んでいるのに、誰も気づかない。", Lines: []omikujiLine{
		{Category: "障害運", Text: "深夜にアラートが鳴り、寝ぼけ眼で対応に入る。"},
		{Category: "デプロイ運", Text: "ホットフィックスがまた別の不具合を連れてくる。"},
		{Category: "健康運", Text: "睡眠を削られ、翌日の頭が回らない。"},
	}},
	{ID: "kyo-005", Tier: TierKyo, Fortune: "動いていた機能が、誰も触っていないのに壊れる。", Lines: []omikujiLine{
		{Category: "失物", Text: "『昨日まで動いてた』が口癖になる一日。"},
		{Category: "学問", Text: "頼みのライブラリが破壊的変更で牙を剥く。"},
		{Category: "対人運", Text: "原因究明の緊急MTGで、午後が丸ごと消える。"},
	}},
	{ID: "kyo-006", Tier: TierKyo, Fortune: "本番DBに流したクエリが、想定の10倍の行を触る。", Lines: []omikujiLine{
		{Category: "障害運", Text: "負荷でレスポンスが悪化し、監視が真っ赤に染まる。"},
		{Category: "デプロイ運", Text: "慌てて戻すも、キャッシュが古いまま暴れ続ける。"},
		{Category: "健康運", Text: "冷や汗で一気に消耗。心臓に悪い午後。"},
	}},
	{ID: "kyo-007", Tier: TierKyo, Fortune: "仕様が二転三転し、作ったものが半分ボツになる。", Lines: []omikujiLine{
		{Category: "願望", Text: "積み上げが崩れ、振り出しに戻される。"},
		{Category: "対人運", Text: "決定事項が会議のたびに覆り、疲労だけが残る。"},
		{Category: "金運", Text: "残業は増えるのに、評価には一切反映されない。"},
	}},
	{ID: "kyo-008", Tier: TierKyo, Fortune: "レビュー指摘の総数が、実装の行数を上回る。", Lines: []omikujiLine{
		{Category: "レビュー運", Text: "『設計から見直そう』の一言で、全てが白紙に戻る。"},
		{Category: "待ち人", Text: "再レビューが何往復も続き、着地が見えない。"},
		{Category: "健康運", Text: "肩と首がガチガチ。湿布が手放せない。"},
	}},
	{ID: "kyo-009", Tier: TierKyo, Fortune: "環境構築で一日を溶かし、コードは一行も書けない。", Lines: []omikujiLine{
		{Category: "学問", Text: "バージョン地獄で、依存関係が延々と噛み合わない。"},
		{Category: "デプロイ運", Text: "CIだけが落ちる。手元では何度やっても通る。"},
		{Category: "願望", Text: "『今日こそ進めたい』が、今日も叶わない。"},
	}},
	{ID: "kyo-010", Tier: TierKyo, Fortune: "書き上げた直後、エディタが落ちて未保存が消える。", Lines: []omikujiLine{
		{Category: "失物", Text: "直したロジックごと、記憶の彼方へ吹き飛ぶ。"},
		{Category: "健康運", Text: "喪失感で気力が尽き、コーヒーだけが進む。"},
		{Category: "対人運", Text: "落ち込む間もなく、次の打ち合わせに呼ばれる。"},
	}},
	{ID: "kyo-011", Tier: TierKyo, Fortune: "『念のため』と踏んだ本番確認で、地雷を踏み抜く。", Lines: []omikujiLine{
		{Category: "障害運", Text: "確認操作そのものが、軽い障害の引き金になる。"},
		{Category: "デプロイ運", Text: "切り戻し手順が古く、書いてある通りに戻せない。"},
		{Category: "健康運", Text: "動悸が収まらず、その日は味がしない夕食。"},
	}},
	{ID: "kyo-012", Tier: TierKyo, Fortune: "テストは全部緑。なのに本番だけが赤く燃える。", Lines: []omikujiLine{
		{Category: "失物", Text: "テストが拾えない境界値で、静かに事故が起きる。"},
		{Category: "レビュー運", Text: "『テスト足りてる?』の指摘が、今さら胸に刺さる。"},
		{Category: "対人運", Text: "振り返り会で、原因を一人で説明する羽目に。"},
	}},
	{ID: "kyo-013", Tier: TierKyo, Fortune: "ドキュメントが古く、書いてある通りにやると壊れる。", Lines: []omikujiLine{
		{Category: "学問", Text: "公式手順が現行版と食い違い、罠だけが残る。"},
		{Category: "待ち人", Text: "詳しい人は退職済み。口伝は誰にも残っていない。"},
		{Category: "願望", Text: "『誰か助けて』の声が、静かなチャンネルに沈む。"},
	}},
	{ID: "kyo-014", Tier: TierKyo, Fortune: "定時直前に『ちょっといい?』で、退勤が二時間ずれる。", Lines: []omikujiLine{
		{Category: "対人運", Text: "軽い相談のはずが、方針レベルの議論に発展する。"},
		{Category: "金運", Text: "残業代は出るが、失った夜は二度と戻らない。"},
		{Category: "健康運", Text: "夕飯が遅れ、胃がもたれたまま眠りにつく。"},
	}},
	{ID: "kyo-015", Tier: TierKyo, Fortune: "秘伝のシェルスクリプトが、今日に限って沈黙する。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "自動化が一箇所こけ、手作業で全部やり直す。"},
		{Category: "失物", Text: "原因は環境変数の一文字。見つかるまで二時間。"},
		{Category: "健康運", Text: "苛立ちで肩に力が入り、頭痛の種になる。"},
	}},

	{ID: "daikyo-001", Tier: TierDaikyo, Fortune: "24時リリースの立ち会い決定。しかも待ちは他チームの障害復旧。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "自分の作業は5分で終わる。だが前工程が永遠に終わらない。"},
		{Category: "待ち人", Text: "承認待ちの相手が、別の障害対応で音信不通になる。"},
		{Category: "健康運", Text: "終電は消え、始発を待つ椅子だけが友になる。"},
	}},
	{ID: "daikyo-002", Tier: TierDaikyo, Fortune: "大規模マイグレーション本番、ロールバック手順は『祈る』のみ。", Lines: []omikujiLine{
		{Category: "障害運", Text: "途中で止まると戻せない。後戻りできない片道切符。"},
		{Category: "失物", Text: "移行の最中に、想定外のNULLが数百万件見つかる。"},
		{Category: "願望", Text: "願うことは一つ。『どうか最後まで完走してくれ』。"},
	}},
	{ID: "daikyo-003", Tier: TierDaikyo, Fortune: "『5分で終わる』と言われた作業で、気づけば朝を迎える。", Lines: []omikujiLine{
		{Category: "対人運", Text: "頼んだ本人はとっくに寝ている。既読すらつかない。"},
		{Category: "デプロイ運", Text: "一つ直すたびに三つ壊れ、終わりが遠ざかる。"},
		{Category: "健康運", Text: "窓の外が白み始め、鳥の声で我に返る。"},
	}},
	{ID: "daikyo-004", Tier: TierDaikyo, Fortune: "例のExcel仕様書が正。コードはウソをつく、という宣告。", Lines: []omikujiLine{
		{Category: "失物", Text: "セルの結合と非表示行に、真の仕様が隠されている。"},
		{Category: "学問", Text: "最新技術より、20年もののマクロ読解力が試される。"},
		{Category: "対人運", Text: "『前任者しか分からない』が、全ての会話の結論になる。"},
	}},
	{ID: "daikyo-005", Tier: TierDaikyo, Fortune: "有給前日の夜、PagerDutyが鳴る。原因は自分のコミット。", Lines: []omikujiLine{
		{Category: "障害運", Text: "旅行の荷造りの手が止まり、そのままPCを開く。"},
		{Category: "失物", Text: "犯人のコミットに、自分の名前がくっきり残っている。"},
		{Category: "健康運", Text: "休むはずの日を、青ざめた顔で潰すことになる。"},
	}},
	{ID: "daikyo-006", Tier: TierDaikyo, Fortune: "本番の全ユーザーデータに、DELETE文がWHERE無しで走る。", Lines: []omikujiLine{
		{Category: "障害運", Text: "実行ボタンを押した指を、時が止まって見つめる。"},
		{Category: "デプロイ運", Text: "頼みの綱のバックアップが、なぜか三日前で止まっている。"},
		{Category: "願望", Text: "『どうか夢であってくれ』と、本気で天に祈る。"},
	}},
	{ID: "daikyo-007", Tier: TierDaikyo, Fortune: "誰も理解していない神クラスの改修を、一人で任される。", Lines: []omikujiLine{
		{Category: "失物", Text: "一万行の関数に、副作用が地雷のように埋まっている。"},
		{Category: "学問", Text: "コメントは全部『TODO: あとで直す(2014年)』。"},
		{Category: "待ち人", Text: "レビューできる人間が、この地球上に存在しない。"},
	}},
	{ID: "daikyo-008", Tier: TierDaikyo, Fortune: "金曜の大型リリース、担当は君ひとり。逃げ場はない。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "週末を人質に取られ、緑になるまで帰れない。"},
		{Category: "障害運", Text: "何かあれば土日も呼ばれる。覚悟の判子を押される。"},
		{Category: "健康運", Text: "週末の予定は全て白紙。心も体もすり減る。"},
	}},
	{ID: "daikyo-009", Tier: TierDaikyo, Fortune: "『動いてるので触るな』のコードに、修正命令が下る。", Lines: []omikujiLine{
		{Category: "失物", Text: "一文字変えた瞬間、地雷が連鎖的に爆発する。"},
		{Category: "対人運", Text: "壊した責任だけが、なぜか君に降ってくる。"},
		{Category: "願望", Text: "『どうか触らずに済ませたい』が、最後まで叶わない。"},
	}},
	{ID: "daikyo-010", Tier: TierDaikyo, Fortune: "リリース当日、キーマンが飛び、指揮官の席が空く。", Lines: []omikujiLine{
		{Category: "対人運", Text: "指示を仰ぐ相手が消え、判断を全部背負わされる。"},
		{Category: "デプロイ運", Text: "手順の要所だけ、その人の頭の中にしかなかった。"},
		{Category: "健康運", Text: "重圧で胃がきりきり。食事が喉を通らない。"},
	}},
	{ID: "daikyo-011", Tier: TierDaikyo, Fortune: "本番と検証のDB接続先が、そっくり入れ替わっていた。", Lines: []omikujiLine{
		{Category: "障害運", Text: "テストのつもりの操作が、本番顧客を直撃する。"},
		{Category: "失物", Text: "設定ファイルの一行の取り違えが、全てを狂わせる。"},
		{Category: "健康運", Text: "血の気が引き、その場に立っていられなくなる。"},
	}},
	{ID: "daikyo-012", Tier: TierDaikyo, Fortune: "年末の凍結期間直前、最後の一本が本番で燃え上がる。", Lines: []omikujiLine{
		{Category: "デプロイ運", Text: "リリース枠は今日で最後。直すか、年を越すかの二択。"},
		{Category: "障害運", Text: "監視が真っ赤なまま、他の全員は帰省に旅立つ。"},
		{Category: "願望", Text: "『今年こそ静かな年末を』が、無情に打ち砕かれる。"},
	}},
	{ID: "daikyo-013", Tier: TierDaikyo, Fortune: "外部APIが予告なく廃止。依存する全機能が一斉に沈黙する。", Lines: []omikujiLine{
		{Category: "学問", Text: "代替の実装を、締切ゼロ日で今すぐ書けと迫られる。"},
		{Category: "障害運", Text: "顧客からの問い合わせが、雪崩のように積み上がる。"},
		{Category: "待ち人", Text: "急ぎのPRを見てくれる人は、誰も手が空いていない。"},
	}},
	{ID: "daikyo-014", Tier: TierDaikyo, Fortune: "『簡単な修正でしょ?』の一言から、深夜対応が確定する。", Lines: []omikujiLine{
		{Category: "対人運", Text: "見積もりを聞かれず、勝手に『今日中』が約束される。"},
		{Category: "失物", Text: "簡単なはずの一点が、設計の根っこまで腐っていた。"},
		{Category: "健康運", Text: "終電も夕飯も逃し、自販機の缶コーヒーで凌ぐ。"},
	}},
	{ID: "daikyo-015", Tier: TierDaikyo, Fortune: "障害報告書の執筆が、障害対応より長い夜になる。", Lines: []omikujiLine{
		{Category: "障害運", Text: "復旧は終わったのに、再発防止策の詰めで朝が来る。"},
		{Category: "対人運", Text: "翌朝いちで、経営層への説明会がセットされている。"},
		{Category: "健康運", Text: "眠気と自責で、キーボードの上に突っ伏しかける。"},
	}},
}
