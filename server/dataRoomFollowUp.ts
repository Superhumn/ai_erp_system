/**
 * Data Room Follow-Up Email Service
 * Sends follow-up emails 1 week after data room is viewed
 */
import * as db from "./db";

export async function sendDataRoomFollowUps() {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Get visitors who viewed 7-14 days ago and haven't been followed up
    const allVisitors = await (db as any).getDataRoomVisitors?.();
    if (!allVisitors) return { sent: 0 };

    const { sendEmail } = await import("./_core/email");
    let sent = 0;

    for (const visitor of allVisitors) {
      const viewDate = new Date(visitor.lastViewedAt || visitor.createdAt);
      
      // Only follow up if viewed 7-14 days ago
      if (viewDate > oneWeekAgo || viewDate < twoWeeksAgo) continue;
      
      // Skip if already followed up (check notes or a flag)
      if ((visitor as any).followUpSent) continue;
      
      const email = visitor.email;
      if (!email) continue;

      const name = visitor.name || email.split("@")[0];

      try {
        await sendEmail({
          to: email,
          subject: "Following up — Superhumn Data Room",
          html: `
            <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
              <p>Hi ${name},</p>
              
              <p>Thanks for taking the time to review our data room last week. I hope you found the information helpful.</p>
              
              <p>I'd love to hear your thoughts and answer any questions. Would you be open to a quick follow-up call?</p>
              
              <div style="margin: 24px 0;">
                <a href="https://calendly.com/jade510" 
                   style="display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-right: 12px;">
                  Schedule a Call with Jade
                </a>
              </div>
              
              <p>If this isn't the right fit or timing, I completely understand. A quick note on why would be incredibly valuable for us:</p>
              
              <div style="margin: 20px 0; padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid #6366f1;">
                <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">Quick feedback (optional):</p>
                <p style="margin: 0; font-size: 13px; color: #666;">
                  Simply reply to this email with a brief reason — timing, stage, sector focus, terms, or anything else. It helps us improve.
                </p>
              </div>
              
              <p>Either way, thank you for considering Superhumn. We're excited about what we're building and hope to stay connected.</p>
              
              <p>Best,<br>
              <strong>Jade Cheng</strong><br>
              Superhumn Inc<br>
              <a href="https://calendly.com/jade510" style="color: #6366f1;">calendly.com/jade510</a></p>
            </div>
          `,
        });

        // Mark as followed up
        try {
          await db.updateDataRoomVisitor?.(visitor.id, { followUpSent: true } as any);
        } catch {
          // Column might not exist yet, skip
        }

        sent++;
      } catch (e) {
        console.warn(`[Data Room Follow-Up] Failed to send to ${email}:`, e);
      }
    }

    return { sent };
  } catch (e) {
    console.warn("[Data Room Follow-Up] Error:", e);
    return { sent: 0 };
  }
}
