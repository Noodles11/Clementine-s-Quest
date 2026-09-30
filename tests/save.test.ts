import { describe, expect, it } from 'vitest';
import { exportProfile, importProfile, migrateProfile, newProfile, PROFILE_VERSION } from '../src/core/save';

describe('save', () => {
  it('round-trips export codes', () => {
    const p = newProfile();
    p.achievements.push('dive2');
    p.stats.runs = 7;
    const back = importProfile(exportProfile(p));
    expect(back?.achievements).toContain('dive2');
    expect(back?.stats.runs).toBe(7);
  });
  it('rejects garbage', () => {
    expect(importProfile('hello')).toBeNull();
    expect(importProfile('CQ1:!!!')).toBeNull();
  });
  it('migrates v1 profiles', () => {
    const p = migrateProfile({ version: 1, unlocks: ['dive2'], stats: { runs: 3 } });
    expect(p.version).toBe(PROFILE_VERSION);
    expect(p.achievements).toContain('dive2');
    expect(p.stats.runs).toBe(3);
    expect(p.options.volume).toBeGreaterThan(0);
  });
});
