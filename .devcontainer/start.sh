#!/bin/bash

set -e

if ! pgrep -f "unison /root/workspace-mount /workspace" >/dev/null; then
    setsid unison devcontainer </dev/null >/dev/null 2>&1 &
    echo "Unison started in the background. Logs can be found at /tmp/unison.log"
fi

sleep 10