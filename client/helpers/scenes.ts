import { AxiosResponse } from 'axios';
import pLimit from 'p-limit';
import {
  CameraFitTypeEnum,
  CreateSceneItemRequest,
  CreateSceneRequest,
  PollIntervalMs,
  pollQueuedJob,
  QueuedJob,
  RenderImageArgs,
  Scene,
  SceneData,
  SceneItem,
  SceneRelationshipDataTypeEnum,
  UpdateSceneRequestDataAttributesStateEnum,
  VertexClient,
} from '../..';

interface CreateSceneWithSceneItemsArgs {
  client: VertexClient;
  parallelism: number;
  verbose: boolean;
  createSceneReq: () => CreateSceneRequest;
  createSceneItemReqs: CreateSceneItemRequest[];
}

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
    console.log(
      `Creating ${args.createSceneItemReqs.length} queued-scene-items...`
    );
  }

  const limit = pLimit(args.parallelism);
  const responses = await Promise.all(
    args.createSceneItemReqs.map((r) =>
      limit<CreateSceneItemRequest[], AxiosResponse<QueuedJob>>(
        (r: CreateSceneItemRequest) =>
          args.client.sceneItems.createSceneItem({
            id: sceneId,
            createSceneItemRequest: r,
          }),
        r
      )
    )
  );

  if (args.verbose)
    console.log(`Created queued-scene-items. Polling for completion...`);

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
