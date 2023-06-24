#!/usr/bin/env node
// Author: Sean Pesce
//
// This script extracts string literals from JavaScript code. Useful for quickly analyzing minified
// or obfuscated code. Similar to running "strings" against a compiled binary executable.
// Optionally also extracts JavaScript comments and RegEx literals.
//
// System package requirements:
//     curl
//     nodejs 18.3+
//
// NodeJS package requirements:
//     esprima

const { parseArgs } = require('util');  // Requires nodejs 18.3+

const fs = require('fs');
const path = require('path');

const jsretk = require('./lib/jsretk');


function printUsage() {
    console.log(`Usage:\n\n${path.basename(process.argv[0])} ${path.basename(process.argv[1])} [OPTIONS] <JS_FILE_1> [[JS_FILE_2] ...]` +
                '\n\nOptions:\n' +
                '\n\t[-h|--help]\t\tPrint usage and exit' +
                '\n\t[-P|--stdin]\t\tPipe data from stdin' +
                '\n\t[-c|--comments]\t\tInclude JavaScript comments in output' +
                '\n\t[-C|--comments-only]\tFind ONLY JavaScript comments (no string/RegEx literals; overrides "-c")' +
                '\n\t[-r|--regex]\t\tInclude Regular Expression (RegEx) literals in output' +
                '\n\t[-R|--regex-only]\tFind ONLY RegEx literals (no comments/string literals; overrides "-r")' +
                '\n\t[-T|--templates-only]\tFind ONLY template strings (no static string/RegEx literals or comments)' +
                '\n\t[-m|--min]\t\tFind strings of this length or longer (inclusive)' +
                '\n\t[-M|--max]\t\tFind strings of this length or shorter (inclusive)' +
                '\n\t[-x|--match-regex] <ex>\tFind strings that match the given Regular Expression' +
                '\n\t[-k|--insecure]\t\tDon\'t verify TLS/SSL certificates for connections when fetching remotely-hosted JS files' +
                '\n\t[-p|--curl-path] <path>\tNon-standard path/name for the curl command' +
                `\n\t[-B|--max-buffer] <n>\tMaximum size (in bytes) for remotely-fetched JS files (default: ${Math.floor(jsretk.DEFAULT_MAX_BUF_SZ/jsretk.ONE_MEGABYTE)}MB)` +
                `\n\t[-E|--encoding] <enc>\tText encoding for local input/output files (default: "${jsretk.DEFAULT_TEXT_ENCODING}")` +
                '\n\t[-i|--interactive]\tEnter interactive NodeJS prompt after completion'
    );
    process.exit();
}


function main(isInteractiveMode) {
    // Parse command-line arguments
    const argsConfig = {
        args: process.argv.slice(2),
        strict: true,
        allowPositionals: true,
        options: {
            // Print usage instructions
            'help': {
                type: 'boolean',
                short: 'h',
                default: false,
            },
            // Pipe data from stdin
            'stdin': {
                type: 'boolean',
                short: 'P',
                default: false,
            },
            // Check whether to verify TLS/SSL certificates for remotely-fetched JS files
            'insecure': {
                type: 'boolean',
                short: 'k',
                default: false,
            },
            // Custom curl path/command
            'curl-path': {
                type: 'string',
                short: 'p',
                default: 'curl',
            },
            // Maximum buffer size for remotely-fetched JS files
            'max-buffer': {
                type: 'string',
                short: 'B',
                default: jsretk.DEFAULT_MAX_BUF_SZ.toString(),
            },
            // Text encoding for local input/output files
            'encoding': {
                type: 'string',
                short: 'E',
                default: jsretk.DEFAULT_TEXT_ENCODING,
            },
            // Optional interactive mode to play with the data after execution (e.g., for troubleshooting)
            'interactive': {
                type: 'boolean',
                short: 'i',
                default: false,
            },
            // Check whether to extract JavaScript comments
            'comments': {
                type: 'boolean',
                short: 'c',
                default: false,
            },
            'comments-only': {
                type: 'boolean',
                short: 'C',
                default: false,
            },
            // Check whether to extract Regular Expressions (RegEx)
            'regex': {
                type: 'boolean',
                short: 'r',
                default: false,
            },
            'regex-only': {
                type: 'boolean',
                short: 'R',
                default: false,
            },
            'templates-only': {
                type: 'boolean',
                short: 'T',
                default: false,
            },
            // Minimum string length (inclusive)
            'min': {
                type: 'string',
                short: 'm',
                default: '0',
            },
            // Maximum string length (inclusive); negative means no maximum
            'max': {
                type: 'string',
                short: 'M',
                default: '-1',
            },
            // Find strings that match the given Regular Expression
            'match-regex': {
                type: 'string',
                short: 'x',
                default: '',
            },
        }
    };
    const parsedArgs = parseArgs(argsConfig);
    const args = parsedArgs.values;
    const inputFiles = parsedArgs.positionals;
    var includeStringLiterals = true;
    var includeTemplateLiterals = true;

    if (args['help'] || (inputFiles.length < 1 && !args['stdin'])) {
        printUsage();
    }

    const exclusiveFlagsErrMsg = 'Error: Only one of -C|--comments-only, -R|--regex-only, -T|--templates-only can be provided simultaneously';

    if (args['comments-only']) {
        args['comments'] = true;
        args['regex'] = false;
        includeStringLiterals = false;
        includeTemplateLiterals = false;

        if (args['regex-only'] || args['templates-only']) {
            console.error(exclusiveFlagsErrMsg);
            process.exit(2);
        }
    }

    if (args['regex-only']) {
        args['regex'] = true;
        args['comments'] = false;
        includeStringLiterals = false;
        includeTemplateLiterals = false;

        if (args['comments-only'] || args['templates-only']) {
            console.error(exclusiveFlagsErrMsg);
            process.exit(2);
        }
    }

    if (args['templates-only']) {
        args['comments'] = false;
        args['regex'] = false;
        includeStringLiterals = false;
        includeTemplateLiterals = true;

        if (args['comments-only'] || args['regex-only']) {
            console.error(exclusiveFlagsErrMsg);
            process.exit(2);
        }
    }

    args['min'] = parseInt(args['min']);
    if (args['min'] < 0) {
        throw RangeError(`-m|--min must be non-negative (received ${args['min']})`);
    }

    args['max'] = parseInt(args['max']);
    if (args['max'] >= 0 && args['min'] > args['max']) {
        throw RangeError(`-M|--max must be greater than or equal to -m|--min (received min=${args['min']}, max=${args['max']})`);
    }

    args['max-buffer'] = parseInt(args['max-buffer']);
    if (args['max-buffer'] <= 0) {
        throw RangeError(`-B|--max-buffer must be non-negative (received ${args['max-buffer']})`);
    }

    if (args['match-regex'] == '') {
        args['match-regex'] = null;
    }

    var parsedFileCount = 0;
    var inFilePath = null;
    var inFileData = null;

    if (args['stdin']) {
        if (inputFiles.length === 0 || inputFiles[0] !== process.stdin.fd) {
            inputFiles.unshift(process.stdin.fd);
        }
    }

    // For each input file, extract the data
    for (var i = 0; i < inputFiles.length; i++) {
        inFilePath = inputFiles[i];

        if (inFilePath !== process.stdin.fd && (inFilePath.toLowerCase().startsWith('http://') || inFilePath.toLowerCase().startsWith('https://'))) {
            // Remote JS file
            inFileData = jsretk.httpGetSync(inFilePath, {verifyCert: !args['insecure'], curlCmd: args['curl-path'], maxBuffer: args['max-buffer']});
        } else {
            // Local JS file
            inFileData = fs.readFileSync(inFilePath, args['encoding']);
        }

        // If the first line of the file is a hashbang/shebang statement, comment it out before parsing
        // (otherwise esprima throws an error, as hashbangs are not valid JS)
        if (inFileData.startsWith('#!')) {
            inFileData = `//${inFileData.slice(2)}`;
        }

        jsretk.getStringTokens(inFileData, {
            doPrint: true,
            includeStringLiterals: includeStringLiterals,
            includeTemplateLiterals: includeTemplateLiterals,
            includeComments: args['comments'],
            includeRegex: args['regex'],
            minLength: args['min'],
            maxLength: args['max'],
            matchRegex: args['match-regex']
        });

        parsedFileCount += 1;
    }

    if (parsedFileCount === 0) {
        printUsage();
    }
    
    // Optional interactive mode to play with the data after execution (e.g., for troubleshooting)
    if (isInteractiveMode == null) {
        // Prevent recursive REPL
        isInteractiveMode = true;
    }
    if (!isInteractiveMode && args['interactive']) {
        var prompt = require('repl').start('> ');
        prompt.context.parseArgs = parseArgs;
        prompt.context.main = main;
        prompt.context.printUsage = printUsage;
        prompt.context.jsretk = jsretk;
        prompt.context.parsedArgs = parsedArgs;
        prompt.context.args = args;
        prompt.context.inputFiles = inputFiles;
        prompt.context.inFilePath = inFilePath;
        prompt.context.inFileData = inFileData;
        prompt.context.parsedFileCount = parsedFileCount;
        prompt.context.includeStringLiterals = includeStringLiterals;
        prompt.context.includeTemplateLiterals = includeTemplateLiterals;
    }
}


if (require.main === module) {
    main(false);
}
