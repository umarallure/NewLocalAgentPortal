/**
 * Session Storage Fallback Utilities
 * 
 * Provides cookie-based session persistence when localStorage is blocked
 * (e.g., Private mode, strict browser settings, Safari restrictions)
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Save current session to cookies as a fallback storage mechanism
 * Cookies are more reliable than localStorage in some browsers
 */
export const saveSessionToCookie = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Store refresh token in secure cookie (expires in 2 weeks)
      document.cookie = `sb-refresh-token=${session.refresh_token}; max-age=1209600; path=/; secure; samesite=strict`;
      
      // Store access token in secure cookie (expires in 1 hour)
      document.cookie = `sb-access-token=${session.access_token}; max-age=3600; path=/; secure; samesite=strict`;
      
      console.log('[Session Storage] ✅ Session saved to cookies');
      return true;
    }
  } catch (error) {
    console.error('[Session Storage] ❌ Failed to save to cookies:', error);
    return false;
  }
};

/**
 * Restore session from cookies when localStorage is unavailable
 */
export const restoreSessionFromCookie = async () => {
  try {
    // Parse cookies into key-value pairs
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    const refreshToken = cookies['sb-refresh-token'];
    const accessToken = cookies['sb-access-token'];

    if (refreshToken && accessToken) {
      console.log('[Session Storage] 🔄 Attempting to restore session from cookies...');
      
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!error && data.session) {
        console.log('[Session Storage] ✅ Session restored from cookies');
        
        // Update cookies with fresh tokens
        await saveSessionToCookie();
        
        return data.session;
      } else {
        console.warn('[Session Storage] ⚠️ Cookie session invalid:', error?.message);
        clearSessionCookies();
      }
    }

    return null;
  } catch (error) {
    console.error('[Session Storage] ❌ Failed to restore from cookies:', error);
    return null;
  }
};

/**
 * Clear session cookies (on logout or invalid session)
 */
export const clearSessionCookies = () => {
  document.cookie = 'sb-refresh-token=; max-age=0; path=/';
  document.cookie = 'sb-access-token=; max-age=0; path=/';
  console.log('[Session Storage] 🗑️ Session cookies cleared');
};

/**
 * Check if localStorage is available and working
 */
export const isLocalStorageAvailable = (): boolean => {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, '1');
    const value = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    return value === '1';
  } catch {
    return false;
  }
};

/**
 * Get storage status for debugging
 */
export const getStorageStatus = () => {
  const status = {
    localStorage: isLocalStorageAvailable(),
    cookies: navigator.cookieEnabled,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  };
  
  console.log('[Session Storage] Storage Status:', status);
  return status;
};
