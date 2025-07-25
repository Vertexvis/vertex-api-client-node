#!/usr/bin/env bash

function get_version {
  jq -r '.version' ./package.json
}

function sed_inplace {
  local script=$1
  local target_file=$2
  local tmp_file

  tmp_file=$(mktemp)
  sed "$script" "$target_file" > "$tmp_file" && mv "$tmp_file" "$target_file"
}
