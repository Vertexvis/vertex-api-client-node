import axios, { AxiosResponse, CancelToken } from 'axios';
import { Limit } from 'p-limit';
import { hrtime } from 'process';

import { ApiError, Batch, Failure, Polling, QueuedJob } from '../../index';
import {
  defined,
  delay,
  hasVertexError,
  head,
  isFailure,
  isQueuedJob,
  prettyJson,
  VertexError,
} from '../utils';

export const PollIntervalMs = 5000;

export const AttemptsPerMin = 60000 / PollIntervalMs;

export const MaxAttempts = 60 * AttemptsPerMin; // Try for an hour

/** Polling async queued job request arguments. */
export interface PollQueuedJobReq {
  /** Queued job ID. */
  readonly id: string;

  /** Function called to get queued job. */
  readonly getQueuedJob: (
    id: string,
    cancelToken: CancelToken
  ) => Promise<AxiosResponse<QueuedJob>>;

  /** If `true`, doesn't fail if API returns 404 status code. */
  readonly allow404?: boolean;

  readonly limit?: Limit;

  /** {@link Polling} */
  readonly polling: Polling;
}

export interface PollQueuedJobRes<T> extends PollJobRes<T> {
  readonly attempts: number;
  readonly id: string;
}

export type PollRes<T> = Failure | QueuedJob | T;

interface PollJobRes<T> {
  readonly res: PollRes<T>;
  readonly status: number;
}

const ConnectTimeoutMs = 8000;
const ClientErrorId = 'node-client-error';
const Debug = false;

/**
 * Poll `getQueuedJob` until redirected to resulting resource, `error`, or reach
 * `polling.maxAttempts`.
 *
 * @param req - {@link PollQueuedJobReq}.
 * @returns {@link PollQueuedJobRes}.
 */
export async function pollQueuedJob<T>({
  id,
  getQueuedJob,
  allow404 = false,
  limit,
  polling: { intervalMs, maxAttempts },
}: PollQueuedJobReq): Promise<PollQueuedJobRes<T>> {
  async function poll(attempt: number): Promise<PollJobRes<T>> {
    const cancelSrc = axios.CancelToken.source();
    const timerId = setTimeout(
      () => cancelSrc.cancel(`Connect timeout after ${ConnectTimeoutMs}ms.`),
      ConnectTimeoutMs
    );

    const start = hrtime.bigint();

    try {
      if (Debug) {
        console.log(
          `[id=${id}, attempt=${attempt}, active=${limit?.activeCount}, pending=${limit?.pendingCount}]`
        );
      }
      const r = await getQueuedJob(id, cancelSrc.token);
      if (Debug) {
        console.log(
          `[id=${id}, attempt=${attempt}, type=${
            r.data.data?.type
          }, durationMs=${durationMs(start)}]`
        );
      }
      clearTimeout(timerId);
      return { status: r.status, res: r.data };
    } catch (error) {
      const e = error as Error;
      console.log(
        `[id=${id}, attempt=${attempt}, durationMs=${durationMs(
          start
        )}] pollQueuedJob error, ${e.message}`
      );

      const ve = e as VertexError;
      return hasVertexError(e) && ve.vertexError?.res != null
        ? { status: ve.vertexError.status, res: ve.vertexError.res }
        : {
            status: 503,
            res: {
              errors: new Set<ApiError>([
                {
                  id: ClientErrorId,
                  status: '503',
                  code: 'ServiceUnavailable',
                  title: `Node client caught error in pollQueuedJob.`,
                  detail: e.message,
                },
              ]),
            },
          };
    }
  }

  let attempts = 1;
  let pollRes = await poll(attempts);
  /* eslint-disable no-await-in-loop */
  while (
    (allowed404(allow404, pollRes.status) ||
      validJob(pollRes.res) ||
      isClientError(pollRes.res)) &&
    attempts <= maxAttempts
  ) {
    attempts += 1;
    await delay(intervalMs);
    pollRes = await poll(attempts);
  }
  /* eslint-enable no-await-in-loop */

  // At this point, the result is one of the following,
  //  - An item of type `T` after being redirected to it
  //  - A QueuedJob (after either exceeding `maxAttempts` or with `error` status)
  //  - A Failure
  return { ...pollRes, attempts, id };
}

export function isPollError<T>(r: PollRes<T>): r is QueuedJob | Failure {
  return isQueuedJobError(r) || isFailure(r);
}

export function isBatch(obj: PollRes<Batch>): obj is Batch {
  const b = obj as Batch;
  return defined(b) && defined(b['vertexvis/batch:results']);
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

function durationMs(start: bigint): bigint {
  return (hrtime.bigint() - start) / BigInt(1000000);
}

function allowed404(allow404: boolean, status: number): boolean {
  return allow404 && status === 404;
}

function validJob<TI>(r: PollRes<TI>): boolean {
  return isQueuedJob(r) && !isStatusError(r);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
function isQueuedJobError(obj: any): obj is QueuedJob {
  return isQueuedJob(obj) && isStatusError(obj);
}

function isStatusError(job: QueuedJob): boolean {
  return job.data.attributes.status === 'error';
}

function isClientError<T>(res: PollRes<T>): boolean {
  return isFailure(res) && head([...res.errors.values()])?.id === ClientErrorId;
}
