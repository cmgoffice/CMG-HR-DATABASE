const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'cmg-hr-database.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'cmg-hr-database',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'cmg-hr-database.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '625046761441',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:625046761441:web:22493e0b56a984cf5daca0',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const genderKeyCounts = {};
  const thaiGenderKeyCounts = {};
  let sampleWithGender = null;
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.gender !== undefined && String(data.gender).trim()) {
      genderKeyCounts[data.gender] = (genderKeyCounts[data.gender] || 0) + 1;
      if (!sampleWithGender) sampleWithGender = { id: d.id, ...data };
    }
    if (data['เพศ'] !== undefined && String(data['เพศ']).trim()) {
      thaiGenderKeyCounts[data['เพศ']] = (thaiGenderKeyCounts[data['เพศ']] || 0) + 1;
    }
  });
  console.log('field "gender" values:', JSON.stringify(genderKeyCounts));
  console.log('field "เพศ" values:', JSON.stringify(thaiGenderKeyCounts));
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
