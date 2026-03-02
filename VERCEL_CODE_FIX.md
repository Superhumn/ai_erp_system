# 🚨 QUICK FIX: Seeing Code Instead of App on Vercel

## Your Problem
When you visit your Vercel URL, you see raw code or source files instead of the actual application.

## The Solution (2 Steps)

### Step 1: The fix is already in your repo
A `vercel.json` configuration file has been added to your repository. This tells Vercel how to properly build and serve your full-stack application.

### Step 2: Redeploy
```bash
vercel --prod
```

**That's it!** Your app should now display correctly.

---

## Alternative: Deploy via Dashboard

If you deployed via GitHub integration:
1. Go to Vercel Dashboard
2. Find your project
3. Click "Redeploy" on the latest deployment
4. Wait for build to complete

---

## What to Expect After Redeploying

✅ **Before:** Raw code files, or directory listing  
✅ **After:** Login page with email/password form

If you still see code after redeploying, check:
- Build logs show "Build successful"
- Environment variables are set (DATABASE_URL, JWT_SECRET)

---

## Finding Your Vercel URL

**Option 1: Terminal Output**
When you ran `vercel`, it showed:
```
✅ Production: https://your-project.vercel.app
```

**Option 2: Vercel Dashboard**
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click your project
3. URL is at the top

**Option 3: CLI Command**
```bash
vercel ls
```
Shows all your deployments with URLs.

---

## Full Explanation

**Why this happened:**
- Vercel needs a `vercel.json` file to know it's a full-stack Node.js app
- Without it, Vercel might serve source files instead of running the build
- The `vercel.json` file configures the build process and routing

**What the fix does:**
- Tells Vercel to run `npm run build`
- Points to the `dist` directory for output
- Routes all requests through the Express server
- Ensures static files are served correctly

---

## Still Having Issues?

### Check 1: Build Logs
```bash
vercel logs [your-deployment-url]
```
Look for: "Build successful" and "dist/public" created

### Check 2: Environment Variables
Must be set in Vercel dashboard:
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - 32+ characters (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `NODE_ENV` - Set to "production"

### Check 3: Force Rebuild
```bash
vercel --prod --force
```

### Check 4: Detailed Guide
See [docs/FIX_VERCEL_CODE_DISPLAY.md](./docs/FIX_VERCEL_CODE_DISPLAY.md) for complete troubleshooting.

---

## Quick Checklist

After redeploying, verify:
- [ ] Visit URL shows login page (not code)
- [ ] Can click "Sign up"
- [ ] Browser console has no major errors
- [ ] Network tab shows bundled JS/CSS files loading

**All good?** You're ready to create your first user! Click "Sign up" and the first user becomes admin automatically.

---

**Need more help?**
- [HOW_TO_ACCESS.md](./HOW_TO_ACCESS.md) - Visual guide
- [ACCESS_FAQ.md](./ACCESS_FAQ.md) - 29+ common questions
- [QUICK_START_VERCEL.md](./QUICK_START_VERCEL.md) - Full deployment guide
