export const state = () => ({
  user: null
})

export const mutations = {
  login(state, user) {
    state.user = user
  },
  logout(state) {
    state.user = null
  }
}

export const getters = {
  isLogin(state) {
    return !!state.user;
  },
}
