# Klarna Payment Selector - Val Town Demo

A serverless payment selector demo running on [Val Town](https://val.town),
demonstrating Klarna's Payment Authorization API with support for both Sub
Partner and Acquiring Partner authentication modes.

## Features

- 🔒 **HTTPS by default** - Val Town provides secure endpoints
- ☁️ **Serverless deployment** - No infrastructure to manage
- 👤 **Sub Partner mode** - Simplified authentication without explicit account
  ID
- 🏢 **Acquiring Partner mode** - Full control with explicit account ID
- 🔄 **Dynamic mode switching** - Toggle between authentication modes in the UI
- 🔐 **Optional mTLS** - Mutual TLS authentication for enhanced security
- 💳 **Klarna Web SDK** - Card and Klarna payment options
- 📝 **Request/Response logging** - Debug backend API calls

## Authentication Modes

This demo supports two authentication modes with dynamic switching:

### Sub Partner Mode

- **SDK Initialization**: Uses only `CLIENT_ID`
- **API Calls**: Uses `/v2/payment/requests` to create payment requests (no
  account ID in path)
- **Use case**: Partners who have a single implicit account
- **Payment Flow**: Creates a payment request → returns `payment_request_id`
  (for SDK) or `payment_request_url` (for redirect)

### Acquiring Partner Mode

- **SDK Initialization**: Uses `CLIENT_ID` + `PARTNER_ACCOUNT_ID`
- **API Calls**: Uses `/v2/accounts/{accountId}/payment/authorize`
- **Use case**: Partners who manage multiple accounts or need explicit account
  routing
- **Payment Flow**: Authorizes payment → may return `APPROVED` directly or
  `STEP_UP_REQUIRED`

### Dynamic Mode Switching

If both modes are configured (with separate credentials), a toggle appears in
the header banner allowing you to switch between modes without restarting. The
UI automatically:

- Re-initializes the SDK with the appropriate credentials
- Refreshes the payment presentation
- Updates the info banners and available features

## Environment Variables

Set these in your Val Town project settings:

### Required Credentials

Configure credentials for each authentication mode you want to use:

**Acquiring Partner:**

| Variable             | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `AP_CLIENT_ID`       | Client ID for Acquiring Partner mode                     |
| `AP_API_KEY`         | Base64-encoded API credentials for Acquiring Partner     |
| `PARTNER_ACCOUNT_ID` | Partner account ID (required for Acquiring Partner mode) |

**Sub Partner:**

| Variable       | Description                                    |
| -------------- | ---------------------------------------------- |
| `SP_CLIENT_ID` | Client ID for Sub Partner mode                 |
| `SP_API_KEY`   | Base64-encoded API credentials for Sub Partner |

### Optional

| Variable                 | Description                                                      | Default                              |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------ |
| `KLARNA_API_BASE_URL`    | Klarna API base URL                                              | `https://api-global.test.klarna.com` |
| `MTLS_CERT`              | Base64-encoded PEM certificate for mTLS                          | —                                    |
| `MTLS_KEY`               | Base64-encoded PEM private key for mTLS                          | —                                    |
| `KLARNA_CUSTOMER_TOKENS` | JSON object mapping country codes to customer tokens (see below) | —                                    |

## Customer Tokens Configuration

The `KLARNA_CUSTOMER_TOKENS` environment variable stores customer tokens per
country as a JSON object:

```json
{
  "SE": "tok_customer_sweden_xxx",
  "US": "tok_customer_usa_yyy",
  "DE": "tok_customer_germany_zzz"
}
```

**Format:**

- Keys are ISO 3166-1 alpha-2 country codes (uppercase)
- Values are the customer tokens for each country
- Store as a single line in the environment variable

**Usage:**

- The demo automatically looks up the customer token based on the selected
  country
- If no token exists for the selected country, tokenized payments features are
  disabled for that country
- The UI displays which countries have tokens configured

## Quick Start

### Both Modes with Dynamic Switching (Recommended)

Configure credentials for both modes to enable the UI toggle:

```
# Acquiring Partner credentials
AP_CLIENT_ID=klarna_ap_client_xxx
AP_API_KEY=your_ap_base64_credentials
PARTNER_ACCOUNT_ID=krn:partner:global:account:xxx

# Sub Partner credentials
SP_CLIENT_ID=klarna_sp_client_yyy
SP_API_KEY=your_sp_base64_credentials
```

### Sub Partner Only

```
SP_CLIENT_ID=klarna_test_client_xxx
SP_API_KEY=your_base64_encoded_credentials
```

### Acquiring Partner Only

```
AP_CLIENT_ID=klarna_test_client_xxx
AP_API_KEY=your_base64_encoded_credentials
PARTNER_ACCOUNT_ID=krn:partner:global:account:xxx
```

### With Tokenized Payments (Optional)

Add customer tokens for the countries you want to support:

```
KLARNA_CUSTOMER_TOKENS={"SE":"tok_xxx","US":"tok_yyy"}
```

## mTLS Configuration

mTLS (mutual TLS) provides an additional layer of security by requiring the
client to present a certificate during the TLS handshake. This is optional but
recommended for production environments.

### Step 1: Prepare Your Certificates

You should have:

- A PEM-encoded certificate file (e.g., `client.crt` or `client.pem`)
- A PEM-encoded private key file (e.g., `client.key`)

### Step 2: Base64 Encode the Certificates

The certificates must be base64-encoded before storing them as environment
variables.

**On macOS/Linux:**

```bash
# Encode the certificate
base64 -i client.crt > client.crt.b64

# Encode the private key
base64 -i client.key > client.key.b64
```

**On Windows (PowerShell):**

```powershell
# Encode the certificate
[Convert]::ToBase64String([IO.File]::ReadAllBytes("client.crt")) | Out-File client.crt.b64

# Encode the private key
[Convert]::ToBase64String([IO.File]::ReadAllBytes("client.key")) | Out-File client.key.b64
```

**Using OpenSSL (cross-platform):**

```bash
openssl base64 -in client.crt -out client.crt.b64
openssl base64 -in client.key -out client.key.b64
```

### Step 3: Set Environment Variables in Val Town

1. Go to your Val Town project settings
2. Navigate to the **Environment Variables** section
3. Add the following variables:

   - **`MTLS_CERT`**: Paste the entire contents of `client.crt.b64`
   - **`MTLS_KEY`**: Paste the entire contents of `client.key.b64`

> ⚠️ **Important:** Make sure to paste the base64 content as a single line
> without any line breaks.

### Step 4: Verify mTLS is Working

Once configured, you can verify mTLS is active by:

1. Calling the `/api/health` endpoint - it will return `"mtls": "configured"`
2. Making a payment authorization - the Backend Logs panel will show:
   - **🔐 mTLS Verified** badge in the response section (when
     `klarna-mtls-verification-status: VALID`)
   - The `klarna-mtls-verification-status` header value

### Troubleshooting

| Issue                                       | Solution                                                            |
| ------------------------------------------- | ------------------------------------------------------------------- |
| mTLS indicator not showing in logs          | Check `klarna-mtls-verification-status` header - it must be `VALID` |
| Certificate decode errors                   | Ensure the base64 encoding has no line breaks                       |
| Connection failures                         | Verify the certificate is valid and not expired                     |
| "mTLS configured but not available" warning | The Deno runtime may not support `createHttpClient`                 |

## Deployment to Val Town

1. Create a new HTTP Val in Val Town
2. Copy the contents of `valtown.ts` into your val
3. Create the `/public` folder structure with the static files
4. Set the required environment variables
5. Register your Val Town URL as an allowed origin in the
   [Klarna Partner Portal](https://portal.playground.klarna.com/settings/client-identifier/allowed-origins)

## Project Structure

```
valtown/
├── valtown.ts              # Main server (Hono + API routes)
├── README.md               # This file
└── public/
    ├── index.html          # Main demo page
    ├── styles.css          # Stylesheet
    ├── script.js           # Frontend JavaScript
    └── payment-complete.html # Payment completion page
```

## API Endpoints

| Endpoint                            | Method | Description                                                                                               |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `/`                                 | GET    | Main demo page                                                                                            |
| `/payment-complete`                 | GET    | Payment completion page                                                                                   |
| `/api/health`                       | GET    | Health check (includes auth mode and mTLS status)                                                         |
| `/api/config`                       | GET    | Returns SDK configuration (clientId, authMode, partnerAccountId if applicable)                            |
| `/api/identity/sdk-tokens`          | POST   | Generates SDK token for tokenized payments (requires `KLARNA_CUSTOMER_TOKENS` with token for the country) |
| `/api/interoperability/test-tokens` | POST   | Generates interoperability test token for advanced flows (ACQUIRING_PARTNER only)                         |
| `/api/interoperability/sdk-tokens`  | POST   | Exchanges interoperability token for SDK token (ACQUIRING_PARTNER only)                                   |
| `/api/presentation`                 | GET    | Fetches payment presentation options via Klarna Payment Presentation API                                  |
| `/api/payment-request`              | POST   | Creates a payment request via Klarna API (SUB_PARTNER mode only)                                          |
| `/api/authorize-payment`            | POST   | Authorizes a payment via Klarna API (ACQUIRING_PARTNER mode)                                              |

### Advanced Checkout Flows

The demo supports advanced checkout flows that can be selected from the
"Advanced Checkout Flows" panel:

- **Tokenized payments**: Uses a customer token to display saved payment methods
  for returning customers. Requires `KLARNA_CUSTOMER_TOKENS` environment
  variable with tokens configured for the relevant countries.
- **Interoperability flows** (Acquiring Partner only): Integration with Klarna
  Express Checkout, Sign in with Klarna, Pre-qualification, and Account Linking.

#### Tokenized Payments

For tokenized payments:

1. The SDK is initialized with an `sdkToken` obtained from the Identity API
2. The `Klarna-Customer-Token` header is added to presentation and payment API
   calls
3. Customer tokens are looked up by country - only countries with configured
   tokens support tokenized payments
4. Returning customers may see their saved payment methods

#### Interoperability Flows

Interoperability flows are available for Acquiring Partners only and enable
advanced customer experiences. Available flows:

- **KLARNA_EXPRESS_CHECKOUT**: Fast checkout with pre-filled customer data
- **SIGN_IN_WITH_KLARNA**: Authentication via Klarna account
- **KLARNA_PRE_QUALIFICATION**: Check customer eligibility before purchase
- **KLARNA_ACCOUNT_LINKING**: Link external accounts to Klarna

When an interoperability flow is selected:

**Step 1: Get Interoperability Test Token**

- Call `POST /api/interoperability/test-tokens`
- Headers: `Klarna-Customer-Token` (from `KLARNA_CUSTOMER_TOKENS`),
  `Klarna-Customer-Region: krn:test:us1:test`
- Body: `{"customer_journey": "<FLOW_NAME>"}`
- Returns: `interoperability_token`

**For SDK-based Payment Selector:**

1. Exchange the interoperability token for an SDK token via
   `POST /api/interoperability/sdk-tokens`
   - Header: `Klarna-Interoperability-Token: <interoperability_token>`
   - No request body
   - Returns: `sdk_token`
2. Initialize the SDK with the `sdkToken` parameter
3. The SDK handles the presentation and payment flow internally

**For API-based Payment Selector:**

1. Add `Klarna-Interoperability-Token` header to the Presentation API call
   (`GET /api/presentation`)
2. Add `Klarna-Interoperability-Token` header to the Payment Authorize API call
   (`POST /api/authorize-payment`)

### Payment Request vs Authorize

- **`/api/payment-request`** (SUB_PARTNER): Calls Klarna's
  `/v2/payment/requests` endpoint. Creates a payment request and returns
  `payment_request_id` and `payment_request_url`. The SDK uses
  `payment_request_id` to trigger the purchase flow, while the API-based
  selector redirects to `payment_request_url`.

- **`/api/authorize-payment`** (ACQUIRING_PARTNER): Calls Klarna's
  `/v2/accounts/{id}/payment/authorize` endpoint. May return `APPROVED` directly
  (instant approval), `STEP_UP_REQUIRED` (redirect needed), or `DECLINED`.

## License

Internal Klarna demo - not for public distribution.
