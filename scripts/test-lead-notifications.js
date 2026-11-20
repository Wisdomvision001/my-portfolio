import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodemailer from 'nodemailer';

/**
 * Lead Notification Workflow, Resend Payload & Gmail SMTP Verification Test
 *
 * Triggers the real lead notification workflow (`createLead` + `dispatchLeadEmails`)
 * using dummy customer details with `audiwisdom4@gmail.com` as the customer email,
 * intercepts outbound Resend API and Gmail SMTP calls BEFORE network transmission,
 * and verifies:
 *   1. Exact Resend API endpoint, method, Authorization, and Idempotency-Key headers.
 *   2. Exact Gmail SMTP transport host/port/auth (`GMAIL_SMTP_USER` / `GMAIL_SMTP_APP_PASSWORD`)
 *      and sender identity (`Wisdom Audi Universe <wisdomaudiuniverse@gmail.com>`).
 *   3. Strict separation between customer recipient (`audiwisdom4@gmail.com`) and
 *      agency notification recipient (`wisdomaudiuniverse@gmail.com`).
 *   4. Secret protection (`GMAIL_SMTP_APP_PASSWORD` never exposed in config summaries/logs).
 *   5. Duplicate-send protection and honest failure handling (`403` Resend / `rejected` SMTP).
 */

const CUSTOMER_EMAIL = 'audiwisdom4@gmail.com';
const AGENCY_EMAIL = 'wisdomaudiuniverse@gmail.com';
const VERIFIED_RESEND_FROM = 'Wisdom Audi Universe <notifications@wisdomaudiuniverse.com>';
const TEST_APP_PASSWORD = 'test-only-16ch-pass';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wau-notif-test-'));
const tempDbPath = path.join(tempDir, 'test-leads.sqlite');

process.env.WISDOM_DB_PATH = tempDbPath;
process.env.RESEND_API_KEY = 're_test_payload_verification_key';
process.env.RESEND_FROM = VERIFIED_RESEND_FROM;
process.env.LEAD_NOTIFY_TO = AGENCY_EMAIL;
process.env.GMAIL_SMTP_USER = AGENCY_EMAIL;
delete process.env.GMAIL_SMTP_APP_PASSWORD;

const capturedResendRequests = [];
let mockResendHttpStatus = 200;
let mockResendResponseBody = (idx) => ({ id: `re_mock_msg_${idx}` });

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const urlStr = String(url);
  if (urlStr === 'https://api.resend.com/emails') {
    const rawBody = typeof init.body === 'string' ? init.body : '';
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const entry = {
      index: capturedResendRequests.length + 1,
      url: urlStr,
      method: init.method || 'GET',
      headers: init.headers || {},
      payload: parsedBody
    };
    capturedResendRequests.push(entry);

    const jsonBody =
      typeof mockResendResponseBody === 'function'
        ? mockResendResponseBody(entry.index)
        : mockResendResponseBody;
    return new Response(JSON.stringify(jsonBody), {
      status: mockResendHttpStatus,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return originalFetch(url, init);
};

const capturedSmtpDispatches = [];
let mockSmtpRejectRecipients = false;
const originalCreateTransport = nodemailer.createTransport.bind(nodemailer);
nodemailer.createTransport = (transportCfg) => ({
  async verify() {
    return true;
  },
  async sendMail(mailOptions) {
    capturedSmtpDispatches.push({ transportCfg, mailOptions });
    if (mockSmtpRejectRecipients) {
      return {
        messageId: '<rejected-test@wisdomaudiuniverse.com>',
        accepted: [],
        rejected: [mailOptions.to]
      };
    }
    return {
      messageId: `<smtp-mock-${capturedSmtpDispatches.length}@wisdomaudiuniverse.com>`,
      accepted: [mailOptions.to],
      rejected: []
    };
  }
});

try {
  const dbMod = await import('../lib/db.js');
  const notifMod = await import('../lib/notifications.js');

  const referenceId = `WAU-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const dummyLeadInput = {
    referenceId,
    submittedAt: new Date().toISOString(),
    fullName: 'Adaeze Okafor',
    businessName: 'Meridian Horizon Logistics',
    email: CUSTOMER_EMAIL,
    industry: 'Logistics & Transportation',
    solutionType: 'Workflow & Business Process Automation',
    challenge:
      'Automate inbound dispatch enquiries, shipment status replies, and CRM logging.',
    desiredOutcome: 'Cut inbound enquiry response times under 60 seconds',
    interestLevel: 'evaluating',
    discoverySummary:
      'High inbound email/WhatsApp volume; suitable for AI triage + automated CRM updates.',
    dedupeHash: dbMod.computeLeadDedupeHash({
      email: CUSTOMER_EMAIL,
      businessName: 'Meridian Horizon Logistics',
      challenge:
        'Automate inbound dispatch enquiries, shipment status replies, and CRM logging.'
    }),
    source: 'wisdom-ai-assistant'
  };

  const savedLead = dbMod.createLead(dummyLeadInput);
  assert.ok(savedLead, 'Dummy lead should be persisted before dispatch');
  assert.equal(savedLead.email, CUSTOMER_EMAIL);

  console.log(`\n[1/6] Triggering Resend dispatchLeadEmails() for ${savedLead.referenceId}...`);
  const results = await notifMod.dispatchLeadEmails(savedLead, { sendCatalogue: true });

  assert.equal(capturedResendRequests.length, 3, 'Expected exactly 3 Resend API requests');
  assert.equal(results.customerConfirmation.status, 'sent');
  assert.equal(results.agencyNotification.status, 'sent');
  assert.equal(results.servicesCatalogue.status, 'sent');

  const [customerReq, agencyReq, catalogueReq] = capturedResendRequests;

  for (const req of capturedResendRequests) {
    assert.equal(req.url, 'https://api.resend.com/emails');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.Authorization, `Bearer ${process.env.RESEND_API_KEY}`);
    assert.equal(req.headers['Content-Type'], 'application/json');
    assert.ok(
      typeof req.headers['Idempotency-Key'] === 'string' && req.headers['Idempotency-Key'].length >= 16,
      'Each Resend call must carry an Idempotency-Key header'
    );
    assert.equal(req.payload.from, VERIFIED_RESEND_FROM);
    assert.ok(Array.isArray(req.payload.to) && req.payload.to.length === 1);
    assert.ok(req.payload.subject && req.payload.text && req.payload.html);
  }

  assert.equal(
    new Set(capturedResendRequests.map((r) => r.headers['Idempotency-Key'])).size,
    3,
    'Each email type must use a unique Idempotency-Key'
  );

  const custTo = customerReq.payload.to[0];
  const agencyTo = agencyReq.payload.to[0];
  const catTo = catalogueReq.payload.to[0];

  assert.notEqual(custTo, agencyTo, 'Customer and agency recipients must differ');
  assert.equal(custTo, CUSTOMER_EMAIL);
  assert.equal(customerReq.payload.reply_to, AGENCY_EMAIL);
  assert.match(customerReq.payload.subject, new RegExp(referenceId));
  assert.match(customerReq.payload.text, /Adaeze Okafor/);

  assert.equal(agencyTo, AGENCY_EMAIL);
  assert.equal(agencyReq.payload.reply_to, CUSTOMER_EMAIL);
  assert.match(agencyReq.payload.subject, new RegExp(referenceId));
  assert.match(agencyReq.payload.text, new RegExp(CUSTOMER_EMAIL));

  assert.equal(catTo, CUSTOMER_EMAIL);
  assert.equal(catalogueReq.payload.reply_to, AGENCY_EMAIL);
  assert.match(catalogueReq.payload.subject, /Services Catalogue/);

  console.log('[2/6] Resend payload inspection passed.');

  console.log('[3/6] Verifying duplicate-send protection...');
  const dupResults = await notifMod.dispatchLeadEmails(savedLead, { sendCatalogue: true });
  assert.equal(capturedResendRequests.length, 3, 'Duplicate dispatch must not invoke Resend API again');
  assert.equal(dupResults.customerConfirmation.status, 'duplicate_prevented');
  assert.equal(dupResults.agencyNotification.status, 'duplicate_prevented');
  assert.equal(dupResults.servicesCatalogue.status, 'duplicate_prevented');

  console.log('[4/6] Verifying Resend HTTP 403 domain_unverified handling...');
  mockResendHttpStatus = 403;
  mockResendResponseBody = {
    statusCode: 403,
    name: 'validation_error',
    message: 'The domain is not verified yet on Resend.'
  };

  const refFail = `WAU-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const failLead = dbMod.createLead({
    ...dummyLeadInput,
    referenceId: refFail,
    dedupeHash: `${dummyLeadInput.dedupeHash}-fail`
  });
  const failResult = await notifMod.sendCustomerConfirmationEmail(failLead);
  assert.equal(failResult.status, 'domain_unverified');
  assert.equal(failResult.httpStatus, 403);

  console.log('[5/6] Verifying Gmail SMTP sender identity, recipient separation & secret safety...');
  // Switch env to unverified Resend + configured Gmail SMTP
  process.env.RESEND_FROM = AGENCY_EMAIL;
  process.env.GMAIL_SMTP_USER = AGENCY_EMAIL;
  process.env.GMAIL_SMTP_APP_PASSWORD = TEST_APP_PASSWORD;

  const summary = notifMod.getEmailConfigSummary();
  assert.equal(summary.activeTransport, 'gmail_smtp');
  assert.equal(summary.gmailSmtpUser, AGENCY_EMAIL);
  assert.equal(summary.gmailSmtpFrom, `Wisdom Audi Universe <${AGENCY_EMAIL}>`);
  assert.equal(summary.agencyNotifyTo, AGENCY_EMAIL);
  assert.equal(summary.gmailSmtpPasswordConfigured, true);
  assert.equal(
    JSON.stringify(summary).includes(TEST_APP_PASSWORD),
    false,
    'Config summary must NEVER expose GMAIL_SMTP_APP_PASSWORD'
  );

  const refGmail = `WAU-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const gmailLead = dbMod.createLead({
    ...dummyLeadInput,
    referenceId: refGmail,
    dedupeHash: `${dummyLeadInput.dedupeHash}-gmail`
  });
  const gmailRes = await notifMod.dispatchLeadEmails(gmailLead, { sendCatalogue: true });

  assert.equal(gmailRes.customerConfirmation.status, 'sent');
  assert.equal(gmailRes.agencyNotification.status, 'sent');
  assert.equal(gmailRes.servicesCatalogue.status, 'sent');
  assert.equal(capturedSmtpDispatches.length, 3);

  const [smtpCust, smtpAgency, smtpCat] = capturedSmtpDispatches;
  assert.equal(smtpCust.transportCfg.host, 'smtp.gmail.com');
  assert.equal(smtpCust.transportCfg.port, 465);
  assert.equal(smtpCust.transportCfg.secure, true);
  assert.equal(smtpCust.transportCfg.auth.user, AGENCY_EMAIL);

  assert.equal(smtpCust.mailOptions.from, `Wisdom Audi Universe <${AGENCY_EMAIL}>`);
  assert.equal(smtpCust.mailOptions.to, CUSTOMER_EMAIL);
  assert.equal(smtpCust.mailOptions.replyTo, AGENCY_EMAIL);

  assert.equal(smtpAgency.mailOptions.from, `Wisdom Audi Universe <${AGENCY_EMAIL}>`);
  assert.equal(smtpAgency.mailOptions.to, AGENCY_EMAIL);
  assert.equal(smtpAgency.mailOptions.replyTo, CUSTOMER_EMAIL);

  assert.equal(smtpCat.mailOptions.from, `Wisdom Audi Universe <${AGENCY_EMAIL}>`);
  assert.equal(smtpCat.mailOptions.to, CUSTOMER_EMAIL);
  assert.equal(smtpCat.mailOptions.replyTo, AGENCY_EMAIL);

  console.log('[6/6] Verifying Gmail SMTP rejected-recipient failure detection...');
  mockSmtpRejectRecipients = true;
  const refSmtpReject = `WAU-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const rejectLead = dbMod.createLead({
    ...dummyLeadInput,
    referenceId: refSmtpReject,
    dedupeHash: `${dummyLeadInput.dedupeHash}-reject`
  });
  const rejectResult = await notifMod.sendCustomerConfirmationEmail(rejectLead);
  assert.equal(rejectResult.status, 'failed', 'Rejected Gmail SMTP recipient must never report sent');
  assert.match(rejectResult.detail, /rejected recipient/i);

  console.log('\nPASS: All Resend + Gmail SMTP lead notification checks succeeded.');
  console.log(`      Customer recipient verified: ${CUSTOMER_EMAIL}`);
  console.log(`      Agency recipient verified:   ${AGENCY_EMAIL}`);
} finally {
  nodemailer.createTransport = originalCreateTransport;
  globalThis.fetch = originalFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
