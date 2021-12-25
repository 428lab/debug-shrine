// import createPersistedState from 'vuex-persistedstate'
import { getAuth, signOut, deleteUser } from 'firebase/auth';

export const state = () => ({
  user: null
})

export const getters = {
  isLogin(state) {
    return !!state.user;
  },
}

export const mutations = {
  login(state, user) {
    state.user = user;
  },
  clear(state) {
    state.user = null;
  },
}

export const actions = {
  async logout({ commit }) {
    const auth = getAuth();
    await signOut(auth);
    commit("clear");
    this.$router.push('/');
  },
  async deleateUser({ commit }) {
    const auth = getAuth();
    const user = auth.currentUser;
    await deleateUser(user);
    commit("clear");
    this.$router.push('/');
  }
}
