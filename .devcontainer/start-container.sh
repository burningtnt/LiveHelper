#!/bin/bash

set +e
export SHELL=/bin/bash

setsid unison devcontainer </dev/null >/dev/null 2>&1 &


cd /workspace
pnpm setup
pnpm install

wait