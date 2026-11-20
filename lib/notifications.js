import crypto from 'crypto';
import nodemailer from 'nodemailer';
import {
  createNotificationLogEntry,
  findExistingEmailDispatch,
  parseRetentionDays,
  updateLeadCatalogueEmail,
  updateLeadCustomerEmail,
  updateLeadNotification,
  updateNotificationLogEntry
} from './db.js';

const FREE_WEBMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com'
]);

const RESERVED_DOMAINS = new Set(['resend.dev', 'example.com', 'example.org', 'example.net', 'localhost']);

let domainCache = { fetchedAt: 0, data: null };

export function extractEmailAddress(raw) {
  const str = String(raw || '').trim();
  const angle = str.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const plain = str.match(/([^\s<>]+@[^\s<>]+)/);
  return plain ? plain[1].trim().toLowerCase() : '';
}

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

function validateSenderConfig(rawFrom) {
  const trimmed = String(rawFrom || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      from: '',
      fromAddress: '',
      fromDomain: '',
      reason: 'RESEND_FROM is not set. Configure a verified Wisdom Audi Universe sending domain (e.g., "Wisdom Audi Universe <hello@yourdomain.com>").'
    };
  }

  const fromAddress = extractEmailAddress(trimmed);
  if (!isValidEmailFormat(fromAddress)) {
    return {
      valid: false,
      from: trimmed,
      fromAddress,
      fromDomain: '',
      reason: `RESEND_FROM ("${trimmed}") does not contain a valid email address.`
    };
  }

  const fromDomain = fromAddress.split('@')[1] || '';
  if (fromDomain === 'resend.dev' || fromDomain.endsWith('.resend.dev')) {
    return {
      valid: false,
      from: trimmed,
      fromAddress,
      fromDomain,
      isTestingSender: true,
      reason:
        'RESEND_FROM uses onboarding@resend.dev, which is restricted to Resend testing only. Configure a verified Wisdom Audi Universe domain in RESEND_FROM for unrestricted customer delivery.'
    };
  }

  if (FREE_WEBMAIL_DOMAINS.has(fromDomain)) {
    return {
      valid: false,
      from: trimmed,
      fromAddress,
      fromDomain,
      reason: `RESEND_FROM uses personal webmail domain "${fromDomain}", which cannot be verified on Resend. Configure your verified custom domain in RESEND_FROM.`
    };
  }

  if (RESERVED_DOMAINS.has(fromDomain) || fromDomain.endsWith('.example') || fromDomain.endsWith('.local') || fromDomain.endsWith('.test')) {
    return {
      valid: false,
      from: trimmed,
      fromAddress,
      fromDomain,
      reason: `RESEND_FROM uses reserved placeholder domain "${fromDomain}". Configure a real verified sending domain.`
    };
  }

  return {
    valid: true,
    from: trimmed,
    fromAddress,
    fromDomain,
    isTestingSender: false,
    reason: ''
  };
}

const DEFAULT_AGENCY_GMAIL = 'wisdomaudiuniverse@gmail.com';

function validateAgencyRecipient(rawNotifyTo, fallbackAddress = DEFAULT_AGENCY_GMAIL) {
  const trimmed = String(rawNotifyTo || '').trim();
  const address = extractEmailAddress(trimmed);
  const cleanFallback = isValidEmailFormat(fallbackAddress) ? fallbackAddress.toLowerCase() : DEFAULT_AGENCY_GMAIL;

  if (!trimmed || !isValidEmailFormat(address)) {
    return {
      valid: true,
      address: cleanFallback,
      raw: trimmed,
      envNeedsUpdate: true,
      reason: `LEAD_NOTIFY_TO is not set in environment Secrets; defaulting agency notifications to "${cleanFallback}".`
    };
  }
  const domain = address.split('@')[1] || '';
  if (domain === 'resend.dev' || domain.endsWith('.resend.dev')) {
    return {
      valid: true,
      address: cleanFallback,
      raw: trimmed,
      envNeedsUpdate: true,
      reason: `LEAD_NOTIFY_TO in environment Secrets points to "${address}" (a Resend testing sender). Routing agency notifications to "${cleanFallback}"; update LEAD_NOTIFY_TO to "${cleanFallback}".`
    };
  }
  return { valid: true, address, raw: trimmed, envNeedsUpdate: false, reason: '' };
}

export function resolveEmailConfig() {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const rawFrom = (process.env.RESEND_FROM || '').trim();
  const rawNotifyTo = (process.env.LEAD_NOTIFY_TO || '').trim();
  const retentionDays = parseRetentionDays(process.env.LEAD_RETENTION_DAYS);

  const envGmailUser = (process.env.GMAIL_SMTP_USER || '').trim().toLowerCase();
  const gmailSmtpUser = isValidEmailFormat(envGmailUser) ? envGmailUser : DEFAULT_AGENCY_GMAIL;
  const gmailSmtpUserSource = isValidEmailFormat(envGmailUser) ? 'env' : 'default';
  const gmailSmtpAppPassword = (process.env.GMAIL_SMTP_APP_PASSWORD || '').trim();
  const gmailSmtpFrom = `Wisdom Audi Universe <${gmailSmtpUser}>`;
  const gmailSmtpReady = Boolean(isValidEmailFormat(gmailSmtpUser) && gmailSmtpAppPassword);

  const sender = validateSenderConfig(rawFrom);
  const agency = validateAgencyRecipient(rawNotifyTo, gmailSmtpUser);

  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();
  const smtpReady = Boolean(smtpHost && smtpUser && smtpPass);

  const resendActive = Boolean(resendKey && sender.valid);
  const activeTransport = resendActive
    ? 'resend'
    : gmailSmtpReady
    ? 'gmail_smtp'
    : smtpReady
    ? 'smtp'
    : 'unconfigured';

  const publicSendingEnabled = Boolean(resendActive || gmailSmtpReady || smtpReady);

  return {
    resendConfigured: Boolean(resendKey),
    resendKey,
    resendActive,
    from: sender.from,
    fromAddress: sender.fromAddress,
    fromDomain: sender.fromDomain,
    senderValid: sender.valid,
    senderReason: sender.reason,
    isTestingSender: Boolean(sender.isTestingSender),
    gmailSmtpUser,
    gmailSmtpUserSource,
    gmailSmtpAppPassword,
    gmailSmtpPasswordConfigured: Boolean(gmailSmtpAppPassword),
    gmailSmtpFrom,
    gmailSmtpReady,
    agencyNotifyTo: agency.address,
    agencyRecipientValid: agency.valid,
    agencyRecipientReason: agency.reason,
    agencyNotifyEnvNeedsUpdate: Boolean(agency.envNeedsUpdate),
    activeTransport,
    publicSendingEnabled,
    retentionDays,
    smtpReady
  };
}

export async function checkResendDomainStatus(forceRefresh = false) {
  const cfg = resolveEmailConfig();
  if (!cfg.resendConfigured) {
    return { status: 'no_api_key', domains: [], verifiedSenderDomain: false };
  }

  const now = Date.now();
  if (!forceRefresh && domainCache.data && now - domainCache.fetchedAt < 30_000) {
    return domainCache.data;
  }

  try {
    const resp = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.resendKey}` },
      signal: AbortSignal.timeout(8000)
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const result = {
        status: resp.status === 401 || resp.status === 403 ? 'restricted_api_key' : 'error',
        httpStatus: resp.status,
        detail: text.slice(0, 140),
        domains: [],
        verifiedSenderDomain: false
      };
      domainCache = { fetchedAt: now, data: result };
      return result;
    }

    const json = await resp.json().catch(() => ({}));
    const domains = Array.isArray(json?.data)
      ? json.data.map((d) => ({ name: String(d.name || ''), status: String(d.status || ''), region: String(d.region || '') }))
      : [];

    const verifiedSenderDomain = Boolean(
      cfg.fromDomain &&
        domains.some((d) => d.name.toLowerCase() === cfg.fromDomain.toLowerCase() && d.status.toLowerCase() === 'verified')
    );

    const result = {
      status: 'ok',
      domains,
      verifiedSenderDomain
    };
    domainCache = { fetchedAt: now, data: result };
    return result;
  } catch (err) {
    return {
      status: 'error',
      detail: err?.name || 'NetworkError',
      domains: [],
      verifiedSenderDomain: false
    };
  }
}

export function getEmailConfigSummary() {
  const cfg = resolveEmailConfig();
  return {
    activeTransport: cfg.activeTransport,
    resendConfigured: cfg.resendConfigured,
    resendActive: cfg.resendActive,
    smtpReady: cfg.smtpReady,
    from: cfg.from,
    fromAddress: cfg.fromAddress,
    fromDomain: cfg.fromDomain,
    senderValid: cfg.senderValid,
    senderReason: cfg.senderReason,
    isTestingSender: cfg.isTestingSender,
    gmailSmtpUser: cfg.gmailSmtpUser,
    gmailSmtpUserSource: cfg.gmailSmtpUserSource,
    gmailSmtpFrom: cfg.gmailSmtpFrom,
    gmailSmtpReady: cfg.gmailSmtpReady,
    gmailSmtpPasswordConfigured: cfg.gmailSmtpPasswordConfigured,
    agencyNotifyTo: cfg.agencyNotifyTo,
    agencyRecipientValid: cfg.agencyRecipientValid,
    agencyRecipientReason: cfg.agencyRecipientReason,
    agencyNotifyEnvNeedsUpdate: cfg.agencyNotifyEnvNeedsUpdate,
    publicSendingEnabled: cfg.publicSendingEnabled,
    retentionDays: cfg.retentionDays
  };
}

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function computeDedupeKey(parts) {
  return crypto
    .createHash('sha256')
    .update(parts.map((p) => String(p || '').trim().toLowerCase()).join('|'))
    .digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderEmailShell({ eyebrow, title, intro, bodyHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#07080a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;">
  <div style="max-width:600px;margin:0 auto;background:#0f1116;border:1px solid #262932;border-radius:10px;overflow:hidden;">
    <div style="padding:22px 26px;border-bottom:1px solid #262932;background:#0b0c10;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">${escapeHtml(eyebrow)}</div>
      <h1 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">${escapeHtml(title)}</h1>
      ${intro ? `<p style="margin:8px 0 0;font-size:14px;color:#cbd1db;">${escapeHtml(intro)}</p>` : ''}
    </div>
    <div style="padding:24px 26px;font-size:14px;color:#d1d5db;">
      ${bodyHtml}
    </div>
    <div style="padding:16px 26px;border-top:1px solid #262932;background:#0b0c10;font-size:12px;color:#9ca3af;">
      ${escapeHtml(footerNote)}
    </div>
  </div>
</body>
</html>`;
}

function buildAgencyNotificationContent(lead) {
  const sourceLabel =
    lead.source === 'website-contact-form'
      ? 'Website Contact Form'
      : lead.source === 'services-catalogue'
      ? 'Services Catalogue Request'
      : 'Wisdom AI Consultation';

  const subject = `[WISDOM AUDI UNIVERSE] New Lead (${lead.referenceId}) — ${lead.businessName || lead.fullName}`;
  const textLines = [
    `New enquiry submitted via ${sourceLabel}.`,
    '',
    `Reference ID: ${lead.referenceId}`,
    `Submitted At: ${lead.submittedAt}`,
    `Source: ${sourceLabel}`,
    `Customer Name: ${lead.fullName}`,
    lead.businessName && lead.businessName !== lead.fullName ? `Business: ${lead.businessName}` : null,
    `Customer Email: ${lead.email}`,
    `Industry: ${lead.industry}`,
    `Requested Service: ${lead.solutionType}`,
    lead.interestLevel ? `Implementation Interest: ${lead.interestLevel}` : null,
    lead.desiredOutcome ? `Desired Outcome: ${lead.desiredOutcome}` : null,
    '',
    'Enquiry Details:',
    lead.challenge,
    lead.discoverySummary ? `\nDiscovery Notes:\n${lead.discoverySummary}` : null,
    '',
    'Reply directly to this email to respond to the customer.'
  ].filter((line) => line !== null);

  const rows = [
    ['Reference ID', lead.referenceId],
    ['Source', sourceLabel],
    ['Submitted At', lead.submittedAt],
    ['Customer Name', lead.fullName],
    lead.businessName && lead.businessName !== lead.fullName ? ['Business', lead.businessName] : null,
    ['Customer Email', lead.email],
    ['Industry', lead.industry],
    ['Focus / Service', lead.solutionType],
    lead.interestLevel ? ['Interest Level', lead.interestLevel] : null,
    lead.desiredOutcome ? ['Desired Outcome', lead.desiredOutcome] : null
  ].filter(Boolean);

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px 6px 0;color:#9ca3af;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 0;color:#ffffff;font-weight:500;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  const html = renderEmailShell({
    eyebrow: `Wisdom Audi Universe · ${sourceLabel}`,
    title: `${lead.fullName}${lead.businessName && lead.businessName !== lead.fullName ? ` — ${lead.businessName}` : ''} (${lead.referenceId})`,
    intro: `Reply directly to ${lead.email}`,
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${tableRows}</table>
      <div style="padding:14px;border-radius:8px;background:#090a0d;border:1px solid #262932;margin-bottom:12px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px;">Enquiry Details</div>
        <div style="white-space:pre-wrap;color:#e5e7eb;">${escapeHtml(lead.challenge)}</div>
      </div>
      ${
        lead.discoverySummary
          ? `<div style="padding:14px;border-radius:8px;background:#090a0d;border:1px solid #262932;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px;">AI Discovery Notes</div>
              <div style="white-space:pre-wrap;color:#cbd1db;">${escapeHtml(lead.discoverySummary)}</div>
            </div>`
          : ''
      }
    `,
    footerNote: 'Manage status and follow-up notes in the internal /admin workspace.'
  });

  return { subject, text: textLines.join('\n'), html };
}

function buildCustomerConfirmationContent(lead, replyAddress) {
  const subject = `We received your Wisdom Audi Universe enquiry (${lead.referenceId})`;
  const hasSeparateBusiness = lead.businessName && lead.businessName !== lead.fullName;

  const textLines = [
    `Hello ${lead.fullName},`,
    '',
    'Thank you for reaching out to Wisdom Audi Universe. We have received your enquiry and logged it for review by our team.',
    '',
    `Reference ID: ${lead.referenceId}`,
    hasSeparateBusiness ? `Business: ${lead.businessName}` : null,
    lead.industry && lead.industry !== 'General' ? `Industry: ${lead.industry}` : null,
    `Focus Area: ${lead.solutionType}`,
    lead.desiredOutcome ? `Desired Outcome: ${lead.desiredOutcome}` : null,
    '',
    'Your Submitted Enquiry:',
    lead.challenge,
    '',
    'What happens next:',
    'A specialist from Wisdom Audi Universe will review your workflow goals directly and follow up via email with tailored recommendations and next steps.',
    '',
    replyAddress ? `If you want to share additional details, simply reply to this email or write to ${replyAddress}.` : 'If you want to share additional details, simply reply directly to this email.',
    '',
    'Best regards,',
    'Wisdom Audi Universe',
    'AI Business Automation & Digital Infrastructure'
  ].filter((line) => line !== null);

  const html = renderEmailShell({
    eyebrow: 'Wisdom Audi Universe · Enquiry Acknowledgement',
    title: `Thank you, ${lead.fullName}`,
    intro: `Your enquiry is logged under reference ${lead.referenceId}.`,
    bodyHtml: `
      <p style="margin:0 0 14px;">Our team is reviewing your request${hasSeparateBusiness ? ` for <strong>${escapeHtml(lead.businessName)}</strong>` : ''} and will reply directly to <strong>${escapeHtml(lead.email)}</strong> with tailored workflow recommendations.</p>
      <div style="padding:14px;border-radius:8px;background:#090a0d;border:1px solid #262932;margin-bottom:14px;">
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px;">Reference: <strong style="color:#ffffff;">${escapeHtml(lead.referenceId)}</strong></div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:6px;">Focus Area: <strong style="color:#ffffff;">${escapeHtml(lead.solutionType)}</strong></div>
        ${lead.industry && lead.industry !== 'General' ? `<div style="font-size:12px;color:#9ca3af;margin-bottom:6px;">Industry: <strong style="color:#ffffff;">${escapeHtml(lead.industry)}</strong></div>` : ''}
        ${lead.desiredOutcome ? `<div style="font-size:12px;color:#9ca3af;margin-bottom:6px;">Desired Outcome: <strong style="color:#ffffff;">${escapeHtml(lead.desiredOutcome)}</strong></div>` : ''}
        <div style="font-size:12px;color:#9ca3af;margin-top:8px;">Your Enquiry:</div>
        <div style="white-space:pre-wrap;color:#e5e7eb;margin-top:4px;">${escapeHtml(lead.challenge)}</div>
      </div>
      <p style="margin:0;color:#cbd1db;">Need to add context or documents? ${replyAddress ? `Reply directly to this email or contact <strong>${escapeHtml(replyAddress)}</strong>.` : 'Simply reply directly to this email.'}</p>
    `,
    footerNote: 'Wisdom Audi Universe · AI Agents, Workflow Automation & Digital Infrastructure'
  });

  return { subject, text: textLines.join('\n'), html };
}

const SERVICES_CATALOGUE_ITEMS = [
  {
    name: '1. AI Agents & Intelligent Assistants',
    summary: 'Autonomous assistants that interpret incoming requests, apply business rules, trigger tools, and execute multi-step tasks reliably.'
  },
  {
    name: '2. AI Customer Support',
    summary: '24/7 customer enquiry resolution, order & booking answers, and structured escalation to human staff with full conversation context.'
  },
  {
    name: '3. Sales & Lead Automation',
    summary: 'Instant inbound lead capture, consultative qualification, CRM syncing, and automated follow-up sequences.'
  },
  {
    name: '4. Workflow & Business Process Automation',
    summary: 'Connecting forms, spreadsheets, invoices, calendars, and internal messaging tools into cohesive automated pipelines.'
  },
  {
    name: '5. Custom AI Systems & Business Applications',
    summary: 'Applied machine learning, anomaly detection, operational dashboards, and bespoke web portals tailored to your workflows.'
  },
  {
    name: '6. Web Development & Digital Infrastructure',
    summary: 'Fast, resilient web platforms engineered cleanly around automated back-office operations.'
  }
];

function buildServicesCatalogueContent({ fullName, industry, focusArea, referenceId }, replyAddress) {
  const greetingName = fullName || 'there';
  const subject = `${fullName ? `${fullName}, here is your ` : ''}Wisdom Audi Universe — AI Automation Services Catalogue (${referenceId})`;

  const textLines = [
    `Hello ${greetingName},`,
    '',
    'As requested, here is your Wisdom Audi Universe Services Catalogue.',
    focusArea ? `Highlighted Focus Area: ${focusArea}` : null,
    industry ? `Industry Context: ${industry}` : null,
    `Catalogue Reference: ${referenceId}`,
    '',
    'CORE CAPABILITIES',
    ...SERVICES_CATALOGUE_ITEMS.flatMap((s) => [s.name, `  ${s.summary}`, '']),
    'INDUSTRIES WE SERVE',
    'Restaurants & Hospitality · Retail & E-commerce · Beauty & Personal Care · Real Estate · Logistics & Transportation · Professional Services · SMBs',
    '',
    'HOW WE WORK',
    '1. Audit & Design — Map operational bottlenecks and architect the exact workflows required.',
    '2. Build & Connect — Engineer AI agents, automations, and supporting web systems.',
    '3. Deploy & Scale — Launch into production with clean handoff and monitoring.',
    '',
    replyAddress ? `To request a tailored scope assessment, reply to this email or write to ${replyAddress}.` : 'To request a tailored scope assessment, simply reply to this email.',
    '',
    'Wisdom Audi Universe'
  ].filter((line) => line !== null);

  const serviceCardsHtml = SERVICES_CATALOGUE_ITEMS.map(
    (s) => `
      <div style="padding:12px 14px;border-radius:8px;background:#090a0d;border:1px solid #262932;margin-bottom:10px;">
        <div style="font-weight:600;color:#ffffff;margin-bottom:4px;">${escapeHtml(s.name)}</div>
        <div style="font-size:13px;color:#cbd1db;">${escapeHtml(s.summary)}</div>
      </div>`
  ).join('');

  const html = renderEmailShell({
    eyebrow: `Wisdom Audi Universe · Services Catalogue (${referenceId})`,
    title: `Intelligent Automation Services for ${greetingName}`,
    intro: `${focusArea ? `Focus: ${focusArea}` : 'Full Capability Overview'}${industry ? ` · ${industry}` : ''}`,
    bodyHtml: `
      ${serviceCardsHtml}
      <div style="margin-top:16px;padding:14px;border-radius:8px;background:#11141c;border:1px solid #2c313d;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px;">How We Deliver</div>
        <div style="font-size:13px;color:#e5e7eb;"><strong>01. Audit &amp; Design</strong> — Map bottlenecks and architect exact workflows.<br><strong>02. Build &amp; Connect</strong> — Engineer AI agents, integrations, and web tools.<br><strong>03. Deploy &amp; Scale</strong> — Launch with clean handoff and room to expand.</div>
      </div>
      <p style="margin:16px 0 0;color:#cbd1db;">Reply directly to this email${replyAddress ? ` or contact <strong>${escapeHtml(replyAddress)}</strong>` : ''} whenever you would like a tailored workflow assessment.</p>
    `,
    footerNote: `Reference ${referenceId} · Wisdom Audi Universe`
  });

  return { subject, text: textLines.join('\n'), html };
}

function classifyResendFailure(httpStatus, errBody) {
  const text = String(errBody || '');
  const lower = text.toLowerCase();

  if (
    httpStatus === 403 &&
    (lower.includes('testing emails') ||
      lower.includes('verify a domain') ||
      lower.includes('only send testing emails to your own email') ||
      lower.includes('not verified'))
  ) {
    return {
      status: 'domain_unverified',
      detail: `Resend HTTP 403: ${text.slice(0, 200)}`
    };
  }

  return {
    status: 'failed',
    detail: `Resend HTTP ${httpStatus}${text ? ': ' + text.slice(0, 180) : ''}`
  };
}

async function sendEmailWithDedupe({
  referenceId,
  emailType,
  dedupeKey,
  cooldownSeconds = 0,
  recipient,
  replyTo,
  subject,
  text,
  html
}) {
  const cfg = resolveEmailConfig();

  if (!isValidEmailFormat(recipient)) {
    const detail = 'Invalid recipient email address.';
    createNotificationLogEntry({
      referenceId,
      emailType,
      dedupeKey: `${dedupeKey}:invalid_recipient`,
      channel: 'validation',
      recipient: String(recipient || ''),
      subject,
      status: 'failed',
      detail
    });
    return {
      status: 'failed',
      channel: 'validation',
      recipient: String(recipient || ''),
      detail
    };
  }

  // Duplicate-send guard (blocks same dedupeKey if already sent or currently sending)
  const existing = findExistingEmailDispatch(dedupeKey, cooldownSeconds);
  if (existing) {
    const detail = `Duplicate send prevented (already ${existing.status} under ${existing.referenceId} at ${existing.createdAt})`;
    createNotificationLogEntry({
      referenceId,
      emailType,
      dedupeKey: `${dedupeKey}:dup`,
      channel: 'dedupe_guard',
      recipient,
      subject,
      status: 'duplicate_prevented',
      detail,
      providerId: existing.providerId || ''
    });
    return {
      status: 'duplicate_prevented',
      deduplicated: true,
      channel: 'dedupe_guard',
      recipient,
      providerId: existing.providerId || '',
      detail
    };
  }

  if (cfg.resendActive) {
    const logId = createNotificationLogEntry({
      referenceId,
      emailType,
      dedupeKey,
      channel: 'resend',
      recipient,
      subject,
      status: 'sending',
      detail: `Dispatching from ${cfg.fromAddress}`
    });

    try {
      const idempotencyKey = dedupeKey.slice(0, 48);
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          from: cfg.from,
          to: [recipient],
          ...(replyTo && isValidEmailFormat(replyTo) ? { reply_to: replyTo } : {}),
          subject,
          text,
          html
        }),
        signal: AbortSignal.timeout(15_000)
      });

      const rawBody = await resp.text().catch(() => '');
      let parsedBody = {};
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        parsedBody = {};
      }

      if (!resp.ok) {
        const failure = classifyResendFailure(resp.status, parsedBody?.message || rawBody);
        updateNotificationLogEntry(logId, {
          status: failure.status,
          detail: failure.detail,
          httpStatus: resp.status
        });
        return {
          status: failure.status,
          channel: 'resend',
          recipient,
          httpStatus: resp.status,
          detail: failure.detail
        };
      }

      const providerId = String(parsedBody?.id || '');
      const detail = `Delivered via Resend (${cfg.fromAddress})`;
      updateNotificationLogEntry(logId, {
        status: 'sent',
        detail,
        providerId,
        httpStatus: resp.status
      });
      return {
        status: 'sent',
        channel: 'resend',
        recipient,
        providerId,
        httpStatus: resp.status,
        detail
      };
    } catch (err) {
      const detail =
        err?.name === 'AbortError' || err?.name === 'TimeoutError'
          ? 'Resend request timed out after 15s'
          : `Resend transport error (${err?.name || 'Error'})`;
      updateNotificationLogEntry(logId, {
        status: 'failed',
        detail
      });
      return {
        status: 'failed',
        channel: 'resend',
        recipient,
        detail
      };
    }
  }

  if (cfg.gmailSmtpReady) {
    const logId = createNotificationLogEntry({
      referenceId,
      emailType,
      dedupeKey,
      channel: 'gmail_smtp',
      recipient,
      subject,
      status: 'sending',
      detail: `Dispatching via Gmail SMTP (${cfg.gmailSmtpUser})`
    });
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: cfg.gmailSmtpUser,
          pass: cfg.gmailSmtpAppPassword
        },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000
      });

      const info = await transporter.sendMail({
        from: cfg.gmailSmtpFrom,
        to: recipient,
        ...(replyTo && isValidEmailFormat(replyTo) ? { replyTo } : {}),
        subject,
        text,
        html
      });

      const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
      const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
      if (rejected.length > 0 || accepted.length === 0) {
        const detail = `Gmail SMTP rejected recipient (${rejected.join(', ') || recipient})`;
        updateNotificationLogEntry(logId, {
          status: 'failed',
          detail
        });
        return {
          status: 'failed',
          channel: 'gmail_smtp',
          recipient,
          detail
        };
      }

      const providerId = String(info?.messageId || '');
      const detail = `Delivered via Gmail SMTP (${cfg.gmailSmtpUser})`;
      updateNotificationLogEntry(logId, {
        status: 'sent',
        detail,
        providerId
      });
      return {
        status: 'sent',
        channel: 'gmail_smtp',
        recipient,
        providerId,
        detail
      };
    } catch (err) {
      const safeCode = String(err?.code || err?.responseCode || err?.name || 'Error').slice(0, 40);
      const detail = `Gmail SMTP error (${safeCode})`;
      updateNotificationLogEntry(logId, {
        status: 'failed',
        detail
      });
      return {
        status: 'failed',
        channel: 'gmail_smtp',
        recipient,
        detail
      };
    }
  }

  if (cfg.smtpReady) {
    const logId = createNotificationLogEntry({
      referenceId,
      emailType,
      dedupeKey,
      channel: 'smtp',
      recipient,
      subject,
      status: 'sending',
      detail: 'Dispatching via SMTP'
    });
    try {
      const smtpUser = (process.env.SMTP_USER || '').trim();
      const transporter = nodemailer.createTransport({
        host: (process.env.SMTP_HOST || '').trim(),
        port: Number(process.env.SMTP_PORT) || 587,
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: { user: smtpUser, pass: (process.env.SMTP_PASS || '').trim() }
      });

      const info = await transporter.sendMail({
        from: (process.env.SMTP_FROM || smtpUser).trim(),
        to: recipient,
        ...(replyTo && isValidEmailFormat(replyTo) ? { replyTo } : {}),
        subject,
        text,
        html
      });

      const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
      const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
      if (rejected.length > 0 || accepted.length === 0) {
        const detail = `SMTP rejected recipient (${rejected.join(', ') || recipient})`;
        updateNotificationLogEntry(logId, {
          status: 'failed',
          detail
        });
        return {
          status: 'failed',
          channel: 'smtp',
          recipient,
          detail
        };
      }

      const providerId = String(info?.messageId || '');
      updateNotificationLogEntry(logId, {
        status: 'sent',
        detail: 'Delivered via SMTP',
        providerId
      });
      return {
        status: 'sent',
        channel: 'smtp',
        recipient,
        providerId,
        detail: 'Delivered via SMTP'
      };
    } catch (err) {
      const detail = `SMTP error (${err?.code || err?.name || 'Error'})`;
      updateNotificationLogEntry(logId, {
        status: 'failed',
        detail
      });
      return {
        status: 'failed',
        channel: 'smtp',
        recipient,
        detail
      };
    }
  }

  if (cfg.resendConfigured && !cfg.senderValid) {
    const policyDetail = `Gmail SMTP awaits GMAIL_SMTP_APP_PASSWORD, and ${cfg.senderReason}`;
    createNotificationLogEntry({
      referenceId,
      emailType,
      dedupeKey: `${dedupeKey}:sender_unconfigured`,
      channel: 'config_validation',
      recipient,
      subject,
      status: 'sender_unconfigured',
      detail: policyDetail
    });
    return {
      status: 'sender_unconfigured',
      channel: 'config_validation',
      recipient,
      detail: policyDetail
    };
  }

  const unconfiguredDetail =
    'Email transport awaiting configuration (set GMAIL_SMTP_APP_PASSWORD for Gmail SMTP or verified RESEND_FROM domain).';
  createNotificationLogEntry({
    referenceId,
    emailType,
    dedupeKey: `${dedupeKey}:unconfigured`,
    channel: 'none',
    recipient,
    subject,
    status: 'not_configured',
    detail: unconfiguredDetail
  });
  return {
    status: 'not_configured',
    channel: 'none',
    recipient,
    detail: unconfiguredDetail
  };
}

export async function verifyGmailSmtpTransport() {
  const cfg = resolveEmailConfig();
  if (!cfg.gmailSmtpPasswordConfigured) {
    return {
      ok: false,
      configured: false,
      user: cfg.gmailSmtpUser,
      detail: 'GMAIL_SMTP_APP_PASSWORD is not configured in environment secrets.'
    };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: cfg.gmailSmtpUser,
        pass: cfg.gmailSmtpAppPassword
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000
    });
    await transporter.verify();
    return {
      ok: true,
      configured: true,
      user: cfg.gmailSmtpUser,
      detail: `Verified Gmail SMTP connection for ${cfg.gmailSmtpUser}`
    };
  } catch (err) {
    const safeCode = String(err?.code || err?.responseCode || err?.name || 'Error').slice(0, 40);
    return {
      ok: false,
      configured: true,
      user: cfg.gmailSmtpUser,
      detail: `Gmail SMTP verification failed (${safeCode})`
    };
  }
}

export async function sendAgencyLeadNotification(lead, { recipientOverride } = {}) {
  const cfg = resolveEmailConfig();

  if (!recipientOverride && !cfg.agencyRecipientValid) {
    createNotificationLogEntry({
      referenceId: lead.referenceId,
      emailType: 'agency_notification',
      dedupeKey: computeDedupeKey(['agency_notification', lead.referenceId, 'unconfigured']),
      channel: 'config_validation',
      recipient: cfg.agencyNotifyTo || '(unset)',
      subject: `[WISDOM AUDI UNIVERSE] New Lead (${lead.referenceId})`,
      status: 'recipient_invalid',
      detail: cfg.agencyRecipientReason
    });
    updateLeadNotification(lead.referenceId, 'recipient_invalid', cfg.agencyRecipientReason);
    return {
      status: 'recipient_invalid',
      channel: 'config_validation',
      recipient: cfg.agencyNotifyTo || '',
      detail: cfg.agencyRecipientReason
    };
  }

  const recipient = (recipientOverride || cfg.agencyNotifyTo).trim().toLowerCase();
  const { subject, text, html } = buildAgencyNotificationContent(lead);
  const dedupeKey = computeDedupeKey(['agency_notification', lead.referenceId, recipient]);

  const result = await sendEmailWithDedupe({
    referenceId: lead.referenceId,
    emailType: 'agency_notification',
    dedupeKey,
    cooldownSeconds: 0,
    recipient,
    replyTo: lead.email,
    subject,
    text,
    html
  });

  updateLeadNotification(lead.referenceId, result.status, result.detail);
  return result;
}

export async function sendCustomerConfirmationEmail(lead) {
  const cfg = resolveEmailConfig();
  const recipient = String(lead.email || '').trim().toLowerCase();
  const replyAddress = cfg.agencyRecipientValid ? cfg.agencyNotifyTo : cfg.fromAddress;
  const { subject, text, html } = buildCustomerConfirmationContent(lead, replyAddress);
  const dedupeKey = computeDedupeKey(['customer_confirmation', lead.referenceId, recipient]);

  const result = await sendEmailWithDedupe({
    referenceId: lead.referenceId,
    emailType: 'customer_confirmation',
    dedupeKey,
    cooldownSeconds: 0,
    recipient,
    replyTo: replyAddress,
    subject,
    text,
    html
  });

  updateLeadCustomerEmail(lead.referenceId, result.status, result.detail);
  return result;
}

export async function sendServicesCatalogueEmail({
  referenceId,
  fullName = '',
  email,
  industry = '',
  focusArea = '',
  cooldownSeconds = 900,
  linkedToLead = false
}) {
  const cfg = resolveEmailConfig();
  const recipient = String(email || '').trim().toLowerCase();
  const replyAddress = cfg.agencyRecipientValid ? cfg.agencyNotifyTo : cfg.fromAddress;
  const { subject, text, html } = buildServicesCatalogueContent(
    { referenceId, fullName, industry, focusArea },
    replyAddress
  );

  const dedupeKey = linkedToLead
    ? computeDedupeKey(['services_catalogue_lead', referenceId, recipient])
    : computeDedupeKey(['services_catalogue', recipient, focusArea, industry]);

  const result = await sendEmailWithDedupe({
    referenceId,
    emailType: 'services_catalogue',
    dedupeKey,
    cooldownSeconds: linkedToLead ? 0 : cooldownSeconds,
    recipient,
    replyTo: replyAddress,
    subject,
    text,
    html
  });

  if (linkedToLead) {
    updateLeadCatalogueEmail(referenceId, result.status, result.detail);
  }
  return result;
}

export async function dispatchLeadEmails(lead, { sendCatalogue = false } = {}) {
  const cfg = resolveEmailConfig();
  const customerConfirmation = await sendCustomerConfirmationEmail(lead);

  if (cfg.resendConfigured && cfg.senderValid) {
    await sleep(550);
  }

  const agencyNotification = await sendAgencyLeadNotification(lead);

  let servicesCatalogue = { status: 'skipped', detail: 'Not requested' };
  if (sendCatalogue) {
    if (cfg.resendConfigured && cfg.senderValid) {
      await sleep(550);
    }
    servicesCatalogue = await sendServicesCatalogueEmail({
      referenceId: lead.referenceId,
      fullName: lead.fullName,
      email: lead.email,
      industry: lead.industry,
      focusArea: lead.solutionType,
      linkedToLead: true
    });
  }

  return {
    agencyNotification,
    customerConfirmation,
    servicesCatalogue
  };
}

export async function dispatchLeadNotification(lead) {
  return sendAgencyLeadNotification(lead);
}
