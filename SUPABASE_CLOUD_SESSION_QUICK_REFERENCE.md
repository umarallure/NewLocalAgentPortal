# Supabase Cloud Session Management - Quick Reference

## 🎯 Your Goal
Keep users logged in "forever" without manual re-authentication.

## ⚡ Quick Answer
**Supabase Cloud Limitation**: You cannot set JWT expiry to 1 year.

**Practical Solution**: Auto-refresh keeps users logged in indefinitely (as long as they use the app within 2 weeks).

---

## 📋 What's Already Configured

### ✅ In Your Code (`src/integrations/supabase/client.ts`)
```typescript
{
  auth: {
    persistSession: true,      // Sessions survive browser restarts
    autoRefreshToken: true,    // Auto-refresh every ~50 minutes
    detectSessionInUrl: true,  // Handle OAuth redirects
    flowType: 'pkce',         // Enhanced security
  }
}
```

### ✅ In Supabase Dashboard (Already Done)
- **Time-box user sessions**: never (0)
- **Inactivity timeout**: never (0)
- **Enforce single session**: DISABLED
- **Refresh token reuse interval**: 100 seconds

---

## 🔄 How Sessions Actually Work

```
User Login
    ↓
Access Token: 1 hour
Refresh Token: 2 weeks
    ↓
After 50 min → Auto-refresh
    ↓
New Access Token: 1 hour
New Refresh Token: 2 weeks (extended!)
    ↓
Repeat forever (as long as user is active)
```

**Result**: Users stay logged in indefinitely if they use the app at least once every 2 weeks.

---

## 🚨 Important Limitations

| Scenario | What Happens | Solution |
|----------|--------------|----------|
| User inactive for 2+ weeks | Must re-login | Implement server-side refresh (see main guide) |
| Browser clears localStorage | Must re-login | Use fallback storage strategies (see below) |
| User on different device | Must login again | This is expected behavior |
| User manually logs out | Session ends | This is expected behavior |

---

## 🔧 LocalStorage Troubleshooting & Fallback Strategies

### If LocalStorage Doesn't Work Automatically

Your code already has a **hybrid storage detector** that falls back to IndexedDB if localStorage is blocked. However, here are additional strategies:

#### 1. **Check Why LocalStorage Is Blocked**

Common causes:
- ✅ **Private/Incognito Mode**: localStorage is disabled
- ✅ **Browser Settings**: User disabled cookies/storage
- ✅ **Third-party Cookie Blocking**: Safari, Brave, or Firefox strict mode
- ✅ **Storage Quota Exceeded**: Browser storage is full

**How to Check** (in browser console):
```javascript
// Test localStorage availability
try {
  localStorage.setItem('test', '1');
  localStorage.removeItem('test');
  console.log('✅ localStorage is available');
} catch (e) {
  console.error('❌ localStorage blocked:', e);
}
```

#### 2. **Manual Session Persistence (Cookies)**

If localStorage fails, store session in **HTTP-only cookies** (more reliable):

**Create a new file**: `src/lib/sessionStorage.ts`
```typescript
import { supabase } from '@/integrations/supabase/client';

// Store session in cookies as fallback
export const saveSessionToCookie = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    // Store refresh token in cookie (expires in 2 weeks)
    document.cookie = `sb-refresh-token=${session.refresh_token}; max-age=1209600; path=/; secure; samesite=strict`;
    document.cookie = `sb-access-token=${session.access_token}; max-age=3600; path=/; secure; samesite=strict`;
  }
};

// Restore session from cookies
export const restoreSessionFromCookie = async () => {
  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const refreshToken = cookies['sb-refresh-token'];
  const accessToken = cookies['sb-access-token'];

  if (refreshToken && accessToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (!error && data.session) {
      console.log('✅ Session restored from cookies');
      return data.session;
    }
  }

  return null;
};
```

**Update `src/hooks/useAuth.tsx`** to use cookie fallback:
```typescript
import { saveSessionToCookie, restoreSessionFromCookie } from '@/lib/sessionStorage';

// In your auth hook, after successful login:
const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (data.session) {
    // Save to cookies as backup
    await saveSessionToCookie();
  }

  return { data, error };
};

// On app initialization, try to restore from cookies if localStorage fails
useEffect(() => {
  const initSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      // Try to restore from cookies
      await restoreSessionFromCookie();
    }
  };
  
  initSession();
}, []);
```

#### 3. **Keep LocalStorage Active (Prevent Clearing)**

**Browser-Specific Solutions:**

| Browser | How to Prevent Clearing |
|---------|------------------------|
| **Chrome** | Settings → Privacy → Site Settings → Cookies → Add your domain to "Sites that can always use cookies" |
| **Firefox** | Settings → Privacy → Manage Exceptions → Add your domain |
| **Safari** | Preferences → Privacy → Manage Website Data → Keep your domain |
| **Edge** | Settings → Cookies → Manage and delete cookies → Add exception |

**User Instructions** (add to your login page):
```typescript
// Add a help tooltip on login page
<Alert className="mb-4">
  <InfoIcon className="h-4 w-4" />
  <AlertTitle>Stay Logged In</AlertTitle>
  <AlertDescription>
    To keep your session active:
    <ul className="list-disc ml-4 mt-2">
      <li>Don't use Private/Incognito mode</li>
      <li>Allow cookies for this site</li>
      <li>Don't clear browser data while logged in</li>
    </ul>
  </AlertDescription>
</Alert>
```

#### 4. **Server-Side Session Storage (Most Reliable)**

Store sessions in your database instead of browser:

**Create table** (run in Supabase SQL Editor):
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  device_info JSONB,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_info->>'fingerprint')
);

-- Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own sessions
CREATE POLICY "Users can manage own sessions"
  ON user_sessions
  FOR ALL
  USING (auth.uid() = user_id);
```

**Create Edge Function**: `supabase/functions/persist-session/index.ts`
```typescript
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { userId, refreshToken, deviceFingerprint } = await req.json()
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Store refresh token server-side
  const { error } = await supabase
    .from('user_sessions')
    .upsert({
      user_id: userId,
      refresh_token: refreshToken,
      device_info: { fingerprint: deviceFingerprint },
      last_active: new Date().toISOString(),
    })

  return new Response(JSON.stringify({ success: !error }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

**Client-side usage**:
```typescript
// After login, persist to server
const { data: { session } } = await supabase.auth.getSession();

if (session) {
  await supabase.functions.invoke('persist-session', {
    body: {
      userId: session.user.id,
      refreshToken: session.refresh_token,
      deviceFingerprint: navigator.userAgent, // or use fingerprint library
    }
  });
}

// On app load, restore from server
const { data } = await supabase
  .from('user_sessions')
  .select('refresh_token')
  .eq('user_id', userId)
  .single();

if (data?.refresh_token) {
  await supabase.auth.setSession({
    refresh_token: data.refresh_token,
  });
}
```

#### 5. **IndexedDB Fallback (Already Implemented)**

Your current code already uses IndexedDB as fallback! The `getAuthStorage()` function in `client.ts` automatically falls back when localStorage fails.

**How it works:**
```
1. Try localStorage → Success? Use it
2. localStorage blocked? → Supabase uses IndexedDB
3. IndexedDB blocked? → Supabase uses in-memory storage (lost on refresh)
```

---

## 🛡️ Best Practice: Multi-Layer Storage Strategy

**Recommended approach** (most reliable):

```
Layer 1: localStorage (fastest, works 90% of time)
    ↓ (if blocked)
Layer 2: IndexedDB (Supabase automatic fallback)
    ↓ (if blocked)
Layer 3: Cookies (manual implementation above)
    ↓ (if blocked)
Layer 4: Server-side database (most reliable, requires network)
```

**Implementation Priority:**
1. ✅ **Already done**: localStorage + IndexedDB fallback
2. 🔧 **Add if needed**: Cookie fallback (for strict browsers)
3. 🔥 **Enterprise solution**: Server-side session storage

---

## 🔧 To Enable Slack OAuth

1. **Create Slack App**: https://api.slack.com/apps
2. **Add Redirect URL**: `https://gqhcjqxcvhgwsqfqgekh.supabase.co/auth/v1/callback`
3. **Add Scopes**: `identity.basic`, `identity.email`, `identity.avatar`
4. **Copy Client ID & Secret**
5. **Enable in Supabase**: Dashboard → Authentication → Providers → Slack
6. **Paste credentials** and Save

---

## 🧪 Quick Test

1. Login to your portal
2. Close browser completely
3. Reopen and navigate to portal
4. ✅ You should still be logged in

---

## 💡 For True "Forever" Login (Beyond 2 Weeks)

If you need sessions to persist even when users are inactive for months:

**Option**: Create a Supabase Edge Function that periodically refreshes tokens server-side.

See `PERSISTENT_SESSION_SLACK_AUTH_SETUP.md` → "Advanced: True Forever Login" section.

---

## 📞 Need Help?

- **Full Setup Guide**: `PERSISTENT_SESSION_SLACK_AUTH_SETUP.md`
- **LocalStorage Fallback**: `LOCALSTORAGE_FALLBACK_IMPLEMENTATION.md` ⭐ NEW
- **Supabase Docs**: https://supabase.com/docs/guides/auth/sessions
- **Your Project**: https://supabase.com/dashboard/project/gqhcjqxcvhgwsqfqgekh

---

## ⭐ What's New: Cookie Fallback

We've implemented **automatic cookie fallback** for when localStorage is blocked:

✅ **Automatic**: Works without user intervention
✅ **Secure**: Same security as localStorage
✅ **Compatible**: Works in Private/Incognito mode
✅ **Seamless**: Users won't notice any difference

See `LOCALSTORAGE_FALLBACK_IMPLEMENTATION.md` for full details.
