# JavaScript Reverse Engineering Toolkit (JSRETK)  

**Author: Sean Pesce**  

## Overview  

NodeJS scripts for analyzing (minified/obfuscated) JavaScript. All tools support processing of local files or remote files via HTTP(S) URL.  

These tools are still under heavy development, so ideas and contributions are welcome.  

## Requirements & Installation  

System packages:

* `curl`
* `nodejs` (18.3+)

Node modules:

* `escodegen`
* `esprima`
* `esrefactor`
* `estraverse`

## Tools  

### `jsretk-strings`  

This script extracts string literals from JavaScript code, with similar results to running `strings` against a compiled binary executable. It also supports options to extract JavaScript comments and RegEx literals.  

```
$ node jsretk-strings.js --help
Usage:

node jsretk-strings.js [OPTIONS] <JS_FILE_1> [[JS_FILE_2] ...]

Options:

	[-h|--help]		Print usage and exit
	[-c|--comments]		Include JavaScript comments in output
	[-C|--comments-only]	Find ONLY JavaScript comments (no string/RegEx literals; overrides "-c")
	[-r|--regex]		Include Regular Expression (RegEx) literals in output
	[-R|--regex-only]	Find ONLY RegEx literals (no comments/string literals; overrides "-r")
	[-m|--min]		Find strings of this length or longer (inclusive)
	[-M|--max]		Find strings of this length or shorter (inclusive)
	[-x|--match-regex] <ex>	Find strings that match the given Regular Expression
	[-k|--insecure]		Don't verify TLS/SSL certificates for connections when fetching remotely-hosted JS files
	[-p|--curl-path] <path>	Non-standard path/name for the curl command
	[-i|--interactive]	Enter interactive NodeJS prompt after completion
```

### `jsretk-unminify`  

This script attempts to un-minify JavaScript code by:

 * Detecting and renaming minified variables to have unique names across the entire file (uniquify)
 * Using various heuristics to make some variable names more informative
 * Formatting the code for readability

Note that the current implementation can take an extremely long time to perform uniquification, so use of the `-v|--verbose` flag is highly recommended for monitoring progress. For some codebases (e.g., some React Native deployments), the experimental `-L|--per-line` flag can reduce completion time exponentially.  

```
$ node jsretk-unminify.js 
Usage:

node jsretk-unminify.js [OPTIONS] <JS_FILE_1> [[JS_FILE_2] ...]

Options:

	[-h|--help]		Print usage and exit
	[-v|--verbose]		Enable verbose output
	[-o|--output-dir] <dir>	Output directory (default: "jsretk-out")
	[-O|--overwrite]	If output file(s) exist, automatically overwrite
	[-t|--tab]		Use tab characters ("\t") instead of spaces for indenting formatted code
	[-I|--indent] <n>	Number of spaces (or tabs) used for indenting formatted code (default: 4 spaces or 1 tab)
	[-r|--rename-len] <n>	Rename variables if names are shorter than or equal to this value (default: 2 characters)
	[-R|--no-rename]	Don't rename variables to unique names
	[-F|--no-format]	Don't format the code for readability
	[-s|--smart-rename]	(EXPERIMENTAL) Use various heuristics to attempt to generate more informative variable names
	[-L|--per-line]		(EXPERIMENTAL) Attempt to refactor code line by line (rather than the whole file at once). Useful for some react-native deployments, but fails on many (most?) codebases
	[-k|--insecure]		Don't verify TLS/SSL certificates for connections when fetching remotely-hosted JS files
	[-p|--curl-path] <path>	Non-standard path/name for the curl command
	[-i|--interactive]	Enter interactive NodeJS prompt after completion
```

---------------------------------------------

For inquiries and/or information about me, visit my **[personal website](https://SeanPesce.github.io)**.  
