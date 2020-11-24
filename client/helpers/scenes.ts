import { AxiosResponse } from 'axios';
import pLimit from 'p-limit';
import {
  CameraFitTypeEnum,
  CreateFileRequest,
  CreateSceneItemRequest,
  CreateSceneRequest,
  CreateSceneTemplateRequest,
  PollIntervalMs,
  pollQueuedJob,
  QueuedJob,
  RenderImageArgs,
  Scene,
  SceneData,
  SceneItem,
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
  createSceneItemReqsByDepth: CreateSceneItemRequest[][];
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
  if (args.verbose) {
    console.log(`Created scene ${sceneId}`);
  }

  const limit = pLimit(args.parallelism);
  let responses: AxiosResponse<QueuedJob>[] = [];
  /* eslint-disable no-await-in-loop */
  for (const [
    depth,
    reqsAtDepth,
  ] of args.createSceneItemReqsByDepth.entries()) {
    if (args.verbose)
      console.log(
        `Creating ${reqsAtDepth.length} queued-scene-items at depth ${depth}...`
      );
    responses = responses.concat(
      await Promise.all(
        reqsAtDepth.map((r) =>
          limit<CreateSceneItemRequest[], AxiosResponse<QueuedJob>>(
            (r: CreateSceneItemRequest) =>
              args.client.sceneItems.createSceneItem({
                id: sceneId,
                createSceneItemRequest: r,
              }),
            r
          )
        )
      )
    );
  }
  /* eslint-enable no-await-in-loop */

  if (args.verbose)
    console.log(`Created queued-scene-items. Polling for completion...`);

  // TODO: Await last batch instead of last item
  await pollQueuedJob<SceneItem>(
    responses[responses.length - 1].data.data.id,
    (id) => args.client.sceneItems.getQueuedSceneItem({ id }),
    true
  );

  if (args.verbose) console.log(`Committing scene and polling until ready...`);

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

  if (args.verbose) console.log(`Fitting scene's camera to scene-items...`);

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

export async function renderScene<T>(
  args: RenderImageArgs
): Promise<AxiosResponse<T>> {
  return await args.client.scenes.renderScene(
    {
      id: args.renderReq.id,
      height: args.renderReq.height,
      width: args.renderReq.width,
    },
    { responseType: 'stream' }
  );
}

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
