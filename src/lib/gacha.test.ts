import { describe, expect, it } from 'vitest';
import { expectedPulls, featuredCurve, fiveStarRate, RULES, totalPulls, worstCase } from './gacha';

describe('gacha model', () => {
  it('has soft and hard pity', () => {
    const r = RULES.character;
    expect(fiveStarRate(r, 1)).toBe(0.006);
    expect(fiveStarRate(r, 73)).toBe(0.006);
    expect(fiveStarRate(r, 74)).toBeCloseTo(0.066);
    expect(fiveStarRate(r, 90)).toBe(1);
  });

  it('guarantees a 5★ within 90 pulls', () => {
    const c = featuredCurve(RULES.standard, { pity: 0, guaranteed: false, copies: 1, maxPulls: 90 });
    expect(c[90]).toBeCloseTo(1, 10);
  });

  it('guarantees the featured character within 180 pulls', () => {
    const c = featuredCurve(RULES.character, { pity: 0, guaranteed: false, copies: 1, maxPulls: 180 });
    expect(c[90]).toBeLessThan(1);
    expect(c[180]).toBeCloseTo(1, 10);
  });

  it('matches the known ~62.5 expected pulls for a 5★ and ~93.75 for a featured one', () => {
    const any = featuredCurve(RULES.standard, { pity: 0, guaranteed: false, copies: 1, maxPulls: 90 });
    expect(expectedPulls(any)).toBeGreaterThan(60);
    expect(expectedPulls(any)).toBeLessThan(64);
    const featured = featuredCurve(RULES.character, { pity: 0, guaranteed: false, copies: 1, maxPulls: 180 });
    expect(expectedPulls(featured)).toBeGreaterThan(91);
    expect(expectedPulls(featured)).toBeLessThan(96);
  });

  it('current pity shortens the road', () => {
    const fresh = featuredCurve(RULES.character, { pity: 0, guaranteed: true, copies: 1, maxPulls: 20 });
    const deep = featuredCurve(RULES.character, { pity: 75, guaranteed: true, copies: 1, maxPulls: 20 });
    expect(deep[15]).toBeCloseTo(1, 10);
    expect(fresh[15]).toBeLessThan(0.1);
  });

  it('computes worst cases', () => {
    expect(worstCase('character', 0, false, 1)).toBe(180);
    expect(worstCase('character', 10, true, 1)).toBe(80);
    expect(worstCase('character', 0, false, 7)).toBe(180 * 7);
    expect(worstCase('weapon', 0, false, 1)).toBe(160);
  });

  it('counts pulls from currencies', () => {
    expect(totalPulls(1600, 3, 12)).toBe(10 + 3 + 2);
  });
});

import { fiftyLuck, normalCdf, pityLuck, pityMoments } from './gacha';

describe('luck rating', () => {
  it('matches the known pity distribution', () => {
    const { mean, sd } = pityMoments(RULES.character);
    expect(mean).toBeGreaterThan(61);
    expect(mean).toBeLessThan(64);
    expect(sd).toBeGreaterThan(10);
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it('rates low average pity as lucky', () => {
    expect(pityLuck(40, 10, RULES.character)).toBeGreaterThan(0.99);
    expect(pityLuck(85, 10, RULES.character)).toBeLessThan(0.01);
    expect(pityLuck(pityMoments(RULES.character).mean, 5, RULES.character)).toBeCloseTo(0.5, 5);
  });

  it('rates 50/50 records with the binomial distribution', () => {
    expect(fiftyLuck(5, 10)).toBeCloseTo(0.5, 6);
    expect(fiftyLuck(10, 10)).toBeGreaterThan(0.99);
    expect(fiftyLuck(0, 10)).toBeLessThan(0.01);
  });
});

import { projectedPrimogems } from './gacha';

describe('savings forecast', () => {
  it('adds daily, Welkin and monthly income', () => {
    expect(projectedPrimogems(0, { daily: 60, welkin: true, monthly: 1600 })).toBe(0);
    expect(projectedPrimogems(10, { daily: 60, welkin: false, monthly: 0 })).toBe(600);
    expect(projectedPrimogems(10, { daily: 60, welkin: true, monthly: 0 })).toBe(1500);
    // One average month of monthly income.
    expect(projectedPrimogems(365.25 / 12, { daily: 0, welkin: false, monthly: 1600 })).toBe(1600);
  });
});
