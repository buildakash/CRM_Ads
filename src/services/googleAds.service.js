// src/services/googleAds.service.js
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { mem } from "../store/memory.js";

const ADS_API_BASE = "https://googleads.googleapis.com";
const ADS_API_VERSION = "v21"; // keep consistent across calls

// OAuth client for the Google Ads connect flow
const oauthAds = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_ADS_REDIRECT_URI // e.g. http://localhost:3000/ads/google/callback
);

export function getGoogleAdsAuthUrl() {
  return oauthAds.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/adwords"],
  });
}

export async function exchangeAdsCode(code) {
  const { tokens } = await oauthAds.getToken(code);

  // Save tokens in memory (demo only)
  const now = Math.floor(Date.now() / 1000);
  mem.googleAds.access_token = tokens.access_token || null;
  if (tokens.refresh_token) mem.googleAds.refresh_token = tokens.refresh_token; // may be missing on repeat consent
  mem.googleAds.access_token_expiry = now + (tokens.expires_in || 3600);

  return tokens;
}

async function getFreshAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (mem.googleAds.access_token && now < mem.googleAds.access_token_expiry - 60) {
    return mem.googleAds.access_token;
  }
  if (!mem.googleAds.refresh_token) {
    throw new Error("No refresh_token saved for Google Ads. Reconnect via /ads/google/connect.");
  }

  const url = "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: mem.googleAds.refresh_token,
  });

  const { data } = await axios.post(url, params);
  mem.googleAds.access_token = data.access_token;
  mem.googleAds.access_token_expiry = now + (data.expires_in || 3600);
  return mem.googleAds.access_token;
}

function baseHeaders(token) {
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN in .env");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  };

  // Only set if you really use an MCC (numbers only, no dashes)
  if (process.env.LOGIN_CUSTOMER_ID && String(process.env.LOGIN_CUSTOMER_ID).trim() !== "") {
    headers["login-customer-id"] = String(process.env.LOGIN_CUSTOMER_ID).replace(/-/g, "");
  }

  return headers;
}

export async function listAccessibleCustomers() {
  const token = await getFreshAccessToken();
  const url = `${ADS_API_BASE}/${ADS_API_VERSION}/customers:listAccessibleCustomers`;
  const { data } = await axios.get(url, { headers: baseHeaders(token) });
  return data.resourceNames || []; // e.g., ["customers/1234567890", ...]
}

export async function setSelectedCustomerId(resourceName) {
  if (!resourceName?.startsWith("customers/")) {
    throw new Error("Invalid customer resource name. Expected format: 'customers/1234567890'.");
  }
  mem.googleAds.selectedCustomerId = resourceName.split("/")[1];
  return mem.googleAds.selectedCustomerId;
}

export async function searchStreamGAQL(gaql) {
  const token = await getFreshAccessToken();
  const cid = mem.googleAds.selectedCustomerId;
  if (!cid) throw new Error("No customerId selected. POST to /ads/google/select-customer first.");

  const url = `${ADS_API_BASE}/${ADS_API_VERSION}/customers/${cid}/googleAds:searchStream`;
  const { data } = await axios.post(
    url,
    { query: gaql },
    { headers: { ...baseHeaders(token), "Content-Type": "application/json" } }
  );

  // Flatten stream chunks
  const rows = [];
  for (const chunk of data) {
    if (chunk.results) rows.push(...chunk.results);
  }
  return rows;
}
