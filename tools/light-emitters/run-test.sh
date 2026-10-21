#!/bin/bash
cd "$(dirname "$0")/../.." && node_modules/.bin/esbuild tools/light-emitters/test.mjs --bundle --platform=node --format=esm --outfile=tools/light-emitters/.test-bundle.mjs --loader:.json=json --loader:.png=empty --external:sharp --log-level=error && NODE_PATH=$PWD/node_modules node tools/light-emitters/.test-bundle.mjs
