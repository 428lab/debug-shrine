<template>
  <div>
    <header>
      <CommonHeader />
    </header>
    <main>
      <Nuxt />
    </main>
    <footer>
      <CommonFooter />
    </footer>
  </div>
</template>

<style>
main {
  min-height: calc(100vh - 300px);
}
</style>
