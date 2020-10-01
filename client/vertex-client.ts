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

interface BuildArgs {
  clientId?: string;
  clientSecret?: string;
  environment?: Environment;
}

const refreshToken = async (
  basePath: string,
  auth: Oauth2Api
): Promise<Configuration> =>
  new Configuration({
    accessToken: (await auth.createToken('client_credentials')).data
      .access_token,
    basePath: basePath,
    // See https://github.com/axios/axios#request-config
    baseOptions: {
      validateStatus: () => true, // Always return response instead of rejecting
      maxContentLength: -1, // Rely on API's limit instead
      maxBodyLength: -1, // Rely on API's limit instead
    },
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
  private config: Configuration;
  private auth: Oauth2Api;

  private constructor(
    basePath: string,
    auth: Oauth2Api,
    config: Configuration
  ) {
    this.basePath = basePath;
    this.auth = auth;
    this.config = config;
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
      args.environment || 'platprod'
    }.vertexvis.io`;
    const auth = new Oauth2Api(
      new Configuration({
        username: args.clientId || process.env.VERTEX_CLIENT_ID,
        password: args.clientSecret || process.env.VERTEX_CLIENT_SECRET,
        basePath: basePath,
      })
    );
    const config = await refreshToken(basePath, auth);
    return new VertexClient(basePath, auth, config);
  };

  public refreshToken = async (): Promise<void> => {
    this.config = await refreshToken(this.basePath, this.auth);
    const config = this.config;
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
