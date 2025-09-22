import admin from 'firebase-admin';

let db = null;

/**
 * Timeout wrapper for Firebase operations with proper cancellation
 * @param {Promise} promise - The Firebase operation promise
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise} Promise that resolves or rejects within timeout
 */
function withTimeout(promise, timeoutMs = 5000) {
  let timeoutId;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      console.log(`⚠️ Operation timed out after ${timeoutMs}ms`);
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([
    promise.then(result => {
      clearTimeout(timeoutId);
      return result;
    }).catch(error => {
      clearTimeout(timeoutId);
      throw error;
    }),
    timeoutPromise
  ]);
}

/**
 * Initialize Firebase Admin SDK
 * Uses Application Default Credentials (ADC) for authentication
 * This works when running in Google Cloud environments or with GOOGLE_APPLICATION_CREDENTIALS
 */
export async function initializeFirebase() {
  try {
    if (!admin.apps.length) {
      // Initialize with Application Default Credentials and timeout settings
      admin.initializeApp({
        projectId: 'zapull-production'
      });
      
      console.log('✅ Firebase Admin SDK initialized successfully for zapull-production');
    }
    
    // Get Firestore instance with timeout settings
    db = admin.firestore();
    
    // Configure Firestore settings for faster timeouts
    db.settings({
      ignoreUndefinedProperties: true,
      // Set timeout for operations
      requestTimeout: 5000  // 5 second timeout
    });
    
    console.log('⚙️ Firestore configured with 5s request timeout');
    
    // Skip connectivity test during startup to prevent container restarts
    console.log('⚠️ Skipping Firebase connectivity test - will test during actual operations');
    // Note: The connectivity test was causing Cloud Run container restarts
    // We'll rely on timeouts during actual /redeem command usage
    
    return db;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    throw error;
  }
}

/**
 * Get Firestore database instance
 * @returns {FirebaseFirestore.Firestore} Firestore instance
 */
export function getDB() {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return db;
}

/**
 * Validate if a gift code exists and get its data
 * @param {string} code - The gift code to validate
 * @returns {Promise<{exists: boolean, data?: object, error?: string}>}
 */
export async function getGiftCard(code) {
  try {
    console.log(`🔥 Firestore query: Getting gift card ${code}`);
    console.log(`🔥 DB instance exists: ${!!db}`);
    console.log(`🔥 Starting Firestore operation...`);
    
    const docRef = db.collection('giftCards').doc(code);
    console.log(`🔥 Document reference created`);
    
    const doc = await withTimeout(
      docRef.get(),
      8000
    );
    console.log(`🔥 Firestore get() completed`);
    
    console.log(`✅ Firestore query completed for ${code}`);
    
    if (!doc.exists) {
      return { exists: false, error: 'Gift code not found' };
    }
    
    const data = doc.data();
    return { exists: true, data };
  } catch (error) {
    console.error('❌ Error getting gift card:', error.message);
    if (error.message.includes('timed out')) {
      return { exists: false, error: 'Database timeout - please try again' };
    }
    return { exists: false, error: 'Database error - please try again' };
  }
}

/**
 * Find user by email
 * @param {string} email - User email to search for
 * @returns {Promise<{found: boolean, userId?: string, data?: object, error?: string}>}
 */
export async function findUserByEmail(email) {
  try {
    console.log(`🔥 Finding user by email using Firebase Auth: ${email}`);
    
    // First try to get user ID from Firebase Auth
    try {
      const userRecord = await withTimeout(
        admin.auth().getUserByEmail(email),
        8000
      );
      console.log(`✅ Firebase Auth found user: ${userRecord.uid}`);
      
      // Get user document directly by UID
      const userDoc = await withTimeout(
        db.collection('users').doc(userRecord.uid).get(),
        8000
      );
      
      if (userDoc.exists) {
        console.log(`✅ User document found for ${email}`);
        return {
          found: true,
          userId: userRecord.uid,
          data: userDoc.data()
        };
      } else {
        console.log(`❌ User document not found for UID: ${userRecord.uid}`);
        return { found: false, error: 'User account not found' };
      }
    } catch (authError) {
      console.log(`❌ Firebase Auth failed - user not found: ${authError.message}`);
      return { found: false, error: 'User not found' };
    }
  } catch (error) {
    console.error('❌ Error finding user by email:', error.message);
    if (error.message.includes('timed out')) {
      return { found: false, error: 'Database timeout - please try again' };
    }
    return { found: false, error: 'Database error - please try again' };
  }
}

/**
 * Redeem gift code in a transaction
 * @param {string} giftCode - The gift code to redeem
 * @param {string} userId - The user ID to credit points to
 * @param {string} email - The email of the user redeeming
 * @param {number} pointsValue - The value of points to add
 * @returns {Promise<{success: boolean, newBalance?: number, error?: string}>}
 */
export async function redeemGiftCode(giftCode, userId, email, pointsValue) {
  try {
    console.log(`🔥 Starting redemption transaction for ${giftCode}`);
    // Use a transaction to ensure atomicity
    return await withTimeout(
      db.runTransaction(async (transaction) => {
      // References
      const giftCardRef = db.collection('giftCards').doc(giftCode);
      const userRef = db.collection('users').doc(userId);
      
      // Read current data
      const [giftCardDoc, userDoc] = await Promise.all([
        transaction.get(giftCardRef),
        transaction.get(userRef)
      ]);
      
      // Verify gift card still exists and is valid
      if (!giftCardDoc.exists) {
        throw new Error('Gift code not found');
      }
      
      const giftCardData = giftCardDoc.data();
      
      // Check if already redeemed
      if (giftCardData.isRedeemed) {
        throw new Error(`Gift code already redeemed by ${giftCardData.redeemedBy} on ${giftCardData.redeemedAt?.toDate?.()?.toLocaleDateString()}`);
      }
      
      // Check if expired
      const now = new Date();
      const expiresAt = giftCardData.expiresAt?.toDate?.();
      if (expiresAt && now > expiresAt) {
        throw new Error(`Gift code expired on ${expiresAt.toLocaleDateString()}`);
      }
      
      // Verify user still exists
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const currentBalance = userDoc.data().pointsBalance || 0;
      const newBalance = currentBalance + pointsValue;
      
      // Update user points using FieldValue.increment
      transaction.update(userRef, {
        pointsBalance: admin.firestore.FieldValue.increment(pointsValue)
      });
      
      // Mark gift card as redeemed
      transaction.update(giftCardRef, {
        isRedeemed: true,
        redeemedBy: email,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Gift code ${giftCode} redeemed by ${email} for ${pointsValue} points`);
      
      return { success: true, newBalance };
    }),
    10000 // 10 second timeout for transactions
    );
  } catch (error) {
    console.error('❌ Error redeeming gift code:', error.message);
    if (error.message.includes('timed out')) {
      return { success: false, error: 'Transaction timeout - please try again' };
    }
    return { success: false, error: error.message };
  }
}
