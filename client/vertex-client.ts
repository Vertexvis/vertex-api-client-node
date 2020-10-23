import axios from 'axios';
import { BasePath } from '.';
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
import { createToken, nowEpochMs, prettyJson } from './utils';

type BaseOptions = Record<string, unknown>;

interface BuildArgs {
  baseOptions?: BaseOptions;
  clientId?: string;
  clientSecret?: string;
  basePath?: BasePath;
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
  validateStatus: (status: number) => status < 400,
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

    const inst = axios.create();
    inst.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.isAxiosError) {
          const r = error.response;
          const c = r.config;
          error.vertexErrorMessage = `${c.method.toUpperCase()} '${
            c.url
          }' error.\nReq: ${c.data}\nRes: ${prettyJson(r.data)}`;
        }
        return Promise.reject(error);
      }
    );
    this.files = new FilesApi(config, null, inst);
    this.geometrySets = new GeometrySetsApi(config, null, inst);
    this.hits = new HitsApi(config, null, inst);
    this.partRevisions = new PartRevisionsApi(config, null, inst);
    this.parts = new PartsApi(config, null, inst);
    this.sceneAlterations = new SceneAlterationsApi(config, null, inst);
    this.sceneItemOverrides = new SceneItemOverridesApi(config, null, inst);
    this.sceneItems = new SceneItemsApi(config, null, inst);
    this.scenes = new ScenesApi(config, null, inst);
    this.sceneViews = new SceneViewsApi(config, null, inst);
    this.streamKeys = new StreamKeysApi(config, null, inst);
    this.sceneTemplates = new SceneTemplatesApi(config, null, inst);
    this.translationInspections = new TranslationInspectionsApi(
      config,
      null,
      inst
    );
  }

  public static build = async (args?: BuildArgs): Promise<VertexClient> => {
    const basePath = args?.basePath || `https://platform.vertexvis.com`;
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
