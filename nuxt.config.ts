// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  nitro: {
    preset: 'vercel-edge'
  },
  runtimeConfig: {
    OPENAI: process.env.OPENAI,
    APIKEY: process.env.APIKEY,
    MSI: process.env.MSI,
    APPID: process.env.APPID,
    PROJECTID: process.env.PROJECTID,
    FB: process.env.FB
  }
})
