/**
 * Polling helpers for handling API polling operations.
 */

import { Polling } from '..';

export const DefaultPollIntervalMs = 500; // 500 milliseconds
export const DefaultPollTimeoutSeconds = 60 * 60; // 60 minutes
export const DefaultShortPollIntervalMs = 50; // 50 milliseconds
export const DefaultShortPollTimeoutSeconds = 60 * 10; // 10 minutes

/**
 * Default backoff configuration for polling.
 * Backoff numbers are added to `intervalMs` after the attempt number is reached
 * e.g. if `intervalMs` is 500 and `backoff[10]` is 2000, then the polling interval
 * will be 2500ms after the 10th attempt.
 */
export const DefaultBackoffMs: Record<number, number | undefined> = {
  0: DefaultPollIntervalMs,
  1: 500,
  10: 2000,
  30: 3000,
  50: 5000,
  300: 10000,
  1000: 20000,
};

/**
 * Default polling configuration for batch operations.
 * Numbers below will result in a total delay of about 60 minutes
 * prior to reaching the maximum number of attempts.
 */
export const DefaultPolling: Polling = getPollingConfiguration({
  backoff: DefaultBackoffMs, // Use backoff
  maxPollDurationSeconds: DefaultPollTimeoutSeconds, // 1 hour
});

/**
 * Default short backoff configuration for polling.
 * Use this for polling for operations that complete quickly
 * and require a shorter delay between polling attempts.
 */
export const DefaultShortBackoffMs: Record<number, number | undefined> = {
  0: DefaultShortPollIntervalMs,
  1: 50,
  10: 200,
  20: 300,
  40: 500,
  50: 1000,
  100: 3000,
  200: 5000,
};

/**
 * Default short polling configuration for quick running operations.
 * Numbers below will result in a total delay of about 10 minutes
 * prior to reaching the maximum number of attempts.
 */
export const DefaultShortPolling: Polling = getPollingConfiguration({
  backoff: DefaultShortBackoffMs, // Use short backoff
  maxPollDurationSeconds: DefaultShortPollTimeoutSeconds, // 10 minutes
});

/**
 * Builds a polling configuration object based on the provided parameters.
 *
 * @param param0
 * @returns
 */
export function getPollingConfiguration({
  backoff,
  intervalMs = DefaultPollIntervalMs,
  maxPollDurationSeconds = DefaultPollTimeoutSeconds,
}: {
  backoff?: Record<number, number | undefined>;
  intervalMs?: number;
  maxPollDurationSeconds?: number;
}): Polling {
  return {
    intervalMs: intervalMs,
    maxAttempts: getMaxAttempts({
      intervalMs,
      maxPollDurationSeconds,
      backoff,
    }),
    backoff,
  };
}

/**
 * Calculates the polling delay for a given attempt.
 * @param param0
 * @returns {number} - The delay in milliseconds for the polling attempt.
 */
export function getPollingDelay({
  attempt,
  polling,
}: {
  attempt: number;
  polling: Polling;
}): number {
  return polling.intervalMs + getBackoffForAttempt(attempt, polling.backoff);
}

/**
 * Gets the backoff keys from the backoff configuration.
 * @param backoff - The backoff configuration.
 * @returns {number[]} - The array of backoff keys.
 */
function getBackoffKeys(backoff: Record<number, number | undefined>): number[] {
  return Object.keys(backoff)
    .map((key) => parseInt(key, 10))
    .reverse();
}

/**
 * Calculates the maximum number of polling attempts based on the provided
 * parameters.
 * @param param0
 * @returns {number} - The maximum number of polling attempts.
 */
function getMaxAttempts({
  intervalMs,
  maxPollDurationSeconds,
  backoff,
}: {
  intervalMs: number;
  maxPollDurationSeconds: number;
  backoff: Record<number, number | undefined> | undefined;
}): number {
  if (backoff) {
    let remainingTimeMs = maxPollDurationSeconds * 1000;
    let attempt = 0;
    const backoffKeys = getBackoffKeys(backoff);
    while (remainingTimeMs > 0) {
      const backoffMs = getBackoffForAttempt(attempt + 1, backoff, backoffKeys);
      remainingTimeMs -= intervalMs + backoffMs;
      attempt += 1;
    }
    return attempt;
  }
  return Math.max(1, Math.floor(maxPollDurationSeconds / intervalMs));
}

/**
 * Gets the backoff delay for a specific polling attempt.
 * @param attempt - The current polling attempt number.
 * @param backoff - The backoff configuration.
 * @param backoffKeys - Optional keys to use for backoff lookup.
 * @returns {number} - The backoff delay in milliseconds.
 */
function getBackoffForAttempt(
  attempt: number,
  backoff?: Record<number, number | undefined>,
  backoffKeys?: number[]
): number {
  if (backoff) {
    const keys = backoffKeys ?? getBackoffKeys(backoff);
    const foundKey = [...keys].find((key) => attempt > key);
    return backoff[foundKey ?? 0] ?? 0;
  }
  return 0;
}
