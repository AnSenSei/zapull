import { Client, GatewayIntentBits, REST, Routes, Collection, MessageFlags } from 'discord.js';
import { config } from 'dotenv';
import http from 'http';
import { initializeFirebase } from './firebase/config.js';
import { data as redeemCommandData, execute as redeemCommandExecute } from './commands/redeem.js';

// Load environment variables
config();

// Bot configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || '1412496817974673408'; // Extracted from your token
const GUILD_ID = process.env.GUILD_ID; // For guild-specific command registration (instant)

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set in environment variables');
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Command collection
client.commands = new Collection();
client.commands.set('redeem', { data: redeemCommandData, execute: redeemCommandExecute });

// Event: Bot is ready (use clientReady to avoid deprecation)
client.once('clientReady', async () => {
  console.log('🤖 Discord bot is ready!');
  console.log(`📋 Logged in as: ${client.user.tag}`);
  console.log(`🌐 Connected to ${client.guilds.cache.size} servers`);
  
  try {
    // Initialize Firebase
    await initializeFirebase();
    firebaseReady = true;  // Mark Firebase as ready
    console.log('🔥 Firebase initialized successfully');
    
    // Register slash commands
    await registerCommands();
    
    console.log('✅ Bot setup completed successfully!');
  } catch (error) {
    console.error('❌ Error during bot initialization:', error);
    process.exit(1);
  }
});

// Track Firebase initialization status
let firebaseReady = false;

// Event: Handle slash command interactions
client.on('interactionCreate', async (interaction) => {
  // Only handle slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`❌ No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    console.log(`📨 Command received: /${interaction.commandName} from ${interaction.user.tag} in ${interaction.guild?.name || 'DM'}`);
    
    // Check if Firebase is ready before executing commands
    if (!firebaseReady) {
      console.error('❌ Firebase not ready yet, rejecting command');
      await interaction.reply({
        content: '⚠️ Bot is still starting up, please try again in a moment.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    await command.execute(interaction);
    botStats.commandsProcessed++;
  } catch (error) {
    console.error(`❌ Error executing ${interaction.commandName}:`, error);
    botStats.errors++;
    
    // Try to send error response
    try {
      const errorMessage = {
        content: '❌ There was an error while executing this command!',
        flags: MessageFlags.Ephemeral
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    } catch (followUpError) {
      console.error('❌ Failed to send error message to user:', followUpError);
    }
  }
});

// Event: Handle errors with reconnection logic
client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
  botStats.errors++;
  // Don't exit on error - let Discord.js handle reconnection
});

// Event: Handle warnings
client.on('warn', (info) => {
  console.warn('⚠️ Discord client warning:', info);
});

// Event: Handle disconnections
client.on('disconnect', () => {
  console.warn('⚠️ Discord client disconnected - Discord.js will attempt to reconnect');
});

// Event: Handle reconnections
client.on('resume', (replayed) => {
  console.log(`✅ Discord client resumed - replayed ${replayed} events`);
  botStats.reconnections++;
  botStats.lastHeartbeat = new Date();
});

// Event: Handle rate limits
client.on('rateLimit', (rateLimitData) => {
  console.warn('⚠️ Rate limit hit:', {
    timeout: rateLimitData.timeout,
    limit: rateLimitData.limit,
    method: rateLimitData.method,
    path: rateLimitData.path,
    route: rateLimitData.route
  });
});

/**
 * Register slash commands with Discord
 */
async function registerCommands() {
  try {
    console.log('🔄 Started refreshing application (/) commands...');

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    
    // Prepare command data
    const commands = [redeemCommandData.toJSON()];
    
    // Register commands - use guild-specific if GUILD_ID is provided (instant), otherwise global (1 hour)
    let data;
    if (GUILD_ID) {
      console.log(`📍 Registering commands for guild: ${GUILD_ID} (instant)`);
      data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log('⚡ Guild commands registered - should appear instantly!');
    } else {
      console.log('🌐 Registering global commands (may take up to 1 hour)');
      data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log('⏰ Global commands registered - may take up to 1 hour to appear');
    }

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    console.log(`📋 Registered commands: ${commands.map(cmd => cmd.name).join(', ')}`);
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
    throw error;
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Track bot statistics for monitoring
let botStats = {
  startTime: new Date(),
  lastHeartbeat: new Date(),
  commandsProcessed: 0,
  errors: 0,
  reconnections: 0
};

// Update heartbeat every 30 seconds
setInterval(() => {
  if (client.isReady()) {
    botStats.lastHeartbeat = new Date();
  }
}, 30000);

// Create HTTP server for Cloud Run health checks
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const uptime = Math.floor((new Date() - botStats.startTime) / 1000);
    const lastHeartbeatAge = Math.floor((new Date() - botStats.lastHeartbeat) / 1000);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: client.isReady() && lastHeartbeatAge < 60 ? 'healthy' : 'unhealthy',
      service: 'discord-gift-bot',
      botStatus: client.isReady() ? 'connected' : 'disconnected',
      uptime: uptime,
      lastHeartbeatAge: lastHeartbeatAge,
      stats: {
        commandsProcessed: botStats.commandsProcessed,
        errors: botStats.errors,
        reconnections: botStats.reconnections,
        guilds: client.guilds?.cache?.size || 0
      },
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🏥 Health check server running on port ${PORT}`);
});

// Login to Discord
console.log('🚀 Starting Discord bot...');
client.login(DISCORD_TOKEN);
