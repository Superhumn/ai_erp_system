# 🔧 Fix: Vercel Shows Code Instead of App

## Problem
When you visit your Vercel URL, you see raw code (source files) instead of the actual application.

## Quick Fix

### Step 1: Ensure `vercel.json` exists
The repository now includes a `vercel.json` file that tells Vercel how to build and serve the app.

### Step 2: Redeploy
```bash
vercel --prod
```

Or push to your connected GitHub branch to trigger auto-deployment.

## Why This Happens

Vercel needs explicit configuration for full-stack Node.js applications. Without `vercel.json`, Vercel may:
- Serve source files directly
- Not run the build process correctly
- Route requests incorrectly

## What the Fix Does

The `vercel.json` file configures:
1. **Build process** - Runs `npm run build` to create production files
2. **Routing** - Routes all requests through the Express server
3. **Output** - Points Vercel to the `dist` directory containing built files

## Verification Steps

After redeploying:

1. ✅ **Visit your URL** - Should show login page, not code
2. ✅ **Check network tab** - Should load JS/CSS bundles, not source files
3. ✅ **Test routes** - `/login`, `/api/*` should work

## If Still Showing Code

### Check 1: Verify Build Completed
```bash
vercel logs [deployment-url]
```

Look for:
- ✅ "Build successful"
- ✅ "dist/public" directory created
- ✅ "dist/index.js" file created

### Check 2: Environment Variables
Ensure these are set in Vercel dashboard:
- `DATABASE_URL` (required)
- `JWT_SECRET` (required, 32+ characters)
- `NODE_ENV=production`

### Check 3: Build Output
In Vercel dashboard → Deployments → Click your deployment → Build Logs

Should see:
```
> vite build
✓ built in [time]

> esbuild server/_core/index.ts
Done in [time]
```

### Check 4: Redeploy from Scratch
```bash
# Remove node_modules and rebuild
rm -rf node_modules package-lock.json
npm install
vercel --prod
```

## Common Causes

| Issue | Solution |
|-------|----------|
| No `vercel.json` | Add the file (now included) |
| Build failed | Check build logs for errors |
| Wrong directory | Verify `outputDirectory: "dist"` |
| Cached old build | Redeploy with `vercel --prod --force` |
| Missing dependencies | Run `npm install` before deploy |

## Test Locally First

Before deploying, test the production build locally:

```bash
# Build the app
npm run build

# Start production server
npm run start

# Visit http://localhost:3000
# Should show the app, not code
```

If it works locally but not on Vercel, the issue is in deployment configuration.

## Alternative: Check Deployment Settings

In Vercel Dashboard → Project Settings:

**Framework Preset:** `Other`

**Build & Development Settings:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

**Root Directory:** `.` (root of repo)

## Still Having Issues?

1. **Check Vercel Status:** [vercel-status.com](https://vercel-status.com)
2. **Review Build Logs:** Vercel Dashboard → Deployments → View logs
3. **Check Server Logs:** `vercel logs --follow`
4. **Contact Support:** Vercel support with deployment URL

## Related Documentation

- [HOW_TO_ACCESS.md](../HOW_TO_ACCESS.md) - Finding your Vercel URL
- [QUICK_START_VERCEL.md](../QUICK_START_VERCEL.md) - Complete deployment guide
- [docs/VERCEL_ACCESS_GUIDE.md](./VERCEL_ACCESS_GUIDE.md) - Troubleshooting guide

---

**Quick Summary:**
- ✅ `vercel.json` file added to repository
- ✅ Redeploy with `vercel --prod`
- ✅ Should now show app instead of code
