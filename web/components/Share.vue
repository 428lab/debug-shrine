<template>
  <div class="">
    <div v-if="title !== ''">{{ title }}</div>
    <div class="mt-2">
      <a :href="twitterUrl" class="btn text-white bg-twitter" target="_blank">
        <img src="/brandlogo/twitter.svg" alt="" width="24px" />
        <span class="ms-2"> Twitter </span>
      </a>
      <a :href="facebookUrl" class="btn text-white bg-facebook" target="_blank">
        <img src="/brandlogo/facebook.svg" alt="" width="24px" />
        <span class="ms-2"> Facebook </span>
      </a>
      <!-- <a :href="lineUrl" class="btn text-white bg-line" target="_blank">
        <img src="/brandlogo/line.svg" alt="" width="24px" />
        <span class="ms-2"> LINE </span>
      </a> -->
    </div>
  </div>
</template>

<script>
import { mapGetters } from "vuex";

export default {
  props: {
    title: "",
    url: "",
  },
  computed: {
    ...mapGetters(["user"]),
    twitterUrl() {
      return (
        "https://twitter.com/share?url=" +
        encodeURIComponent(this.url) +
        "&text=" +
        encodeURIComponent(
          "これが" + this.user.display_name + "の でばっぐのうりょくだ！"
        ) +
        "&hashtags=でばっぐ神社"
      );
    },
    facebookUrl() {
      return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(this.url);
    },
    // lineUrl() {
    //   return this.url;
    // },
  },
};
</script>
