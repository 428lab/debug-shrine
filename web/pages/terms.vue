<template>
  <div v-html="article"></div>
</template>

<script>
import article from '~/static/terms/termsOfService.md';

export default {
  computed: {
    article() {
      return article;
    }
  }
}
</script>
