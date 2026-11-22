/**
 * Firestore Security Rules Specification Tests ("Dirty Dozen" Payloads)
 * Designed for @firebase/rules-unit-testing against firestore.rules.
 */
import fs from 'node:fs';

const PROJECT_ID = 'striped-contact-4x30v';

export async function runDirtyDozenChecks() {
  const testingPkg = '@firebase/rules-unit-testing';
  const { assertFails, assertSucceeds, initializeTestEnvironment } = await import(testingPkg);
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8')
    }
  });

  const adminAuth = {
    email: 'audiwisdom@gmail.com',
    email_verified: true
  };
  const spoofUnverifiedAuth = {
    email: 'audiwisdom@gmail.com',
    email_verified: false
  };
  const outsiderAuth = {
    email: 'audiwisdom4@gmail.com',
    email_verified: true
  };

  try {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const unverifiedDb = testEnv.authenticatedContext('spoof1', spoofUnverifiedAuth).firestore();
    const outsiderDb = testEnv.authenticatedContext('outsider1', outsiderAuth).firestore();
    const adminDb = testEnv.authenticatedContext('admin1', adminAuth).firestore();

    // 1. Unauthenticated read blocked
    await assertFails(anonDb.collection('admins').doc('admin1').get());
    // 2. Unverified email spoof blocked
    await assertFails(unverifiedDb.collection('admins').doc('spoof1').get());
    // 3. Unauthorized verified email (including audiwisdom4@gmail.com) blocked
    await assertFails(
      outsiderDb.collection('admins').doc('outsider1').set({
        uid: 'outsider1',
        email: 'audiwisdom4@gmail.com',
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
    // 4. Shadow field injection blocked
    await assertFails(
      adminDb.collection('admins').doc('admin1').set({
        uid: 'admin1',
        email: 'audiwisdom@gmail.com',
        role: 'admin',
        isSuperAdmin: true,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
    // 5. Invalid doc ID blocked
    await assertFails(adminDb.collection('admins').doc('bad$id').get());
    // 6. Audit log deletion blocked even for admins
    await assertFails(adminDb.collection('adminAuditLogs').doc('log1').delete());
    // 7. Outsider list scraping blocked
    await assertFails(outsiderDb.collection('adminAuditLogs').get());
    // 8. Valid admin read succeeds
    await assertSucceeds(adminDb.collection('admins').doc('admin1').get());
  } finally {
    await testEnv.cleanup();
  }
}
