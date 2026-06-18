const { diffSnapshots, analyzeMutual } = require('../scraper');

describe('diffSnapshots', () => {
  test('detects unfollowed users', () => {
    const oldList = ['alice', 'bob', 'carol'];
    const newList = ['alice', 'carol'];
    const result = diffSnapshots(oldList, newList);
    expect(result.unfollowed).toEqual(['bob']);
    expect(result.newFollowers).toEqual([]);
  });

  test('detects new followers', () => {
    const oldList = ['alice'];
    const newList = ['alice', 'dave'];
    const result = diffSnapshots(oldList, newList);
    expect(result.unfollowed).toEqual([]);
    expect(result.newFollowers).toEqual(['dave']);
  });

  test('detects both simultaneously', () => {
    const oldList = ['alice', 'bob'];
    const newList = ['alice', 'carol'];
    const result = diffSnapshots(oldList, newList);
    expect(result.unfollowed).toEqual(['bob']);
    expect(result.newFollowers).toEqual(['carol']);
  });

  test('returns empty arrays when nothing changed', () => {
    const list = ['alice', 'bob'];
    const result = diffSnapshots(list, list);
    expect(result.unfollowed).toEqual([]);
    expect(result.newFollowers).toEqual([]);
  });
});

describe('analyzeMutual', () => {
  test('detects you follow but they dont follow back', () => {
    const followers = ['alice'];
    const following = ['alice', 'bob'];
    const result = analyzeMutual(followers, following);
    expect(result.youFollowNoReturn).toEqual(['bob']);
    expect(result.theyFollowNoReturn).toEqual([]);
  });

  test('detects they follow but you dont follow back', () => {
    const followers = ['alice', 'carol'];
    const following = ['alice'];
    const result = analyzeMutual(followers, following);
    expect(result.youFollowNoReturn).toEqual([]);
    expect(result.theyFollowNoReturn).toEqual(['carol']);
  });

  test('mutual follows produce no mismatches', () => {
    const list = ['alice', 'bob'];
    const result = analyzeMutual(list, list);
    expect(result.youFollowNoReturn).toEqual([]);
    expect(result.theyFollowNoReturn).toEqual([]);
  });
});
