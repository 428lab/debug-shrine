// import createPersistedState from 'vuex-persistedstate'
import { getAuth, signOut, deleteUser } from 'firebase/auth';

export const state = () => ({
  user: null,
  token: null,
  ranking: {
    ranking: [],
    latest_update: null,
    myRanking: null,
  },
})

export const getters = {
  isLogin: state => !!state.user,
  user: state => state.user,
  token: state => state.token,
  getRanking: state => state.ranking,
}

export const mutations = {
  setUser(state, user) {
    state.user = user;
  },
  setToken(state, token) {
    state.token = token;
  },
  setRanking(state, data) {
    console.log(data);
    state.ranking.ranking = data.ranking;
    state.ranking.latest_update = data.latest_update;
    if(data.my_rank) state.ranking.myRanking = data.my_rank;
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
