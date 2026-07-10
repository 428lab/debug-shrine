<template>
  <!--
    お稲荷さんの狐スプライト(SVG)。体・しっぽ・耳・足・顔を持ち、
    pose プロパティでポーズを切り替える(sleep/idle/crouch/jump/land/happy)。
    位置移動(left/bottom)や向き(flip)は親側で制御し、ここは姿勢のみ担当。
  -->
  <svg
    class="fox-svg"
    :class="'pose-' + pose"
    viewBox="0 0 120 92"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- しっぽ(ふさふさ・白い先) -->
    <g class="tail">
      <path
        d="M36,60 C14,66 2,52 8,32 C11,44 18,50 26,53 C20,44 18,36 22,26 C28,38 36,48 44,54 Z"
        fill="#f08c3e"
      />
      <path d="M8,32 C10,40 15,47 22,51 C18,42 18,34 22,26 C15,28 10,29 8,32 Z" fill="#fff4e4" />
    </g>

    <!-- 後ろ足 -->
    <g class="legs legs-back">
      <rect x="36" y="62" width="6" height="16" rx="3" fill="#5b3b23" />
      <rect x="46" y="64" width="6" height="14" rx="3" fill="#5b3b23" />
    </g>

    <!-- 体 -->
    <ellipse cx="54" cy="58" rx="26" ry="16" fill="#f08c3e" />
    <circle cx="41" cy="59" r="14" fill="#e57f33" />
    <ellipse cx="63" cy="64" rx="10" ry="8" fill="#fff4e4" />

    <!-- 前足 -->
    <g class="legs legs-front">
      <rect x="64" y="62" width="6" height="17" rx="3" fill="#5b3b23" />
      <rect x="72" y="63" width="6" height="16" rx="3" fill="#5b3b23" />
    </g>

    <!-- 頭 -->
    <g class="head">
      <!-- 耳 -->
      <g class="ear ear-l">
        <path d="M63,25 L59,5 L75,17 Z" fill="#f08c3e" />
        <path d="M64,21 L62,10 L71,17 Z" fill="#7a4a26" />
      </g>
      <g class="ear ear-r">
        <path d="M85,22 L95,3 L99,23 Z" fill="#f08c3e" />
        <path d="M88,19 L93,9 L95,20 Z" fill="#7a4a26" />
      </g>
      <!-- 顔 -->
      <circle cx="79" cy="34" r="17" fill="#f08c3e" />
      <ellipse cx="89" cy="42" rx="11" ry="8" fill="#fff4e4" />
      <circle cx="98" cy="40" r="2.8" fill="#402b1e" />
      <!-- 目(開き) -->
      <g class="eyes-open">
        <circle cx="73" cy="31" r="2.5" fill="#402b1e" />
        <circle cx="86" cy="31" r="2.5" fill="#402b1e" />
      </g>
      <!-- 目(閉じ=にっこり) -->
      <g class="eyes-closed">
        <path d="M70,31 Q73,28.5 76,31" stroke="#402b1e" stroke-width="1.8" fill="none" stroke-linecap="round" />
        <path d="M83,31 Q86,28.5 89,31" stroke="#402b1e" stroke-width="1.8" fill="none" stroke-linecap="round" />
      </g>
      <!-- ほっぺ -->
      <circle class="blush" cx="70" cy="39" r="3" fill="#ff9d68" opacity="0.55" />
    </g>
  </svg>
</template>

<script>
export default {
  props: {
    // sleep | idle | crouch | jump | land | happy
    pose: { type: String, default: "idle" },
  },
};
</script>

<style scoped>
.fox-svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  transform-origin: 50% 100%;
  transition: transform 0.16s ease;
}
.fox-svg .head,
.fox-svg .tail,
.fox-svg .legs,
.fox-svg .ear {
  transition: transform 0.16s ease;
}
.fox-svg .head { transform-origin: 76px 40px; }
.fox-svg .tail { transform-origin: 38px 58px; }
.fox-svg .ear-l { transform-origin: 66px 22px; }
.fox-svg .ear-r { transform-origin: 92px 20px; }
.fox-svg .legs { transform-origin: 55px 62px; }

/* 目はポーズで開閉(既定は開き) */
.fox-svg .eyes-closed { display: none; }

/* --- 寝てる(丸まって目を閉じ、しっぽを抱える) --- */
.pose-sleep {
  transform: scaleY(0.82) translateY(4px);
}
.pose-sleep .head { transform: translate(-3px, 10px) rotate(16deg); }
.pose-sleep .tail { transform: rotate(-18deg) translate(4px, -2px); }
.pose-sleep .legs { transform: scaleY(0.45) translateY(6px); }
.pose-sleep .ear-l,
.pose-sleep .ear-r { transform: rotate(-12deg); }
.pose-sleep .eyes-open { display: none; }
.pose-sleep .eyes-closed { display: block; }

/* --- しゃがみ(ジャンプの溜め。おしりフリフリ) --- */
.pose-crouch {
  transform: scaleY(0.76) scaleX(1.06) translateY(4px);
  animation: fox-wiggle 0.36s ease-in-out infinite;
}
.pose-crouch .head { transform: translateY(3px) rotate(-4deg); }
.pose-crouch .ear-l, .pose-crouch .ear-r { transform: rotate(-14deg); }
.pose-crouch .tail { transform: rotate(10deg); }
@keyframes fox-wiggle {
  0%, 100% { rotate: -2deg; }
  50% { rotate: 2deg; }
}

/* --- ジャンプ(伸びて足をたたみ、しっぽが流れる) --- */
.pose-jump {
  transform: scaleY(1.12) scaleX(0.94);
}
.pose-jump .legs { transform: scaleY(0.5) translateY(5px); }
.pose-jump .tail { transform: rotate(22deg); }
.pose-jump .ear-l, .pose-jump .ear-r { transform: rotate(-18deg); }
.pose-jump .head { transform: rotate(-6deg); }

/* --- 着地(ぐしゃっと潰れる) --- */
.pose-land {
  transform: scaleY(0.7) scaleX(1.18) translateY(5px);
}
.pose-land .ear-l, .pose-land .ear-r { transform: rotate(6deg); }
.pose-land .tail { transform: rotate(-8deg); }

/* --- ご機嫌(本命に着地。しっぽパタパタ) --- */
.pose-happy .tail { animation: fox-wag 0.5s ease-in-out infinite; }
.pose-happy .eyes-open { display: none; }
.pose-happy .eyes-closed { display: block; }
@keyframes fox-wag {
  0%, 100% { transform: rotate(-10deg); }
  50% { transform: rotate(16deg); }
}
</style>
