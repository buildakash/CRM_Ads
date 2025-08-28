// src/services/googleDb.service.js
import { getDb } from "../db.js";

/**
 * Save (or update) the Google Ads token for a user
 * - Stores access_token, refresh_token, and expiry
 * - Keeps platform_name = 'google'
 */
export async function upsertGoogleConnection(userId, { access_token, refresh_token, expires_in }) {
    const db = await getDb();
    const sql = `
      INSERT INTO api_connections
        (user_id, platform_name, token, refresh_token, status, token_expires_at)
      VALUES
        (?, 'google', ?, ?, 'connected', DATE_ADD(NOW(), INTERVAL ? SECOND))
      ON DUPLICATE KEY UPDATE
        token = VALUES(token),
        refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
        status = VALUES(status),
        token_expires_at = VALUES(token_expires_at)
    `;
    await db.query(sql, [
      Number(userId),
      access_token || null,
      refresh_token || null,
      Number(expires_in || 3600),
    ]);
  }

/** Save selected Google customer ID (stored in ad_account_id) */
export async function saveGoogleSelectedCustomer(userId, customerId) {
    const db = await getDb();
    const sql = `
      INSERT INTO api_connections (user_id, platform_name, ad_account_id, status)
      VALUES (?, 'google', ?, 'connected')
      ON DUPLICATE KEY UPDATE ad_account_id = VALUES(ad_account_id)
    `;
    await db.query(sql, [Number(userId), String(customerId)]);
  }

  // Add these below your existing exports
  export async function getGoogleConnectionStatus(userId) {
    const db = await getDb();
    const [rows] = await db.query(
      `SELECT token_expires_at, ad_account_id, refresh_token
       FROM api_connections
       WHERE user_id=? AND platform_name='google' LIMIT 1`,
      [Number(userId)]
    );
    if (!rows.length) {
      return { connected: false, reason: "no_row" };
    }
    const r = rows[0];
    const expiresAt = r.token_expires_at ? new Date(r.token_expires_at) : null;
    const secsLeft = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : 0;
  
    return {
      connected: true,
      selectedCustomerId: r.ad_account_id ? String(r.ad_account_id) : null,
      hasRefreshToken: !!r.refresh_token,
      tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
      secondsToExpiry: secsLeft,
    };
  }
  
  export function tokenIsFresh(row) {
    if (!row?.token_expires_at) return false;
    // treat as fresh if > 60s remaining
    return new Date(row.token_expires_at).getTime() - Date.now() > 60_000;
  }
  
  export async function getGoogleConnection(userId) {
    const db = await getDb();
    const [rows] = await db.query(
      `SELECT user_id, platform_name, token, refresh_token, token_expires_at, ad_account_id
       FROM api_connections 
       WHERE user_id = ? 
         AND platform_name = 'google' 
       LIMIT 1`,
      [Number(userId)]
    );
    return rows.length > 0 ? rows[0] : null;
  }
  
  export async function getGoogleSummary(userId) {
    const row = await getGoogleConnection(userId);
    if (!row) return null;
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
    const secondsToExpiry = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : null;
    return {
      connected: !!row.token || !!row.refresh_token,
      selectedCustomerId: row.ad_account_id ? String(row.ad_account_id) : null,
      hasRefreshToken: !!row.refresh_token,
      tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
      secondsToExpiry,
    };
  }
  
