// import createPersistedState from 'vuex-persistedstate'
import { getAuth, signOut, deleteUser } from 'firebase/auth';

export const state = () => ({
  user: null,
  token: null,
  ranking: [],
  myRanking: {},
})

export const getters = {
  isLogin: state => !!state.user,
  user: state => state.user,
  token: state => state.token,
  getRanking: state => state.ranking,
  getMyRanking: state => state.myRanking,
}

export const mutations = {
  setUser(state, user) {
    state.user = user;
  },
  setToken(state, token) {
    state.token = token;
  },
  setRanking(state, ranking) {
    state.ranking = ranking;
  },
  setMyRanking(state, myRanking) {
    state.myRanking = myRanking;
  },
  clear(state) {
    state.user = null;
    state.token = null;
  },
}

export const actions = {
  async logout({ commit }) {
    const auth = getAuth();
    await signOut(auth);
    commit("clear");
    this.$router.push('/');
  },
  async deleteUser({ commit }) {
    const auth = getAuth();
    const user = auth.currentUser;
    await deleteUser(user);
    commit("clear");
    this.$router.push('/');
  }
}
