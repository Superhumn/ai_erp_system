# Vercel Deployment Quick Start

**TL;DR:** How to deploy and access your AI ERP System on Vercel in 5 minutes.

## 🚀 Prerequisites

- [x] Node.js 18+ installed
- [x] GitHub account
- [x] Vercel account ([sign up free](https://vercel.com/signup))
- [x] MySQL database ([PlanetScale free tier](https://planetscale.com) recommended)

## ⚡ 5-Minute Deployment

### Step 1: Deploy to Vercel (2 min)

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to your project
cd ai_erp_system

# Deploy
vercel
```

Follow the prompts:
- **Set up and deploy?** Yes
- **Which scope?** Your personal account
- **Link to existing project?** No
- **Project name?** ai-erp-system (or your choice)
- **Directory?** ./ (default)
- **Override settings?** No

**Result:** You'll get a URL like `https://ai-erp-system-xxxxx.vercel.app`

### Step 2: Set Environment Variables (1 min)

#### Generate JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output.

#### Add to Vercel
```bash
vercel env add DATABASE_URL
# Paste your MySQL connection string

vercel env add JWT_SECRET
# Paste the JWT secret you generated

vercel env add NODE_ENV
# Enter: production
```

Or via [Vercel Dashboard](https://vercel.com/dashboard):
1. Go to your project → Settings → Environment Variables
2. Add:
   - `DATABASE_URL`: `mysql://user:pass@host:3306/database?ssl={"rejectUnauthorized":true}`
   - `JWT_SECRET`: (paste the generated secret)
   - `NODE_ENV`: `production`

### Step 3: Redeploy (1 min)

```bash
vercel --prod
```

This redeploys with your environment variables.

### Step 4: Setup Database (30 sec)

```bash
# Set DATABASE_URL in local .env
echo "DATABASE_URL=your-mysql-connection-string" > .env

# Run migrations
npm run db:push
```

This creates all required database tables.

### Step 5: Access Your App (30 sec)

1. **Visit:** `https://your-project.vercel.app`
2. **You'll see:** Login page
3. **Click:** "Sign up"
4. **Enter:**
   - Name: Your name
   - Email: your.email@company.com
   - Password: (min 8 characters)
5. **Click:** "Sign Up"
6. **Done!** You're logged in as admin

## 🎯 Quick Checklist

```
✅ Deployed to Vercel
✅ Set DATABASE_URL
✅ Set JWT_SECRET
✅ Ran database migrations
✅ Visited deployment URL
✅ Created first user (auto-admin)
✅ Dashboard loaded successfully
```

## 🔗 Your Deployment URLs

After deployment, you have:

- **Production:** `https://[your-project].vercel.app` (main)
- **Preview:** Automatic for each PR/branch
- **Logs:** [Vercel Dashboard](https://vercel.com/dashboard) → Your Project → Logs

## 🛟 Common Quick Fixes

### "Database connection failed"
```bash
# Verify DATABASE_URL is set
vercel env ls

# If not set or wrong, update it
vercel env rm DATABASE_URL
vercel env add DATABASE_URL
# Then redeploy
vercel --prod
```

### "Invalid JWT secret"
```bash
# Generate new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update in Vercel
vercel env rm JWT_SECRET
vercel env add JWT_SECRET
# Then redeploy
vercel --prod
```

### Build fails
```bash
# Check build logs
vercel logs [deployment-url]

# Common fix: ensure dependencies are installed
npm install
git add package-lock.json
git commit -m "Update dependencies"
git push
```

## 📚 Need More Details?

- **Full Access Guide:** [docs/VERCEL_ACCESS_GUIDE.md](./docs/VERCEL_ACCESS_GUIDE.md)
- **Deployment Guide:** [docs/STANDALONE_DEPLOYMENT.md](./docs/STANDALONE_DEPLOYMENT.md)
- **Main README:** [README.md](./README.md)

## 💡 Pro Tips

### Tip 1: Use PlanetScale for Easy Database
```bash
# 1. Create database at planetscale.com
# 2. Copy connection string
# 3. Add to Vercel
# 4. Done - no server management needed!
```

### Tip 2: Auto-Deploy on Git Push
In Vercel Dashboard:
1. Go to your project → Settings → Git
2. Connect your GitHub repository
3. Enable "Auto Deploy"
4. Now every push to `main` deploys automatically

### Tip 3: Add Custom Domain
```bash
# Via CLI
vercel domains add yourdomain.com

# Or in dashboard:
# Settings → Domains → Add → Enter domain
```

### Tip 4: Monitor Your App
```bash
# View real-time logs
vercel logs --follow

# Or check dashboard:
# Your Project → Logs (live stream)
```

## 🎊 Success!

You now have a fully deployed AI ERP System at:
**`https://[your-project].vercel.app`**

**Next steps:**
1. Invite team members (Settings → Team)
2. Import your data (Settings → Import)
3. Configure integrations (Settings → Integrations)
4. Start managing your business!

---

**Deployment Time:** ~5 minutes  
**Cost:** Free tier available on Vercel and PlanetScale  
**Difficulty:** ⭐⭐☆☆☆ (Easy)

Need help? Check the [full access guide](./docs/VERCEL_ACCESS_GUIDE.md) or [troubleshooting section](./docs/VERCEL_ACCESS_GUIDE.md#troubleshooting-common-issues).
