<template>
  <div v-html="article"></div>
</template>

<script>
import article from "~/static/terms/termsOfService.md";

export default {
  asyncData() {
    return {
      article: article,
    };
  },
};
</script>
