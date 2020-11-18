import { AxiosResponse } from 'axios';
import {
  arrayChunked,
  CameraFitTypeEnum,
  CreateFileRequest,
  createSceneItem,
  CreateSceneItemRequest,
  CreateSceneRequest,
  CreateSceneTemplateRequest,
  PollIntervalMs,
  pollQueuedJob,
  RenderImageArgs,
  Scene,
  SceneData,
  SceneRelationshipDataTypeEnum,
  UpdateSceneRequestDataAttributesStateEnum,
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
  the parent relationship for children at lower depths. For example,
    [
      [...] // Items at depth 0 (root items)
      [...] // Items at depth 1
      ...
    ]
  If hierarchy isn't important, simply pass requests as,
    [[() => ({ data: { ... } }), () => ({ data: { ... } })]]
  */
  createSceneItemReqFactoriesByDepth: ((
    suppliedIdToSceneItemId: Map<string, string>
  ) => CreateSceneItemRequest)[][];
}

export const createSceneFromTemplateFile = async (
  args: CreateSceneFromTemplateFileArgs
): Promise<SceneData> => {
  const file = await uploadFile({
    client: args.client,
    verbose: args.verbose,
    fileData: args.fileData,
    createFileReq: args.createFileReq,
  });

  const createSceneTemplateRequest = args.createSceneTemplateReq(file.id);
  const createTemplateRes = await args.client.sceneTemplates.createSceneTemplate(
    {
      createSceneTemplateRequest,
    }
  );
  const queuedSceneTemplateId = createTemplateRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created scene-template with queued-scene-template ${queuedSceneTemplateId}, file ${file.id}`
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

  const scene = await pollQueuedJob<Scene>(queuedSceneId, (id) =>
    args.client.scenes.getQueuedScene({ id })
  );

  return scene.data;
};

export async function createSceneWithSceneItems(
  args: CreateSceneWithSceneItemsArgs
): Promise<SceneData> {
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
          state: UpdateSceneRequestDataAttributesStateEnum.Commit,
        },
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });

  await pollSceneReady({ client: args.client, id: sceneId });

  const scene = await args.client.scenes.updateScene({
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

  return scene.data.data;
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

export async function pollSceneReady({
  client,
  id,
  pollIntervalMs = PollIntervalMs,
}: {
  client: VertexClient;
  id: string;
  pollIntervalMs?: number;
}): Promise<Scene> {
  const poll = async (): Promise<Scene> =>
    new Promise((resolve) => {
      setTimeout(
        async () => resolve((await client.scenes.getScene({ id })).data),
        pollIntervalMs
      );
    });

  let scene = await poll();
  while (scene.data.attributes.state !== 'ready') scene = await poll();

  return scene;
}
