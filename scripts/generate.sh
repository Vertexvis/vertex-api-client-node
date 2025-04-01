#!/usr/bin/env bash
set -o errexit -o nounset

yarn clean

curl -s https://platform.vertexvis.com/spec > ./spec.yml
# cp ../vertex-api/src/universal/api-public.yml ./spec.yml

docker run --rm -v "${PWD}:/local" openapitools/openapi-generator-cli:v5.4.0 generate \
    --input-spec /local/spec.yml \
    --generator-name typescript-axios \
    --config /local/config.yml \
    --output /local

sed -i "s/, COLLECTION_FORMATS, /, /" api.ts
sed -i "s/, setApiKeyToObject, /, /" api.ts
sed -i "s/, setBearerAuthToObject, /, /" api.ts
sed -i "s/baseOptions && baseOptions.headers ? baseOptions.headers :/baseOptions?.headers ??/" api.ts
sed -i "s/AxiosPromise,//" base.ts
sed -i "s/name: \"RequiredError\" = \"RequiredError\";/override name: \"RequiredError\" = \"RequiredError\";/" base.ts

yarn generate:docs

yarn format
yarn lint --fix
