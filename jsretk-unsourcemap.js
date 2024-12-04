#!/usr/bin/env node
// Modified by Sean Pesce from original code written by Tim McCormack (timmc)
// 
// Original source code:
//   https://github.com/timmc/unsourcemap
//   https://codeberg.org/timmc/unsourcemap
//
// Original license:
//   Copyright (c) 2013, Chase Douglas <chasedouglas@gmail.com>
//   All rights reserved.
//
//   Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//
//   Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//   Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

const fs = require('fs');
// @TODO: Convert argument-parsing to use util.parseArgs
const ArgumentParser = require('argparse').ArgumentParser;
const { parseArgs } = require('util');  // Requires nodejs 18.3+
const path = require('path');
const sourceMap = require('source-map');

const parser = new ArgumentParser({
    add_help: true,
    description: 'Deobfuscate JavaScript code using a source map',
});

parser.add_argument('src-js', {help: 'Path to JavaScript file to recover', nargs: 1});
parser.add_argument('src-map', {help: 'Path to source-map to recover from', nargs: 1});
parser.add_argument('out-dir', {help: 'Path to directory where sources will be dumped', nargs: 1});
const args = parser.parse_args();

const code = fs.readFileSync(args['src-js'][0], 'utf8');
const mapData = fs.readFileSync(args['src-map'][0], 'utf8');

const map = new sourceMap.SourceMapConsumer(mapData);

const outDir = args['out-dir'][0];
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, 0o755);
}

function sanitizeSourceName(url) {
    url = url.replace(/[^a-zA-Z0-9\-_.:\/]/g, '_');
    while (url.includes('..')) {
        // Prevent path traversal
        console.warn(`[WARNING] Sanitizing potential path-traversal file path: ${url}`);
        url = url.replace('..', '.');
    }
    const schemes = [
      'webpack:',
    ];
    for (var scheme of schemes) {
      if (url.startsWith(scheme)) {
        url = url.slice(scheme.length);
      }
    }
    return url;
}

for (var i = 0; i < map.sources.length; i++) {
    const sUrl = map.sources[i];
    console.log('[INFO] Writing', sUrl);
    //const dest = outDir + '/' + i + '-' + sanitizeSourceName(sUrl);
    const dest = outDir + '/' + sanitizeSourceName(sUrl);
    const destDir = path.dirname(dest);
    // Make directories
    if (!fs.existsSync(destDir)){
        fs.mkdirSync(destDir, { recursive: true });
    }
    const contents = map.sourceContentFor(sUrl);
    fs.writeFileSync(dest, contents, 'utf8', 0o644);
}
