const cron = require('node-cron');
const supabase = require('./db');
const { fetchUserLists, diffSnapshots, analyzeMutual, sendFollowRequest } = require('./scraper');
const { sendUnfollowAlert, sendNewFollowerAlert, sendPrivatePendingAlert } = require('./notifier');

const jobs = new Map(); // userId → cron task

async function runCheckForUser(user) {
  let lists;

  try {
    lists = await fetchUserLists(user.instagram_username);
  } catch (err) {
    if (err.message === 'PRIVATE') {
      if (!user.pending_follow) {
        await sendFollowRequest(user.instagram_username);
        await supabase.from('users').update({ pending_follow: true }).eq('id', user.id);
        if (user.telegram_chat_id) {
          await sendPrivatePendingAlert(user.telegram_chat_id, user.instagram_username);
        }
      }
      return;
    }
    console.error(`Scrape failed for ${user.instagram_username}:`, err.message);
    return;
  }

  if (user.pending_follow) {
    await supabase.from('users').update({ pending_follow: false }).eq('id', user.id);
  }

  const { data: lastSnapshots } = await supabase
    .from('snapshots')
    .select('*')
    .eq('user_id', user.id)
    .order('taken_at', { ascending: false })
    .limit(1);

  const lastSnap = lastSnapshots?.[0] || null;

  await supabase
    .from('snapshots')
    .insert({
      user_id: user.id,
      follower_count: lists.followers.length,
      following_count: lists.following.length,
      follower_list: lists.followers,
      following_list: lists.following,
    });

  if (!lastSnap) return;

  const { unfollowed, newFollowers } = diffSnapshots(
    lastSnap.follower_list || [],
    lists.followers
  );

  for (const username of unfollowed) {
    await supabase.from('events').insert({
      user_id: user.id,
      type: 'unfollowed',
      target_username: username,
      count_before: lastSnap.follower_count,
      count_after: lists.followers.length,
    });
    if (user.telegram_chat_id) await sendUnfollowAlert(user.telegram_chat_id, username);
  }

  for (const username of newFollowers) {
    await supabase.from('events').insert({
      user_id: user.id,
      type: 'new_follower',
      target_username: username,
      count_before: lastSnap.follower_count,
      count_after: lists.followers.length,
    });
    if (user.telegram_chat_id) await sendNewFollowerAlert(user.telegram_chat_id, username);
  }

  const { youFollowNoReturn, theyFollowNoReturn } = analyzeMutual(lists.followers, lists.following);

  const prevMutual = analyzeMutual(
    lastSnap.follower_list || [],
    lastSnap.following_list || []
  );
  const prevYFNR = new Set(prevMutual.youFollowNoReturn);
  const prevTFNR = new Set(prevMutual.theyFollowNoReturn);

  for (const username of youFollowNoReturn) {
    if (!prevYFNR.has(username)) {
      await supabase.from('events').insert({
        user_id: user.id,
        type: 'you_follow_no_return',
        target_username: username,
        count_before: null,
        count_after: null,
      });
    }
  }

  for (const username of theyFollowNoReturn) {
    if (!prevTFNR.has(username)) {
      await supabase.from('events').insert({
        user_id: user.id,
        type: 'they_follow_no_return',
        target_username: username,
        count_before: null,
        count_after: null,
      });
    }
  }
}

function cronExpression(intervalHours) {
  return `0 */${intervalHours} * * *`;
}

function addUserJob(user) {
  if (jobs.has(user.id)) return;
  const task = cron.schedule(cronExpression(user.check_interval_hours), () => {
    runCheckForUser(user).catch((err) =>
      console.error(`Job error for ${user.instagram_username}:`, err)
    );
  });
  jobs.set(user.id, task);
  console.log(`Scheduled check for @${user.instagram_username} every ${user.check_interval_hours}h`);
}

async function initScheduler() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_verified', true);

  if (error) {
    console.error('Failed to load users for scheduler:', error.message);
    return;
  }

  for (const user of users) {
    addUserJob(user);
  }

  console.log(`Scheduler initialised with ${users.length} users.`);
}

module.exports = { initScheduler, addUserJob, runCheckForUser };
