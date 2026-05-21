mport "dotenv/config";
import { getVendors, findCrmContactForVendor, linkVendorContact } from "../server/db";

async function main() {
  const vendors = await getVendors();
  console.log(`Scanning ${vendors.length} vendors for CRM contact matches...\n`);

  let linked = 0;
  let alreadyLinked = 0;
  let unmatched = 0;
  const unmatchedNames: string[] = [];

  for (const vendor of vendors) {
    if (vendor.contactId) {
      alreadyLinked++;
      continue;
    }
    const match = await findCrmContactForVendor({
      phone: vendor.phone,
      whatsappNumber: vendor.whatsappNumber,
      email: vendor.email,
    });
    if (match) {
      await linkVendorContact(vendor.id, match.id);
      console.log(`  ✓ ${vendor.name} → ${match.fullName || `contact #${match.id}`}`);
      linked++;
    } else {
      unmatched++;
      unmatchedNames.push(vendor.name);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Already linked:    ${alreadyLinked}`);
  console.log(`  Newly auto-linked: ${linked}`);
  console.log(`  No match:          ${unmatched}`);
  if (unmatched > 0 && unmatched <= 50) {
    console.log(`\nVendors without a CRM contact (use the chat button in the UI to link or create one):`);
    for (const name of unmatchedNames) console.log(`  - ${name}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
