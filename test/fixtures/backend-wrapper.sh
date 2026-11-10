#!/bin/sh
dir=$(dirname "${1#PI_CODING_AGENT_DIR=}")
: > "$dir/wrapper-ran"
exec env "$@"
