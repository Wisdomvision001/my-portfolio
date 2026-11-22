import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInAdminWithGoogle(): Promise<{ user: User; idToken: string }> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  const idToken = await credential.user.getIdToken();
  return { user: credential.user, idToken };
}

export async function getCurrentAdminIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export async function signOutAdmin(): Promise<void> {
  await signOut(auth);
}

export function subscribeAdminAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

function clampString(value: unknown, maxLen: number): string {
  return String(value ?? '').trim().slice(0, maxLen);
}

export async function syncAdminProfileAndAudit(
  user: User,
  action: 'login' | 'logout' = 'login'
): Promise<void> {
  const uid = clampString(user.uid, 128);
  const email = clampString(user.email, 160).toLowerCase();
  const displayName = clampString(user.displayName, 120);
  if (!uid || !email || !/^[a-zA-Z0-9_-]+$/.test(uid)) return;

  const adminPath = `admins/${uid}`;
  const adminRef = doc(db, 'admins', uid);

  if (action === 'login') {
    let existsAlready = false;
    try {
      const snap = await getDoc(adminRef);
      existsAlready = snap.exists();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, adminPath);
    }

    try {
      if (!existsAlready) {
        await setDoc(adminRef, {
          uid,
          email,
          displayName,
          role: 'admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        });
      } else {
        await updateDoc(adminRef, {
          displayName,
          updatedAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, existsAlready ? OperationType.UPDATE : OperationType.CREATE, adminPath);
    }
  }

  const auditPath = 'adminAuditLogs';
  const userAgent = clampString(typeof navigator !== 'undefined' ? navigator.userAgent : '', 240);
  try {
    await addDoc(collection(db, auditPath), {
      uid,
      email,
      action,
      userAgent,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, auditPath);
  }
}
