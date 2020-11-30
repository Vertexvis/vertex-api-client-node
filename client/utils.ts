import { AxiosResponse } from 'axios';
import { stringify } from 'flatted';
import { Oauth2Api, OAuth2Token, QueuedJob } from '..';

export const PollIntervalMs = 5000;
export const Utf8 = 'utf8';

export function arrayEq(a: number[], b: number[]): boolean {
  return arrayLenEq(a, b) && a.every((v, idx) => v === b[idx]);
}

export function arrayEq2d(a: number[][], b: number[][]): boolean {
  if (!arrayLenEq(a, b)) return false;

  for (let i = 0; i < a.length; i++) if (!arrayEq(a[i], b[i])) return false;

  return true;
}

export function arrayChunked<T>(a: T[], chunkSize: number): T[][] {
  return a.reduce((all: T[][], one: T, idx: number) => {
    const chunk = Math.floor(idx / chunkSize);
    all[chunk] = ([] as T[]).concat(all[chunk] ?? [], one);
    return all;
  }, [] as T[][]);
}

export async function createToken(auth: Oauth2Api): Promise<OAuth2Token> {
  return (await auth.createToken({ grantType: 'client_credentials' })).data;
}

export async function delay(ms: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function encodeIfNotEncoded(s: string) {
  return isEncoded(s) ? s : encodeURIComponent(s);
}

export const groupBy = <T>(items: T[], getKey: (item: T) => number): T[][] =>
  items.reduce((acc, cur) => {
    const group = getKey(cur);
    if (!acc[group]) acc[group] = [];
    acc[group].push(cur);
    return acc;
  }, [] as T[][]);

export function head<T>(item: T | T[]): T {
  return Array.isArray(item) ? item[0] : item;
}

export function is4x4Identity(transform: number[][]): boolean {
  return arrayEq2d(transform, [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]);
}

export function isEncoded(s: string) {
  return s !== decodeURIComponent(s);
}

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

export function nowEpochMs(): number {
  return new Date().getTime();
}

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
    const sceneItem = head(res.data.data);
    if (sceneItem.attributes.suppliedId === suppliedId) return sceneItem;
  }

  return undefined;
}

export async function pollQueuedJob<T extends { data: { id: string } }>(
  id: string,
  getQueuedJob: (id: string) => Promise<AxiosResponse<QueuedJob>>,
  allow404: boolean = false,
  pollIntervalMs: number = PollIntervalMs
): Promise<T> {
  const poll = async (): Promise<AxiosResponse<QueuedJob | T>> => {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const res = await getQueuedJob(id);
        if (allow404 && res.status === 404) resolve(res);
        else if (
          !res.data.data ||
          !res.data.data.attributes ||
          res.data.data.attributes.status === 'error'
        ) {
          reject(
            new Error(
              `Error getting queued job ${id}.\n${prettyJson(res.data)}`
            )
          );
        } else resolve(res);
      }, pollIntervalMs);
    });
  };

  let res: AxiosResponse<T | QueuedJob> = await poll();
  while ((allow404 && res.status === 404) || res.data.data.id === id)
    res = await poll();

  return res.data as T;
}

export function prettyJson(obj: unknown): string {
  return stringify(obj, null, 2);
}

export function toFloats(fallback: string, a?: string): number[] {
  return (a ?? fallback).split(',').map(parseFloat);
}

export function to4x4Transform(
  orientation: number[],
  translation: number[],
  scale: number = 1
): number[][] {
  return [
    [orientation[0], orientation[3], orientation[6], translation[0] * scale],
    [orientation[1], orientation[4], orientation[7], translation[1] * scale],
    [orientation[2], orientation[5], orientation[8], translation[2] * scale],
    [0, 0, 0, 1],
  ];
}

export function toTransform(t: number[][]) {
  return {
    r0: { x: t[0][0], y: t[0][1], z: t[0][2], w: t[0][3] },
    r1: { x: t[1][0], y: t[1][1], z: t[1][2], w: t[1][3] },
    r2: { x: t[2][0], y: t[2][1], z: t[2][2], w: t[2][3] },
    r3: { x: t[3][0], y: t[3][1], z: t[3][2], w: t[3][3] },
  };
}

function arrayLenEq(a: number[] | number[][], b: number[] | number[][]) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length;
}
