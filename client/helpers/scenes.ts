import { AxiosResponse } from 'axios';
import {
  arrayChunked,
  CameraFitTypeEnum,
  CreateFileRequest,
  createSceneItem,
  CreateSceneItemRequest,
  CreateSceneRequest,
  CreateSceneTemplateRequest,
  pollQueuedJob,
  RenderImageArgs,
  SceneRelationshipDataTypeEnum,
  uploadFile,
  VertexClient,
} from '../..';

interface CreateSceneFromTemplateFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Buffer in Node
  createFileReq: CreateFileRequest;
  createSceneReq: (templateId: string) => CreateSceneRequest;
  createSceneTemplateReq: (fileId: string) => CreateSceneTemplateRequest;
}

interface CreateSceneWithSceneItemsArgs {
  client: VertexClient;
  parallelism: number;
  verbose: boolean;
  createSceneReq: () => CreateSceneRequest;
  /*
  2D-array by depth. This allows awaiting creation of each depth in order to set
  the parent relationship for children at lower depths.
    [
      [...] // Items at depth 0 (root items)
      [...] // Items at depth 1
      ...
    ]
  */
  createSceneItemReqFactoriesByDepth: ((
    suppliedIdToSceneItemId: Map<string, string>
  ) => CreateSceneItemRequest)[][];
}

export const createSceneFromTemplateFile = async (
  args: CreateSceneFromTemplateFileArgs
): Promise<string> => {
  const fileId = await uploadFile({
    client: args.client,
    verbose: args.verbose,
    fileData: args.fileData,
    createFileReq: args.createFileReq,
  });

  const createSceneTemplateRequest = args.createSceneTemplateReq(fileId);
  const createTemplateRes = await args.client.sceneTemplates.createSceneTemplate(
    {
      createSceneTemplateRequest,
    }
  );
  const queuedSceneTemplateId = createTemplateRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created scene-template with queued-scene-template ${queuedSceneTemplateId}, file ${fileId}`
    );

  const templateId = (
    await pollQueuedJob(queuedSceneTemplateId, (id) =>
      args.client.sceneTemplates.getQueuedSceneTemplate({ id })
    )
  ).data.id;
  if (args.verbose) console.log(`Created scene-template ${templateId}`);

  const createSceneRequest = args.createSceneReq(templateId);
  const createSceneRes = await args.client.scenes.createScene({
    createSceneRequest,
  });
  const queuedSceneId = createSceneRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created scene with queued-scene id ${queuedSceneId}, scene-template ${templateId}`
    );

  const sceneId = (
    await pollQueuedJob(queuedSceneId, (id) =>
      args.client.scenes.getQueuedScene({ id })
    )
  ).data.id;

  return sceneId;
};

export async function createSceneWithSceneItems(
  args: CreateSceneWithSceneItemsArgs
): Promise<string> {
  const createSceneRes = await args.client.scenes.createScene({
    createSceneRequest: {
      data: {
        attributes: {},
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });
  const sceneId = createSceneRes.data.data.id;
  const suppliedIdToSceneItemId = new Map<string, string>();

  /* eslint-disable no-await-in-loop */
  for (const reqFactoriesAtDepth of args.createSceneItemReqFactoriesByDepth) {
    const chunks = arrayChunked(reqFactoriesAtDepth, args.parallelism);
    for (const chunk of chunks) {
      (
        await Promise.all(
          chunk.map((reqFactory) =>
            createSceneItem({
              client: args.client,
              verbose: args.verbose,
              sceneId,
              createSceneItemReq: () => reqFactory(suppliedIdToSceneItemId),
            })
          )
        )
      ).forEach((si) =>
        suppliedIdToSceneItemId.set(si.data.attributes.suppliedId, si.data.id)
      );
    }
  }
  /* eslint-enable no-await-in-loop */

  await args.client.scenes.updateScene({
    id: sceneId,
    updateSceneRequest: {
      data: {
        attributes: {
          camera: { type: CameraFitTypeEnum.FitVisibleSceneItems },
        },
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });

  return sceneId;
}

// Returns Stream in Node, `(await renderScene(...)).data.pipe(createWriteStream('image.jpeg'))`
export const renderScene = async (
  args: RenderImageArgs
): Promise<AxiosResponse<any>> =>
  await args.client.scenes.renderScene(
    {
      id: args.renderReq.id,
      height: args.renderReq.height,
      width: args.renderReq.width,
    },
    { responseType: 'stream' }
  );
