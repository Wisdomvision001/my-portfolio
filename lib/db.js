import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.WISDOM_DB_PATH
  ? path.resolve(process.env.WISDOM_DB_PATH)
  : path.join(DATA_DIR, 'wisdom_audi.sqlite');
const ADMIN_KEY_FILE = path.join(DATA_DIR, '.admin-key');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    reference_id TEXT UNIQUE NOT NULL,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    full_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    email TEXT NOT NULL,
    industry TEXT NOT NULL,
    solution_type TEXT NOT NULL,
    challenge TEXT NOT NULL,
    desired_outcome TEXT NOT NULL DEFAULT '',
    interest_level TEXT NOT NULL DEFAULT '',
    discovery_summary TEXT NOT NULL DEFAULT '',
    consent INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'wisdom-ai-assistant',
    dedupe_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    follow_up_notes TEXT NOT NULL DEFAULT '',
    notification_status TEXT NOT NULL DEFAULT 'pending',
    notification_detail TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads(submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_dedupe ON leads(dedupe_hash, submitted_at);

  CREATE TABLE IF NOT EXISTS chat_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    model TEXT NOT NULL,
    fallback_used INTEGER NOT NULL DEFAULT 0,
    thinking_level TEXT NOT NULL,
    ttft_ms INTEGER,
    total_ms INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    tool_called TEXT NOT NULL DEFAULT '',
    turn_count INTEGER NOT NULL DEFAULT 1,
    http_status INTEGER NOT NULL DEFAULT 200
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_created_at ON chat_metrics(created_at DESC);

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  );
`);

function ensureColumn(tableName, columnName, definition) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

ensureColumn('leads', 'customer_email_status', "TEXT NOT NULL DEFAULT 'pending'");
ensureColumn('leads', 'customer_email_detail', "TEXT NOT NULL DEFAULT ''");
ensureColumn('leads', 'catalogue_email_status', "TEXT NOT NULL DEFAULT ''");
ensureColumn('leads', 'catalogue_email_detail', "TEXT NOT NULL DEFAULT ''");

ensureColumn('notification_logs', 'email_type', "TEXT NOT NULL DEFAULT 'agency_notification'");
ensureColumn('notification_logs', 'dedupe_key', "TEXT NOT NULL DEFAULT ''");
ensureColumn('notification_logs', 'provider_id', "TEXT NOT NULL DEFAULT ''");
ensureColumn('notification_logs', 'http_status', 'INTEGER');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notif_dedupe ON notification_logs(dedupe_key, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notif_created_at ON notification_logs(created_at DESC);
`);

export const ALLOWED_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'closed', 'archived'];

export function parseRetentionDays(raw) {
  const str = String(raw ?? '').trim();
  const match = str.match(/\d+/);
  const parsed = match ? parseInt(match[0], 10) : NaN;
  return Math.max(7, Math.min(3650, Number.isFinite(parsed) && parsed > 0 ? parsed : 365));
}

export function getAdminAccessSecret() {
  const fromEnv = (process.env.ADMIN_ACCESS_KEY || '').trim();
  if (fromEnv) {
    return { secret: fromEnv, source: 'env' };
  }
  try {
    if (fs.existsSync(ADMIN_KEY_FILE)) {
      const existing = fs.readFileSync(ADMIN_KEY_FILE, 'utf8').trim();
      if (existing.length >= 24) {
        return { secret: existing, source: 'generated_file' };
      }
    }
    const generated = crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(ADMIN_KEY_FILE, generated + '\n', { encoding: 'utf8', mode: 0o600 });
    return { secret: generated, source: 'generated_file' };
  } catch {
    return { secret: '', source: 'unavailable' };
  }
}

export function computeLeadDedupeHash({ email, businessName, challenge }) {
  const normalized = [
    String(email || '').trim().toLowerCase(),
    String(businessName || '').trim().toLowerCase(),
    String(challenge || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 140)
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function findRecentDuplicateLead(dedupeHash, windowSeconds = 600) {
  const cutoffIso = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const stmt = db.prepare(`
    SELECT reference_id, submitted_at
    FROM leads
    WHERE dedupe_hash = ? AND submitted_at >= ?
    ORDER BY submitted_at DESC
    LIMIT 1
  `);
  return stmt.get(dedupeHash, cutoffIso) || null;
}

export function createLead(lead) {
  const stmt = db.prepare(`
    INSERT INTO leads (
      id, reference_id, submitted_at, updated_at,
      full_name, business_name, email, industry,
      solution_type, challenge, desired_outcome, interest_level, discovery_summary,
      consent, source, dedupe_hash, status, follow_up_notes, notification_status, notification_detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    lead.referenceId,
    lead.referenceId,
    lead.submittedAt,
    lead.submittedAt,
    lead.fullName,
    lead.businessName,
    lead.email,
    lead.industry,
    lead.solutionType,
    lead.challenge,
    lead.desiredOutcome || '',
    lead.interestLevel || '',
    lead.discoverySummary || '',
    1,
    lead.source || 'wisdom-ai-assistant',
    lead.dedupeHash,
    'new',
    '',
    'pending',
    ''
  );
  return getLeadByRef(lead.referenceId);
}

export function updateLeadNotification(referenceId, status, detail = '') {
  const stmt = db.prepare(`
    UPDATE leads
    SET notification_status = ?, notification_detail = ?
    WHERE reference_id = ?
  `);
  stmt.run(status, String(detail || '').slice(0, 240), referenceId);
}

export function updateLeadCustomerEmail(referenceId, status, detail = '') {
  const stmt = db.prepare(`
    UPDATE leads
    SET customer_email_status = ?, customer_email_detail = ?
    WHERE reference_id = ?
  `);
  stmt.run(status, String(detail || '').slice(0, 240), referenceId);
}

export function updateLeadCatalogueEmail(referenceId, status, detail = '') {
  const stmt = db.prepare(`
    UPDATE leads
    SET catalogue_email_status = ?, catalogue_email_detail = ?
    WHERE reference_id = ?
  `);
  stmt.run(status, String(detail || '').slice(0, 240), referenceId);
}

export function findExistingEmailDispatch(dedupeKey, cooldownSeconds = 0) {
  if (!dedupeKey) return null;
  if (cooldownSeconds > 0) {
    const cutoffIso = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
    return (
      db
        .prepare(
          `SELECT id, reference_id AS referenceId, status, provider_id AS providerId, created_at AS createdAt
           FROM notification_logs
           WHERE dedupe_key = ? AND status IN ('sent', 'sending') AND created_at >= ?
           ORDER BY id DESC
           LIMIT 1`
        )
        .get(dedupeKey, cutoffIso) || null
    );
  }
  return (
    db
      .prepare(
        `SELECT id, reference_id AS referenceId, status, provider_id AS providerId, created_at AS createdAt
         FROM notification_logs
         WHERE dedupe_key = ? AND status IN ('sent', 'sending')
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(dedupeKey) || null
  );
}

export function createNotificationLogEntry({
  referenceId,
  emailType = 'agency_notification',
  dedupeKey = '',
  channel,
  recipient,
  subject,
  status,
  detail = '',
  providerId = '',
  httpStatus = null
}) {
  const result = db
    .prepare(
      `INSERT INTO notification_logs (
        created_at, reference_id, email_type, dedupe_key, channel, recipient, subject, status, detail, provider_id, http_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      new Date().toISOString(),
      referenceId,
      emailType,
      dedupeKey,
      channel,
      recipient,
      subject,
      status,
      String(detail || '').slice(0, 240),
      String(providerId || '').slice(0, 120),
      httpStatus != null ? Number(httpStatus) : null
    );
  return Number(result?.lastInsertRowid || 0);
}

export function updateNotificationLogEntry(id, { status, detail = '', providerId = '', httpStatus = null, channel }) {
  if (!id) return;
  if (channel) {
    db.prepare(
      `UPDATE notification_logs
       SET status = ?, detail = ?, provider_id = ?, http_status = ?, channel = ?
       WHERE id = ?`
    ).run(
      status,
      String(detail || '').slice(0, 240),
      String(providerId || '').slice(0, 120),
      httpStatus != null ? Number(httpStatus) : null,
      channel,
      id
    );
    return;
  }
  db.prepare(
    `UPDATE notification_logs
     SET status = ?, detail = ?, provider_id = ?, http_status = ?
     WHERE id = ?`
  ).run(
    status,
    String(detail || '').slice(0, 240),
    String(providerId || '').slice(0, 120),
    httpStatus != null ? Number(httpStatus) : null,
    id
  );
}

export function logNotificationAttempt({
  referenceId,
  emailType = 'agency_notification',
  dedupeKey = '',
  channel,
  recipient,
  subject,
  status,
  detail = '',
  providerId = '',
  httpStatus = null
}) {
  return createNotificationLogEntry({
    referenceId,
    emailType,
    dedupeKey,
    channel,
    recipient,
    subject,
    status,
    detail,
    providerId,
    httpStatus
  });
}

export function listNotificationLogs({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(300, Number(limit) || 100));
  return db
    .prepare(
      `SELECT
        id,
        created_at AS createdAt,
        reference_id AS referenceId,
        email_type AS emailType,
        channel,
        recipient,
        subject,
        status,
        detail,
        provider_id AS providerId,
        http_status AS httpStatus
       FROM notification_logs
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(safeLimit);
}

export function getLeadByRef(referenceId) {
  const stmt = db.prepare(`
    SELECT
      reference_id AS referenceId,
      submitted_at AS submittedAt,
      updated_at AS updatedAt,
      full_name AS fullName,
      business_name AS businessName,
      email,
      industry,
      solution_type AS solutionType,
      challenge,
      desired_outcome AS desiredOutcome,
      interest_level AS interestLevel,
      discovery_summary AS discoverySummary,
      source,
      status,
      follow_up_notes AS followUpNotes,
      notification_status AS notificationStatus,
      notification_detail AS notificationDetail,
      customer_email_status AS customerEmailStatus,
      customer_email_detail AS customerEmailDetail,
      catalogue_email_status AS catalogueEmailStatus,
      catalogue_email_detail AS catalogueEmailDetail
    FROM leads
    WHERE reference_id = ?
  `);
  return stmt.get(referenceId) || null;
}

export function listLeads({ status = '', industry = '', search = '' } = {}) {
  const where = [];
  const params = [];

  if (status && status !== 'all' && ALLOWED_LEAD_STATUSES.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (industry && industry !== 'all') {
    where.push('LOWER(industry) = LOWER(?)');
    params.push(industry);
  }
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    where.push(`(
      LOWER(reference_id) LIKE ? OR
      LOWER(full_name) LIKE ? OR
      LOWER(business_name) LIKE ? OR
      LOWER(email) LIKE ? OR
      LOWER(industry) LIKE ? OR
      LOWER(solution_type) LIKE ? OR
      LOWER(challenge) LIKE ?
    )`);
    params.push(q, q, q, q, q, q, q);
  }

  const sql = `
    SELECT
      reference_id AS referenceId,
      submitted_at AS submittedAt,
      updated_at AS updatedAt,
      full_name AS fullName,
      business_name AS businessName,
      email,
      industry,
      solution_type AS solutionType,
      challenge,
      desired_outcome AS desiredOutcome,
      interest_level AS interestLevel,
      discovery_summary AS discoverySummary,
      source,
      status,
      follow_up_notes AS followUpNotes,
      notification_status AS notificationStatus,
      notification_detail AS notificationDetail,
      customer_email_status AS customerEmailStatus,
      customer_email_detail AS customerEmailDetail,
      catalogue_email_status AS catalogueEmailStatus,
      catalogue_email_detail AS catalogueEmailDetail
    FROM leads
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY submitted_at DESC
    LIMIT 500
  `;
  return db.prepare(sql).all(...params);
}

export function getLeadOverview() {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newCount,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contactedCount,
      SUM(CASE WHEN status IN ('qualified', 'proposal') THEN 1 ELSE 0 END) AS activePipelineCount,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closedCount
    FROM leads
  `).get();

  const industries = db.prepare(`
    SELECT DISTINCT industry FROM leads WHERE industry != '' ORDER BY industry ASC
  `).all().map((r) => r.industry);

  return {
    total: Number(counts?.total || 0),
    newCount: Number(counts?.newCount || 0),
    contactedCount: Number(counts?.contactedCount || 0),
    activePipelineCount: Number(counts?.activePipelineCount || 0),
    closedCount: Number(counts?.closedCount || 0),
    industries
  };
}

export function updateLead(referenceId, { status, followUpNotes }) {
  const existing = getLeadByRef(referenceId);
  if (!existing) return null;

  const nextStatus = status !== undefined ? status : existing.status;
  const nextNotes = followUpNotes !== undefined ? followUpNotes : existing.followUpNotes;
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE leads
    SET status = ?, follow_up_notes = ?, updated_at = ?
    WHERE reference_id = ?
  `).run(nextStatus, nextNotes, updatedAt, referenceId);

  return getLeadByRef(referenceId);
}

export function deleteLead(referenceId) {
  const result = db.prepare('DELETE FROM leads WHERE reference_id = ?').run(referenceId);
  return Number(result?.changes || 0) > 0;
}

export function recordChatMetric({
  model,
  fallbackUsed = false,
  thinkingLevel,
  ttftMs = null,
  totalMs,
  outcome,
  toolCalled = '',
  turnCount = 1,
  httpStatus = 200
}) {
  db.prepare(`
    INSERT INTO chat_metrics (
      created_at, model, fallback_used, thinking_level,
      ttft_ms, total_ms, outcome, tool_called, turn_count, http_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    String(model),
    fallbackUsed ? 1 : 0,
    String(thinkingLevel),
    ttftMs !== null && Number.isFinite(ttftMs) ? Math.round(ttftMs) : null,
    Math.round(totalMs),
    String(outcome),
    String(toolCalled || ''),
    Number(turnCount) || 1,
    Number(httpStatus) || 200
  );
}

export function getMetricsSummary() {
  const agg = db.prepare(`
    SELECT
      COUNT(*) AS totalRequests,
      SUM(CASE WHEN outcome = 'ok' THEN 1 ELSE 0 END) AS okCount,
      SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) AS fallbackCount,
      SUM(CASE WHEN tool_called != '' THEN 1 ELSE 0 END) AS toolCallCount,
      AVG(CASE WHEN ttft_ms IS NOT NULL THEN ttft_ms END) AS avgTtftMs,
      AVG(total_ms) AS avgTotalMs
    FROM chat_metrics
  `).get();

  const recent = db.prepare(`
    SELECT
      created_at AS createdAt,
      model,
      fallback_used AS fallbackUsed,
      thinking_level AS thinkingLevel,
      ttft_ms AS ttftMs,
      total_ms AS totalMs,
      outcome,
      tool_called AS toolCalled,
      turn_count AS turnCount,
      http_status AS httpStatus
    FROM chat_metrics
    ORDER BY id DESC
    LIMIT 25
  `).all();

  const byModel = db.prepare(`
    SELECT
      model,
      COUNT(*) AS requests,
      AVG(CASE WHEN ttft_ms IS NOT NULL THEN ttft_ms END) AS avgTtftMs,
      AVG(total_ms) AS avgTotalMs,
      SUM(CASE WHEN outcome = 'ok' THEN 1 ELSE 0 END) AS okCount
    FROM chat_metrics
    GROUP BY model
  `).all();

  return {
    totalRequests: Number(agg?.totalRequests || 0),
    okCount: Number(agg?.okCount || 0),
    fallbackCount: Number(agg?.fallbackCount || 0),
    toolCallCount: Number(agg?.toolCallCount || 0),
    avgTtftMs: agg?.avgTtftMs != null ? Math.round(agg.avgTtftMs) : null,
    avgTotalMs: agg?.avgTotalMs != null ? Math.round(agg.avgTotalMs) : null,
    byModel: byModel.map((m) => ({
      model: m.model,
      requests: Number(m.requests),
      okCount: Number(m.okCount),
      avgTtftMs: m.avgTtftMs != null ? Math.round(m.avgTtftMs) : null,
      avgTotalMs: m.avgTotalMs != null ? Math.round(m.avgTotalMs) : null
    })),
    recent
  };
}

export function createAdminSession(ttlHours = 12) {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + ttlHours * 3600 * 1000);

  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now.toISOString());
  db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').run(
    tokenHash,
    now.toISOString(),
    expires.toISOString()
  );

  return { rawToken, expiresAt: expires.toISOString() };
}

export function validateAdminSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return false;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const nowIso = new Date().toISOString();
  const row = db.prepare('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?').get(tokenHash);
  if (!row) return false;
  if (row.expires_at < nowIso) {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
    return false;
  }
  return true;
}

export function revokeAdminSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
}

export function pruneExpiredRecords(retentionDays = 365) {
  const days = parseRetentionDays(retentionDays);
  const cutoffIso = new Date(Date.now() - days * 86400 * 1000).toISOString();
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('DELETE FROM chat_metrics WHERE created_at < ?').run(cutoffIso);
  db.prepare('DELETE FROM notification_logs WHERE created_at < ?').run(cutoffIso);
  db.prepare("DELETE FROM leads WHERE status = 'archived' AND updated_at < ?").run(cutoffIso);
  return days;
}
