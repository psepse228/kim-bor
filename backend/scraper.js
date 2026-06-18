const axios = require('axios');

const BASE = 'https://api.hikerapi.com';

function headers() {
  return { 'x-access-key': process.env.HIKER_API_KEY };
}

async function getUserId(username) {
  const res = await axios.get(`${BASE}/v1/user/by/username`, {
    params: { username },
    headers: headers(),
  });
  const user = res.data;
  if (!user || !user.pk) throw new Error('ACCOUNT_NOT_FOUND');
  if (user.is_private) throw new Error('PRIVATE');
  return user.pk;
}

async function fetchList(userId, type) {
  const results = [];
  let maxId = null;

  do {
    const params = { user_id: userId };
    if (maxId) params.max_id = maxId;

    const res = await axios.get(`${BASE}/v1/user/${type}/chunk`, {
      params,
      headers: headers(),
    });

    const [users, nextCursor] = res.data;
    for (const u of (users || [])) {
      if (!u.is_verified) results.push(u.username);
    }
    maxId = nextCursor || null;
  } while (maxId);

  return results;
}

async function fetchUserLists(username) {
  const userId = await getUserId(username);
  const followers = await fetchList(userId, 'followers');
  const following = await fetchList(userId, 'following');
  return { followers, following };
}

function diffSnapshots(oldList, newList) {
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  return {
    unfollowed: oldList.filter((u) => !newSet.has(u)),
    newFollowers: newList.filter((u) => !oldSet.has(u)),
  };
}

function analyzeMutual(followers, following) {
  const followerSet = new Set(followers);
  const followingSet = new Set(following);
  return {
    youFollowNoReturn: following.filter((u) => !followerSet.has(u)),
    theyFollowNoReturn: followers.filter((u) => !followingSet.has(u)),
  };
}

async function fetchVerifiedFollowing(username) {
  const userId = await getUserId(username);
  const verified = [];
  let maxId = null;
  do {
    const params = { user_id: userId };
    if (maxId) params.max_id = maxId;
    const res = await axios.get(`${BASE}/v1/user/following/chunk`, {
      params,
      headers: headers(),
    });
    const [users, nextCursor] = res.data;
    for (const u of (users || [])) {
      if (u.is_verified) verified.push(u.username);
    }
    maxId = nextCursor || null;
  } while (maxId);
  return verified;
}

async function sendFollowRequest() {
  // Not supported — HikerAPI is read-only
}

module.exports = { fetchUserLists, fetchVerifiedFollowing, diffSnapshots, analyzeMutual, sendFollowRequest };
