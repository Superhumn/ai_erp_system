# Paid Ads — setup

The Paid Ads module lives at `/marketing/ads` (also the **Paid Ads** tab on the Marketing hub). It records leads, daily spend, campaigns, tracking links and ad credits. Ads are still built and launched on each platform.

Cost per signup = spend ÷ signups, worked out when the screen loads. It is never stored.

## What runs on its own

| When | What | Where to see it |
|---|---|---|
| A lead arrives | CRM contact created or matched, tagged `ad:<platform>` and `campaign:<name>`, welcome email sent (if the campaign has one), team notified | Leads tab, CRM |
| Every morning after 06:00 UTC | Yesterday's spend, clicks and signups pulled from each connected platform | Cost per signup tab |
| Every 15 minutes | LinkedIn lead forms polled (LinkedIn has no lead webhook) | Leads tab |
| Once a day | Alerts: cost per signup above target 3 days running, campaign spend reached its budget, credit 14 days from expiry | Notifications |
| Monday morning | Weekly summary: spend, signups and cost per signup by platform, as a notification and an email | Notifications, inbox |
| Any sync fails | Logged and an alert is raised | Platforms tab → Automation log |

Alerts go to users with the admin, exec or sales role.

## Environment variables

```
META_APP_SECRET=            # Meta app secret; verifies lead webhook signatures
META_WEBHOOK_VERIFY_TOKEN=  # Any string you choose; Meta echoes it on subscription
AD_LEAD_WEBHOOK_SECRET=     # Any string you choose; the landing-page form sends it
```

Email uses the existing SendGrid settings (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`).

## Connect a platform

Platforms tab → **Add platform**. Paste the ad account id and an access token. Tokens are stored encrypted. **Sync last 7 days** pulls spend straight away and creates a campaign row for each platform campaign it finds.

| Platform | Account id | Token | Notes |
|---|---|---|---|
| Instagram (Meta) | `act_…` from Ads Manager | System user token with `ads_read`, `leads_retrieval`, `pages_manage_ads` | Also enter the Facebook page id that the lead forms belong to |
| LinkedIn | Sponsored account id (numbers only) | OAuth token with `r_ads_reporting`, `r_marketing_leadgen_automation` | Leads are polled every 15 minutes |
| Reddit | Ad account id (`a2_…`) | Reddit Ads API token | Reddit leads come through the landing page form |

The API versions are pinned in `server/_core/adPlatforms.ts` (Meta Graph v21.0, LinkedIn 202409, Reddit Ads v3).

## Lead intake endpoints

**Meta lead forms**: in the Meta app dashboard, subscribe the `leadgen` field on the page with the callback URL

```
https://<your-erp-host>/webhooks/ads/meta/leads
```

and the verify token from `META_WEBHOOK_VERIFY_TOKEN`. Each event is fetched from the Graph API by its `leadgen_id` and recorded.

**Landing page form** (Reddit traffic, or any page): POST JSON to

```
https://<your-erp-host>/webhooks/ads/leads
```

with the header `x-webhook-secret: <AD_LEAD_WEBHOOK_SECRET>` (or `?secret=`). Body fields: `name` or `fullName`, `email`, `phone`, `company`, plus either `utm_source` / `utm_campaign` fields or `pageUrl` (the page's full address, which carries the UTM tags). Any other fields are kept as the lead's answers. The campaign is matched on `utm_campaign`, so use links from the Links tab.

## Campaign matching

A synced spend row or an inbound lead is matched to a campaign by the **platform campaign id** (Campaigns tab → edit). Unknown ids create a new campaign automatically. Leads from the landing page match on **UTM campaign**.

## Alerts you can tune

- **Cost per signup target** is per campaign. Empty means no alert.
- **Budget**: total budget, or daily budget × the number of days between start and end.
- **Credit expiry**: fixed at 14 days. Moving a credit's expiry date re-arms its warning.
