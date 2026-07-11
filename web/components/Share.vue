<template>
  <div class="">
    <div v-if="title !== ''">{{ title }}</div>
    <div class="mt-2">
      <a
        :href="xUrl"
        class="btn text-white bg-x"
        target="_blank"
        aria-label="Xでシェア"
      >
        <IconX />
      </a>
      <a
        :href="facebookUrl"
        class="btn text-white bg-facebook"
        target="_blank"
        aria-label="Facebookでシェア"
      >
        <i class="fab fa-facebook fa-lg fa-fw"></i>
      </a>
    </div>
  </div>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: {
    title: "",
    url: "",
    message: "",
  },
  computed: {
    xUrl() {
      return (
        "https://x.com/intent/post?url=" +
        encodeURIComponent(this.url) +
        "&text=" +
        encodeURIComponent(this.message) +
        "&hashtags=でばっぐ神社"
      );
    },
    facebookUrl() {
      return (
        "https://www.facebook.com/sharer/sharer.php?u=" +
        encodeURIComponent(this.url)
      );
    },
    // lineUrl() {
    //   return this.url;
    // },
  },
};
</script>
