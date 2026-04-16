# Payment Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix invisible errors in the verify-payment edge function, improve PayPal error handling on the frontend, and add an `onCancel` handler so users get clear feedback at every failure point.

**Architecture:** The edge function (`verify-payment`) currently returns HTTP 200 for all responses including errors, making failures invisible in Supabase logs. We'll add proper HTTP status codes. On the frontend (`PublicRegistration.tsx`), we'll improve PayPal button error/cancel handling and make error messages specific. No new files needed — this is a targeted fix across two existing files plus one redeployment.

**Tech Stack:** Deno (edge function), React + TypeScript (frontend), PayPal JS SDK (`@paypal/react-paypal-js`)

---

### Task 1: Add proper HTTP status codes to verify-payment edge function

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

This is the highest-impact fix. Every error currently returns HTTP 200, so Supabase dashboard logs show no failures. We change each error `jsonResponse()` call to include the correct HTTP status code.

- [ ] **Step 1: Update validation error responses to return 400**

In `supabase/functions/verify-payment/index.ts`, update every validation/client error to return HTTP 400. Find and update each `jsonResponse({ error: ... })` call in the validation section (before PayPal calls).

Change these lines:

```ts
// Line ~68: Missing attendees
if (!attendees || attendees.length === 0) {
  return jsonResponse({ error: 'Missing required field: attendees' }, 400);
}
```

```ts
// Line ~89: Form not found
if (formError || !formData) {
  return jsonResponse({ error: 'Form not found' }, 404);
}
```

```ts
// Line ~112: Invalid quantity
return jsonResponse({ error: `Invalid quantity for "${item.name}"` }, 400);
```

```ts
// Line ~115: Quantity exceeds max
return jsonResponse({ error: `Quantity for "${item.name}" exceeds maximum of ${item.maxPerOrder}` }, 400);
```

```ts
// Line ~153: Inventory exhausted
return jsonResponse({ error: `"${item.name}" has only ${Math.max(0, remaining)} tickets remaining` }, 409);
```

```ts
// Line ~186: Too many attendees
return jsonResponse({ error: `Too many attendees: expected at most ${maxAttendees}, received ${attendees.length}` }, 400);
```

```ts
// Line ~197: Free registration attempted for paid form
return jsonResponse({ error: 'This registration requires payment. Cannot register as free.' }, 400);
```

```ts
// Line ~209: DB insert error (free path)
return jsonResponse({ error: `Database error: ${insertError.message}` }, 500);
```

- [ ] **Step 2: Update PayPal error responses to return proper status codes**

Continue in the same file, update the paid registration section:

```ts
// Line ~225: Missing paypalOrderId
return jsonResponse({ error: 'Missing required field: paypalOrderId for paid registration' }, 400);
```

```ts
// Line ~261: PayPal credentials not configured
return jsonResponse({ error: 'PayPal credentials not configured on server' }, 500);
```

```ts
// Line ~278: PayPal auth failed
return jsonResponse({ error: 'Failed to authenticate with PayPal API' }, 502);
```

```ts
// Line ~295-299: PayPal capture failed
return jsonResponse({
  error: 'Payment was not completed or PayPal API rejected the request',
  details: captureData.status || captureData.error_description || captureData.message || 'Unknown error',
}, 502);
```

```ts
// Line ~303: No capture data
return jsonResponse({ error: 'No capture data found in PayPal response' }, 502);
```

```ts
// Line ~313-315: Amount mismatch
return jsonResponse({
  error: `Payment amount mismatch. Expected: ${expectedAmount}, Captured: ${capturedAmount}`,
}, 422);
```

```ts
// Line ~321-323: Currency mismatch
return jsonResponse({
  error: `Payment currency mismatch. Expected: ${expectedCurrency}, Captured: ${capturedCurrency}`,
}, 422);
```

```ts
// Line ~332: Duplicate transaction
return jsonResponse({ error: 'This payment has already been processed' }, 409);
```

```ts
// Line ~345: DB insert error (paid path)
return jsonResponse({ error: `Database error: ${insertError.message}` }, 500);
```

- [ ] **Step 3: Update the catch-all error handler to return 500**

```ts
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('verify-payment error:', message);
  return jsonResponse({ error: message }, 500);
}
```

- [ ] **Step 4: Add structured logging with environment info**

Add a log line at the start of the paid path (right after the `useSandbox` determination, around line ~244) so you can see which PayPal environment was selected in the logs:

```ts
console.log(`[verify-payment] mode=${mode}, useSandbox=${useSandbox}, origin=${(req.headers.get('origin') || '').toLowerCase()}, formId=${formId || 'legacy'}, attendees=${attendees.length}`);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/verify-payment/index.ts
git commit -m "fix(verify-payment): return proper HTTP status codes so errors are visible in Supabase logs

Previously all responses returned 200, making payment failures invisible in the dashboard."
```

---

### Task 2: Deploy the updated edge function

**Files:**
- Deploy: `supabase/functions/verify-payment/index.ts`

- [ ] **Step 1: Deploy via Supabase MCP**

Use the Supabase MCP `deploy_edge_function` tool to deploy the updated `verify-payment` function with:
- `project_id`: `iigbgbgakevcgilucvbs`
- `name`: `verify-payment`
- `verify_jwt`: `false` (matching current config)
- `entrypoint_path`: `index.ts`
- `files`: the full content of the updated `index.ts`

- [ ] **Step 2: Verify deployment**

Use the Supabase MCP `get_edge_function` tool to confirm the new version is deployed and the code includes the status code changes.

- [ ] **Step 3: Verify logs show the new format**

Use the Supabase MCP `get_logs` tool with `service: "edge-function"` to confirm the function is still responding (no deployment errors).

---

### Task 3: Add `onCancel` handler and improve PayPal error messages

**Files:**
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Add `onCancel` handler to PayPalButtons**

In `components/PublicRegistration.tsx`, find the `<PayPalButtons` component (around line 1182) and add an `onCancel` prop. Also update the `onError` message to be more specific.

Change from:
```tsx
<PayPalButtons
  style={{
    layout: "vertical",
    shape: "rect",
    tagline: false
  }}
  createOrder={(data, actions) => {
    return actions.order.create({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: ticketField?.ticketConfig?.currency || "USD",
            value: paymentTotal.toFixed(2),
          }
        }
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING"
      }
    });
  }}
  onApprove={onPayPalApprove}
  onError={(err) => {
    console.error("PayPal Error:", err);
    setError("PayPal failed to load. Please verify your Client ID in Settings.");
  }}
/>
```

Change to:
```tsx
<PayPalButtons
  style={{
    layout: "vertical",
    shape: "rect",
    tagline: false
  }}
  createOrder={(data, actions) => {
    return actions.order.create({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: ticketField?.ticketConfig?.currency || "USD",
            value: paymentTotal.toFixed(2),
          }
        }
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING"
      }
    });
  }}
  onApprove={onPayPalApprove}
  onCancel={() => {
    setError("Payment was cancelled. You can try again when you're ready.");
  }}
  onError={(err) => {
    console.error("PayPal Error:", err);
    setError("Something went wrong with PayPal. Please try again or contact the event organizer.");
  }}
/>
```

- [ ] **Step 2: Improve the error display on the payment step**

Currently when `setStep('form')` is called on error (line 629), the user is bounced back to the form and may not see the error. The payment page also needs to show the error. Check that the error banner is visible on the payment step. Find the payment step rendering section (around line 1130) and ensure the error alert is displayed there too. 

Find the existing error display in the payment section. If there isn't one, add it right before the PayPal total summary. Look for `{step === 'payment' && (` and add inside the payment block, near the top:

```tsx
{error && (
  <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-start gap-2">
    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
    <span>{error}</span>
  </div>
)}
```

- [ ] **Step 3: Keep user on payment step when PayPal errors occur (don't bounce to form)**

In the `finalizeRegistration` catch block (around line 625), change `setStep('form')` to only go back to form for non-payment errors. For payment errors, keep the user on the payment step so they can retry:

Change from:
```ts
} catch (registrationError: any) {
  console.error('Registration failed:', registrationError);
  setError(registrationError.message || 'An unexpected error occurred. Please try again.');
  setLoading(false);
  setStep('form');
}
```

Change to:
```ts
} catch (registrationError: any) {
  console.error('Registration failed:', registrationError);
  setError(registrationError.message || 'An unexpected error occurred. Please try again.');
  setLoading(false);
  // Stay on payment step so user can retry PayPal — don't bounce back to form
  if (step !== 'payment') {
    setStep('form');
  }
}
```

- [ ] **Step 4: Clear error when user interacts with PayPal again**

In the `onPayPalApprove` handler (around line 634), clear any previous error at the start:

Change from:
```ts
const onPayPalApprove = async (data: any, actions: any) => {
  const paypalOrderId = data.orderID;
  const expectedCurrency = ticketField?.ticketConfig?.currency || "USD";
  finalizeRegistration('paid', paypalOrderId, `${paymentTotal} ${expectedCurrency}`);
};
```

Change to:
```ts
const onPayPalApprove = async (data: any, actions: any) => {
  setError('');
  const paypalOrderId = data.orderID;
  const expectedCurrency = ticketField?.ticketConfig?.currency || "USD";
  finalizeRegistration('paid', paypalOrderId, `${paymentTotal} ${expectedCurrency}`);
};
```

- [ ] **Step 5: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "fix(registration): add PayPal onCancel handler, improve error messages and UX

- Add onCancel so users see clear feedback when they close the PayPal popup
- Keep user on payment step on error instead of bouncing back to form
- Show error banner on payment step
- Clear errors when retrying payment"
```

---

### Task 4: Guard against payment captured but DB insert failing

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

This is the scenario where PayPal captures money successfully but the database insert fails, leaving no record. We add a console.error with full context so the payment can be manually recovered.

- [ ] **Step 1: Add detailed recovery logging when DB insert fails after capture**

In `supabase/functions/verify-payment/index.ts`, find the paid path's DB insert error handler (the `insertError` check after `upsert` in the paid section, around line 345). Enhance the logging so a failed insert after successful capture gives enough info to recover:

Change from:
```ts
if (insertError) {
  console.error('Failed to save attendees:', insertError);
  return jsonResponse({ error: `Database error: ${insertError.message}` }, 500);
}
```

Change to:
```ts
if (insertError) {
  // CRITICAL: Payment was captured but attendees failed to save.
  // Log full details for manual recovery.
  console.error('CRITICAL: Payment captured but DB insert failed!', JSON.stringify({
    transactionId,
    capturedAmount,
    capturedCurrency,
    formId: formId || 'legacy',
    attendeeCount: stampedAttendees.length,
    primaryName: stampedAttendees[0]?.name,
    primaryEmail: stampedAttendees[0]?.email,
    dbError: insertError.message,
  }));
  return jsonResponse({
    error: `Your payment was processed but we encountered a database error saving your registration. Please contact the event organizer with this reference: ${transactionId}`,
  }, 500);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/verify-payment/index.ts
git commit -m "fix(verify-payment): add critical recovery logging when DB insert fails after payment capture

Logs transaction ID, amount, and attendee details so captured-but-unsaved payments can be manually recovered."
```

---

### Task 5: Deploy final edge function and verify

- [ ] **Step 1: Deploy the final version via Supabase MCP**

Same as Task 2 — deploy the edge function with both Task 1 and Task 4 changes included.

- [ ] **Step 2: Verify the deployment**

Use Supabase MCP `get_edge_function` to confirm the latest version is live.

- [ ] **Step 3: Final commit for deployment record**

No code change needed — just verify everything is deployed and working.
