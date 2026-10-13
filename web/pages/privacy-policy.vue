<template>
  <div class="container pt-4 pt-lg-5 content-narrow">
    <div v-html="article" class="prose"></div>
  </div>
</template>

<script>
import article from "~/static/terms/privacyPolicy.md";

export default {
  asyncData() {
    return {
      article: article,
    };
  },
};
</script>
