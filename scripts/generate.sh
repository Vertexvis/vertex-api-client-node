#!/bin/bash
set -e

# curl -s https://platform.platdev.vertexvis.io/spec > ./spec.yml
cp ../vertex-api/src/universal/api-resolved-public.yml ./spec.yml

docker run --rm -v "${PWD}:/local" openapitools/openapi-generator-cli:latest generate \
    --input-spec /local/spec.yml \
    --generator-name typescript-axios \
    --config /local/config.yml \
    --output /local
