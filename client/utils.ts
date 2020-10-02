import { Oauth2Api, OAuth2Token, QueuedJob } from '..';
import { AxiosResponse } from 'axios';

const PollIntervalMs = 5000;
export const Utf8 = 'utf8';

export const arrayEq = (a: number[], b: number[]): boolean =>
  arrayLenEq(a, b) && a.every((v, idx) => v === b[idx]);

export const arrayEq2d = (a: number[][], b: number[][]): boolean => {
  if (!arrayLenEq(a, b)) return false;

  for (let i = 0; i < a.length; i++) if (!arrayEq(a[i], b[i])) return false;

  return true;
};

export const arrayChunked = <T>(a: T[], chunkSize: number): T[][] =>
  a.reduce((all: T[][], one: T, idx: number) => {
    const chunk = Math.floor(idx / chunkSize);
    all[chunk] = ([] as T[]).concat(all[chunk] || [], one);
    return all;
  }, [] as T[][]);

export const createToken = async (auth: Oauth2Api): Promise<OAuth2Token> =>
  (await auth.createToken('client_credentials')).data;

export const is4x4Identity = (transform: number[][]): boolean =>
  arrayEq2d(transform, [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]);

export const multiply = (a: number[][], b: number[][]): number[][] => {
  const m = new Array(a.length).fill(0);
  for (let r = 0; r < a.length; ++r) {
    m[r] = new Array(b[0].length).fill(0);
    for (let c = 0; c < b[0].length; ++c) {
      for (let i = 0; i < a[0].length; ++i) {
        m[r][c] += a[r][i] * b[i][c];
      }
    }
  }
  return m;
};

export const nowEpochMs = (): number => new Date().getTime();

export const pollQueuedJob = async <T extends { data: { id: string } }>(
  id: string,
  getQueuedJob: (id: string) => Promise<AxiosResponse<QueuedJob>>,
  pollIntervalMs: number = PollIntervalMs
): Promise<T> => {
  const poll = async (): Promise<AxiosResponse<QueuedJob | T>> => {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const res = await getQueuedJob(id);
        if (
          !res.data.data ||
          !res.data.data.attributes ||
          res.data.data.attributes.status === 'error'
        ) {
          return reject(
            new Error(
              `Error getting queued job ${id}.\n${prettyJson(res.data)}`
            )
          );
        }

        resolve(res);
      }, pollIntervalMs);
    });
  };

  let data: T | QueuedJob = { data: { id } } as T;
  while (data.data.id === id) data = (await poll()).data;

  return data as T;
};

export const prettyJson = (obj: unknown): string =>
  JSON.stringify(obj, null, 2);

export const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const throwOnError = (res: AxiosResponse, msg: string): void => {
  if (res.status >= 400) throw new Error(`${msg}\n${prettyJson(res.data)}`);
};

export const toFloats = (fallback: string, a?: string): number[] =>
  (a || fallback).split(',').map(parseFloat);

export const to4x4Transform = (
  orientation: number[],
  translation: number[],
  scale: number = 1
): number[][] => [
  [orientation[0], orientation[3], orientation[6], translation[0] * scale],
  [orientation[1], orientation[4], orientation[7], translation[1] * scale],
  [orientation[2], orientation[5], orientation[8], translation[2] * scale],
  [0, 0, 0, 1],
];

export const toTransform = (t: number[][]) => ({
  r0: { x: t[0][0], y: t[0][1], z: t[0][2], w: t[0][3] },
  r1: { x: t[1][0], y: t[1][1], z: t[1][2], w: t[1][3] },
  r2: { x: t[2][0], y: t[2][1], z: t[2][2], w: t[2][3] },
  r3: { x: t[3][0], y: t[3][1], z: t[3][2], w: t[3][3] },
});

const arrayLenEq = (a: number[] | number[][], b: number[] | number[][]) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length;
