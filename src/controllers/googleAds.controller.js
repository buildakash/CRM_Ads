import {
    getGoogleAdsAuthUrl,
    exchangeAdsCode,
    listAccessibleCustomers,
    setSelectedCustomerId,
    searchStreamGAQL,
  } from "../services/googleAds.service.js";
  import { mem } from "../store/memory.js";
  
  export function startGoogleAdsConnect(_req, res) {
    res.redirect(getGoogleAdsAuthUrl());
  }
  
  export async function googleAdsCallback(req, res) {
    try {
      const { code } = req.query;
      if (!code) return res.status(400).json({ error: "Missing code" });
  
      await exchangeAdsCode(code);
      const resourceNames = await listAccessibleCustomers(); // ["customers/1234567890", ...]
      res.json({
        message: "Google Ads connected. Choose a customer to proceed.",
        accessibleCustomerResourceNames: resourceNames,
        tip: "POST one resourceName to /ads/google/select-customer",
      });
    } catch (e) {
      res.status(400).json({ error: e?.response?.data || e.message });
    }
  }
  
  export async function selectCustomer(req, res) {
    try {
      const { customerResourceName } = req.body || {};
      const id = await setSelectedCustomerId(customerResourceName);
      res.json({ ok: true, selectedCustomerId: id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
  
  export async function summaryLast7Days(_req, res) {
    try {
      const GAQL = `
        SELECT
          campaign.id, campaign.name,
          metrics.impressions, metrics.clicks, metrics.cost_micros
        FROM campaign
        WHERE segments.date DURING LAST_7_DAYS
        ORDER BY metrics.impressions DESC
        LIMIT 20
      `;
      const rows = await searchStreamGAQL(GAQL);
      res.json({
        customerId: mem.googleAds.selectedCustomerId,
        items: rows.map(r => ({
          campaignId: r.campaign?.id,
          campaignName: r.campaign?.name,
          impressions: r.metrics?.impressions,
          clicks: r.metrics?.clicks,
          costMicros: r.metrics?.costMicros,
        })),
      });
    } catch (e) {
      res.status(400).json({ error: e?.response?.data || e.message });
    }
  }
  