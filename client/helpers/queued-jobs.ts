import { AxiosResponse } from 'axios';
import { Failure, Polling, QueuedJob } from '../../index';
import { isFailure, isQueuedJob, isQueuedJobError, prettyJson } from '../utils';

export const PollIntervalMs = 5000;

export const AttemptsPerMin = 60000 / PollIntervalMs;

export const MaxAttempts = 60 * AttemptsPerMin; // Try for an hour

/** Polling async queued job request arguments. */
export interface PollQueuedJobReq {
  /** Queued job ID. */
  readonly id: string;

  /** Function called to get queued job. */
  readonly getQueuedJob: (id: string) => Promise<AxiosResponse<QueuedJob>>;

  /** If `true`, doesn't fail if API returns 404 status code. */
  readonly allow404?: boolean;

  /** {@link Polling} */
  readonly polling: Polling;
}

export interface PollQueuedJobRes<T> extends PollJobRes<T> {
  attempts: number;
  id: string;
}

type PollRes<T> = Failure | QueuedJob | T;

interface PollJobRes<T> {
  res: PollRes<T>;
  status: number;
}

/**
 * Poll `getQueuedJob` until redirected to resulting resource, `error`, or reach
 * `polling.maxAttempts`.
 *
 * @param req - {@link PollQueuedJobReq}.
 * @returns {@link PollQueuedJobRes}.
 */
export async function pollQueuedJob<T extends { data: { id: string } }>({
  id,
  getQueuedJob,
  allow404 = false,
  polling: { intervalMs, maxAttempts },
}: PollQueuedJobReq): Promise<PollQueuedJobRes<T>> {
  async function poll(): Promise<PollJobRes<T>> {
    return new Promise((resolve) => {
      setTimeout(async () => {
        const jobRes: AxiosResponse<PollRes<T>> = await getQueuedJob(id);
        resolve({ status: jobRes.status, res: jobRes.data });
      }, intervalMs);
    });
  }

  let attempts = 1;
  let res = await poll();
  while (
    (allow404 && res.status === 404) ||
    (isQueuedJob(res.res) &&
      (attempts > maxAttempts || isQueuedJobError(res.res)))
  ) {
    attempts += 1;
    res = await poll();
  }

  // At this point, `res` is one of the following,
  //   - An item of type `T` after being redirected to it
  //   - A QueuedJob (after either exceeding `maxAttempts` or with `error` status)
  //   - A Failure
  return { ...res, attempts, id };
}

export function isPollError<T>(r: PollRes<T>): r is QueuedJob | Failure {
  return isQueuedJob(r) || isFailure(r);
}

export function throwOnError<T>({
  maxAttempts,
  pollRes,
}: {
  maxAttempts: number;
  pollRes: PollQueuedJobRes<T>;
}): never {
  throw new Error(
    isQueuedJobError(pollRes.res) || isFailure(pollRes.res)
      ? `Error getting queued job ${pollRes.id}.\n${prettyJson(pollRes.res)}`
      : `Polled queued item ${pollRes.id} ${maxAttempts} times, giving up.`
  );
}
