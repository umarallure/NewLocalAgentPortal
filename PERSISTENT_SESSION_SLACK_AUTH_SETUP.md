# Persistent Sessions & Slack Authentication Setup Guide

## ⚠️ CRITICAL: Supabase Cloud Reality Check

You're using **Supabase Cloud** (hosted at supabase.com), which means:

### What You CANNOT Control:
- ❌ **JWT Expiry**: Fixed at ~1 hour (cannot be changed)
- ❌ **Refresh Token Lifetime**: Fixed at ~2 weeks (cannot be changed)
- ❌ **config.toml changes**: Completely ignored by Supabase Cloud
- ❌ **GoTrue service config**: Fully managed by Supabase, no access

### What You CAN Control:
- ✅ **Auto-refresh behavior**: Keep tokens fresh automatically
- ✅ **Session persistence**: Store sessions across browser restarts
- ✅ **OAuth providers**: Enable Slack, Google, etc.
- ✅ **Session settings**: Timeout, single session enforcement, etc.

## ✅ How "Forever Login" Actually Works on Cloud

Even though individual tokens expire quickly, you can achieve **practically infinite sessions** through:

1. **Auto-refresh**: Tokens refresh automatically before expiry
2. **Refresh token renewal**: Each refresh extends the refresh token by 2 weeks
3. **Persistent storage**: Sessions survive browser restarts
4. **Result**: Users stay logged in indefinitely as long as they use the app at least once every 2 weeks

## 🔧 Changes Made to Your Code

### 1. Supabase Client Configuration (`src/integrations/supabase/client.ts`)
```typescript
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: authStorage,           // localStorage or IndexedDB fallback
    persistSession: true,            // ✅ Survive browser restarts
    autoRefreshToken: true,          // ✅ Auto-refresh before expiry
    detectSessionInUrl: true,        // ✅ Handle OAuth redirects
    flowType: 'pkce',               // ✅ Enhanced security
  }
});
```

### 2. Slack OAuth Integration (`src/pages/Auth.tsx`)
- Added "Continue with Slack" button
- Implemented OAuth flow with automatic redirect
- Added visual separator between login methods
- Included Slack branding

## 🔧 Required Supabase Cloud Dashboard Configuration

### Step 1: Enable Slack OAuth Provider

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/gqhcjqxcvhgwsqfqgekh
2. Navigate to **Authentication** → **Providers**
3. Find **Slack** in the provider list
4. Click **Enable**
5. You'll need to create a Slack App first:

#### Create Slack App:
1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name: "Unlimited Insurance Agent Portal"
4. Select your Slack workspace
5. Click **Create App**

#### Configure Slack App:
1. In your Slack app settings, go to **OAuth & Permissions**
2. Add **Redirect URLs**:
   ```
   https://gqhcjqxcvhgwsqfqgekh.supabase.co/auth/v1/callback
   http://localhost:54321/auth/v1/callback (for local development)
   ```
3. Under **Scopes** → **User Token Scopes**, add:
   - `identity.basic`
   - `identity.email`
   - `identity.avatar`

4. Go to **Basic Information**
5. Copy **Client ID** and **Client Secret**

#### Add Credentials to Supabase:
1. Back in Supabase Dashboard → **Authentication** → **Providers** → **Slack**
2. Paste **Client ID** (from Slack app)
3. Paste **Client Secret** (from Slack app)
4. Click **Save**

### Step 2: Configure Session Settings (Already Done in Screenshots)

Verify these settings in **Authentication** → **Settings**:

#### User Sessions:
- ✅ **Enforce single session per user**: DISABLED
- ✅ **Time-box user sessions**: Set to "never" (0)
- ✅ **Inactivity timeout**: Set to "never" (0)

#### Refresh Tokens:
- ✅ **Detect and revoke potentially compromised refresh tokens**: ENABLED
- ✅ **Refresh token reuse interval**: 100 seconds (already configured)

### Step 3: Configure Session Settings in Dashboard

Go to **Authentication** → **Settings** → **User Sessions**:

#### Recommended Settings for "Forever Login":
- ✅ **Enforce single session per user**: DISABLED (allow multiple devices)
- ✅ **Time-box user sessions**: Set to "never" (0)
- ✅ **Inactivity timeout**: Set to "never" (0)

#### Refresh Token Settings:
- ✅ **Detect and revoke potentially compromised refresh tokens**: ENABLED (security)
- ✅ **Refresh token reuse interval**: 100 seconds (prevents token replay attacks)

**Note**: These settings are already configured correctly in your screenshots!

## 🚀 How It Actually Works (Supabase Cloud)

### Real Token Lifecycle:
```
Login 
  ↓
Access Token (JWT) - expires in 1 hour
Refresh Token - expires in 2 weeks
  ↓
After 50 minutes: Auto-refresh triggered
  ↓
New Access Token (1 hour)
New Refresh Token (2 weeks from now) ← This is key!
  ↓
Repeat every hour while user is active
  ↓
Result: Infinite session as long as app is used within 2 weeks
```

### What Happens:
1. **Initial Login**: User signs in → gets access token (1h) + refresh token (2w)
2. **Auto-Refresh**: Before 1 hour expires, client automatically refreshes
3. **Token Renewal**: Each refresh gives a NEW refresh token valid for 2 more weeks
4. **Persistence**: Session stored in localStorage/IndexedDB
5. **Result**: User stays logged in forever if they use the app at least once every 2 weeks

### Edge Cases:
- **User inactive for 2+ weeks**: Must re-login (refresh token expired)
- **Browser clears storage**: Must re-login (session lost)
- **User on different device**: Must login again (session is device-specific)

### Slack OAuth Flow:
1. User clicks "Continue with Slack"
2. Redirected to Slack authorization page
3. User approves access
4. Slack redirects back to your app with auth code
5. Supabase exchanges code for user session
6. User automatically redirected to dashboard
7. Session persists forever (same as email/password)

## 🔒 Security Considerations

### Why This Is Safe:
1. **PKCE Flow**: Prevents authorization code interception
2. **Refresh Token Rotation**: New refresh token issued on each use
3. **Compromise Detection**: Supabase detects and revokes compromised tokens
4. **Secure Storage**: Uses browser's secure storage mechanisms

### Best Practices:
- Sessions persist across browser restarts
- Users should manually sign out on shared devices
- Consider adding "Remember this device" checkbox if needed
- Monitor auth logs for suspicious activity

## 🧪 Testing

### Test 1: Persistent Sessions (Browser Restart)
1. Sign in to the portal
2. Close browser completely
3. Reopen browser and navigate to portal
4. ✅ **Expected**: Still logged in (session restored from localStorage)

### Test 2: Slack OAuth
1. Click "Continue with Slack" on login page
2. Authorize the app in Slack
3. ✅ **Expected**: Redirect to dashboard
4. Close browser and reopen
5. ✅ **Expected**: Still logged in

### Test 3: Auto-Refresh (Watch It Happen)
1. Sign in and open DevTools → Console
2. Watch for Supabase auth logs
3. Wait ~50 minutes
4. ✅ **Expected**: See token refresh happen automatically
5. Check DevTools → Application → Local Storage → `supabase.auth.token`
6. ✅ **Expected**: `expires_at` timestamp should update

### Test 4: 2-Week Inactivity (Edge Case)
1. Sign in to the portal
2. Don't use the app for 2+ weeks
3. Try to access the portal
4. ✅ **Expected**: Redirected to login (refresh token expired)

### Test 5: Multiple Devices
1. Sign in on Device A
2. Sign in on Device B
3. ✅ **Expected**: Both sessions work (single session enforcement is disabled)

## � Advanced: True "Forever Login" (Beyond 2 Weeks)

If you need sessions to last longer than 2 weeks (even when user is inactive), you have two options:

### Option 1: Server-Side Token Refresh (Recommended)

Create a Supabase Edge Function that stores and refreshes tokens:

```typescript
// supabase/functions/refresh-session/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { userId } = await req.json()
  
  // Fetch stored refresh token from your database
  const { data: tokenData } = await supabase
    .from('user_sessions')
    .select('refresh_token')
    .eq('user_id', userId)
    .single()
  
  // Refresh the session
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: tokenData.refresh_token
  })
  
  if (data.session) {
    // Store new refresh token
    await supabase
      .from('user_sessions')
      .update({ refresh_token: data.session.refresh_token })
      .eq('user_id', userId)
  }
  
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

Then call this function periodically (e.g., via cron job) to keep sessions alive.

### Option 2: Client-Side Manual Refresh

Store refresh token securely and manually restore session:

```typescript
// On app startup
const savedRefreshToken = localStorage.getItem('supabase_refresh_token')

if (savedRefreshToken) {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: savedRefreshToken
  })
  
  if (data.session) {
    // Session restored successfully
    localStorage.setItem('supabase_refresh_token', data.session.refresh_token)
  }
}
```

**⚠️ Security Warning**: Storing refresh tokens client-side is less secure. Use server-side approach for production.

## 🐛 Troubleshooting

### Sessions Not Persisting:

**Problem**: Users get logged out after closing browser

**Diagnosis**:
```javascript
// Run in browser console
try {
  localStorage.setItem('test', '1');
  localStorage.removeItem('test');
  console.log('✅ localStorage works');
} catch (e) {
  console.error('❌ localStorage blocked:', e.message);
}
```

**Solutions**:
1. ✅ **Check browser mode**: Not in Private/Incognito
2. ✅ **Check browser settings**: Cookies/storage enabled for your domain
3. ✅ **Check console**: Look for storage errors
4. ✅ **Verify config**: `persistSession: true` in client config
5. ✅ **Fallback already active**: Your code uses IndexedDB if localStorage fails

**If localStorage is permanently blocked**:
- Implement cookie-based storage (see Quick Reference guide)
- Use server-side session storage (most reliable)

### LocalStorage Blocked by Browser:

**Common Causes**:
- Private/Incognito mode
- Third-party cookie blocking (Safari, Brave, Firefox strict mode)
- Browser storage quota exceeded
- Corporate/school network restrictions

**Workarounds**:
1. **Cookie Fallback**: Store session in cookies (see Quick Reference)
2. **Server-Side Storage**: Store refresh tokens in database
3. **User Education**: Add instructions on login page

**Quick Fix** - Add to login page:
```typescript
<Alert>
  <AlertTitle>To stay logged in:</AlertTitle>
  <AlertDescription>
    • Don't use Private/Incognito mode
    • Allow cookies for this site
    • Don't clear browser data
  </AlertDescription>
</Alert>
```

### Slack OAuth Not Working:
1. Verify redirect URLs match exactly in Slack app settings
2. Check Client ID and Secret are correct in Supabase
3. Ensure Slack provider is enabled in Supabase Dashboard
4. Check browser console for OAuth errors

### Users Getting Logged Out After 2 Weeks:
1. This is expected (refresh token expiry)
2. Implement server-side token refresh for longer sessions
3. See "Advanced: True Forever Login" section above

### Auto-Refresh Not Working:
1. Check browser console for refresh errors
2. Verify `autoRefreshToken: true` in client config
3. Check network tab for `/auth/v1/token` calls
4. Review Supabase auth logs for errors

## � Summary Table

| Feature | Supabase Cloud Limitation | What You Can Do | Result |
|---------|---------------------------|-----------------|--------|
| JWT Expiry | Fixed at ~1 hour | Enable `autoRefreshToken: true` | Tokens refresh automatically |
| Refresh Token | Fixed at ~2 weeks | Each refresh extends by 2 weeks | Infinite if used regularly |
| Session Persistence | N/A | Enable `persistSession: true` | Survives browser restarts |
| Inactivity Timeout | Configurable in Dashboard | Set to "never" | No forced logout |
| Multiple Devices | Configurable in Dashboard | Disable single session | Users can login on multiple devices |
| True "Forever" | Not possible directly | Use server-side refresh daemon | Can extend beyond 2 weeks |

## 🎯 Bottom Line

**For Supabase Cloud:**
- ✅ Users will stay logged in **indefinitely** if they use the app at least once every 2 weeks
- ✅ Sessions persist across browser restarts
- ✅ Tokens refresh automatically every hour
- ⚠️ If inactive for 2+ weeks, users must re-login (this is a Supabase Cloud limitation)
- 💡 For true "forever" login, implement server-side token refresh (see Advanced section)

## �📚 References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Session Management](https://supabase.com/docs/guides/auth/sessions)
- [Slack OAuth Documentation](https://api.slack.com/authentication/oauth-v2)
- [PKCE Flow Explanation](https://oauth.net/2/pkce/)
- [Supabase Cloud Limitations](https://supabase.com/docs/guides/platform/going-into-prod)
