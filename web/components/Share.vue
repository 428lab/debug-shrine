<template>
  <div class="">
    <div v-if="title !== ''" class="small text-muted">{{ title }}</div>
    <!-- 全文(text)指定時は編集可能なテキストエリアを表示し、
         コピー・シェアシートには編集後のテキストを使う -->
    <div v-if="text" class="mt-2 content-narrow">
      <textarea
        class="form-control share-text-area"
        rows="4"
        v-model="editableText"
      ></textarea>
    </div>
    <!-- 「シェアする」とアイコンは 1 行。並びの軸は置かれた画面に合わせる(align) -->
    <div
      class="d-flex flex-wrap align-items-center gap-2 mt-2"
      :class="align === 'start' ? 'justify-content-start' : 'justify-content-center'"
    >
      <!-- 対応環境(主にモバイル)ではOSのシェアシートを一次導線にする -->
      <button
        v-if="canWebShare"
        type="button"
        class="btn btn-ghost btn-sm"
        @click="webShare"
      >
        <i class="fas fa-share-alt fa-fw"></i>
        シェアする
      </button>
      <a
        :href="xUrl"
        class="btn btn-icon"
        target="_blank"
        aria-label="Xでシェア"
      >
        <IconX />
      </a>
      <a
        :href="blueskyUrl"
        class="btn btn-icon brand-bluesky"
        target="_blank"
        aria-label="Blueskyでシェア"
      >
        <IconBluesky />
      </a>
      <a
        :href="facebookUrl"
        class="btn btn-icon brand-facebook"
        target="_blank"
        aria-label="Facebookでシェア"
      >
        <i class="fab fa-facebook fa-fw"></i>
      </a>
      <button
        type="button"
        class="btn btn-icon"
        :aria-label="copied ? 'コピーしました' : 'シェア文面をコピー'"
        @click="copy"
      >
        <i class="fas fa-fw" :class="copied ? 'fa-check' : 'fa-copy'"></i>
      </button>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    message: { type: String, default: "" },
    // コピー・シェアシート用の全文(URLやハッシュタグ込み)。
    // 未指定の場合は message + url を使う。
    text: { type: String, default: "" },
    // ボタン行の並び。center(参拝・おみくじ) / start(カード内のマイページ・公開プロフィール)
    align: { type: String, default: "center" },
  },
  data() {
    return {
      canWebShare: false,
      copied: false,
      resetTimer: null,
      editableText: this.text,
    };
  },
  watch: {
    text(value) {
      this.editableText = value;
    },
  },
  mounted() {
    this.canWebShare = typeof navigator !== "undefined" && !!navigator.share;
  },
  beforeDestroy() {
    clearTimeout(this.resetTimer);
  },
  computed: {
    // コピー用の全文(テキストエリアで編集した内容を優先)
    fullText() {
      if (this.editableText) return this.editableText;
      return [this.message, this.url].filter(Boolean).join("\n");
    },
    // 直リンクは短文+URL(全文はintentには長すぎる)
    shortText() {
      return [this.message, this.url].filter(Boolean).join("\n");
    },
    xUrl() {
      return (
        "https://x.com/intent/post?url=" +
        encodeURIComponent(this.url) +
        "&text=" +
        encodeURIComponent(this.message) +
        "&hashtags=でばっぐ神社"
      );
    },
    blueskyUrl() {
      return (
        "https://bsky.app/intent/compose?text=" +
        encodeURIComponent(this.shortText)
      );
    },
    facebookUrl() {
      return (
        "https://www.facebook.com/sharer/sharer.php?u=" +
        encodeURIComponent(this.url)
      );
    },
  },
  methods: {
    async webShare() {
      try {
        // 全文(URL込み)がある場合はそれを、無い場合は message + url を渡す
        if (this.editableText) {
          await navigator.share({ text: this.editableText });
        } else {
          await navigator.share({ text: this.message, url: this.url });
        }
      } catch (e) {
        // ユーザーによるシェアシートのキャンセルは正常系なので何もしない
      }
    },
    async copy() {
      await navigator.clipboard.writeText(this.fullText);
      this.copied = true;
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        this.copied = false;
      }, 2000);
    },
  },
};
</script>

<style scoped>
.share-text-area {
  resize: vertical;
}
/* ブランド色はベタ塗りでなくアイコンの色で出す(X は黒なので文字色のまま) */
.brand-bluesky,
.brand-bluesky:hover {
  color: var(--color-bluesky);
}
.brand-facebook,
.brand-facebook:hover {
  color: var(--color-facebook);
}
</style>
