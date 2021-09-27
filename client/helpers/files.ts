import fs from 'fs';
import { promisify } from 'util';

import {
  BaseReq,
  delay,
  DeleteReq,
  encodeIfNotEncoded,
  getBySuppliedId,
  getPage,
} from '../../client/index';
import { CreateFileRequest, FileList, FileMetadataData } from '../../index';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

/** Upload file arguments. */
export interface UploadFileReq extends BaseReq {
  /** A {@link CreateFileRequest}. */
  readonly createFileReq: CreateFileRequest;

  /** File data, use {@link Buffer} in Node.
   * @deprecated Use {@link filePath} instead.
   */
  readonly fileData?: unknown;

  readonly filePath?: string;
}

/**
 * Delete all files.
 *
 * @param args - The {@link DeleteReq}.
 */
export async function deleteAllFiles({
  client,
  pageSize = 100,
  exceptions = new Set(),
}: DeleteReq): Promise<FileMetadataData[]> {
  let files: FileMetadataData[] = [];
  let cursor: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await getPage(() =>
      client.files.getFiles({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
    cursor = res.cursor;
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(ids.map((id) => client.files.deleteFile({ id })));
    files = files.concat(res.page.data);
  } while (cursor);

  return files;
}

/**
 * Create a file resource and upload a file if it doesn't already exist.
 *
 * @param args - The {@link UploadFileReq}.
 */
export async function uploadFileIfNotExists({
  client,
  createFileReq,
  fileData,
  filePath,
  onMsg = console.log,
  verbose,
}: UploadFileReq): Promise<FileMetadataData> {
  const suppliedId = createFileReq.data.attributes.suppliedId;
  const existingFile = suppliedId
    ? await getBySuppliedId<FileMetadataData, FileList>(
        () =>
          client.files.getFiles({
            pageSize: 1,
            filterSuppliedId: encodeIfNotEncoded(suppliedId),
          }),
        suppliedId
      )
    : undefined;

  if (existingFile) {
    const fileId = existingFile.id;
    if (existingFile.attributes.status === 'complete') {
      if (verbose) {
        onMsg(
          `File with suppliedId '${suppliedId}' already exists, using it, ${fileId}`
        );
      }

      return existingFile;
    } else {
      if (verbose) {
        onMsg(
          `Deleting file with suppliedId '${suppliedId}' in status ${existingFile.attributes.status}, ${fileId}`
        );
      }

      await client.files.deleteFile({ id: fileId });
    }
  }

  return uploadFile({
    client,
    createFileReq,
    fileData,
    filePath,
    onMsg,
    verbose,
  });
}

/**
 * Create a file resource and upload a file.
 *
 * @param args - The {@link UploadFileReq}.
 */
export async function uploadFile({
  client,
  createFileReq,
  fileData,
  filePath,
  onMsg = console.log,
  verbose,
}: UploadFileReq): Promise<FileMetadataData> {
  const fileName = createFileReq.data.attributes.name;
  const createRes = await client.files.createFile({
    createFileRequest: createFileReq,
  });
  const fileId = createRes.data.data.id;
  if (verbose) onMsg(`Created file '${fileName}', ${fileId}`);

  const [body, { size }] = filePath
    ? await Promise.all([readFile(filePath), stat(filePath)])
    : [fileData, { size: -1 }];
  await client.files.uploadFile(
    { id: fileId, body },
    { headers: size >= 0 ? { 'Content-Length': size } : undefined }
  );
  if (verbose) onMsg(`Uploaded file ${fileId}`);

  const updated = (await client.files.getFile({ id: fileId })).data.data;
  if (size >= 0 && updated.attributes.size !== size) {
    onMsg(
      `File ${fileId} size mismatch, expected ${size} got ${updated.attributes.size}`
    );
  }

  const status = updated.attributes.status;
  if (status === 'error')
    throw new Error(`Uploading file ${fileId} failed with status ${status}`);

  // Sanity check
  if (status !== 'complete') {
    if (verbose) onMsg(`File ${fileId} in status ${status}, waiting...`);
    await delay(1000);
  }

  return updated;
}
