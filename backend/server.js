require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./db');
const { initScheduler, addUserJob, runCheckForUser } = require('./scheduler');
const { bot, resolveOTP } = require('./notifier');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// POST /register
app.post('/register', async (req, res) => {
  const { invitePassword, instagramUsername } = req.body;

  if (!invitePassword || !instagramUsername) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  if (invitePassword !== process.env.INVITE_PASSWORD) {
    return res.status(403).json({ error: 'Invalid invite password.' });
  }

  const username = instagramUsername.toLowerCase().replace(/^@/, '').trim();

  const { data: existing } = await supabase
    .from('users')
    .select('id, is_verified')
    .eq('instagram_username', username)
    .single();

  if (existing?.is_verified) {
    // Already registered and verified — treat as login, go straight to dashboard
    return res.status(200).json({ userId: existing.id, alreadyVerified: true });
  }

  if (existing && !existing.is_verified) {
    return res.status(200).json({
      userId: existing.id,
      message: `Message @${process.env.TELEGRAM_BOT_USERNAME} on Telegram to get your verification code.`,
    });
  }

  const { data: user, error } = await supabase
    .from('users')
    .insert({ instagram_username: username, invite_code_used: invitePassword })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Database error.' });

  return res.status(201).json({
    userId: user.id,
    message: `Message @${process.env.TELEGRAM_BOT_USERNAME} on Telegram to get your verification code.`,
  });
});

// POST /verify
app.post('/verify', async (req, res) => {
  const { userId, otp } = req.body;

  if (!userId || !otp) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) return res.status(404).json({ error: 'User not found.' });
  if (user.is_verified) return res.status(409).json({ error: 'Already verified.' });

  const chatId = resolveOTP(otp);
  if (!chatId) {
    return res.status(401).json({ error: 'Invalid or expired code. Message the bot again to get a new one.' });
  }

  await supabase
    .from('users')
    .update({ is_verified: true, telegram_chat_id: chatId })
    .eq('id', userId);

  addUserJob({ ...user, is_verified: true, telegram_chat_id: chatId });

  return res.status(200).json({ success: true });
});

// GET /dashboard/:userId
app.get('/dashboard/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, instagram_username, check_interval_hours')
    .eq('id', userId)
    .eq('is_verified', true)
    .single();

  if (userError || !user) return res.status(404).json({ error: 'User not found.' });

  const { data: snapshots } = await supabase
    .from('snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false })
    .limit(7);

  const latestSnap = snapshots?.[0] || null;

  let youFollowNoReturn = [];
  let theyFollowNoReturn = [];
  if (latestSnap) {
    const { analyzeMutual } = require('./scraper');
    const result = analyzeMutual(
      latestSnap.follower_list || [],
      latestSnap.following_list || []
    );
    youFollowNoReturn = result.youFollowNoReturn;
    theyFollowNoReturn = result.theyFollowNoReturn;
  }

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .in('type', ['unfollowed', 'new_follower'])
    .order('detected_at', { ascending: false })
    .limit(50);

  const sparkline = (snapshots || [])
    .reverse()
    .map((s) => ({ taken_at: s.taken_at, follower_count: s.follower_count }));

  return res.status(200).json({
    user,
    latestSnapshot: latestSnap
      ? {
          follower_count: latestSnap.follower_count,
          following_count: latestSnap.following_count,
          taken_at: latestSnap.taken_at,
        }
      : null,
    sparkline,
    youFollowNoReturn,
    theyFollowNoReturn,
    events: events || [],
  });
});

// POST /analyze/:userId
app.post('/analyze/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('is_verified', true)
    .single();

  if (error || !user) return res.status(404).json({ error: 'User not found.' });

  runCheckForUser(user).catch((err) => console.error('Manual analyze error:', err));

  return res.status(202).json({ message: 'Analysis triggered. Refresh in ~30 seconds.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`IG Check backend running on port ${PORT}`);
  await initScheduler();
});
