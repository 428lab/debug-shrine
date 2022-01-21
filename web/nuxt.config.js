export default {
  // Disable server-side rendering (https://go.nuxtjs.dev/ssr-mode)
  ssr: false,

  // Target (https://go.nuxtjs.dev/config-target)
  target: 'static',

  publicRuntimeConfig: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL,
    appEnv: process.env.APP_ENV,
    authEmulatorUrl: process.env.FIREBASE_AUTH_EMULATOR_URL
  },

  // Global page headers (https://go.nuxtjs.dev/config-head)
  head: {
    htmlAttrs: {
      lang: 'ja'
    },
    title: 'でばっぐ神社',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'og:title', name: 'og:title', content:'でばっぐ神社' },
      { hid: 'og:site_name', name: 'og:site_name', content:'でばっぐ神社' },
      { hid: 'apple-mobile-web-app-title', name: 'apple-mobile-web-app-title', content:'でばっぐ神社' },
      { hid: 'og:url', name: 'og:url', content: process.env.BASE_URL|| 'http://localhost:3000' },
      { hid: 'description', name: 'description', content: 'バグった時の神頼み。' },
      { hid: 'og:description', name: 'og:description', content: 'バグった時の神頼み。' },
      { hid: 'og:image', property: 'og:image', content: process.env.BASE_URL+`ogimage.png`},

      { hid: 'twitter:card', property: 'twitter:card', content: 'summary_large_image'},
      { hid: 'twitter:image', property: 'twitter:image', content: process.env.BASE_URL+`ogimage.png`},
      { hid: 'twitter:site', property:'twitter:site', content: 'debug_shrine' },
      { hid: 'twitter:title', property:'twitter:title', content: 'でばっぐ神社' },
      // { hid: 'twitter:url', property:'twitter:url',content: process.env.BASE_URL|| 'http://localhost:3000' },
      { hid: 'twitter:description', property:'twitter:description', content: 'バグった時の神頼み。' },

    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
    ]
  },

  // Global CSS (https://go.nuxtjs.dev/config-css)
  css: [
    '~/assets/css/bootstrap.min.css',
    '~/assets/css/font.css',
    '~/assets/css/color.css',
    '~/assets/css/common.css',
  ],

  script: [
    { type: "text/javascript", src: "~/assets/js/bootstrap.bundle.min.js" },
    { type: "text/javascript", src: "~/assets/js/matter.js" }
  ],

  // Plugins to run before rendering page (https://go.nuxtjs.dev/config-plugins)
  plugins: [
    '~/plugins/persistedstate.js',
  ],

  // Auto import components (https://go.nuxtjs.dev/config-components)
  components: true,

  // Modules for dev and build (recommended) (https://go.nuxtjs.dev/config-modules)
  buildModules: [
  ],

  // Modules (https://go.nuxtjs.dev/config-modules)
  modules: [
    '@nuxtjs/axios',
    '@nuxtjs/pwa',
    '@nuxtjs/firebase',
    '@nuxtjs/markdownit',
    ['@nuxtjs/google-gtag', {
      id: process.env.GTM_ID ? process.env.GTM_ID : 'G-xxxxxxxx',
      debug: false,
    }]
  ],

  firebase:
  {
    config: {
      apiKey: process.env.API_KEY,
      authDomain: process.env.AUTH_DOMAIN,
      databaseURL: process.env.DATABASE_URL,
      projectId: process.env.PROJECT_ID,
      storageBucket: process.env.STORAGE_BUCKET,
      messagingSenderId: process.env.MESSAGING_SENDER_ID,
      appId: process.env.APP_ID
    },
    services: {
      auth: process.env.APP_ENV!=='local' ? true :
      {
        persistence: 'local', // default
        initialize: {
          onAuthStateChangedMutation: 'ON_AUTH_STATE_CHANGED_MUTATION',
          onAuthStateChangedAction: 'onAuthStateChangedAction',
          subscribeManually: false
        },
        ssr: false, // default
        emulatorPort: 9099,
        emulatorHost: 'http://localhost',
      }
    }
  },

  // Axios module configuration (https://go.nuxtjs.dev/config-axios)
  axios: {
    baseURL: process.env.API_URL
  },

  // pwa module configuration
  pwa: {
    manifest: {
      name: "でばっぐ神社",
      title: "でばっぐ神社",
      'og:title': 'でばっぐ神社',
      description: 'バグった時の神頼み。',
      'og:description': 'バグった時の神頼み。',
      lang: 'ja',
      theme_color: "#444444",
      background_color: "#000000",
      display: "standalone",
      scope: "/",
      start_url: "/"
    }
  },

  // Build Configuration (https://go.nuxtjs.dev/config-build)
  build: {
  },

  markdownit: {
    injected: true,   // $mdを使ってどこからでも使えるようになる
    breaks: true      // 改行を<br>に変換してくれる
  },
}
