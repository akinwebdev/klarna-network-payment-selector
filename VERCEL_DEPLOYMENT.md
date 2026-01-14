# Deploying to Vercel

This project has been adapted from Val Town to work on Vercel. Follow these steps to deploy:

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Vercel CLI installed (optional, for local testing):
   ```bash
   npm i -g vercel
   ```

## Deployment Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

In your Vercel project dashboard, go to **Settings → Environment Variables** and add:

#### Required (at least one authentication mode):

**For Acquiring Partner mode:**
- `AP_CLIENT_ID` - Client ID for Acquiring Partner mode
- `AP_API_KEY` - Base64 encoded API credentials for Acquiring Partner mode
- `PARTNER_ACCOUNT_ID` - Partner account ID (required for Acquiring Partner mode)

**For Sub Partner mode:**
- `SP_CLIENT_ID` - Client ID for Sub Partner mode
- `SP_API_KEY` - Base64 encoded API credentials for Sub Partner mode

#### Optional:
- `KLARNA_API_BASE_URL` - Klarna API base URL (defaults to `https://api-global.test.klarna.com`)
- `MTLS_CERT` - Base64 encoded PEM certificate for mTLS (limited support on Vercel)
- `MTLS_KEY` - Base64 encoded PEM private key for mTLS (limited support on Vercel)
- `KLARNA_CUSTOMER_TOKENS` - JSON object mapping country codes to tokens, e.g., `{"SE":"tok_xxx","US":"tok_yyy"}`

### 3. Deploy to Vercel

#### Option A: Using Vercel Dashboard

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Vercel will automatically detect the project settings
4. Add your environment variables in the project settings
5. Deploy!

#### Option B: Using Vercel CLI

```bash
vercel
```

Follow the prompts to link your project and deploy.

### 4. Configure Allowed Origins

After deployment, you'll need to register your Vercel URL as an allowed origin:

1. **For Sub Partner mode**: Register your Vercel URL in the [Klarna Partner Portal](https://portal.playground.klarna.com/settings/client-identifier/allowed-origins)
   - Navigate to Settings → Client Identifier → Allowed Origins
   - Add your Vercel deployment URL

2. **For Acquiring Partner mode**: Ensure your partner account is onboarded with:
   - `store_groups[].stores[].type = WEBSITE`
   - `store_groups[].stores[].url` set to your Vercel deployment URL

## Project Structure

```
.
├── api/
│   └── [...].ts          # Vercel serverless function (handles all API routes)
├── public/               # Static files (served automatically by Vercel)
│   ├── index.html
│   ├── payment-complete.html
│   ├── styles.css
│   └── js/              # Frontend JavaScript
├── package.json          # Dependencies
├── vercel.json          # Vercel configuration
└── README.md            # Original project documentation
```

## Differences from Val Town Version

1. **Static File Serving**: Vercel automatically serves files from the `public/` directory, so no explicit file serving code is needed.

2. **API Routes**: All API routes are handled by a single catch-all serverless function at `api/[...].ts`.

3. **mTLS Support**: mTLS (mutual TLS) has limited support on Vercel. The code structure is in place, but full mTLS functionality may require Vercel Enterprise or custom configuration.

4. **Environment Variables**: Use Vercel's environment variable system instead of Val Town's.

## Testing Locally

To test locally with Vercel:

```bash
npm install
vercel dev
```

This will start a local development server that mimics Vercel's production environment.

## Troubleshooting

### API Routes Not Working
- Ensure your `api/[...].ts` file is in the correct location
- Check that environment variables are set correctly
- Review Vercel function logs in the dashboard

### Static Files Not Loading
- Verify files are in the `public/` directory
- Check `vercel.json` rewrites configuration
- Ensure file paths in HTML match the public directory structure

### Environment Variables Not Loading
- Make sure variables are set in Vercel dashboard (not just `.env` files)
- Redeploy after adding new environment variables
- Check variable names match exactly (case-sensitive)

## Support

For issues specific to:
- **Vercel deployment**: Check [Vercel documentation](https://vercel.com/docs)
- **Klarna API**: Refer to the original README.md and Klarna documentation
- **Project code**: See the original README.md for project-specific details
