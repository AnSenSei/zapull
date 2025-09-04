// functions/index.js

const admin = require("firebase-admin");

// Initialize the Admin SDK
admin.initializeApp();

// Import weekly ranking rewards functions
const { 
  processWeeklyRankingRewards, 
  manualProcessWeeklyRewards 
} = require("./processWeeklyRankingRewards");

// Export functions
module.exports = {
  processWeeklyRankingRewards,
  manualProcessWeeklyRewards
};
