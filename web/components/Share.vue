<template>
  <div class="">
    <div v-if="title !== ''">{{ title }}</div>
    <div class="mt-2">
      <a :href="twitterUrl" class="btn text-white bg-twitter" target="_blank">
        <i class="fab fa-twitter fa-lg fa-fw"></i>
        Twitter
      </a>
      <a :href="facebookUrl" class="btn text-white bg-facebook" target="_blank">
        <i class="fab fa-facebook fa-lg fa-fw"></i>
        Facebook
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
    twitterUrl() {
      return (
        "https://twitter.com/share?url=" +
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
