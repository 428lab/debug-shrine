<template>
  <div class="share-text">
    <div v-if="title" class="fs-5 mb-2">{{ title }}</div>
    <textarea
      class="form-control share-text-area"
      rows="4"
      v-model="editableText"
    ></textarea>
    <button
      type="button"
      class="btn btn-primary mt-2"
      :class="{ copied: copied }"
      @click="copy"
    >
      <i class="fas fa-copy fa-fw"></i>
      {{ copied ? "コピーしました！" : "クリップボードにコピー" }}
    </button>
  </div>
</template>

<script>
// SNS投稿用テキストを表示し、ワンクリックでクリップボードへコピーするコンポーネント。
// テキストは編集可能にしてあるため、コピー前に手直しもできる。
export default {
  props: {
    text: { type: String, default: "" },
    title: { type: String, default: "" },
  },
  data() {
    return {
      editableText: this.text,
      copied: false,
      resetTimer: null,
    };
  },
  watch: {
    text(value) {
      this.editableText = value;
    },
  },
  beforeDestroy() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
  },
  methods: {
    async copy() {
      await navigator.clipboard.writeText(this.editableText);
      this.copied = true;
      if (this.resetTimer) clearTimeout(this.resetTimer);
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
.btn.copied {
  background-color: #2e7d32;
  border-color: #2e7d32;
}
</style>
