import { FileCollectionMetadataData } from '../../api';
import { DeleteReq, getPage } from '../../client/index';

/**
 * Delete all file collections.
 *
 * @param args - The {@link DeleteReq}.
 */
export async function deleteAllFileCollections({
  client,
  pageSize = 100,
  exceptions = new Set(),
}: DeleteReq): Promise<FileCollectionMetadataData[]> {
  let fileCollections: FileCollectionMetadataData[] = [];
  let pageCursor: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await getPage(() =>
      client.fileCollections.listFileCollections({
        pageSize,
        pageCursor,
      })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
    pageCursor = res.cursor;
    // eslint-disable-next-line no-await-in-loop
    const deleteRes = await Promise.allSettled(
      ids.map((id) => client.fileCollections.deleteFileCollection({ id }))
    );
    deleteRes.forEach((r, index) => {
      if (r.status === 'rejected') {
        console.error(
          `Failed to delete file collection with id=${ids[index]}: ${r.reason}`
        );
        exceptions.add(ids[index]);
      }
    });
    fileCollections = fileCollections.concat(
      res.page.data as FileCollectionMetadataData[]
    );
  } while (pageCursor);

  return fileCollections;
}
