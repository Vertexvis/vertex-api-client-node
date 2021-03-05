#!/usr/bin/env bash
# shellcheck source=./utils.sh
. "$(pwd)"/scripts/utils.sh

set -e

install_mo() {
  if ! test -d ./.lib; then mkdir ./.lib; fi
  if ! test -x ./.lib/mo; then
    curl -sSL https://git.io/get-mo -o mo
    chmod +x mo
    mv mo ./.lib/mo
  fi
}

install_mo

# Update readme with correct version.
version=$(get_version)
export version
cat ./README.template.md | ./.lib/mo > README.md
