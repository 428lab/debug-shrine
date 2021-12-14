import { getAuth, signOut } from 'firebase/auth';

export const state = () => ({
  user: null
})

export const mutations = {
  login(state, user) {
    state.user = user
  },
  logout(state) {
    const auth = getAuth();

    signOut(auth).then(() => {
      console.log("LOGOUT");

      state.user = null;

      // redirect
      this.$router.push('/');
    });
  }
}

export const getters = {
  isLogin(state) {
    return !!state.user;
  },
}
