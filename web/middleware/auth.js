import { getAuth, onAuthStateChanged } from 'firebase/auth';

function firebaseAuthCheck(store) {
  return new Promise(resolve => {
    console.log('firebase_auth_check')
    // 認証インスタンスの取得
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        store.dispatch('logout');
      } else {
        store.commit('setToken', user.refreshToken);
        console.log('set_token')
      }
    });
    resolve();
  })
}

export default async function ({ redirect, store }) {
  if (!store.state.user) {
    return redirect('/');
  }
  await firebaseAuthCheck(store);
}
