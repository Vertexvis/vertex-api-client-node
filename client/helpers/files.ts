import {
  BaseReq,
  DeleteReq,
  encodeIfNotEncoded,
  getBySuppliedId,
  getPage,
} from '../../client/index';
import { CreateFileRequest, FileList, FileMetadataData } from '../../index';

export interface File {
  /** File data. */
  readonly data: Buffer;

  /** File size. */
  readonly size: number;
}

/** Upload file arguments. */
export interface UploadFileReq extends BaseReq {
  /** A {@link CreateFileRequest}. */
  readonly createFileReq: CreateFileRequest;

  /** File data.
   * @deprecated Use {@link file} instead.
   */
  readonly fileData?: unknown;

  readonly file?: File;
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
  onMsg = console.log,
  verbose,
  ...rest
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

  return uploadFile({ client, createFileReq, onMsg, verbose, ...rest });
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
  file,
  onMsg = console.log,
  verbose,
}: UploadFileReq): Promise<FileMetadataData> {
  const fileName = createFileReq.data.attributes.name;
  const createRes = await client.files.createFile({
    createFileRequest: createFileReq,
  });
  const fileId = createRes.data.data.id;
  if (verbose) onMsg(`Created file '${fileName}', ${fileId}`);

  const body = file?.data ?? fileData;
  const size = file?.size ?? -1;
  const uploadRes = await client.files.uploadFile({ id: fileId, body });

  if (uploadRes.status !== 204) {
    throw new Error(
      `Uploading file ${fileId} failed with status code ${uploadRes.status}`
    );
  }

  const getRes = (await client.files.getFile({ id: fileId })).data.data;
  const status = getRes.attributes.status;
  if (status === 'error') {
    throw new Error(`Uploading file ${fileId} failed with status ${status}`);
  } else if (size >= 0 && getRes.attributes.size !== size) {
    onMsg(
      `File ${fileId} size mismatch, expected ${size} got ${getRes.attributes.size}`
    );
  }

  if (verbose) onMsg(`Uploaded file ${fileId}, status ${status}`);

  return getRes;
}
