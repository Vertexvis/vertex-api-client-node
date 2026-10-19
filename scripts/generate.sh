#!/usr/bin/env bash
set -o errexit -o nounset

# shellcheck source=./utils.sh
. "$(pwd)"/scripts/utils.sh

yarn clean

curl -s https://platform.vertexvis.com/spec > ./spec.yml
# cp ../vertex-api/src/universal/api-public.yml ./spec.yml

docker run --rm -v "${PWD}:/local" openapitools/openapi-generator-cli:v5.4.0 generate \
    --input-spec /local/spec.yml \
    --generator-name typescript-axios \
    --config /local/config.yml \
    --output /local

sed_inplace "s/, RequiredError }/ }/" api.ts
sed_inplace "s/, setApiKeyToObject, /, /" api.ts
sed_inplace "s/, setBearerAuthToObject, /, /" api.ts
sed_inplace "s/baseOptions && baseOptions.headers ? baseOptions.headers :/baseOptions?.headers ??/" api.ts
sed_inplace "s/AxiosPromise,//" base.ts
sed_inplace "s/name: \"RequiredError\" = \"RequiredError\";/override name: \"RequiredError\" = \"RequiredError\";/" base.ts
sed_inplace "s/return axios.request<T, R>(axiosRequestArgs);/return axios.request<T, R>(axiosRequestArgs) as Promise<R>;/" common.ts

# Fix for object query parameters being incorrectly serialized as `[object Object]` due to usage of `toString`.
# See https://github.com/OpenAPITools/openapi-generator/issues/7564 + https://github.com/OpenAPITools/openapi-generator/issues/12329.
sed_inplace "/^import { AxiosInstance, AxiosResponse } from 'axios';/a\\
import { setNestedSearchParam } from './util/search-params';
" common.ts
sed_inplace "s/searchParams.append(key, item);/setNestedSearchParam(searchParams, key, item, true);/" common.ts
sed_inplace "s/searchParams.set(key, object\\[key\\]);/setNestedSearchParam(searchParams, key, object[key]);/" common.ts

yarn generate:docs

yarn format
yarn lint --fix
