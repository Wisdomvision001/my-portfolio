# Firestore Security Specification (Admin Authentication)

## 1. Data Invariants

1. **Zero-Trust Default Deny**: Every document path not explicitly matched is denied for all reads and writes.
2. **Verified Admin Identity**: Only authenticated users whose `request.auth.token.email_verified == true` AND whose verified email is strictly `audiwisdom@gmail.com` or `wisdomaudiuniverse@gmail.com` may access admin collections.
3. **No Self-Assigned Escalation**: Unprivileged users cannot create or update `/admins/{adminUid}` to grant themselves `role: "admin"`, and `role` is strictly constrained to `"admin"`.
4. **Immutable Audit Trail**: `/adminAuditLogs/{logId}` documents can only be created by a verified admin recording their own `uid` and server timestamp `request.time`; updates and deletes are strictly forbidden.
5. **PII & Resource Boundaries**: Emails, display names, user agents, and document IDs are strictly bounded by `.size()` and regex checks (`isValidId`) matching `firebase-blueprint.json`.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)

1. **Unauthenticated read on `/admins/uid1`** (`request.auth == null`).
2. **Unverified email spoofing** (`email == "audiwisdom@gmail.com"`, `email_verified == false`).
3. **Unauthorized Gmail account self-promotion** (`email == "attacker@gmail.com"`, `email_verified == true` writing `{ role: "admin" }` to `/admins/attackerUid`).
4. **UID mismatch spoof in `/admins/{adminUid}`** (`adminUid != data.uid` on create).
5. **Shadow / ghost field injection** on `/admins/{adminUid}` (`{ ..., isSuperAdmin: true }`).
6. **Role tampering on update** (`role` changed or `createdAt`/`uid` modified on `/admins/{adminUid}`).
7. **Resource exhaustion ID poisoning** (`/admins/` + 300-character document ID or invalid characters `$#`).
8. **Oversized string poisoning** (`displayName` > 120 chars or `email` > 160 chars).
9. **Client-forged timestamp** (`createdAt` or `updatedAt` set to past/future client `Timestamp` != `request.time`).
10. **Audit log identity spoofing** (`uid` in `/adminAuditLogs/{logId}` != `request.auth.uid`).
11. **Audit log tampering / deletion** (`update` or `delete` on `/adminAuditLogs/{logId}`).
12. **Blanket non-admin list scraping** (`list` on `/admins` or `/adminAuditLogs` by non-admin user).
