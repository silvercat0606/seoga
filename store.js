// 저장소: Firebase 설정이 있으면 구글 로그인 + Firestore 동기화, 없으면 이 기기(localStorage)에만 저장
import { firebaseConfig } from './firebase-config.js';

const LS_KEY = 'seoga-state-v1';
const FB_VERSION = '10.12.2';

export const isCloud = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

export function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}
function saveLocal(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* 저장 공간 부족 등 */ }
}

export function createLocalStore(onState) {
  onState(loadLocal());
  // 같은 기기의 다른 탭에서 바뀌면 반영
  window.addEventListener('storage', (e) => { if (e.key === LS_KEY) onState(loadLocal()); });
  return { mode: 'local', save: saveLocal };
}

export async function createCloudStore({ onState, onAuth, onError }) {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } =
    await import(`${base}/firebase-auth.js`);
  const { getFirestore, doc, onSnapshot, setDoc } = await import(`${base}/firebase-firestore.js`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  const clientId = Math.random().toString(36).slice(2);

  let ref = null, unsub = null, timer = null, pending = null;

  onAuthStateChanged(auth, (user) => {
    if (unsub) { unsub(); unsub = null; }
    ref = user ? doc(db, 'users', user.uid) : null;
    onAuth(user);
    if (!user) return;
    unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) { onState(null); return; }
      const data = snap.data();
      if (data.by === clientId) return; // 내가 방금 저장한 것의 메아리
      try { onState(JSON.parse(data.state)); } catch { onState(null); }
    }, (err) => onError && onError(err));
  });

  function flush() {
    if (!ref || !pending) return;
    const state = pending; pending = null;
    setDoc(ref, { state: JSON.stringify(state), by: clientId, at: Date.now() })
      .catch((err) => onError && onError(err));
  }

  window.addEventListener('pagehide', flush);

  return {
    mode: 'cloud',
    save(state) {
      saveLocal(state); // 오프라인 대비 사본
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    },
    async signIn() {
      try { await signInWithPopup(auth, provider); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-environment') {
          await signInWithRedirect(auth, provider);
        } else throw e;
      }
    },
    signOut: () => { flush(); return signOut(auth); }
  };
}
