import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  writeBatch,
  getDocFromServer
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfigJson from "../../firebase-applet-config.json";

// Firebase configuration from provisioned environment
export const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey || "AIzaSyAjX0svKkka7hHi2APIzEPGJC55fuB618Q",
  authDomain: firebaseConfigJson.authDomain || "excelencia-operacional-2fc2b.firebaseapp.com",
  projectId: firebaseConfigJson.projectId || "excelencia-operacional-2fc2b",
  storageBucket: firebaseConfigJson.storageBucket || "excelencia-operacional-2fc2b.firebasestorage.app",
  messagingSenderId: firebaseConfigJson.messagingSenderId || "585430751442",
  appId: firebaseConfigJson.appId || "1:585430751442:web:c1ad7a8d6ebc94d9a1b50b",
  firestoreDatabaseId: firebaseConfigJson.firestoreDatabaseId || "(default)"
};

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore Database connecting to the specified databaseId
let firestoreInstance;
try {
  // Use persistent local cache and force long polling for rock-solid stability across proxies and containers
  const isBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined";
  firestoreInstance = initializeFirestore(
    app, 
    { 
      localCache: isBrowser ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : undefined,
      experimentalForceLongPolling: true 
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch (e) {
  try {
    firestoreInstance = initializeFirestore(
      app,
      { experimentalForceLongPolling: true },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (e2) {
    firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = firestoreInstance;
export const dbDefault = firestoreInstance;
export const auth = getAuth(app);

// Test Firestore connection on boot as mandated in skill
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error: any) {
    const isOfflineOrUnavailable = 
      error?.code === "unavailable" ||
      (error instanceof Error && (
        error.message.includes("the client is offline") ||
        error.message.includes("unavailable") ||
        error.message.includes("Could not reach Cloud Firestore backend")
      ));

    if (isOfflineOrUnavailable) {
      console.info("Firestore status: Operating in resilient offline cache mode while connecting to backend.");
    } else {
      console.warn("Firestore connection check notice:", error?.message || error);
    }
    return false;
  }
}

// Perform connection validation in background after browser network settles
if (typeof window !== "undefined") {
  setTimeout(() => {
    testConnection().catch(() => {});
  }, 2000);
}

// Error handling contracts from Firebase Integration skill
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn("Firestore Notice:", JSON.stringify(errInfo));
  return errInfo;
}

export {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch
};
