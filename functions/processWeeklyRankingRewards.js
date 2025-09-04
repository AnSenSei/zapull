// functions/processWeeklyRankingRewards.js

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const axios = require("axios");

// Initialize Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Prize amounts for top 10 players (same as frontend)
const PRIZE_AMOUNTS = {
  1: 25000,
  2: 20000,
  3: 15000,
  4: 12500,
  5: 10000,
  6: 7500,
  7: 6875,
  8: 6250,
  9: 5625,
  10: 5000
};

/**
 * Process weekly ranking rewards
 * Scheduled to run every Sunday at 23:59 (11:59 PM)
 * Awards points to top 10 players based on weekly spending
 */
exports.processWeeklyRankingRewards = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "512MB",
  })
  .pubsub
  .schedule("59 23 * * 0") // Every Sunday at 23:59
  .timeZone("America/New_York") // Adjust timezone as needed
  .onRun(async (context) => {
    console.log("Starting weekly ranking rewards processing...");
    
    try {
      // Get the top 10 users from the weekly spending ranking
      const topUsers = await getTopWeeklyUsers();
      
      if (!topUsers || topUsers.length === 0) {
        console.log("No users found in weekly ranking");
        return null;
      }
      
      // Process rewards for each user
      const batch = db.batch();
      const rewardRecords = [];
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      
      for (let i = 0; i < Math.min(topUsers.length, 10); i++) {
        const user = topUsers[i];
        const rank = i + 1;
        const prizeAmount = PRIZE_AMOUNTS[rank];
        
        if (!prizeAmount) continue;
        
        console.log(`Processing reward for rank ${rank}: User ${user.user_id}, Prize: ${prizeAmount} points`);
        
        // Update user's points balance
        const userRef = db.collection("users").doc(user.user_id);
        batch.update(userRef, {
          points: admin.firestore.FieldValue.increment(prizeAmount),
          last_weekly_reward: timestamp,
          total_rewards_earned: admin.firestore.FieldValue.increment(prizeAmount)
        });
        
        // Create a reward record for tracking
        const rewardRef = db.collection("weekly_rewards").doc();
        const rewardData = {
          user_id: user.user_id,
          display_name: user.display_name,
          rank: rank,
          prize_amount: prizeAmount,
          weekly_spending: user.spent || 0,
          created_at: timestamp,
          week_ending: new Date().toISOString().split('T')[0], // Current date
          status: "awarded"
        };
        
        batch.set(rewardRef, rewardData);
        rewardRecords.push(rewardData);
        
        // Create a notification for the user
        const notificationRef = db.collection("users").doc(user.user_id)
          .collection("notifications").doc();
        batch.set(notificationRef, {
          type: "weekly_reward",
          title: "Weekly Ranking Reward!",
          message: `Congratulations! You ranked #${rank} this week and earned ${prizeAmount.toLocaleString()} points!`,
          rank: rank,
          prize_amount: prizeAmount,
          created_at: timestamp,
          read: false
        });
      }
      
      // Commit all updates
      await batch.commit();
      
      console.log(`Successfully processed ${rewardRecords.length} weekly rewards`);
      
      // Log the summary to a collection for admin review
      await db.collection("weekly_reward_summaries").add({
        processed_at: timestamp,
        total_users_rewarded: rewardRecords.length,
        total_points_distributed: rewardRecords.reduce((sum, r) => sum + r.prize_amount, 0),
        rewards: rewardRecords,
        status: "completed"
      });
      
      return {
        success: true,
        users_rewarded: rewardRecords.length,
        total_points: rewardRecords.reduce((sum, r) => sum + r.prize_amount, 0)
      };
      
    } catch (error) {
      console.error("Error processing weekly ranking rewards:", error);
      
      // Log error for debugging
      await db.collection("weekly_reward_errors").add({
        error_message: error.message,
        error_stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      throw error;
    }
  });

/**
 * Manual trigger for testing or re-running the weekly rewards
 * Can be called via HTTP request
 */
exports.manualProcessWeeklyRewards = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "512MB",
  })
  .https
  .onRequest(async (req, res) => {
    // Check for admin authentication (you should implement proper auth)
    const adminToken = req.headers.authorization;
    if (!adminToken || adminToken !== functions.config().admin?.token) {
      res.status(403).send("Unauthorized");
      return;
    }
    
    try {
      console.log("Manual trigger: Processing weekly ranking rewards...");
      
      // Call the same processing logic
      const result = await processWeeklyRewardsLogic();
      
      res.status(200).json({
        success: true,
        message: "Weekly rewards processed successfully",
        result: result
      });
    } catch (error) {
      console.error("Error in manual processing:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

/**
 * Get top weekly users from the backend API
 */
async function getTopWeeklyUsers() {
  try {
    // Use the user backend API to get weekly spending ranking
    const API_BASE_URL = functions.config().api?.user_backend_url || 
      "https://user-backend-351785787544.us-central1.run.app/users/api/v1";
    
    // Create a service account token for backend-to-backend communication
    const token = await admin.auth().createCustomToken("cloud-function-service");
    
    const response = await axios.get(`${API_BASE_URL}/rank/weekly_spent/weekly_spent`, {
      params: { limit: 10 },
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    
    return response.data.rankings || [];
  } catch (error) {
    console.error("Error fetching top weekly users:", error);
    
    // Fallback: Query directly from Firestore if API fails
    return await getTopUsersFromFirestore();
  }
}

/**
 * Fallback: Get top users directly from Firestore
 */
async function getTopUsersFromFirestore() {
  try {
    // Calculate the start of the current week (Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Query users and aggregate their weekly spending
    const usersSnapshot = await db.collection("users")
      .where("last_activity", ">=", startOfWeek)
      .orderBy("last_activity", "desc")
      .limit(100)
      .get();
    
    const userSpending = [];
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      
      // Calculate weekly spending from transactions
      const transactionsSnapshot = await db.collection("transactions")
        .where("user_id", "==", doc.id)
        .where("type", "==", "pack_purchase")
        .where("created_at", ">=", startOfWeek)
        .get();
      
      let weeklySpent = 0;
      transactionsSnapshot.forEach(txDoc => {
        const txData = txDoc.data();
        weeklySpent += txData.amount || 0;
      });
      
      if (weeklySpent > 0) {
        userSpending.push({
          user_id: doc.id,
          display_name: userData.display_name || "Unknown",
          avatar: userData.avatar_url || "",
          spent: weeklySpent,
          level: userData.level || 1
        });
      }
    }
    
    // Sort by spending and return top 10
    userSpending.sort((a, b) => b.spent - a.spent);
    return userSpending.slice(0, 10);
    
  } catch (error) {
    console.error("Error getting top users from Firestore:", error);
    return [];
  }
}

/**
 * Shared logic for processing weekly rewards
 */
async function processWeeklyRewardsLogic() {
  const topUsers = await getTopWeeklyUsers();
  
  if (!topUsers || topUsers.length === 0) {
    return { success: false, message: "No users found" };
  }
  
  const batch = db.batch();
  const rewardRecords = [];
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  
  for (let i = 0; i < Math.min(topUsers.length, 10); i++) {
    const user = topUsers[i];
    const rank = i + 1;
    const prizeAmount = PRIZE_AMOUNTS[rank];
    
    if (!prizeAmount) continue;
    
    // Update user's points
    const userRef = db.collection("users").doc(user.user_id);
    batch.update(userRef, {
      points: admin.firestore.FieldValue.increment(prizeAmount),
      last_weekly_reward: timestamp,
      total_rewards_earned: admin.firestore.FieldValue.increment(prizeAmount)
    });
    
    // Create reward record
    const rewardRef = db.collection("weekly_rewards").doc();
    const rewardData = {
      user_id: user.user_id,
      display_name: user.display_name,
      rank: rank,
      prize_amount: prizeAmount,
      weekly_spending: user.spent || 0,
      created_at: timestamp,
      week_ending: new Date().toISOString().split('T')[0],
      status: "awarded"
    };
    
    batch.set(rewardRef, rewardData);
    rewardRecords.push(rewardData);
    
    // Create notification
    const notificationRef = db.collection("users").doc(user.user_id)
      .collection("notifications").doc();
    batch.set(notificationRef, {
      type: "weekly_reward",
      title: "Weekly Ranking Reward!",
      message: `Congratulations! You ranked #${rank} this week and earned ${prizeAmount.toLocaleString()} points!`,
      rank: rank,
      prize_amount: prizeAmount,
      created_at: timestamp,
      read: false
    });
  }
  
  await batch.commit();
  
  // Log summary
  await db.collection("weekly_reward_summaries").add({
    processed_at: timestamp,
    total_users_rewarded: rewardRecords.length,
    total_points_distributed: rewardRecords.reduce((sum, r) => sum + r.prize_amount, 0),
    rewards: rewardRecords,
    status: "completed"
  });
  
  return {
    success: true,
    users_rewarded: rewardRecords.length,
    total_points: rewardRecords.reduce((sum, r) => sum + r.prize_amount, 0),
    records: rewardRecords
  };
}

module.exports = {
  processWeeklyRankingRewards: exports.processWeeklyRankingRewards,
  manualProcessWeeklyRewards: exports.manualProcessWeeklyRewards
};