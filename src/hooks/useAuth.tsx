import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  saveSessionToCookie, 
  restoreSessionFromCookie, 
  clearSessionCookies,
  isLocalStorageAvailable,
  getStorageStatus
} from '@/lib/sessionStorage';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Log storage status on initialization
    const storageStatus = getStorageStatus();
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] State change:', event);
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Save to cookies as fallback when session changes
        if (session && event === 'SIGNED_IN') {
          await saveSessionToCookie();
        } else if (event === 'SIGNED_OUT') {
          clearSessionCookies();
        }
      }
    );

    // Get initial session
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // If no session in localStorage, try to restore from cookies
      if (!session && !storageStatus.localStorage) {
        console.log('[Auth] localStorage unavailable, attempting cookie restore...');
        const restoredSession = await restoreSessionFromCookie();
        
        if (restoredSession) {
          setSession(restoredSession);
          setUser(restoredSession.user);
        }
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      
      setLoading(false);
    };
    
    initSession();

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      toast({
        title: "Error signing in",
        description: error.message,
        variant: "destructive",
      });
    } else {
      // Save session to cookies as fallback
      if (data.session) {
        await saveSessionToCookie();
      }
      
      toast({
        title: "Welcome back!",
        description: "You have been signed in successfully.",
      });
    }
    
    return { error };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
        },
      },
    });
    
    if (error) {
      toast({
        title: "Error signing up",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Account created!",
        description: "Please check your email to confirm your account.",
      });
    }
    
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    
    // Clear cookie fallback storage
    clearSessionCookies();
    
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
    }
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};