import { Environment } from '.';
import { Configuration } from '..';
import {
  FilesApi,
  GeometrySetsApi,
  HitsApi,
  PartRevisionsApi,
  SceneAlterationsApi,
  SceneItemOverridesApi,
  SceneItemsApi,
  SceneViewsApi,
  StreamKeysApi,
  Oauth2Api,
  PartsApi,
  ScenesApi,
  SceneTemplatesApi,
  TranslationInspectionsApi,
} from '../api';

type BaseOptions = Record<string, unknown>;

interface BuildArgs {
  baseOptions?: BaseOptions;
  clientId?: string;
  clientSecret?: string;
  environment?: Environment;
}

interface RefreshTokenArgs {
  auth: Oauth2Api;
  baseOptions: BaseOptions;
  basePath: string;
}

type CtorArgs = RefreshTokenArgs & { config: Configuration };

// See https://github.com/axios/axios#request-config
const createBaseOptions = (baseOptions: BaseOptions) => ({
  validateStatus: () => true, // Always return response instead of rejecting
  maxContentLength: Number.POSITIVE_INFINITY, // Rely on API's limit instead
  maxBodyLength: Number.POSITIVE_INFINITY, // Rely on API's limit instead
  ...(baseOptions || {}),
});

const refreshToken = async ({
  auth,
  baseOptions,
  basePath,
}: RefreshTokenArgs): Promise<Configuration> =>
  new Configuration({
    accessToken: (await auth.createToken('client_credentials')).data
      .access_token,
    baseOptions: createBaseOptions(baseOptions),
    basePath: basePath,
  });

export class VertexClient {
  public files: FilesApi;
  public geometrySets: GeometrySetsApi;
  public hits: HitsApi;
  public partRevisions: PartRevisionsApi;
  public parts: PartsApi;
  public sceneAlterations: SceneAlterationsApi;
  public sceneItemOverrides: SceneItemOverridesApi;
  public sceneItems: SceneItemsApi;
  public scenes: ScenesApi;
  public sceneViews: SceneViewsApi;
  public streamKeys: StreamKeysApi;
  public sceneTemplates: SceneTemplatesApi;
  public translationInspections: TranslationInspectionsApi;

  private basePath: string;
  private baseOptions: BaseOptions;
  private auth: Oauth2Api;

  private constructor({ auth, baseOptions, basePath, config }: CtorArgs) {
    this.auth = auth;
    this.baseOptions = baseOptions || {};
    this.basePath = basePath;
    this.files = new FilesApi(config);
    this.geometrySets = new GeometrySetsApi(config);
    this.hits = new HitsApi(config);
    this.partRevisions = new PartRevisionsApi(config);
    this.parts = new PartsApi(config);
    this.sceneAlterations = new SceneAlterationsApi(config);
    this.sceneItemOverrides = new SceneItemOverridesApi(config);
    this.sceneItems = new SceneItemsApi(config);
    this.scenes = new ScenesApi(config);
    this.sceneViews = new SceneViewsApi(config);
    this.streamKeys = new StreamKeysApi(config);
    this.sceneTemplates = new SceneTemplatesApi(config);
    this.translationInspections = new TranslationInspectionsApi(config);
  }

  public static build = async (args?: BuildArgs): Promise<VertexClient> => {
    const basePath = `https://platform.${
      args?.environment || 'platprod'
    }.vertexvis.io`;
    const baseOptions = args?.baseOptions || {};
    const auth = new Oauth2Api(
      new Configuration({
        baseOptions: createBaseOptions(baseOptions),
        basePath,
        username: args?.clientId || process.env.VERTEX_CLIENT_ID,
        password: args?.clientSecret || process.env.VERTEX_CLIENT_SECRET,
      })
    );
    const refreshArgs = { auth, baseOptions, basePath };
    return new VertexClient({
      ...refreshArgs,
      config: await refreshToken(refreshArgs),
    });
  };

  public refreshToken = async (): Promise<void> => {
    const config = await refreshToken({
      auth: this.auth,
      baseOptions: this.baseOptions,
      basePath: this.basePath,
    });
    this.files = new FilesApi(config);
    this.geometrySets = new GeometrySetsApi(config);
    this.hits = new HitsApi(config);
    this.partRevisions = new PartRevisionsApi(config);
    this.parts = new PartsApi(config);
    this.sceneAlterations = new SceneAlterationsApi(config);
    this.sceneItemOverrides = new SceneItemOverridesApi(config);
    this.sceneItems = new SceneItemsApi(config);
    this.scenes = new ScenesApi(config);
    this.sceneViews = new SceneViewsApi(config);
    this.streamKeys = new StreamKeysApi(config);
    this.sceneTemplates = new SceneTemplatesApi(config);
    this.translationInspections = new TranslationInspectionsApi(config);
  };
}
