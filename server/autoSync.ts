import * as db from "./db";

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSync() {
  if (syncTimer) return;

  // Check every 60 seconds for syncs that need to run
  syncTimer = setInterval(async () => {
    try {
      const settings = await db.getEnabledSyncSettings();
      const now = new Date();

      for (const setting of settings) {
        // Skip if next sync is in the future
        if (setting.nextSyncAt && new Date(setting.nextSyncAt) > now) continue;
        if (!setting.accessToken) continue;

        console.log(`[AutoSync] Running ${setting.direction} sync for ${setting.integration}`);

        try {
          if (setting.integration === 'salesforce' && setting.instanceUrl) {
            await runSalesforceSync(setting);
          } else if (setting.integration === 'airtable' && setting.baseId && setting.tableId) {
            await runAirtableSync(setting);
          } else if (setting.integration === 'hubspot') {
            await runHubspotSync(setting);
          }

          await db.updateSyncTimestamp(setting.integration);
        } catch (error: any) {
          console.error(`[AutoSync] Error syncing ${setting.integration}:`, error.message);
          await db.createSyncLog({
            integration: setting.integration,
            action: 'auto_sync',
            status: 'error',
            errorMessage: error.message,
          });
          // Still update timestamp to prevent rapid retries
          await db.updateSyncTimestamp(setting.integration);
        }
      }
    } catch (error) {
      console.error("[AutoSync] Scheduler error:", error);
    }
  }, 60_000);

  console.log("[AutoSync] Scheduler started (checking every 60s)");
}

export function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[AutoSync] Scheduler stopped");
  }
}

async function runSalesforceSync(setting: any) {
  const { accessToken, instanceUrl, direction } = setting;

  // Inbound: Salesforce -> ERP
  if (direction !== 'outbound') {
    const response = await fetch(
      `${instanceUrl}/services/data/v59.0/query/?q=` +
        encodeURIComponent('SELECT Id, FirstName, LastName, Email, Phone, MailingCity, MailingState, MailingCountry, Account.Name, Title FROM Contact ORDER BY LastModifiedDate DESC LIMIT 200'),
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );

    if (response.ok) {
      const data = await response.json();
      let imported = 0, updated = 0;
      for (const sc of (data.records || [])) {
        const existing = await db.getCustomerBySalesforceId(sc.Id);
        const custData = {
          name: `${sc.FirstName || ''} ${sc.LastName || ''}`.trim() || sc.Email || 'Unknown',
          email: sc.Email || undefined,
          phone: sc.Phone || undefined,
          salesforceContactId: sc.Id,
          syncSource: 'salesforce' as const,
          lastSyncedAt: new Date(),
          salesforceData: JSON.stringify(sc),
        };
        if (existing) { await db.updateCustomer(existing.id, custData); updated++; }
        else { await db.createCustomer(custData); imported++; }
      }

      await db.createSyncLog({
        integration: 'salesforce',
        action: 'auto_sync_inbound',
        status: 'success',
        details: `Imported ${imported}, Updated ${updated}`,
        recordsProcessed: imported + updated,
      });
    }
  }

  // Outbound: ERP -> Salesforce
  if (direction !== 'inbound') {
    const since = setting.lastSyncAt || new Date(Date.now() - (setting.intervalMinutes || 15) * 60_000);
    const modified = await db.getCustomersModifiedSince(since);
    let pushed = 0, failed = 0;

    for (const c of modified.filter((m: any) => m.salesforceContactId)) {
      try {
        const nameParts = (c.name || '').split(' ');
        const res = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/${c.salesforceContactId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ FirstName: nameParts[0], LastName: nameParts.slice(1).join(' ') || nameParts[0], Email: c.email, Phone: c.phone }),
        });
        if (res.ok || res.status === 204) pushed++; else failed++;
      } catch { failed++; }
    }

    if (pushed > 0 || failed > 0) {
      await db.createSyncLog({
        integration: 'salesforce',
        action: 'auto_sync_outbound',
        status: failed > 0 ? 'warning' : 'success',
        details: `Pushed ${pushed}${failed > 0 ? `, ${failed} failed` : ''}`,
        recordsProcessed: pushed,
        recordsFailed: failed,
      });
    }
  }
}

async function runAirtableSync(setting: any) {
  const { accessToken, baseId, tableId, direction } = setting;

  // Inbound
  if (direction !== 'outbound') {
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}?maxRecords=200`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );

    if (response.ok) {
      const data = await response.json();
      let imported = 0, updated = 0;
      for (const rec of (data.records || [])) {
        const f = rec.fields || {};
        const getF = (...names: string[]) => {
          for (const n of names) {
            const k = Object.keys(f).find(k => k.toLowerCase() === n.toLowerCase());
            if (k && f[k]) return String(f[k]);
          }
          return undefined;
        };
        const name = getF('Name', 'Full Name') || [getF('First Name'), getF('Last Name')].filter(Boolean).join(' ') || getF('Email') || 'Unknown';
        const existing = await db.getCustomerByAirtableId(rec.id);
        const custData = {
          name,
          email: getF('Email') || undefined,
          phone: getF('Phone') || undefined,
          airtableRecordId: rec.id,
          syncSource: 'airtable' as const,
          lastSyncedAt: new Date(),
          airtableData: JSON.stringify(rec),
        };
        if (existing) { await db.updateCustomer(existing.id, custData); updated++; }
        else { await db.createCustomer(custData); imported++; }
      }

      await db.createSyncLog({
        integration: 'airtable',
        action: 'auto_sync_inbound',
        status: 'success',
        details: `Imported ${imported}, Updated ${updated}`,
        recordsProcessed: imported + updated,
      });
    }
  }

  // Outbound
  if (direction !== 'inbound') {
    const since = setting.lastSyncAt || new Date(Date.now() - (setting.intervalMinutes || 15) * 60_000);
    const modified = await db.getCustomersModifiedSince(since);
    const toUpdate = modified.filter((c: any) => c.airtableRecordId);
    let pushed = 0, failed = 0;

    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10).map((c: any) => ({
        id: c.airtableRecordId,
        fields: { 'Name': c.name, 'Email': c.email || '', 'Phone': c.phone || '' },
      }));
      try {
        const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: batch }),
        });
        if (res.ok) pushed += batch.length; else failed += batch.length;
      } catch { failed += batch.length; }
    }

    if (pushed > 0 || failed > 0) {
      await db.createSyncLog({
        integration: 'airtable',
        action: 'auto_sync_outbound',
        status: failed > 0 ? 'warning' : 'success',
        details: `Pushed ${pushed}${failed > 0 ? `, ${failed} failed` : ''}`,
        recordsProcessed: pushed,
        recordsFailed: failed,
      });
    }
  }
}

async function runHubspotSync(setting: any) {
  const { accessToken, direction } = setting;

  // Inbound
  if (direction !== 'outbound') {
    const response = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=email,firstname,lastname,phone,company',
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );

    if (response.ok) {
      const data = await response.json();
      let imported = 0, updated = 0;
      for (const hc of (data.results || [])) {
        const props = hc.properties || {};
        const existing = await db.getCustomerByHubspotId(hc.id.toString());
        const custData = {
          name: `${props.firstname || ''} ${props.lastname || ''}`.trim() || props.email || 'Unknown',
          email: props.email || undefined,
          phone: props.phone || undefined,
          hubspotContactId: hc.id.toString(),
          syncSource: 'hubspot' as const,
          lastSyncedAt: new Date(),
          hubspotData: JSON.stringify(hc),
        };
        if (existing) { await db.updateCustomer(existing.id, custData); updated++; }
        else { await db.createCustomer(custData); imported++; }
      }

      await db.createSyncLog({
        integration: 'hubspot',
        action: 'auto_sync_inbound',
        status: 'success',
        details: `Imported ${imported}, Updated ${updated}`,
        recordsProcessed: imported + updated,
      });
    }
  }
}
