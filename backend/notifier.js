const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// chatId → { otp, expiresAt }
const otpStore = new Map();

bot.on('message', async (msg) => {
  const chatId = String(msg.chat.id);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  otpStore.set(chatId, { otp, expiresAt });

  await bot.sendMessage(
    chatId,
    `Your IG Check verification code is: *${otp}*\n\nIt expires in 10 minutes. Paste it on the registration page.`,
    { parse_mode: 'Markdown' }
  );
});

// Returns chatId if a matching, non-expired OTP is found; null otherwise
function resolveOTP(submittedOtp) {
  for (const [chatId, entry] of otpStore.entries()) {
    if (entry.otp === submittedOtp && entry.expiresAt > new Date()) {
      otpStore.delete(chatId);
      return chatId;
    }
  }
  return null;
}

async function sendUnfollowAlert(chatId, username) {
  await bot.sendMessage(chatId, `❌ @${username} unfollowed you.`);
}

async function sendNewFollowerAlert(chatId, username) {
  await bot.sendMessage(chatId, `✅ @${username} started following you.`);
}

async function sendCountChangeAlert(chatId, before, after) {
  const diff = after - before;
  const sign = diff > 0 ? '+' : '';
  await bot.sendMessage(chatId, `📊 Your follower count changed: ${before} → ${after} (${sign}${diff})`);
}

async function sendPrivatePendingAlert(chatId, username) {
  await bot.sendMessage(
    chatId,
    `⏳ @${username} has a private account. We've sent them a follow request. We'll start tracking once they accept.`
  );
}

module.exports = { bot, resolveOTP, sendUnfollowAlert, sendNewFollowerAlert, sendCountChangeAlert, sendPrivatePendingAlert };
