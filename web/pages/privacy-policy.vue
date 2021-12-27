<template>
  <div v-html="article"></div>
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
