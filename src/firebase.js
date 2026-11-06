import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs,
  documentId,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA6yd2gE3hMTNJhIdmWnsTZEFZC5qAMWYM",
  authDomain: "turjeman-farm.firebaseapp.com",
  projectId: "turjeman-farm",
  storageBucket: "turjeman-farm.firebasestorage.app",
  messagingSenderId: "18714476580",
  appId: "1:18714476580:web:407c503dbc7c6b881998b1",
  measurementId: "G-GJL76ETK32",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

setPersistence(auth, browserLocalPersistence).catch(() => {});

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

function kvCollection(uid) {
  return collection(db, "users", uid, "kv");
}

export function createCloudStorage(uid) {
  return {
    async get(key) {
      try {
        const snap = await getDoc(doc(kvCollection(uid), key));
        return snap.exists() ? { key, value: snap.data().value } : null;
      } catch (e) {
        return null;
      }
    },
    async set(key, value) {
      await setDoc(doc(kvCollection(uid), key), {
        value,
        updatedAt: serverTimestamp(),
      });
      return { key, value };
    },
    async delete(key) {
      await deleteDoc(doc(kvCollection(uid), key));
      return { key, deleted: true };
    },
    async list(prefix) {
      if (!prefix) {
        const snap = await getDocs(query(kvCollection(uid), orderBy(documentId())));
        return { keys: snap.docs.map((d) => d.id) };
      }
      const endBound = prefix + "";
      const q = query(
        kvCollection(uid),
        orderBy(documentId()),
        startAt(prefix),
        endAt(endBound)
      );
      const snap = await getDocs(q);
      return { keys: snap.docs.map((d) => d.id) };
    },
  };
}
