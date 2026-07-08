import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Firebase Authのサインアウト検知はアプリ全体で1つの購読があれば足りる。
// 以前はミドルウェア実行(=ルート遷移)のたびに onAuthStateChanged を登録して
// 解除もしていなかったため、リスナーが遷移回数分だけ蓄積し、サインアウト時に
// logout アクションが多重dispatchされていた(router.push('/') の重複実行を含む)。
let authWatcherRegistered = false;

function watchFirebaseAuth(store) {
  if (authWatcherRegistered) return;
  authWatcherRegistered = true;
  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    // 既にログアウト済みの状態で重ねて logout を dispatch しない
    if (!user && store.state.user) {
      store.dispatch('logout');
    }
  });
}

export default function ({ redirect, store }) {
  if (!store.state.user) {
    return redirect('/');
  }
  watchFirebaseAuth(store);
}
