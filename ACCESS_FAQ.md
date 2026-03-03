# Post-Deployment Access FAQ

Common questions and answers about accessing your AI ERP System after deployment.

## General Access Questions

### Q0: I see code/source files instead of the app - how do I fix this?

**Answer:** This happens when Vercel doesn't have proper configuration for the full-stack app.

**Quick Fix:**
1. Ensure `vercel.json` exists in your repository (it should be there now)
2. Redeploy: `vercel --prod`
3. The app should now display correctly

**Why it happens:**
- Without `vercel.json`, Vercel may serve source files instead of built application
- The build process might not run correctly
- Routing configuration is missing

**Detailed solution:** See [docs/FIX_VERCEL_CODE_DISPLAY.md](./docs/FIX_VERCEL_CODE_DISPLAY.md)

**Verification:**
- ✅ Should see login page, not code files
- ✅ Browser should load bundled JS/CSS, not source files
- ✅ Check Vercel build logs for "Build successful"

### Q1: Where is my deployed application?

**Answer:** Your application URL depends on the platform:

- **Vercel:** `https://[your-project-name].vercel.app`
  - Find it: Vercel Dashboard → Your Project → URL at top
  - Or: Check CLI output after running `vercel`

- **Railway:** `https://[your-app-name].railway.app`
  - Find it: Railway Dashboard → Your Project → Deployments → Click deployment

- **Custom Domain:** If you configured one, use that (e.g., `https://erp.yourcompany.com`)

### Q2: What happens when I first visit the URL?

**Answer:** You'll be automatically redirected to `/login` because:
1. The app requires authentication
2. No one is logged in yet
3. This is expected behavior ✅

**Next steps:**
- Click "Sign up" at the bottom
- Create your account
- You become the admin automatically

### Q3: Why do I see a login page instead of the app?

**Answer:** This is correct! The system requires authentication for security.

**Action:** Click "Sign up" to create your first user account.

### Q4: How do I create my first admin account?

**Answer:**
1. Visit your deployment URL
2. You'll see the login page
3. Click **"Sign up"** (at the bottom)
4. Fill in:
   - Name: Your full name
   - Email: Your email address
   - Password: At least 8 characters
5. Click "Sign Up"
6. **You're now the admin!** 🎉

**Important:** The FIRST user to sign up automatically gets admin privileges.

### Q5: Can I login with a demo account?

**Answer:** No, there are no pre-created demo accounts. You must create your own account first.

**Why?** For security reasons, each deployment should create its own accounts with secure passwords.

## Error Messages

### Q6: "Cannot connect to database"

**Causes:**
- DATABASE_URL not set in environment variables
- Wrong database connection string
- Database not accessible from your hosting platform

**Fix:**
1. Verify DATABASE_URL is set:
   ```bash
   # Vercel
   vercel env ls
   
   # Railway
   railway variables
   ```

2. Check the format:
   ```
   mysql://user:password@host:3306/database?ssl={"rejectUnauthorized":true}
   ```

3. Ensure database tables exist:
   ```bash
   npm run db:push
   ```

4. Redeploy after fixing:
   ```bash
   vercel --prod  # or railway up
   ```

### Q7: "Invalid session cookie" / Immediately logged out

**Causes:**
- JWT_SECRET not set or too short
- JWT_SECRET changed after users logged in
- Cookies being blocked

**Fix:**
1. Generate secure JWT_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Add to environment variables (must be 32+ characters)

3. Redeploy

4. Try logging in again

### Q8: "404 - Not Found"

**Causes:**
- Build failed
- Deployment didn't complete
- Wrong URL

**Fix:**
1. Check deployment status in dashboard
2. Review build logs for errors
3. Verify URL is correct
4. Ensure build command is: `npm run build`
5. Ensure start command is: `npm run start`

### Q9: Page loads but looks broken (no CSS)

**Causes:**
- Build didn't complete successfully
- Static assets not deployed
- CORS or CSP blocking assets

**Fix:**
1. Check build logs for errors
2. Verify `dist/public` folder was created
3. Ensure `vite build` completed without errors
4. Redeploy with clean build

### Q10: "Email already exists" when signing up

**Causes:**
- Someone (maybe you) already created an account with that email

**Fix:**
1. Try clicking "Sign in" instead
2. Use the password you set when you created the account
3. If you forgot the password, you'll need database access to reset it
4. Or use a different email to create a new account

## Environment Variables

### Q11: Where do I set environment variables?

**Vercel:**
1. Dashboard → Your Project → Settings → Environment Variables
2. Or via CLI: `vercel env add VARIABLE_NAME`

**Railway:**
1. Dashboard → Your Project → Variables
2. Or via CLI: `railway variables set VARIABLE_NAME=value`

**Required variables:**
- `DATABASE_URL` (MySQL connection string)
- `JWT_SECRET` (32+ characters)

**Recommended:**
- `NODE_ENV=production`

### Q12: Do I need to redeploy after changing environment variables?

**Answer:** YES! ✅

Environment variables are loaded at build/startup time. After changing them:

```bash
# Vercel
vercel --prod

# Railway
railway up
```

### Q13: How do I generate a secure JWT_SECRET?

**Answer:**
```bash
# Method 1: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Method 2: OpenSSL
openssl rand -hex 32

# Method 3: Online (use trusted sites only)
# Visit: https://www.grc.com/passwords.htm
```

**Important:** 
- Must be at least 32 characters
- Use random, cryptographically secure values
- Never commit to Git
- Store only in environment variables

## Database Setup

### Q14: Do I need to create database tables manually?

**Answer:** Yes, run migrations once:

```bash
# 1. Set DATABASE_URL in local .env
echo "DATABASE_URL=your-mysql-connection-string" > .env

# 2. Run migrations
npm run db:push

# 3. Verify tables were created
# Connect to your database and check for tables like:
# - users, customers, vendors, products, invoices, etc.
```

**This only needs to be done once** per database.

### Q15: Which database should I use?

**Recommendations:**

**For Vercel:**
- **PlanetScale** (recommended) - Free tier, automatic scaling
- **Railway MySQL** - Simple setup
- **AWS RDS** - Full control, production-grade

**For Railway:**
- **Railway MySQL** (built-in) - Easiest option
- **PlanetScale** - Also works great

**Requirements:**
- MySQL 8.0+
- Accessible from your hosting platform

### Q16: Can I use PostgreSQL instead of MySQL?

**Answer:** No, currently the schema is MySQL-specific. The app uses:
- MySQL-specific data types
- MySQL syntax in migrations
- Drizzle ORM configured for MySQL

Switching to PostgreSQL would require:
- Updating schema definitions
- Changing connection configuration
- Testing all queries

## Performance & Loading

### Q17: Why is the first visit slow?

**Causes:**
- Cold start (serverless functions warming up)
- Database connection initialization
- Asset loading

**Normal:** First load can take 3-5 seconds

**If slower:**
- Check database location (should be same region as app)
- Check database connection limits
- Review server logs for errors

### Q18: How can I speed up cold starts?

**Options:**
1. **Upgrade to paid tier** (some platforms reduce cold starts)
2. **Keep warm:** Regular health check pings
3. **Database location:** Same region as app
4. **Optimize:** Review slow queries in logs

## User Management

### Q19: How do I invite more users?

**Answer:**
1. Log in as admin
2. Go to Settings → Team
3. Click "Invite Team Member"
4. Enter their email and select role
5. They'll receive invitation (if email configured)
6. Or share the signup link directly

### Q20: What if I created the wrong first user?

**Answer:**
1. Log in as that user
2. Create a new admin user via Settings → Team
3. Log out
4. Log in as the new admin
5. Demote or delete the first user

**Or:** Access database directly and change user roles.

### Q21: Can I have multiple admins?

**Answer:** Yes! 

Admins can:
- Create new admin users
- Assign admin role to existing users
- Manage all system settings

**To add admin:**
1. Settings → Team → Invite
2. Select "Admin" role
3. Or edit existing user's role to "Admin"

## Security

### Q22: Is it safe to have the first user auto-admin?

**Answer:** Yes, because:
1. Only works on first signup
2. Requires knowing the deployment URL
3. Should be done immediately after deployment
4. You can change roles later

**Best practice:**
- Sign up immediately after deployment
- Use a strong password
- Don't share admin credentials
- Create separate accounts for team members

### Q23: How do I reset a forgotten password?

**Answer:** Currently requires database access:

1. Connect to your database
2. Delete the user's record from `localAuthCredentials` table
3. User can sign up again with same email

**Coming soon:** Password reset via email (requires SendGrid setup)

### Q24: Are my passwords secure?

**Answer:** Yes! ✅

- Passwords are hashed with PBKDF2-SHA512
- 100,000 iterations (OWASP recommended)
- Unique salt per password
- Never stored in plain text
- Cannot be reversed or decrypted

## Deployment Platforms

### Q25: Vercel vs Railway - which is better?

**Vercel:**
- ✅ Great for frontend-heavy apps
- ✅ Excellent CI/CD
- ✅ Free tier generous
- ⚠️ Serverless (cold starts)

**Railway:**
- ✅ Always-on servers (no cold starts)
- ✅ Built-in databases
- ✅ Simple setup
- ⚠️ Paid after free credits

**Recommendation:** Try Vercel first (free), switch if needed.

### Q26: Can I deploy to AWS/GCP/Azure?

**Answer:** Yes! The app runs anywhere Node.js runs.

See [docs/STANDALONE_DEPLOYMENT.md](./docs/STANDALONE_DEPLOYMENT.md) for:
- AWS deployment guide
- DigitalOcean setup
- Docker deployment
- PM2 process management

## Getting More Help

### Q27: Where can I find detailed documentation?

**Quick Answers:**
- [HOW_TO_ACCESS.md](./HOW_TO_ACCESS.md) - Visual quick guide
- [QUICK_START_VERCEL.md](./QUICK_START_VERCEL.md) - 5-minute deployment

**Detailed Guides:**
- [docs/VERCEL_ACCESS_GUIDE.md](./docs/VERCEL_ACCESS_GUIDE.md) - Complete Vercel guide
- [docs/STANDALONE_DEPLOYMENT.md](./docs/STANDALONE_DEPLOYMENT.md) - All platforms
- [README.md](./README.md) - Full system documentation

**Troubleshooting:**
- [SECURITY_SUMMARY_AUTH.md](./SECURITY_SUMMARY_AUTH.md) - Security details
- Platform docs: [Vercel](https://vercel.com/docs), [Railway](https://docs.railway.app)

### Q28: How do I check logs?

**Vercel:**
```bash
# Real-time logs
vercel logs --follow

# Or in dashboard: Your Project → Logs
```

**Railway:**
```bash
# Real-time logs
railway logs

# Or in dashboard: Your Project → Deployments → View Logs
```

**What to look for:**
- Database connection errors
- JWT secret issues
- Build/startup errors
- 404 or 500 errors

### Q29: My question isn't answered here

**Resources:**
1. Check [docs/VERCEL_ACCESS_GUIDE.md](./docs/VERCEL_ACCESS_GUIDE.md) troubleshooting section
2. Review deployment platform docs
3. Check application logs
4. Open GitHub issue with:
   - Platform (Vercel/Railway/etc.)
   - Error message (if any)
   - Steps to reproduce
   - Deployment logs

---

## Quick Command Reference

```bash
# Deploy to Vercel
vercel

# Check environment variables
vercel env ls

# View logs
vercel logs --follow

# Redeploy
vercel --prod

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Run database migrations
npm run db:push
```

## Success Checklist

After deployment, you should have:

- [ ] Deployment URL (e.g., `https://your-app.vercel.app`)
- [ ] DATABASE_URL set in environment variables
- [ ] JWT_SECRET (32+ chars) set in environment variables
- [ ] Database tables created (ran `npm run db:push`)
- [ ] Redeployed after setting env vars
- [ ] Can access the login page
- [ ] Created first user (admin)
- [ ] Dashboard loads successfully
- [ ] Can navigate to different pages

**All checked?** 🎉 You're ready to use the system!

---

**Still having issues?** See the [complete troubleshooting guide](./docs/VERCEL_ACCESS_GUIDE.md#troubleshooting-common-issues).
