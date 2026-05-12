import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { AppRole } from "@/lib/apiAuth";

interface AuthContextValue {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const loginTimeStr = localStorage.getItem("auth_login_time");
        const now = Date.now();
        const TWELVE_HOURS = 12 * 60 * 60 * 1000;

        if (loginTimeStr && now - parseInt(loginTimeStr, 10) > TWELVE_HOURS) {
          localStorage.removeItem("auth_login_time");
          firebaseSignOut(auth).then(() => {
            setUser(null);
            setRole(null);
            setLoading(false);
          });
          return;
        } else if (!loginTimeStr) {
          localStorage.setItem("auth_login_time", now.toString());
        }

        // Read role from custom claims; no claim = legacy account treated as admin
        const tokenResult = await firebaseUser.getIdTokenResult();
        const claimedRole = tokenResult.claims.role as AppRole | undefined;
        setRole(claimedRole ?? "admin");
        setUser(firebaseUser);
      } else {
        localStorage.removeItem("auth_login_time");
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    intervalId = setInterval(() => {
      const loginTimeStr = localStorage.getItem("auth_login_time");
      if (loginTimeStr) {
        const now = Date.now();
        const TWELVE_HOURS = 12 * 60 * 60 * 1000;
        if (now - parseInt(loginTimeStr, 10) > TWELVE_HOURS) {
          localStorage.removeItem("auth_login_time");
          firebaseSignOut(auth);
        }
      }
    }, 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
