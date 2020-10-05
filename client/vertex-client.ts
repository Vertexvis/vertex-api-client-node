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
  OAuth2Token,
  PartsApi,
  ScenesApi,
  SceneTemplatesApi,
  TranslationInspectionsApi,
} from '../api';
import { createToken, nowEpochMs } from './utils';

type BaseOptions = Record<string, unknown>;

interface BuildArgs {
  baseOptions?: BaseOptions;
  clientId?: string;
  clientSecret?: string;
  environment?: Environment;
}

interface CtorArgs {
  auth: Oauth2Api;
  baseOptions?: BaseOptions;
  basePath: string;
  token: OAuth2Token;
}

const TokenExpiryBufferMs = 60000;
const SecToMs = 1000;

// See https://github.com/axios/axios#request-config
const createBaseOptions = (baseOptions: BaseOptions) => ({
  validateStatus: () => true, // Always return response instead of rejecting
  maxContentLength: Number.POSITIVE_INFINITY, // Rely on API's limit instead
  maxBodyLength: Number.POSITIVE_INFINITY, // Rely on API's limit instead
  ...(baseOptions || {}),
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

  private auth: Oauth2Api;
  private token: OAuth2Token;
  private tokenFetchedEpochMs: number;

  private constructor({ auth, baseOptions, basePath, token }: CtorArgs) {
    this.auth = auth;
    this.token = token;
    this.tokenFetchedEpochMs = nowEpochMs();
    const config = new Configuration({
      accessToken: this.accessTokenRefresher,
      baseOptions,
      basePath,
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

    const token = await createToken(auth);
    return new VertexClient({
      auth,
      baseOptions: createBaseOptions(baseOptions),
      basePath,
      token,
    });
  };

  private accessTokenRefresher = async (): Promise<string> => {
    const nowMs = nowEpochMs();
    const expiresAtMs =
      this.tokenFetchedEpochMs + this.token.expires_in * SecToMs;
    const tokenValid = expiresAtMs > nowMs - TokenExpiryBufferMs;
    if (tokenValid) return this.token.access_token;

    this.token = await createToken(this.auth);
    this.tokenFetchedEpochMs = nowEpochMs();
    return this.token.access_token;
  };
}
