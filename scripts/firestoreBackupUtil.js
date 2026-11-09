/**
 * ตัวช่วยร่วมสำหรับสคริปต์ migrate/restore: เชื่อม Firestore + serialize/deserialize ชนิดข้อมูลพิเศษ
 * (Timestamp, GeoPoint, DocumentReference, Bytes) เพื่อให้ backup แล้ว restore กลับได้ตรงเดิม
 */
const { initializeApp } = require('firebase/app');
const { getFirestore, Timestamp, GeoPoint, DocumentReference, Bytes, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'cmg-hr-database.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'cmg-hr-database',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'cmg-hr-database.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '625046761441',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:625046761441:web:22493e0b56a984cf5daca0',
};

const db = getFirestore(initializeApp(firebaseConfig));

const serialize = (v) => {
  if (v instanceof Timestamp) return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof GeoPoint) return { __type: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return { __type: 'ref', path: v.path };
  if (v instanceof Bytes) return { __type: 'bytes', base64: Buffer.from(v.toUint8Array()).toString('base64') };
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialize(x)]));
  return v;
};

const deserialize = (v) => {
  if (Array.isArray(v)) return v.map(deserialize);
  if (v && typeof v === 'object') {
    if (v.__type === 'timestamp') return new Timestamp(v.seconds, v.nanoseconds);
    if (v.__type === 'geopoint') return new GeoPoint(v.latitude, v.longitude);
    if (v.__type === 'ref') return doc(db, v.path);
    if (v.__type === 'bytes') return Bytes.fromUint8Array(new Uint8Array(Buffer.from(v.base64, 'base64')));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deserialize(x)]));
  }
  return v;
};

module.exports = { db, serialize, deserialize };
