import { getAuth, onAuthStateChanged } from 'firebase/auth';

export default function({redirect, store}) {
  // 認証インスタンスの取得
  const auth = getAuth();

  // 認証状況の確認
  onAuthStateChanged(auth, (user) => {
    if(!user) {
      // 非ログイン時ログアウト/リダイレクト処理の呼び出し
      store.dispatch('logout');
    }
  });
}
