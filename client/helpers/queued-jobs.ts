import { AxiosResponse } from 'axios';
import { Failure, Polling, QueuedJob } from '../../index';
import { isFailure, isQueuedJob, prettyJson } from '../utils';

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
        const jobRes = await getQueuedJob(id);
        resolve({ status: jobRes.status, res: jobRes.data });
      }, intervalMs);
    });
  }

  const allowed404 = (status: number): boolean => allow404 && status === 404;
  const validJob = <T>(r: PollRes<T>): boolean => isQueuedJob(r) && !isError(r);

  let attempts = 1;
  let pr = await poll();
  while (
    (allowed404(pr.status) || validJob(pr.res)) &&
    attempts <= maxAttempts
  ) {
    attempts += 1;
    pr = await poll();
  }

  // At this point, `res` is one of the following,
  //  - An item of type `T` after being redirected to it
  //  - A QueuedJob (after either exceeding `maxAttempts` or with `error` status)
  //  - A Failure
  return { ...pr, attempts, id };
}

export function isPollError<T>(r: PollRes<T>): r is QueuedJob | Failure {
  return isQueuedJobError(r) || isFailure(r);
}

export function throwOnError<T>(r: PollQueuedJobRes<T>): never {
  throw new Error(
    isQueuedJobError(r.res) || isFailure(r.res)
      ? `Error getting queued job ${r.id}.\n${prettyJson(r.res)}`
      : `Polled queued item ${r.id} ${
          r.attempts
        } times, giving up.\n${prettyJson(r.res)}`
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
function isQueuedJobError(obj: any): obj is QueuedJob {
  return isQueuedJob(obj) && isError(obj);
}

function isError(job: QueuedJob): boolean {
  return job.data.attributes.status === 'error';
}
