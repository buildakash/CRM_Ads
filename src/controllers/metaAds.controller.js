// // STEP 1: Redirect user to Meta OAuth login
// export async function metaAuthHandler(req, res) {
//   console.log(">>> Meta auth endpoint hit");   // log request

//   const { userId } = req.query;
//   if (!userId) {
//     console.error("❌ Missing userId in query");
//     return res.status(400).json({ error: "userId required" });
//   }

//   const authUrl =
//     "https://www.facebook.com/v18.0/dialog/oauth?" +
//     querystring.stringify({
//       client_id: META_APP_ID,
//       redirect_uri: META_REDIRECT_URI,
//       scope: "ads_management,ads_read,business_management",
//       state: userId,
//     });

//   console.log("✅ Redirecting to Meta Auth URL:", authUrl);
//   res.redirect(authUrl);
// }

// // STEP 2: Handle Meta callback
// export async function metaCallbackHandler(req, res) {
//   console.log(">>> Meta callback endpoint hit");
//   console.log("Query params:", req.query);

//   const { code, state } = req.query;
//   if (!code || !state) {
//     console.error("❌ Missing code or state in callback");
//     return res.status(400).json({ error: "Missing code or userId" });
//   }

//   try {
//     const tokenUrl =
//       "https://graph.facebook.com/v18.0/oauth/access_token?" +
//       querystring.stringify({
//         client_id: META_APP_ID,
//         client_secret: META_APP_SECRET,
//         redirect_uri: META_REDIRECT_URI,
//         code,
//       });

//     console.log("📡 Fetching token from:", tokenUrl);

//     const tokenRes = await fetch(tokenUrl);
//     const tokenData = await tokenRes.json();
//     console.log("📥 Token response:", tokenData);

//     if (tokenData.error) {
//       console.error("❌ Meta token error:", tokenData.error);
//       return res.status(500).json({ error: "Failed to fetch access token" });
//     }

//     const accessToken = tokenData.access_token;
//     console.log("✅ Access token received");

//     const db = await getDb();
//     await db.query(
//       `INSERT INTO api_connections (user_id, platform_name, token, status)
//        VALUES (?, ?, ?, ?)
//        ON DUPLICATE KEY UPDATE token = VALUES(token), status = VALUES(status)`,
//       [state, "MetaAds", accessToken, "active"]
//     );

//     console.log("✅ Token saved to DB for user:", state);
//     res.send("✅ Meta Ads connected successfully! You can close this window.");
//   } catch (err) {
//     console.error("❌ Meta callback error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// }

// export async function getMetaPagesHandler(req, res) {
//   try {
//     const { userId } = req.query;
//     if (!userId) return res.status(400).json({ error: "userId required" });

//     const db = await getDb();
//     const [rows] = await db.query(
//       "SELECT token FROM api_connections WHERE user_id = ? AND platform_name = 'MetaAds'",
//       [userId]
//     );

//     if (!rows.length) return res.status(404).json({ error: "No Meta Ads connection found" });

//     const token = rows[0].token;

//     const response = await fetch(
//       `https://graph.facebook.com/v18.0/me/accounts?access_token=${token}`
//     );
//     const data = await response.json();

//     res.json(data);
//   } catch (err) {
//     console.error("Meta pages fetch error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// }

import axios from "axios";
import { getDb } from "../db.js";
const db = await getDb();

// Save Meta Ads token when user connects
export const connectMetaAds = async (req, res) => {
  const { userId, accessToken } = req.body;

  try {
    // Insert or update token in api_connections (MySQL syntax)
    await db.query(
      `INSERT INTO api_connections (user_id, platform_name, token, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE token = VALUES(token), status = VALUES(status)`,
      [userId, "meta_ads", accessToken, "connected"]
    );

    res.json({ ok: true, message: "Meta Ads connected successfully" });
  } catch (err) {
    console.error("Error saving Meta Ads token:", err);
    res.status(500).json({ error: "Database error" });
  }
};

// Fetch campaigns
export const getCampaigns = async (req, res) => {
  const { userId } = req.query;

  try {
    const [rows] = await db.query(
      "SELECT token FROM api_connections WHERE user_id = ? AND platform_name = ?",
      [userId, "meta_ads"]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    const accessToken = rows[0].token;

    const response = await axios.get(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
    );

    res.json(response.data);
  } catch (err) {
    console.error("Error fetching campaigns:", err.response?.data || err);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
};


// Fetch leads from a lead form
export const getLeads = async (req, res) => {
  const { userId, formId } = req.query;

  try {
    // Step 1: Get user long-lived token from DB
    const [rows] = await db.query(
      "SELECT token FROM api_connections WHERE user_id = ? AND platform_name = ?",
      [userId, "meta_ads"]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    const userToken = rows[0].token;

    // Step 2: Get all Pages connected to this user
    const pagesResp = await axios.get(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`
    );

    let leads = [];

    // Step 3: Try fetching leads from the given formId for each page
    for (const page of pagesResp.data.data) {
      const pageToken = page.access_token;

      try {
        const leadsResp = await axios.get(
          `https://graph.facebook.com/v21.0/${formId}/leads?fields=created_time,field_data&access_token=${pageToken}`
        );

        // Step 4: Save each lead into DB
        for (const lead of leadsResp.data.data) {
          await db.query(
            "INSERT INTO leads (user_id, platform, lead_data) VALUES (?, ?, ?)",
            [userId, "meta_ads", JSON.stringify(lead)]
          );
        }

        // Collect leads for response
        leads = leads.concat(leadsResp.data.data);
      } catch (innerErr) {
        // If this page doesn’t own the form, just skip
        continue;
      }
    }

    // Step 5: Return leads
    if (leads.length === 0) {
      return res.json({ ok: true, message: "No leads found for this form" });
    }

    res.json({ ok: true, leads });
  } catch (err) {
    console.error("Error fetching leads:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
};


const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const REDIRECT_URI = process.env.META_REDIRECT_URI;

// Exchange Auth Code → Long-Lived Token
export const exchangeToken = async (req, res) => {
  const { userId, code } = req.body;

  try {
    // Step 1: Exchange code for short-lived user token
    const shortResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`, {
        params: {
          client_id: APP_ID,
          redirect_uri: REDIRECT_URI,
          client_secret: APP_SECRET,
          code
        }
      }
    );

    const shortToken = shortResp.data.access_token;

    // Step 2: Exchange short token for long-lived token
    const longResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`, {
        params: {
          grant_type: "fb_exchange_token",
          client_id: APP_ID,
          client_secret: APP_SECRET,
          fb_exchange_token: shortToken
        }
      }
    );

    const longToken = longResp.data.access_token;

    // Step 3: Save into api_connections
    await db.query(
      `INSERT INTO api_connections (user_id, platform_name, token, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE token = VALUES(token), status = VALUES(status)`,
      [userId, "meta_ads", longToken, "connected"]
    );

    res.json({ ok: true, message: "Meta Ads connected", token: longToken });
  } catch (err) {
    console.error("Error exchanging Meta Ads token:", err.response?.data || err);
    res.status(500).json({ error: "Failed to exchange token" });
  }
};

// Handle redirect from Meta OAuth
export const metaCallback = async (req, res) => {
  const { code, state } = req.query; // code from Meta, state = userId
  

  if (!code) {
    return res.status(400).json({ error: "Missing code from Meta callback" });
  }

  try {
    // Step 1: Exchange code for short-lived token
    const shortResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`,
      {
        params: {
          client_id: APP_ID,
          redirect_uri: REDIRECT_URI,
          client_secret: APP_SECRET,
          code
        }
      }
    );
    const shortToken = shortResp.data.access_token;

    // Step 2: Exchange for long-lived token
    const longResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`,
      {
        params: {
          grant_type: "fb_exchange_token",
          client_id: APP_ID,
          client_secret: APP_SECRET,
          fb_exchange_token: shortToken
        }
      }
    );
    const longToken = longResp.data.access_token;

    // Save into DB
    const userId = state || 1; // default to 1 for testing
    await db.query(
      `INSERT INTO api_connections (user_id, platform_name, token, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE token = VALUES(token), status = VALUES(status)`,
      [userId, "meta_ads", longToken, "connected"]
    );

    // Redirect to frontend success page (or just return JSON for now)
    res.json({ ok: true, message: "Meta Ads connected", token: longToken });
  } catch (err) {
    console.error("Error in Meta callback:", err.response?.data || err);
    
    res.status(500).json({ error: "Meta callback failed" });
  }
};

// Get all lead forms for user's pages
export const getForms = async (req, res) => {
  const { userId } = req.query;

  try {
    // Step 1: Get user long-lived token
    const [rows] = await db.query(
      "SELECT token FROM api_connections WHERE user_id = ? AND platform_name = ?",
      [userId, "meta_ads"]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    const userToken = rows[0].token;

    // Step 2: Get pages connected to this user
    const pagesResp = await axios.get(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`
    );

    let forms = [];

    // Step 3: For each page, fetch leadgen forms
    for (const page of pagesResp.data.data) {
      const pageId = page.id;
      const pageToken = page.access_token;

      const formResp = await axios.get(
        `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id,name&access_token=${pageToken}`
      );

      forms.push({
        pageId,
        pageName: page.name,
        forms: formResp.data.data
      });
    }

    res.json({ ok: true, forms });
  } catch (err) {
    console.error("Error fetching forms:", err.response?.data || err);
    res.status(500).json({ error: "Failed to fetch forms" });
  }
};



