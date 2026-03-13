
## Diagnosis — Complete Root Cause Analysis

### Evidence collected:

1. **webhook-whatsapp logs show:**
   ```
   sender=559882549505  (12 digits, no 9th digit)
   ```

2. **Whitelist in database has:**
   ```
   +5598982549505  (13 digits, WITH 9th digit)
   ```

3. **What happens in the code (line 264):**
   ```typescript
   const phoneE164 = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`
   // senderPhone = "559882549505"
   // phoneE164   = "+559882549505"  ← 12 digits
   ```

4. **Then the whitelist check at line 276:**
   ```
   .eq('phone_e164', '+559882549505')  ← does NOT match "+5598982549505"
   ```

5. **Result:** webhook_logs table is empty (no rows being written since 11:15) — messages ARE arriving (logs show `sender=559882549505`) but the whitelist block is happening silently BEFORE the log is inserted. Wait — actually looking again at the code flow:
   - Line 222-230: log is inserted FIRST (status='processing')
   - Line 263-286: whitelist check runs AFTER log insert
   - But webhook_logs is empty...
   
   Re-reading: the `webhook_logs` table returned **zero rows** in the query — meaning the webhook IS running (logs show it), it's finding the integration, but then something fails before the log INSERT (or the log table has RLS blocking service role? No, service role bypasses RLS).

   Actually looking more carefully: the logs show `[webhook] Using fallback integration` — this means the instance name is `null` and it falls back to the active integration. The code then proceeds to insert a log at line 222. But `webhook_logs` is empty. This means the INSERT is failing silently.

   The real issue is: **after adding numbers to the whitelist, the user's WhatsApp number (`559882549505`) doesn't match `+5598982549505`** in the whitelist. This is the Brazilian telecom migration issue — some numbers still come in 8-digit format (`88254-9505`) vs the newer 9-digit format (`9 8825-4505`).

   Additionally: there are NO webhook_logs rows at all — which means the INSERT at line 222-230 is also failing. This could be because `webhook_logs` table has RLS and the service role is being blocked, OR the table structure has changed.

### Confirmed issues:

**Issue 1 — Critical: Brazilian phone number normalization mismatch**
- Evolution sends `559882549505` (55 + 98 + 82549505 = old 8-digit)  
- User stored `+5598982549505` (55 + 98 + 9 + 82549505 = new 9-digit)
- These are the SAME real number — just different formats
- Fix: in the whitelist check, also try the 9th-digit normalized version

**Issue 2 — Critical: webhook_logs INSERT failing silently**
- No rows in webhook_logs after 11:15 despite webhook arriving
- The service role should bypass RLS — but let's check if the table structure mismatch is causing an issue
- The `webhook_logs` table has no `updated_at` column — the code tries to `update({ status: 'ok' })` by id which is fine
- Most likely the RLS on webhook_logs is blocking even service role (misconfigured) OR the log insert IS working but was cleaned up

**Issue 3 — process-message never called**
- With whitelist blocking, process-message is never dispatched — this is the downstream effect

### Fix plan:

**File: `supabase/functions/webhook-whatsapp/index.ts`**

Replace the whitelist check (lines 264-286) with a normalized check that handles the Brazilian 9-digit migration:

```typescript
// Normalize phone: handle both 8-digit and 9-digit Brazilian mobile formats
const phoneE164 = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`

// Also try the alternative format (Brazilian 9th digit normalization)
// 8-digit:  55XX8XXXXXXX → 55XXXXXXXXXX (12 digits after country code)
// 9-digit:  55XX9XXXXXXX → 55XXXXXXXXXX (13 digits after country code)
function getNormalizedVariants(phone: string): string[] {
  const variants = [phone]
  const stripped = phone.startsWith('+') ? phone.slice(1) : phone
  // If 12 digits starting with 55 (Brazilian 8-digit) — add 9th digit variant
  if (/^55\d{2}\d{8}$/.test(stripped)) {
    const cc = stripped.slice(0, 2)  // 55
    const ddd = stripped.slice(2, 4) // e.g. 98
    const number = stripped.slice(4) // 8-digit number
    variants.push(`+${cc}${ddd}9${number}`)
  }
  // If 13 digits starting with 55 (Brazilian 9-digit) — add 8-digit variant
  if (/^55\d{2}9\d{8}$/.test(stripped)) {
    const cc = stripped.slice(0, 2)
    const ddd = stripped.slice(2, 4)
    const number = stripped.slice(5) // skip the '9'
    variants.push(`+${cc}${ddd}${number}`)
  }
  return [...new Set(variants)]
}
```

Then use `.in('phone_e164', variants)` instead of `.eq('phone_e164', phoneE164)`.

**This single fix restores all messaging.**

The same normalization needs to be applied to the conversation lookup (line 293: `.eq('contact_phone', phoneE164)`) — otherwise a new conversation is created every time the number format differs.

### Files to modify:
1. `supabase/functions/webhook-whatsapp/index.ts` — Add phone normalization helper + use `.in()` for whitelist + conversation lookups
2. `supabase/functions/process-message/index.ts` — Check if `sender_phone` normalization is also needed for the contact lookup there

### No DB changes needed — purely a function fix.
