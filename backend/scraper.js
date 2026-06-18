const axios = require('axios');

const ACTOR = 'figue~instagram-followers-and-following-scrapper';

async function apifyRun(input) {
  const res = await axios.post(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`,
    input,
    {
      params: { token: process.env.APIFY_TOKEN },
      timeout: 300000,
    }
  );
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchUserLists(username) {
  const [followersRaw, followingRaw] = await Promise.all([
    apifyRun({ username, type: 'followers' }),
    apifyRun({ username, type: 'following' }),
  ]);

  if (!followersRaw.length && !followingRaw.length) {
    throw new Error('PRIVATE');
  }

  const followers = [];
  const following = [];
  const followingVerified = [];

  for (const u of followersRaw) {
    if (!u.is_verified) followers.push(u.username);
  }

  for (const u of followingRaw) {
    if (u.is_verified) followingVerified.push(u.username);
    else following.push(u.username);
  }

  return { followers, following, followingVerified };
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

async function sendFollowRequest() {}

module.exports = { fetchUserLists, diffSnapshots, analyzeMutual, sendFollowRequest };
