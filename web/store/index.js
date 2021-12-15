import { getAuth, signOut } from 'firebase/auth';

export const state = () => ({
  user: null
})

export const actions = {
  async logout({ commit }) {
    // ログアウト処理の呼び出し
    await commit('logout');

    // ログアウト後リダイレクト処理
    this.$router.push('/');
  }
}

export const mutations = {
  login(state, user) {
    state.user = user
  },
  async logout(state) {
    // 認証インスタンスの取得
    const auth = getAuth();

    // ログアウト処理
    await signOut(auth);
  }
}

export const getters = {
  isLogin(state) {
    return !!state.user;
  },
}
