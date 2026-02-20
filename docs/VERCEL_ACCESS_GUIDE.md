# How to Access Your Vercel Deployment

This guide walks you through accessing your AI ERP System after deploying to Vercel.

## Quick Answer

After deploying to Vercel, your application will be available at a URL like:
- **Production:** `https://your-project-name.vercel.app`
- **Preview deployments:** `https://your-project-name-[hash].vercel.app`

## Step-by-Step Access Instructions

### 1. Find Your Vercel Deployment URL

#### Option A: Via Vercel Dashboard
1. Go to [vercel.com](https://vercel.com) and log in
2. Click on your project (e.g., "ai-erp-system")
3. On the project page, you'll see your deployment URL at the top
4. Click on the URL or copy it to your clipboard

#### Option B: Via CLI Output
When you run `vercel` or `vercel deploy`, the CLI outputs:
```bash
✅  Production: https://your-project-name.vercel.app
```

Copy this URL.

#### Option C: Via Vercel App
1. Install the Vercel mobile app (iOS/Android)
2. Find your project
3. Tap to view deployment details
4. URL is shown at the top

### 2. Visit Your Application

1. **Open the URL in your browser**
   - Paste the Vercel URL (e.g., `https://ai-erp-system.vercel.app`)
   - Press Enter

2. **What you'll see:**
   - You'll be automatically redirected to `/login`
   - This is expected behavior - the app requires authentication

### 3. Create Your First User (Admin Account)

On the login page:

1. **Click "Sign up"** at the bottom of the form

2. **Fill in the signup form:**
   - **Name:** Your full name (e.g., "John Doe")
   - **Email:** Your work email (e.g., "john@company.com")
   - **Password:** At least 8 characters (e.g., "SecurePass123!")

3. **Click "Sign Up"**
   - You'll be automatically logged in
   - The first user created gets **admin role** automatically

4. **You're in!**
   - You'll be redirected to the dashboard
   - You should see the main ERP interface

### 4. Verify Your Setup

After logging in, verify everything works:

1. **Check the Dashboard**
   - You should see KPI cards (Revenue, Invoices, etc.)
   - Navigation sidebar on the left
   - Your name/profile in the top right

2. **Test Basic Functionality**
   - Click "Sales" → "Customers" to see the customers page
   - Click "Operations" → "Products" to see the products page
   - These pages should load without errors

3. **Invite Team Members** (Optional)
   - Click "Settings" → "Team"
   - Click "Invite Team Member"
   - Enter their email and select a role
   - They'll receive an invitation to create their account

## Troubleshooting Common Issues

### Issue: "Cannot connect to database"

**Symptom:** Error message about database connection

**Solution:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify `DATABASE_URL` is set correctly
3. Format should be: `mysql://user:password@host:3306/database?ssl={"rejectUnauthorized":true}`
4. For PlanetScale, ensure you're using the connection string from their dashboard
5. Redeploy after changing environment variables

### Issue: "Invalid session cookie" or immediate logout

**Symptom:** You log in but are immediately logged out

**Solution:**
1. Verify `JWT_SECRET` is set in environment variables
2. JWT_SECRET must be at least 32 characters
3. Generate a secure one:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Add it to Vercel environment variables
5. Redeploy

### Issue: Page shows "404 - Not Found"

**Symptom:** Visiting the URL shows a 404 error

**Solution:**
1. Verify the deployment succeeded in Vercel dashboard
2. Check the "Deployments" tab for build errors
3. Ensure build command is set to: `npm run build`
4. Ensure start command is set to: `npm run start`
5. Check the build logs for errors

### Issue: Slow loading or timeout

**Symptom:** Page takes too long to load or times out

**Solution:**
1. Check Vercel function execution time limits
2. Verify database is accessible from Vercel (check firewall rules)
3. For PlanetScale, ensure you're in the same region for lower latency
4. Check Vercel logs for serverless function timeouts

### Issue: Static assets not loading (CSS/JS broken)

**Symptom:** Page loads but looks broken, missing styles

**Solution:**
1. Verify build completed successfully
2. Check that `dist/public` folder was created during build
3. Ensure `vite build` completed without errors
4. Check Vercel build logs for any warnings

### Issue: Environment variables not working

**Symptom:** Features that require env vars don't work

**Solution:**
1. Environment variables in Vercel are separate from your local `.env`
2. Add all required variables in: Settings → Environment Variables
3. Required variables:
   - `DATABASE_URL` (required)
   - `JWT_SECRET` (required)
   - `NODE_ENV=production` (recommended)
4. Redeploy after adding variables (changes require redeployment)

## Advanced: Custom Domain

Want to use your own domain instead of `.vercel.app`?

### Add a Custom Domain

1. **In Vercel Dashboard:**
   - Go to your project
   - Click "Settings" → "Domains"
   - Click "Add"

2. **Enter your domain:**
   - Example: `erp.yourcompany.com`
   - Click "Add"

3. **Configure DNS:**
   - Vercel will show you DNS records to add
   - Go to your domain provider (e.g., GoDaddy, Namecheap)
   - Add the DNS records as shown
   - Common record types:
     - `A` record pointing to Vercel IP
     - Or `CNAME` record pointing to `cname.vercel-dns.com`

4. **Wait for verification:**
   - DNS propagation takes 5-60 minutes
   - Vercel will automatically verify and issue SSL certificate
   - Your site will be available at your custom domain

5. **Update environment variables:**
   - Update `APP_URL` to your custom domain
   - Redeploy

## Database Setup

If this is your first deployment, you need a database:

### Option 1: PlanetScale (Recommended with Vercel)

1. **Create Database:**
   - Go to [planetscale.com](https://planetscale.com)
   - Sign up/login
   - Click "Create database"
   - Name it (e.g., "ai-erp-prod")
   - Select region (same as Vercel for best performance)

2. **Get Connection String:**
   - Click on your database
   - Go to "Connect"
   - Select "Node.js" or "Prisma"
   - Copy the connection string

3. **Add to Vercel:**
   - In Vercel: Settings → Environment Variables
   - Name: `DATABASE_URL`
   - Value: Paste the PlanetScale connection string
   - Add to: Production, Preview, Development

4. **Run Migrations:**
   - Clone your repo locally
   - Set `DATABASE_URL` in local `.env`
   - Run: `npm run db:push`
   - This creates all tables

### Option 2: Other MySQL Providers

Works with any MySQL 8.0+ database:
- Railway MySQL
- AWS RDS
- DigitalOcean Managed MySQL
- Azure Database for MySQL
- Self-hosted MySQL

Just set the `DATABASE_URL` in Vercel environment variables.

## Security Best Practices

### After Deployment:

1. **Change Default Credentials**
   - Create admin account with strong password
   - Don't use demo/test passwords in production

2. **Use Strong JWT Secret**
   - Generate with: `openssl rand -hex 32`
   - Never commit it to Git
   - Store only in Vercel environment variables

3. **Enable HTTPS Only**
   - Vercel provides this automatically
   - Ensure `Secure` cookies are enabled (automatic in production)

4. **Backup Your Database**
   - PlanetScale has automatic backups
   - For other providers, set up automated backups

5. **Monitor Access Logs**
   - Check Vercel logs regularly
   - Set up alerts for errors

## Getting Help

### Deployment Issues
- Vercel Status: [vercel-status.com](https://vercel-status.com)
- Vercel Docs: [vercel.com/docs](https://vercel.com/docs)
- Vercel Support: Available in dashboard

### Application Issues
- Check logs: Vercel Dashboard → Your Project → Logs
- Check build logs: Deployments tab → Click deployment → View logs
- GitHub Issues: Report bugs in your repository

### Database Issues
- PlanetScale Status: [status.planetscale.com](https://status.planetscale.com)
- PlanetScale Docs: [planetscale.com/docs](https://planetscale.com/docs)
- Connection issues: Verify connection string and firewall rules

## Next Steps

Now that you're logged in:

1. **Invite Your Team**
   - Settings → Team → Invite Team Member
   - Assign appropriate roles (admin, finance, ops, etc.)

2. **Import Initial Data**
   - Settings → Import to import products, customers, vendors
   - Or use the API to bulk import

3. **Configure Integrations** (Optional)
   - Settings → Integrations
   - Set up QuickBooks, Shopify, Google Drive as needed

4. **Explore Features**
   - Check out the AI Assistant (press Cmd/Ctrl+K)
   - Create your first invoice, order, or product
   - Explore the dashboard and reports

5. **Read the Documentation**
   - [README.md](../README.md) - Full feature guide
   - [NATURAL_LANGUAGE_USER_GUIDE.md](../NATURAL_LANGUAGE_USER_GUIDE.md) - AI features
   - [STANDALONE_DEPLOYMENT.md](./STANDALONE_DEPLOYMENT.md) - Deployment guide

## Summary

**Quick Start Checklist:**
- ✅ Deploy to Vercel
- ✅ Set environment variables (`DATABASE_URL`, `JWT_SECRET`)
- ✅ Run database migrations
- ✅ Visit your Vercel URL
- ✅ Sign up with your email
- ✅ You're the admin!
- ✅ Invite your team
- ✅ Start using the system

**Your Vercel URL:** `https://[your-project].vercel.app`

---

**Need help?** Check the [troubleshooting section](#troubleshooting-common-issues) above or consult the [deployment guide](./STANDALONE_DEPLOYMENT.md).
