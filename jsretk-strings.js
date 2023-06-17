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

const { parseArgs } = require('util');

const child_process = require('child_process');
const esprima = require('esprima');
const fs = require('fs');
const path = require('path');


function printUsage() {
    console.log('Usage:\n\n' + path.basename(process.argv[0]) + ' ' + path.basename(process.argv[1]) + ' [OPTIONS] <JS_FILE_1> [[JS_FILE_2] ...]' +
                '\n\nOptions:\n' +
                '\n\t[-h|--help]\t\tPrint usage and exit' +
                '\n\t[-c|--comments]\t\tInclude JavaScript comments in output' +
                '\n\t[-C|--comments-only]\tFind ONLY JavaScript comments (no string/RegEx literals; overrides "-c")' +
                '\n\t[-r|--regex]\t\tInclude Regular Expression (RegEx) literals in output' +
                '\n\t[-R|--regex-only]\tFind ONLY RegEx literals (no comments/string literals; overrides "-r")' +
                '\n\t[-m|--min]\t\tFind strings of this length or longer (inclusive)' +
                '\n\t[-M|--max]\t\tFind strings of this length or shorter (inclusive)' +
                '\n\t[-x|--match-regex] <ex>\tFind strings that match the given Regular Expression' +
                '\n\t[-k|--insecure]\t\tDon\'t verify TLS/SSL certificates for connections when fetching remotely-hosted JS files' +
                '\n\t[-p|--curl-path] <path>\tNon-standard path/name for the curl command' +
                '\n\t[-i|--interactive]\tEnter interactive NodeJS prompt after completion'
    );
    process.exit();
}


// Synchronously fetches web data (function doesn't return until the full response is received).
//
// Accepts additional arguments in an options object; default values are as follows:
//   {
//       verifyCert: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
//       curlCmd: 'curl'
//   }
function httpGetSync(url, options) {
    if (options == null) {
        options = {};
    }
    var verifyCertEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (options.verifyCert == null) {
        if (verifyCertEnv == null) {
            options.verifyCert = true;
        } else {
            options.verifyCert = !!parseInt(verifyCertEnv);
        }
    }
    // Check for custom curl command/location
    if (options.curlCmd == null) {
        options.curlCmd = 'curl';
    }
    // Check whether curl is accessible
    var subProc = child_process.spawnSync(options.curlCmd, ['-h']);
    if (subProc.status != 0) {
        throw Error('Failed to run curl ("' + options.curlCmd + ' -h" returned ' + subProc.status +
                    '). curl must be installed to fetch remote JS data.');
    }

    if (url.startsWith('-') || !(url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://'))) {
        throw URIError('Unsupported URL: ' + url);
    }

    cmdArgs = [ '-s' ];
    if (!options.verifyCert) {
        cmdArgs.push('-k');
    }
    cmdArgs.push(url);
    subProc = child_process.spawnSync(options.curlCmd, cmdArgs);
    if (subProc.status != 0) {
        throw Error('Failed to obtain remote data; subprocess returned ' + subProc.status);
    }

    return '' + subProc.stdout;
}


// EITHER returns the list of string literals/comments, OR prints each one, but NOT both.
//
// Accepts additional arguments in an options object; default values are as follows:
//   {
//       doPrint: false,
//       includeStringLiterals: true,
//       includeComments = false,
//       includeRegex = false,
//       minLength = 0,
//       maxLength = -1,
//       matchRegex = null
//   }
function getStringTokens(tokens, options) {
    if (options == null) {
        options = {};
    }
    if (options.doPrint == null) {
        options.doPrint = false;
    }
    if (options.includeStringLiterals == null) {
        options.includeStringLiterals = true;
    }
    if (options.includeComments == null) {
        options.includeComments = false;
    }
    if (options.includeRegex == null) {
        options.includeRegex = false;
    }
    if (options.minLength == null) {
        options.minLength = 0;
    }
    options.minLength = parseInt(options.minLength);
    if (options.maxLength == null) {
        options.maxLength = -1;
    }
    options.maxLength = parseInt(options.maxLength);
    if (options.matchRegex == null) {
        options.matchRegex = null;
    }

    var results = options.doPrint ? null : [];

    for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i];
        var val = tok.value;
        var extract = false;
        if (options.includeStringLiterals && tok.type.toLowerCase().indexOf('string') >= 0) {
            // Found a string literal
            val = val.slice(1, val.length-1); // Remove quotes
            extract = true;
        } else if (options.includeComments && tok.type.toLowerCase().indexOf('comment') >= 0) {
            // Found a comment
            extract = true;
        } else if (options.includeRegex && tok.type.toLowerCase().indexOf('regularexpression') >= 0) {
            // Found a RegEx literal
            extract = true;
        }
        // Check length
        if (val.length < options.minLength || (options.maxLength >= 0 && val.length > options.maxLength)) {
            extract = false;
        }
        if (options.matchRegex != null && !RegExp(options.matchRegex).test(val)) {
            extract = false;
        }
        
        if (extract) {
            if (options.doPrint) {
                console.log(val);
            } else {
                results.push(val);
            }
        }
    }

    return results;
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

    if (inputFiles.length < 1 || args['help']) {
        printUsage();
    }

    if (args['comments-only']) {
        args['comments'] = true;
        args['regex'] = false;
        includeStringLiterals = false;

        if (args['regex-only']) {
            console.error('Error: -C|--comments-only and -R|--regex-only can not be provided simultaneously');
            process.exit(2);
        }
    }

    if (args['regex-only']) {
        args['regex'] = true;
        args['comments'] = false;
        includeStringLiterals = false;
    }

    args['min'] = parseInt(args['min']);
    if (args['min'] < 0) {
        throw RangeError('-m|--min must be non-negative (received ' + args['min'] + ')');
    }

    args['max'] = parseInt(args['max']);
    if (args['max'] >= 0 && args['min'] > args['max']) {
        throw RangeError('-M|--max must be greater than or equal to -m|--min (received min=' + args['min'] + + ', max=' + args['max'] + ')');
    }

    if (args['match-regex'] == '') {
        args['match-regex'] = null;
    }

    var parsedFileCount = 0;
    var inFilePath = null;
    var inFileData = null;
    var tokens = null;

    // For each input file, extract the data
    for (var i = 0; i < inputFiles.length; i++) {
        inFilePath = inputFiles[i];

        if (inFilePath.toLowerCase().startsWith('http://') || inFilePath.toLowerCase().startsWith('https://')) {
            // Remote JS file
            inFileData = httpGetSync(inFilePath, {verifyCert: !args['insecure'], curlCmd: args['curl-path']});
        } else {
            // Local JS file
            inFileData = fs.readFileSync(inFilePath, 'utf8');
        }

        // If the first line of the file is a hashbang/shebang statement, comment it out before parsing
        // (otherwise esprima throws an error, as hashbangs are not valid JS)
        if (inFileData.startsWith('#!')) {
            inFileData = '//' + inFileData.slice(2);
        }

        tokens = esprima.tokenize(inFileData, {comment: args['comments']});

        getStringTokens(tokens, {
            doPrint: true,
            includeStringLiterals: includeStringLiterals,
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
        prompt.context.esprima = esprima;
        prompt.context.parseArgs = parseArgs;
        prompt.context.main = main;
        prompt.context.printUsage = printUsage;
        prompt.context.httpGetSync = httpGetSync;
        prompt.context.getStringTokens = getStringTokens;
        prompt.context.parsedArgs = parsedArgs;
        prompt.context.args = args;
        prompt.context.inputFiles = inputFiles;
        prompt.context.inFilePath = inFilePath;
        prompt.context.inFileData = inFileData;
        prompt.context.tokens = tokens;
        prompt.context.parsedFileCount = parsedFileCount;
        prompt.context.includeStringLiterals = includeStringLiterals;
    }
}


if (require.main === module) {
    main(false);
}
