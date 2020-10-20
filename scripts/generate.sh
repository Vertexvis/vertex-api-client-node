#!/bin/bash
set -e

curl -s https://platform.platdev.vertexvis.io/spec > ./spec.yml
# cp ../vertex-api/src/universal/api-resolved.yml ./spec.yml

docker run --rm -v "${PWD}:/local" openapitools/openapi-generator-cli:v5.0.0-beta2 generate \
    --input-spec /local/spec.yml \
    --generator-name typescript-axios \
    --config /local/config.yml \
    --output /local
