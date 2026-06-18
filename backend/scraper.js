const axios = require('axios');

const IG_HEADERS = {
  'User-Agent': 'Instagram 219.0.0.12.117 Android (26/8.0.0; 480dpi; 1080x1920; OnePlus; 6T; OnePlus6T; qcom; en_US; 314665256)',
  'Accept': '*/*',
  'Accept-Language': 'en-US',
  'Accept-Encoding': 'gzip, deflate',
  'X-IG-App-ID': '936619743392459',
  'X-IG-WWW-Claim': '0',
  'Origin': 'https://www.instagram.com',
  'Connection': 'keep-alive',
};

function igHeaders() {
  return {
    ...IG_HEADERS,
    Cookie: `sessionid=${process.env.IG_SESSION_COOKIE}`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return sleep(2000 + Math.random() * 3000);
}

async function getUserId(username) {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
  const res = await axios.get(url, { headers: igHeaders() });
  return res.data.data.user.id;
}

async function fetchList(userId, type) {
  const results = [];
  let nextMaxId = null;

  do {
    await randomDelay();
    const params = new URLSearchParams({ count: '50' });
    if (nextMaxId) params.set('max_id', nextMaxId);

    const url = `https://www.instagram.com/api/v1/friendships/${userId}/${type}/?${params}`;
    const res = await axios.get(url, { headers: igHeaders() });
    const data = res.data;

    const users = data.users || [];
    for (const u of users) {
      results.push(u.username);
    }

    nextMaxId = data.next_max_id || null;
  } while (nextMaxId);

  return results;
}

async function fetchUserLists(username) {
  let userId;
  try {
    userId = await getUserId(username);
  } catch (err) {
    if (err.response?.status === 404) throw new Error('ACCOUNT_NOT_FOUND');
    throw err;
  }

  try {
    await randomDelay();
    const followers = await fetchList(userId, 'followers');
    await randomDelay();
    const following = await fetchList(userId, 'following');
    return { followers, following };
  } catch (err) {
    if (err.response?.status === 400) {
      throw new Error('PRIVATE');
    }
    throw err;
  }
}

function diffSnapshots(oldList, newList) {
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  const unfollowed = oldList.filter((u) => !newSet.has(u));
  const newFollowers = newList.filter((u) => !oldSet.has(u));
  return { unfollowed, newFollowers };
}

function analyzeMutual(followers, following) {
  const followerSet = new Set(followers);
  const followingSet = new Set(following);
  const youFollowNoReturn = following.filter((u) => !followerSet.has(u));
  const theyFollowNoReturn = followers.filter((u) => !followingSet.has(u));
  return { youFollowNoReturn, theyFollowNoReturn };
}

async function sendFollowRequest(username) {
  const userId = await getUserId(username);
  await randomDelay();
  await axios.post(
    `https://www.instagram.com/api/v1/friendships/create/${userId}/`,
    {},
    { headers: igHeaders() }
  );
}

module.exports = { fetchUserLists, diffSnapshots, analyzeMutual, sendFollowRequest };
