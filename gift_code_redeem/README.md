# Gift Code Redeem Discord Bot

A Discord bot that allows users to redeem gift codes and automatically add points to their Zapull accounts using Firebase Firestore.

## Features

- **Slash Command Interface**: `/redeem` command with email and gift code parameters
- **Gift Code Validation**: Checks if codes exist, aren't already redeemed, and haven't expired
- **User Lookup**: Finds users by email address in the Firebase database
- **Atomic Transactions**: Ensures data consistency when redeeming codes
- **Comprehensive Error Handling**: Provides clear feedback for all error scenarios
- **Secure**: Uses ephemeral responses to keep sensitive data private

## Prerequisites

- Node.js 18.0.0 or higher
- Firebase service account credentials with access to the `zapull-production` project
- Discord Bot Token and Application ID

## Installation

1. **Clone or navigate to the project directory**:
   ```bash
   cd gift_code_redeem
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   - Copy the `.env.example` or create a `.env` file
   - Set your Discord bot token and Firebase configuration
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_application_id_here
   FIREBASE_PROJECT_ID=zapull-production
   ```

4. **Set up Firebase credentials**:
   
   **For local development:**
   - Download your Firebase service account key JSON file
   - Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
     ```

   **For production deployment:**
   - The bot uses Application Default Credentials (ADC)
   - Ensure your deployment environment has the necessary Firebase permissions

## Discord Bot Setup

1. **Create a Discord Application**:
   - Go to https://discord.com/developers/applications
   - Create a new application
   - Go to the "Bot" section and create a bot
   - Copy the bot token and set it in your `.env` file

2. **Set Bot Permissions**:
   - In the Discord Developer Portal, go to OAuth2 > URL Generator
   - Select "bot" and "applications.commands" scopes
   - Select "Use Slash Commands" permission
   - Use the generated URL to invite the bot to your server

## Database Schema

The bot interacts with two Firestore collections:

### Gift Cards Collection (`giftCards`)
```javascript
// Document ID: {giftCode}
{
  code: "1KWB98UKE14V",           // string
  createdAt: Timestamp,          // timestamp
  expiresAt: Timestamp,          // timestamp
  isRedeemed: false,             // boolean
  redeemedAt: null,              // timestamp | null
  redeemedBy: null,              // string | null (email)
  value: 200                     // number (points value)
}
```

### Users Collection (`users`)
```javascript
// Document ID: {userId}
{
  email: "user@example.com",     // string
  pointsBalance: 1000,           // number
  // ... other user fields
}
```

## Usage

### Starting the Bot

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

### Discord Commands

**`/redeem`**
- **Description**: Redeem a gift code and add points to your account
- **Parameters**:
  - `email` (required): Your account email address
  - `giftcode` (required): The gift code to redeem

**Example usage:**
```
/redeem email:user@example.com giftcode:1KWB98UKE14V
```

### Response Examples

**Successful Redemption:**
```
✅ Gift Code Redeemed Successfully! 🎉

200 points have been added to your account!

📧 Account: user@example.com
🎁 Gift Code: 1KWB98UKE14V
💎 Points Added: 200
💰 New Balance: 1,200
```

**Error Responses:**
- Gift code not found
- Gift code already redeemed (shows who redeemed and when)
- Gift code expired (shows expiration date)
- User account not found
- Invalid email format

## Architecture

### Project Structure
```
gift_code_redeem/
├── src/
│   ├── index.js              # Main bot file
│   ├── commands/
│   │   └── redeem.js         # Redeem slash command
│   └── firebase/
│       └── config.js         # Firebase configuration and utilities
├── package.json              # Dependencies and scripts
├── .env                      # Environment variables (not in git)
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

### Key Components

1. **Discord Client** (`src/index.js`):
   - Handles Discord connection and events
   - Registers slash commands
   - Routes interactions to command handlers

2. **Redeem Command** (`src/commands/redeem.js`):
   - Validates user input
   - Coordinates the redemption process
   - Provides user feedback via Discord embeds

3. **Firebase Config** (`src/firebase/config.js`):
   - Initializes Firebase Admin SDK
   - Provides utility functions for database operations
   - Handles atomic transactions for redemptions

### Security Features

- **Ephemeral Responses**: All command responses are ephemeral (only visible to the user)
- **Input Validation**: Email format validation and gift code sanitization
- **Atomic Transactions**: Ensures data consistency across Firestore operations
- **Error Handling**: Prevents sensitive information leakage in error messages

## Deployment

### Local Development
1. Set up Firebase credentials as described above
2. Run `npm run dev` to start with auto-restart
3. Test the bot in your Discord server

### Production Deployment
1. Deploy to a platform with Firebase access (Google Cloud Run, etc.)
2. Ensure Application Default Credentials are configured
3. Set environment variables in your deployment platform
4. Run `npm start`

## Troubleshooting

**Firebase Connection Issues:**
- Verify your service account has Firestore read/write permissions
- Check that `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- Ensure the Firebase project ID is correct

**Discord Bot Not Responding:**
- Verify the bot token is valid
- Check that the bot has been invited to your server with proper permissions
- Ensure slash commands are registered (check console logs)

**Gift Code Issues:**
- Verify the gift code exists in Firestore
- Check the document structure matches the expected schema
- Ensure timestamps are properly formatted

## Logs

The bot provides detailed console logging:
- 🤖 Bot startup and connection status
- 🔥 Firebase initialization
- 📨 Command execution logs
- ✅ Successful redemptions
- ❌ Errors and warnings

## License

MIT License - Feel free to modify and distribute as needed.

## Support

For issues or questions:
1. Check the console logs for error details
2. Verify your Firebase and Discord configurations
3. Ensure all environment variables are properly set