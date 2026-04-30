import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  User 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  Timestamp, 
  runTransaction 
} from "firebase/firestore";

// Shared type definitions
export type UserRole = "MasterAdmin" | "MD" | "PD" | "HRM" | "HR" | "Admin Site" | "Staff";

export const ALL_ROLES: UserRole[] = ["MasterAdmin", "MD", "PD", "HRM", "HR", "Admin Site", "Staff"];

export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  role: UserRole[]; 
  status: 'pending' | 'approved' | 'rejected';
  assignedProjects: string[];
  createdAt: Timestamp;
  photoURL?: string;
  isFirstUser: boolean;
  columnPreferences?: Record<string, string[]>; // เก็บคอลัมน์ที่ซ่อนของแต่ละ module
}

interface AuthContextType {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<UserProfile | null>;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile | null>;
  registerWithEmail: (email: string, password: string, firstName: string, lastName: string, position: string) => Promise<UserProfile | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
  updateColumnPreferences: (moduleId: string, hiddenColumns: string[]) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

// Activity Logger
const logActivity = async (db: any, action: string, details: string, userEmail: string) => {
  try {
    const logRef = doc(getFirestore(), "CMG-HR-Database", "root", "activity_logs", Date.now().toString());
    await setDoc(logRef, {
      timestamp: new Date().toLocaleString("th-TH"),
      user: userEmail,
      module: "Authentication",
      action,
      details,
      createdAt: Date.now()
    }).catch(() => {});
  } catch (e) {
    // silently fail
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const auth = getAuth();
  const db = getFirestore();

  const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const docRef = doc(db, "CMG-HR-Database", "root", "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error("Failed to fetch profile", error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (firebaseUser) {
      const profile = await fetchProfile(firebaseUser.uid);
      setUserProfile(profile);
    }
  };

  const handleFirstUserLogic = async (uid: string, email: string, firstName: string, lastName: string, position: string, photoURL?: string): Promise<UserProfile> => {
    const configRef = doc(db, "CMG-HR-Database", "root", "appMeta", "config");
    const userRef = doc(db, "CMG-HR-Database", "root", "users", uid);
    
    return await runTransaction(db, async (transaction) => {
      const configDoc = await transaction.get(configRef);
      let isFirstUser = false;
      let totalUsers = 0;
      
      if (!configDoc.exists() || !configDoc.data().firstUserRegistered) {
        isFirstUser = true;
        totalUsers = 1;
        transaction.set(configRef, {
          firstUserRegistered: true,
          totalUsers: 1,
          createdAt: Timestamp.now()
        });
      } else {
        totalUsers = configDoc.data().totalUsers + 1;
        transaction.update(configRef, { totalUsers });
      }

      const profile: UserProfile = {
        uid,
        email,
        firstName,
        lastName,
        position,
        role: isFirstUser ? ["MasterAdmin"] : ["Staff"],
        status: isFirstUser ? 'approved' : 'pending',
        assignedProjects: [],
        createdAt: Timestamp.now(),
        photoURL: photoURL || "",
        isFirstUser
      };

      transaction.set(userRef, profile);
      return profile;
    });
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      let profile = await fetchProfile(user.uid);
      
      if (!profile) {
        // New user auto-registration
        profile = await handleFirstUserLogic(
          user.uid, 
          user.email || "", 
          user.displayName?.split(' ')[0] || "", 
          user.displayName?.split(' ').slice(1).join(' ') || "", 
          "Employee",
          user.photoURL || ""
        );
        logActivity(db, "REGISTER", `Google Auto-Register: ${user.email}`, user.email || "");
      }
      
      logActivity(db, "LOGIN", `Google Login: ${user.email}`, user.email || "");
      
      setFirebaseUser(user);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const profile = await fetchProfile(result.user.uid);
    logActivity(db, "LOGIN", `Email Login: ${email}`, email);
    setFirebaseUser(result.user);
    setUserProfile(profile);
    return profile;
  };

  const registerWithEmail = async (email: string, password: string, firstName: string, lastName: string, position: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const profile = await handleFirstUserLogic(result.user.uid, email, firstName, lastName, position);
    logActivity(db, "REGISTER", `Email Register: ${email}`, email);
    setFirebaseUser(result.user);
    setUserProfile(profile);
    return profile;
  };

  const logout = async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setUserProfile(null);
  };

  const hasRole = (roles: UserRole[]) => {
    if (!userProfile) return false;
    // MasterAdmin overriding can be here if needed, but let's stick to literal matches or MasterAdmin inclusion
    if (userProfile.role.includes("MasterAdmin")) return true;
    return roles.some(role => userProfile.role.includes(role));
  };

  const updateColumnPreferences = async (moduleId: string, hiddenColumns: string[]) => {
    if (!firebaseUser) return;
    
    try {
      const userRef = doc(db, "CMG-HR-Database", "root", "users", firebaseUser.uid);
      const currentPrefs = userProfile?.columnPreferences || {};
      const updatedPrefs = {
        ...currentPrefs,
        [moduleId]: hiddenColumns
      };
      
      await setDoc(userRef, {
        columnPreferences: updatedPrefs
      }, { merge: true });
      
      // Update local state
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          columnPreferences: updatedPrefs
        });
      }
    } catch (error) {
      console.error("Failed to update column preferences", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        const profile = await fetchProfile(user.uid);
        setUserProfile(profile);
      } else {
        setFirebaseUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      firebaseUser,
      userProfile,
      loading,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      logout,
      refreshProfile,
      hasRole,
      updateColumnPreferences
    }}>
      {children}
    </AuthContext.Provider>
  );
};
