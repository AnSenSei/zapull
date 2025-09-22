import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGiftCard, findUserByEmail, redeemGiftCode } from '../firebase/config.js';

export const data = new SlashCommandBuilder()
  .setName('redeem')
  .setDescription('Redeem a gift code and add points to your account')
  .addStringOption(option =>
    option
      .setName('email')
      .setDescription('Your account email address')
      .setRequired(true))
  .addStringOption(option =>
    option
      .setName('giftcode')
      .setDescription('The gift code to redeem')
      .setRequired(true));

export async function execute(interaction) {
  let interactionAcknowledged = false;
  
  try {
    // Acknowledge interaction IMMEDIATELY - within 1 second
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    interactionAcknowledged = true;
    console.log('✅ Discord interaction acknowledged');
    
    const email = interaction.options.getString('email').trim().toLowerCase();
    const giftCode = interaction.options.getString('giftcode').trim().toUpperCase();

    console.log(`🎁 Redemption attempt: ${email} trying to redeem ${giftCode}`);
    
    console.log(`⏱️ Starting operations with timeouts`);
    const startTime = Date.now();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await interaction.editReply({
        embeds: [createErrorEmbed('Invalid email format', 'Please provide a valid email address.')]
      });
      return;
    }

    // Step 1: Find user by email FIRST (fast Firebase Auth lookup)
    console.log(`👤 Looking up user: ${email}`);
    const userResult = await findUserByEmail(email);
    
    if (!userResult.found) {
      const errorTitle = userResult.error?.includes('timeout') ? 'Database Timeout' : 'User Not Found';
      const errorMessage = userResult.error?.includes('timeout')
        ? 'Database is taking too long to respond. Please try again in a moment.'
        : `No account found with email: **${email}**\n\nPlease make sure you've registered an account with this email address.`;
        
      await interaction.editReply({
        embeds: [createErrorEmbed(errorTitle, errorMessage)]
      });
      return;
    }

    console.log(`✅ User found: ${userResult.userId}`);

    // Step 2: Check if gift code exists and get its details (only after user is confirmed)
    console.log(`🔍 Checking gift code: ${giftCode}`);
    const giftCardResult = await getGiftCard(giftCode);
    
    if (!giftCardResult.exists) {
      const elapsed = Date.now() - startTime;
      console.log(`❌ Gift card validation failed after ${elapsed}ms`);
      
      const errorTitle = giftCardResult.error?.includes('timeout') ? 'Database Timeout' : 'Gift Code Not Found';
      const errorMessage = giftCardResult.error?.includes('timeout') 
        ? 'Database is taking too long to respond. Please try again in a moment.' 
        : `The gift code \`${giftCode}\` does not exist.`;
        
      await interaction.editReply({
        embeds: [createErrorEmbed(errorTitle, errorMessage)]
      });
      return;
    }

    const giftCardData = giftCardResult.data;

    // Step 3: Check if already redeemed
    if (giftCardData.isRedeemed) {
      const redeemedDate = giftCardData.redeemedAt?.toDate?.()?.toLocaleDateString() || 'Unknown date';
      await interaction.editReply({
        embeds: [createErrorEmbed(
          'Already Redeemed', 
          `This gift code has already been redeemed on ${redeemedDate}.`
        )]
      });
      return;
    }

    // Step 3: Check if expired
    const now = new Date();
    const expiresAt = giftCardData.expiresAt?.toDate?.();
    if (expiresAt && now > expiresAt) {
      await interaction.editReply({
        embeds: [createErrorEmbed(
          'Gift Code Expired', 
          `This gift code expired on ${expiresAt.toLocaleDateString()}.`
        )]
      });
      return;
    }

    // User already found in Step 1

    // Step 5: Attempt to redeem the gift code
    console.log(`💰 Redeeming ${giftCardData.value} points for user ${userResult.userId}`);
    const redeemResult = await redeemGiftCode(
      giftCode, 
      userResult.userId, 
      email, 
      giftCardData.value
    );

    if (!redeemResult.success) {
      const errorTitle = redeemResult.error?.includes('timeout') ? 'Transaction Timeout' : 'Redemption Failed';
      const errorMessage = redeemResult.error?.includes('timeout')
        ? 'The redemption is taking too long. Please try again in a moment. If the issue persists, contact support.'
        : redeemResult.error;
        
      await interaction.editReply({
        embeds: [createErrorEmbed(errorTitle, errorMessage)]
      });
      return;
    }

    // Step 6: Success! Send confirmation
    const currentBalance = userResult.data.pointsBalance || 0;
    const newBalance = currentBalance + giftCardData.value;

    await interaction.editReply({
      embeds: [createSuccessEmbed(
        'Gift Code Redeemed Successfully! 🎉',
        `**${giftCardData.value} points** have been added to your account!\n\n` +
        `📧 **Account:** ${email}\n` +
        `🎁 **Gift Code:** \`${giftCode}\`\n` +
        `💎 **Points Added:** ${giftCardData.value.toLocaleString()}\n` +
        `💰 **New Balance:** ${newBalance.toLocaleString()}`
      )]
    });

    const totalTime = Date.now() - startTime;
    console.log(`✅ Successfully redeemed ${giftCode} for ${email}: +${giftCardData.value} points (${totalTime}ms)`);

  } catch (error) {
    console.error('❌ Error in /redeem command:', error);
    
    // If interaction wasn't acknowledged, we can't send any response
    if (!interactionAcknowledged) {
      console.error('❌ Interaction was never acknowledged - cannot send error response');
      return;
    }
    
    try {
      // Check if this is an unknown interaction error
      if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
        console.error('❌ Unknown interaction - likely timeout. User will need to retry.');
        return; // Can't respond to unknown interactions
      }
      
      // Try to send error response (interaction should be deferred at this point)
      await interaction.editReply({
        embeds: [createErrorEmbed(
          'System Error', 
          'An unexpected error occurred. Please try again later or contact support.'
        )]
      });
    } catch (editError) {
      console.error('❌ Failed to send error message:', editError);
      // If we can't send any response, the user will see the command as failed
    }
  }
}

/**
 * Create a success embed
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} Discord embed
 */
function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x00FF00) // Green
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Zapull Gift Code System' });
}

/**
 * Create an error embed
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} Discord embed
 */
function createErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xFF0000) // Red
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Zapull Gift Code System' });
}