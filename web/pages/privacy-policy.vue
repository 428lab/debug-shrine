<template>
  <div v-html="article"></div>
</template>

<script>
import article from '~/static/terms/privacyPolicy.md';

export default {
  computed: {
    article() {
      return article;
    }
  }
}
</script>
