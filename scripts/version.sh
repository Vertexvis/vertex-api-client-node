#!/bin/bash
# shellcheck source=./utils.sh
. "$(pwd)"/scripts/utils.sh

version=$(get_version)

echo "export const version = '$version';" > ./client/version.ts

git add ./client/version.ts
