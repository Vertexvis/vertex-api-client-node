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

sed_inplace "s/, COLLECTION_FORMATS, /, /" api.ts
sed_inplace "s/, setApiKeyToObject, /, /" api.ts
sed_inplace "s/, setBearerAuthToObject, /, /" api.ts
sed_inplace "s/baseOptions && baseOptions.headers ? baseOptions.headers :/baseOptions?.headers ??/" api.ts
sed_inplace "s/AxiosPromise,//" base.ts
sed_inplace "s/name: \"RequiredError\" = \"RequiredError\";/override name: \"RequiredError\" = \"RequiredError\";/" base.ts

yarn generate:docs

yarn format
yarn lint --fix
