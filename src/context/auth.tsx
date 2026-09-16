import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { effacerListesMemorisees } from '@/lib/cache-brouillons';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      // 16/09/2026 : la liste des brouillons memorisee sur l'appareil part avec
      // la session, y compris quand elle expire sans clic sur « Se deconnecter ».
      if (event === 'SIGNED_OUT') void effacerListesMemorisees();
      setSession(newSession);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await effacerListesMemorisees();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
