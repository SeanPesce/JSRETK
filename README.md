# JavaScript Reverse Engineering Toolkit (JSRETK)  

**Author: Sean Pesce**  

## Overview  

NodeJS scripts for analyzing (minified/obfuscated) JavaScript. All tools support processing of local files, remote files via HTTP(S) URL, or data from standard input.  

These tools are still under heavy development, so ideas and contributions are welcome.  

## Requirements & Installation  

System packages:

* `curl`
* [`nodejs`](https://nodejs.org) (18.3+)

Node modules:

* [`escodegen`](https://github.com/estools/escodegen)
* [`esprima`](https://github.com/jquery/esprima)
* [`estraverse`](https://github.com/estools/estraverse)
* [`source-map`](https://github.com/mozilla/source-map)

**Note:** These tools ship with an updated version of [`esrefactor`](https://github.com/ariya/esrefactor)
by [Nick LaRosa](https://github.com/cakesmith). [Nick's version](https://github.com/cakesmith/esrefactor)
fixes some major issues with the version of the library in NPM (see the pull request
[here](https://github.com/ariya/esrefactor/pull/9)). The PR version could also be installed directly
with `npm install ariya/esrefactor#pull/9/head`, but I've included it here for convenience.  

## Tools  

### `jsretk-strings`  

This script extracts string literals from JavaScript code, with similar results to running `strings` against a compiled binary executable. It also supports options to extract JavaScript comments and RegEx literals.  

```
$ node jsretk-strings.js --help
Usage:

node jsretk-strings.js [OPTIONS] <JS_FILE_1> [[JS_FILE_2] ...]

Options:

	[-h|--help]		Print usage and exit
	[-P|--stdin]		Pipe data from stdin
	[-c|--comments]		Include JavaScript comments in output
	[-C|--comments-only]	Find ONLY JavaScript comments (no string/RegEx literals; overrides "-c")
	[-r|--regex]		Include Regular Expression (RegEx) literals in output
	[-R|--regex-only]	Find ONLY RegEx literals (no comments/string literals; overrides "-r")
	[-T|--templates-only]	Find ONLY template strings (no static string/RegEx literals or comments)
	[-m|--min]		Find strings of this length or longer (inclusive)
	[-M|--max]		Find strings of this length or shorter (inclusive)
	[-x|--match-regex] <ex>	Find strings that match the given Regular Expression
	[-k|--insecure]		Don't verify TLS/SSL certificates for connections when fetching remotely-hosted JS files
	[-p|--curl-path] <path>	Non-standard path/name for the curl command
	[-B|--max-buffer] <n>	Maximum size (in bytes) for remotely-fetched JS files (default: 50MB)
	[-E|--encoding] <enc>	Text encoding for local input/output files (default: "utf8")
	[-i|--interactive]	Enter interactive NodeJS prompt after completion
```

### `jsretk-unminify`  

**WARNING:** This script is unstable and non-performant in its current state.  

This script attempts to un-minify JavaScript code by:

 * Detecting and renaming minified variables to have unique names across the entire file (uniquify)
 * Using various heuristics to make some variable names more informative
 * Formatting the code for readability

Note that the current implementation can take an extremely long time to perform uniquification, so use of the `-v|--verbose` flag is highly recommended for monitoring progress. For some codebases (e.g., some React Native deployments), the experimental `-L|--per-line` flag can reduce completion time exponentially.  

```
$ node jsretk-unminify.js --help
Usage:

node jsretk-unminify.js [OPTIONS] <JS_FILE_1> [[JS_FILE_2] ...]

Options:

	[-h|--help]		Print usage and exit
	[-P|--stdin]		Pipe data from stdin
	[-v|--verbose]		Enable verbose output
	[-o|--output-dir] <dir>	Output directory (default: "jsretk-out")
	[-O|--overwrite]	If output file(s) exist, automatically overwrite
	[-t|--tab]		Use tab characters ("\t") instead of spaces for indenting formatted code
	[-I|--indent] <n>	Number of spaces (or tabs) used for indenting formatted code (default: 4 spaces or 1 tab)
	[-r|--rename-len] <n>	Rename variables if names are shorter than or equal to this value (default: 2 characters)
	[-R|--no-rename]	Don't rename variables to unique names
	[-F|--no-format]	Don't format the code for readability
	[-C|--char-iter]	Iterate over characters instead of tokens during refactoring. Significantly slower; may produce slightly different output
	[-s|--smart-rename]	(EXPERIMENTAL) Use various heuristics to attempt to generate more informative variable names
	[-L|--per-line]		(EXPERIMENTAL) Attempt to refactor code line by line (rather than the whole file at once). Useful for some react-native deployments, but fails on many (most?) codebases
	[-k|--insecure]		Don't verify TLS/SSL certificates for connections when fetching remotely-hosted JS files
	[-p|--curl-path] <path>	Non-standard path/name for the curl command
	[-B|--max-buffer] <n>	Maximum size (in bytes) for remotely-fetched JS files (default: 50MB)
	[-E|--encoding] <enc>	Text encoding for local input/output files (default: "utf8")
	[-i|--interactive]	Enter interactive NodeJS prompt after completion
```

### `jsretk-unsourcemap`  

This script, based on original code from [Tim McCormack](https://github.com/timmc/), recovers JavaScript/TypeScript source code from JS/source map files (`*.js.map`).

```
$ node jsretk-unsourcemap.js --help
usage: jsretk-unsourcemap.js [-h] src-js src-map out-dir

Deobfuscate JavaScript code using a source map

positional arguments:
  src-js      Path to JavaScript file to recover
  src-map     Path to source-map to recover from
  out-dir     Path to directory where sources will be dumped

optional arguments:
  -h, --help  show this help message and exit
```

---------------------------------------------

For inquiries and/or information about me, visit my **[personal website](https://SeanPesce.github.io)**.  
