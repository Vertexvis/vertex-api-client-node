import { AxiosError, AxiosResponse, Method } from 'axios';
import { parse, ParsedUrlQuery } from 'querystring';
import {
  ApiError,
  Failure,
  Matrix4,
  Oauth2Api,
  OAuth2Token,
  QueuedJob,
} from '../index';
import { DUMMY_BASE_URL } from '../common';
import { Polling } from './index';

export interface Partitions<T> {
  a: T[];
  b: T[];
}

export const PollIntervalMs = 5000;

export const AttemptsPerMin = 60000 / PollIntervalMs;

export const MaxAttempts = 60 * AttemptsPerMin; // Try for an hour

export const Utf8 = 'utf8';

type VertexError = Error & {
  vertexError?: { method: Method; url: string; req: unknown; res: Failure };
  vertexErrorMessage?: string;
};

const PageCursor = 'page[cursor]';
const UnableToStringify = 'Unable to stringify';

/** Polling async queued job request arguments. */
export interface PollQueuedJobArgs {
  /** Queued job ID. */
  readonly id: string;

  /** Function called to get queued job. */
  readonly getQueuedJob: (id: string) => Promise<AxiosResponse<QueuedJob>>;

  /** If `true`, doesn't fail if API returns 404 status code. */
  readonly allow404?: boolean;

  /** {@link Polling} */
  readonly polling?: Polling;
}

/**
 * Check for array equality.
 *
 * @param a - A number array.
 * @param b - A number array.
 * @returns `true` if `a` and `b` are equal.
 */
export function arrayEq(a: number[], b: number[]): boolean {
  return arrayLenEq(a, b) && a.every((v, idx) => v === b[idx]);
}

/**
 * Check for 2D array equality.
 *
 * @param a - A 2D number array.
 * @param b - A 2D number array.
 * @returns `true` if `a` and `b` are equal.
 */
export function arrayEq2d(a: number[][], b: number[][]): boolean {
  if (!arrayLenEq(a, b)) return false;

  for (let i = 0; i < a.length; i += 1) if (!arrayEq(a[i], b[i])) return false;

  return true;
}

/**
 * Split an array into a 2D array of `chunkSize` chunks.
 *
 * @param a - An array.
 * @param chunkSize - The number of chunks to split `a` into.
 * @returns A 2D number array.
 */
export function arrayChunked<T>(a: T[], chunkSize: number): T[][] {
  return a.reduce((all: T[][], one: T, idx: number) => {
    const chunk = Math.floor(idx / chunkSize);
    all[chunk] = ([] as T[]).concat(all[chunk] ?? [], one);
    return all;
  }, [] as T[][]);
}

/**
 * Create an OAuth2 token.
 *
 * @param auth - A {@link Oauth2Api}.
 */
export async function createToken(auth: Oauth2Api): Promise<OAuth2Token> {
  return (await auth.createToken({ grantType: 'client_credentials' })).data;
}

/**
 * Delay execution by the given milliseconds.
 *
 * @param ms - Amount of milliseconds to delay.
 */
export async function delay(ms: number): Promise<void> {
  new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * URI encode given value if it isn't already.
 *
 * @param s - value to encode.
 * @returns Encoded value.
 */
export function encodeIfNotEncoded(s: string): string {
  return isEncoded(s) ? s : encodeURIComponent(s);
}

/**
 * Call `getter` and return item if `suppliedId` matches.
 *
 * @param getter - Function called to get item.
 * @param suppliedId - ID to match.
 * @returns Item if and only if it matches ID.
 */
export async function getBySuppliedId<
  T extends { attributes: { suppliedId?: string } },
  TRes extends { data: T[] }
>(
  getter: () => Promise<AxiosResponse<TRes>>,
  suppliedId?: string
): Promise<T | undefined> {
  if (!suppliedId) return undefined;

  const res = await getter();
  if (res.data.data.length > 0) {
    const item = head(res.data.data);
    if (item.attributes.suppliedId === suppliedId) return item;
  }

  return undefined;
}

/**
 * Get an Error message produced by {@link VertexClient}.
 *
 * @param error: The error.
 */
export function getErrorMessage(error: VertexError | AxiosError): string {
  if (hasVertexErrorMessage(error)) {
    const ve = error.vertexErrorMessage;
    return ve && !ve.startsWith(UnableToStringify) ? ve : error.message;
  }

  return error.isAxiosError && error.response?.data
    ? prettyJson(error.response?.data)
    : error.message;
}

/**
 * Get a page of results from a listing.
 *
 * @param getListing - Function called to get list of items.
 * @returns Page of results and optional cursor to get next page.
 */
export async function getPage<
  T extends { data: unknown[]; links: { next?: { href: string } } }
>(
  getListing: () => Promise<AxiosResponse<T>>
): Promise<{ page: T; cursor?: string }> {
  const page = (await getListing()).data;
  const next = parseUrl(page.links.next?.href);
  const nextCursor = next
    ? next[PageCursor] ?? next[`?${PageCursor}`]
    : undefined;
  return {
    page,
    cursor: Array.isArray(nextCursor) ? nextCursor[0] : nextCursor,
  };
}

/**
 * Group an array by the result of `getKey`.
 *
 * @param items - An array.
 * @param getKey - Function returning key to group the array by.
 * @returns A 2D array.
 */
export const groupBy = <T>(items: T[], getKey: (item: T) => number): T[][] =>
  items.reduce((acc, cur) => {
    const group = getKey(cur);
    if (!acc[group]) acc[group] = [];
    acc[group].push(cur);
    return acc;
  }, [] as T[][]);

/**
 * Return the first item in an array.
 *
 * @param items - An array.
 * @returns The first item.
 */
export function head<T>(items: T | T[]): T {
  return Array.isArray(items) ? items[0] : items;
}

/**
 * Check if array is the 4x4 identity matrix.
 *
 * @param transform: A 2D number array.
 * @returns `true` if 4x4 identity matrix.
 */
export function is4x4Identity(transform: number[][]): boolean {
  return arrayEq2d(transform, [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]);
}

/**
 * Check if a value is URI encoded.
 *
 * @param s: value to check.
 * @returns `true` if URI encoded.
 */
export function isEncoded(s: string): boolean {
  return s !== decodeURIComponent(s);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
export function isApiError(error: any): error is ApiError {
  return error.id != null && error.status != null && error.code != null;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
export function isFailure(data: any): data is Failure {
  return data.errors == null || data.errors.length === 0
    ? false
    : isApiError(head(data.errors));
}

export function hasVertexError(
  error: VertexError | AxiosResponse
): error is VertexError {
  return (error as VertexError).vertexError != null;
}

export function hasVertexErrorMessage(
  error: VertexError | AxiosResponse
): error is VertexError {
  return (error as VertexError).vertexErrorMessage != null;
}

/**
 * Log an Error produced by {@link VertexClient}.
 *
 * @param error: The error to log.
 * @param logger: The logger to use.
 */
export function logError(
  error: VertexError | AxiosError,
  logger: (input: Error | string) => void = console.error
): void {
  logger(getErrorMessage(error));
}

/**
 * Matrix multiply two 2D arrays.
 *
 * @param a - A 2D number array.
 * @param b - A 2D number array.
 * @returns The 2D multiplied array.
 */
export function multiply(a: number[][], b: number[][]): number[][] {
  const m = new Array(a.length).fill(0);
  for (let r = 0; r < a.length; ++r) {
    m[r] = new Array(head(b).length).fill(0);
    for (let c = 0; c < head(b).length; ++c) {
      for (let i = 0; i < head(a).length; ++i) {
        m[r][c] += a[r][i] * b[i][c];
      }
    }
  }
  return m;
}

/**
 * Get the current epoch.
 *
 * @returns The current epoch.
 */
export function nowEpochMs(): number {
  return new Date().getTime();
}

/**
 * Whether or not a value is null or undefined.
 */
export function nullOrUndefined<T>(obj?: T): obj is T {
  return obj == null;
}

/**
 * Parse the query parameters from a URL.
 *
 * @param url - A URL to parse.
 */
export function parseUrl(url?: string): ParsedUrlQuery | undefined {
  if (url === undefined) return undefined;

  const absoluteUrl = url.startsWith('http')
    ? url
    : url.startsWith('/')
    ? `${DUMMY_BASE_URL}${url}`
    : `${DUMMY_BASE_URL}/${url}`;
  return parse(new URL(absoluteUrl).search);
}

/**
 * Partition an array into two arrays, a and b, based on `isA` predicate.
 *
 * @param url - Two arrays.
 */
export function partition<T>(is: T[], isA: (i: T) => boolean): Partitions<T> {
  return is.reduce(
    ({ a, b }, i) => (isA(i) ? { a: [...a, i], b } : { a, b: [...b, i] }),
    { a: [], b: [] } as Partitions<T>
  );
}

/**
 * Poll `getQueuedJob` until redirected to resulting resource, `error`, or reach
 * `polling.maxAttempts`.
 *
 * @param args - {@link PollQueuedJobArgs}.
 * @returns The resulting resource.
 */
export async function pollQueuedJob<T extends { data: { id: string } }>({
  id,
  getQueuedJob,
  allow404 = false,
  polling: { intervalMs, maxAttempts } = {
    intervalMs: PollIntervalMs,
    maxAttempts: MaxAttempts,
  },
}: PollQueuedJobArgs): Promise<T> {
  const poll = async (): Promise<AxiosResponse<QueuedJob | T>> => {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const jobRes = await getQueuedJob(id);
        if (allow404 && jobRes.status === 404) resolve(jobRes);
        else if (
          !jobRes.data.data ||
          !jobRes.data.data.attributes ||
          jobRes.data.data.attributes.status === 'error'
        ) {
          reject(
            new Error(
              `Error getting queued job ${id}.\n${prettyJson(jobRes.data)}`
            )
          );
        } else resolve(jobRes);
      }, intervalMs);
    });
  };

  let attempts = 1;
  let res: AxiosResponse<T | QueuedJob> = await poll();
  while ((allow404 && res.status === 404) || res.data.data.id === id) {
    attempts += 1;
    if (attempts > maxAttempts)
      throw new Error(
        `Polled queued item ${id} ${maxAttempts} times, giving up.`
      );
    res = await poll();
  }

  return res.data as T;
}

/**
 * Convert JavaScript object to a pretty JSON string.
 *
 * @param obj - A JavaScript object.
 * @returns The pretty JSON format.
 */
export function prettyJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    return `${UnableToStringify} ${obj} to JSON.`;
  }
}

/**
 * Convert a comma-separated string to a float array.
 *
 * @param fallback - A default to use if `a` is undefined.
 * @param a - The value to convert.
 * @returns A float array.
 */
export function toFloats(fallback: string, a?: string): number[] {
  return (a ?? fallback).split(',').map(parseFloat);
}

/**
 * Convert an `orientation`, `translation`, and `scale` to a 4x4 transform.
 *
 * @param orientation - The transform's orientation as a nine-element array.
 * @param translation - The transform's translation as a three-element array.
 * @param scale - The transform's scale.
 * @returns A 4x4 transform.
 */
export function to4x4Transform(
  orientation: number[],
  translation: number[],
  scale = 1
): number[][] {
  return [
    [orientation[0], orientation[3], orientation[6], translation[0] * scale],
    [orientation[1], orientation[4], orientation[7], translation[1] * scale],
    [orientation[2], orientation[5], orientation[8], translation[2] * scale],
    [0, 0, 0, 1],
  ];
}

/**
 * Convert a 2D array to a {@link Matrix4}.
 *
 * @param t - A 2D number array.
 */
export function toTransform(t: number[][]): Matrix4 {
  return {
    r0: { x: t[0][0], y: t[0][1], z: t[0][2], w: t[0][3] },
    r1: { x: t[1][0], y: t[1][1], z: t[1][2], w: t[1][3] },
    r2: { x: t[2][0], y: t[2][1], z: t[2][2], w: t[2][3] },
    r3: { x: t[3][0], y: t[3][1], z: t[3][2], w: t[3][3] },
  };
}

/**
 * Try a request with a streaming response and handle errors.
 *
 * @param fn - Function with streaming response type.
 */
export async function tryStream<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return new Promise((_resolve, reject) => {
      let res = '';
      error.response.data.setEncoding('utf8');
      error.response.data
        .on('data', (data: string) => (res += data))
        .on('end', () => reject(res));
    });
  }
}

/**
 * Check if arrays are equal length.
 *
 * @param a - A number array.
 * @param b - A number array.
 * @returns `true` if arrays are equal length.
 */
function arrayLenEq(
  a: number[] | number[][],
  b: number[] | number[][]
): boolean {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length;
}
