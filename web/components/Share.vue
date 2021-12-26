<template>
  <div>
    <div v-if="title !== ''">{{ title }}</div>
    <a :href="twitterUrl" class="btn text-white bg-twitter" target="_blank">
      <img src="/twitter.svg" alt="" width="24px" />
      <span class="ms-2"> Twitter </span>
    </a>
    <a :href="facebookUrl" class="btn text-white bg-facebook" target="_blank">
      <img src="/facebook.svg" alt="" width="24px" />
      <span class="ms-2"> Facebook </span>
    </a>
    <a :href="lineUrl" class="btn text-white bg-line" target="_blank">
      <img src="/line.svg" alt="" width="24px" />
      <span class="ms-2"> LINE </span>
    </a>
  </div>
</template>

<script>
export default {
  props: {
    title: "",
    url: "",
  },
  computed: {
    twitterUrl() {
      return this.url;
    },
    facebookUrl() {
      return this.url;
    },
    lineUrl() {
      return this.url;
    },
  },
};
</script>
