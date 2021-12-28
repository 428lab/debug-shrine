<template>
  <div class="container">
    <div v-html="article" class="p-2"></div>
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
