import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, runTransaction, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { createCloudStore } from './cloud-state.js';

export const OWNER_UID = 'foBHfz9GrccA0ZgiTsXwTl8E8mh2';
const app = initializeApp({
  apiKey: 'AIzaSyDima78Usba0XZd--sN_ASD1qHO6w-xd3g',
  authDomain: 'xiaoyi-growth-planet.firebaseapp.com',
  projectId: 'xiaoyi-growth-planet',
  storageBucket: 'xiaoyi-growth-planet.firebasestorage.app',
  messagingSenderId: '746208018554',
  appId: '1:746208018554:web:d6db316c4002a454913bc3',
});
const auth = getAuth(app);
const db = getFirestore(app);
export const cloud = createCloudStore({ owner: OWNER_UID, ref: path => doc(db, path), run: action => runTransaction(db, action, { maxAttempts: 3 }) });
export const observeAuth = callback => onAuthStateChanged(auth, callback);
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const watch = (changed, failed) => onSnapshot(cloud.root, { includeMetadataChanges: true }, snapshot => {
  if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) changed();
}, failed);
