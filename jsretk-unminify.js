#!/usr/bin/env node
// Author: Sean Pesce
//
// This script attempts to un-minify JavaScript code by:
//     - Detecting and renaming minified variables to have unique names
//     - Formatting the code for readability
//
// @TODO:
//      - Create iterative (temporary?) backups after each major step
//
// System package requirements:
//     curl
//     nodejs 18.3+
//
// NodeJS package requirements:
//     escodegen
//     esprima
//     esrefactor
//     estraverse

const { parseArgs } = require('util');

const child_process = require('child_process');
const escodegen = require('escodegen');
const esprima = require('esprima');
const esrefactor = require('esrefactor');
const estraverse = require('estraverse');
const fs = require('fs');
const path = require('path');
const urlUtils = require('url');


const DEFAULT_INDENT_LEVEL = 4;
const DEFAULT_OUTDIR = 'jsretk-out';
const DEFAULT_RENAME_LENGTH_THRESHOLD = 2;  // Rename variables if names are shorter than or equal to this value

function printUsage() {
    console.log('Usage:\n\n' + path.basename(process.argv[0]) + ' ' + path.basename(process.argv[1]) + ' [OPTIONS] <JS_FILE_1> [[JS_FILE_2] ...]' +
                '\n\nOptions:\n' +
                '\n\t[-h|--help]\t\tPrint usage and exit' +
                '\n\t[-v|--verbose]\t\tEnable verbose output' +
                '\n\t[-o|--output-dir] <dir>\tOutput directory (default: "' + DEFAULT_OUTDIR + '")' +
                '\n\t[-O|--overwrite]\tIf output file(s) exist, automatically overwrite' +
                '\n\t[-t|--tab]\t\tUse tab characters ("\\t") instead of spaces for indenting formatted code' +
                '\n\t[-I|--indent] <n>\tNumber of spaces (or tabs) used for indenting formatted code (default: ' + DEFAULT_INDENT_LEVEL + ' space' + (DEFAULT_INDENT_LEVEL==1 ? '' : 's') + ' or 1 tab)' +
                '\n\t[-r|--rename-len] <n>\tRename variables if names are shorter than or equal to this value (default: ' + DEFAULT_RENAME_LENGTH_THRESHOLD + ' character' + (DEFAULT_RENAME_LENGTH_THRESHOLD==1 ? '' : 's') + ')' +
                '\n\t[-R|--no-rename]\tDon\'t rename variables to unique names' +
                '\n\t[-F|--no-format]\tDon\'t format the code for readability' +
                '\n\t[-s|--smart-rename]\t(EXPERIMENTAL) Use various heuristics to attempt to generate more informative variable names' +
                '\n\t[-L|--per-line]\t\t(EXPERIMENTAL) Attempt to refactor code line by line (rather than the whole file at once). Useful for some react-native deployments, but fails on many (most?) codebases' +
                '\n\t[-k|--insecure]\t\tDon\'t verify TLS/SSL certificates for connections when fetching remotely-hosted JS files' +
                '\n\t[-p|--curl-path] <path>\tNon-standard path/name for the curl command' +
                '\n\t[-i|--interactive]\tEnter interactive NodeJS prompt after completion'
    );
    process.exit();
}


// Traverses the AST and renames all identifiers with oldName to newName.
// This function should only be used on unique oldName variable names (i.e., after uniquification).
//
// Accepts additional arguments in an options object; default values are as follows:
//   {
//       verbose: false,
//       logTag: ''
//   }
function renameAllInstancesOfIdentifier(ast, oldName, newName, options) {
    if (options == null) {
        options = {};
    }
    if (options.verbose == null) {
        options.verbose = false;
    }
    if (options.logTag == null) {
        options.logTag = '';
    }

    if (options.verbose) {
        console.error(options.logTag + oldName + '\t->\t' + newName);
    }

    estraverse.traverse(ast, {
        enter: function(node) {
            if (node.type === 'Identifier' && node.name === oldName) {
                node.name = newName;
            }
        }
    });
}


// (EXPERIMENTAL) "Smart Rename" via token sequence heuristic.
// This function should preferably be used after uniquification.
// Returns the number of variables that were renamed.
//
// Checker functions should be implemented as functions that take
// an identifier string and run a heuristic to determine if the name
// is a valid "source"/"good" or "destination"/"bad" (i.e., the one
// to be renamed) identifier, and return true if so.
//
// Accepts additional arguments in an options object; default values are as follows:
//   {
//       goodNameCheckerFunc: /* See below */,
//       badNameCheckerFunc: /* See below */,
//       renamePrefix: 'srn_',
//       renameSuffix: '_',
//       verbose: false
//   }
function smartRename_TokenOrderHeuristic(ast, options) {
    if (options == null) {
        options = {};
    }
    if (options.renamePrefix == null) {
        options.renamePrefix = 'srn_';
    }
    if (options.renameSuffix == null) {
        options.renameSuffix = '_';
    }
    if (options.verbose == null) {
        options.verbose = false;
    }
    if (options.goodNameCheckerFunc == null) {
        options.goodNameCheckerFunc = function (name) {
            return name != null && !name.startsWith('i_') && name.length > 3;
        };
    }
    if (options.badNameCheckerFunc == null) {
        options.badNameCheckerFunc = function (name) {
            return name != null && RegExp('^i_([0-9]+_)?[0-9]+_$').test(name);
        };
    }

    var logTag = '    [SmartRename|Token Order Heuristic] '
    var tokens = ast.tokens;
    // Some variables are re-used to hold unrelated data, so we verify that each
    // variable is assigned to exactly one newName candidate before renaming it.
    var renameCandidates = {};

    for (var i = 0; i < tokens.length; i++) {
            
        var leftName = null;
        var rightName = null;
        var oldName = null;
        var newName = null;

        // Basic heuristic:
        //   "goodName = badName;"  OR  "badName = goodName;"
        if (i < tokens.length - 3
            && tokens[i].type == 'Identifier'
            && tokens[i+1].type == 'Punctuator' && tokens[i+1].value == '='
            && tokens[i+2].type == 'Identifier'
            && tokens[i+3].type == 'Punctuator' && ';,)}]'.indexOf(tokens[i+3].value) >= 0) {
            
            leftName = tokens[i].value;
            rightName = tokens[i+2].value;
        }

        // Basic heuristic:
        //   "identifier['goodName'] = badName;" OR "identifier['badName'] = goodName;"
        else if (i < tokens.length - 6
                && tokens[i].type == 'Identifier'
                && tokens[i+1].type == 'Punctuator' && tokens[i+1].value == '['
                && tokens[i+2].type == 'String'
                && tokens[i+3].type == 'Punctuator' && tokens[i+3].value == ']'
                && tokens[i+4].type == 'Punctuator' && tokens[i+4].value == '='
                && tokens[i+5].type == 'Identifier'
                && tokens[i+6].type == 'Punctuator' && ';,)}]'.indexOf(tokens[i+6]) >= 0) {
        
            leftName = tokens[i+2].value;
            leftName = leftName.slice(1, leftName.length-1); // Remove quotes
            rightName = tokens[i+5].value;
        }

        // Basic heuristic:
        //   "goodName = identifier['badName'];" OR "badName = identifier['goodName'];"
        else if (i < tokens.length - 6
                    && tokens[i].type == 'Identifier'
                    && tokens[i+1].type == 'Punctuator' && tokens[i+1].value == '='
                    && tokens[i+2].type == 'Identifier'
                    && tokens[i+3].type == 'Punctuator' && tokens[i+3].value == '['
                    && tokens[i+4].type == 'String'
                    && tokens[i+5].type == 'Punctuator' && tokens[i+5].value == ']'
                    && tokens[i+6].type == 'Punctuator' && ';,)}]'.indexOf(tokens[i+6]) >= 0) {
        
            leftName = tokens[i].value;
            rightName = tokens[i+4].value;
            rightName = rightName.slice(1, rightName.length-1); // Remove quotes
        }

        // Check for candidate token sequence
        if (options.goodNameCheckerFunc(leftName) && options.badNameCheckerFunc(rightName)) {
            // Found a candidate expression; rename right value to left value
            oldName = rightName;
            newName = options.renamePrefix + leftName + options.renameSuffix;
        } else if (options.goodNameCheckerFunc(rightName) && options.badNameCheckerFunc(leftName)) {
            // Found a candidate expression; rename left value to right value
            oldName = leftName;
            newName = options.renamePrefix + rightName + options.renameSuffix;
        }

        // Store candidate names for later review
        if (oldName != null && newName != null) {
            if (oldName in renameCandidates) {
                if (renameCandidates[oldName].indexOf(newName) == -1) {
                    renameCandidates[oldName].push(newName);
                }
            } else {
                renameCandidates[oldName] = [ newName ];
            }
        }
    }

    // Rename candidates that have a unique assignment
    var renameCount = 0;
    var oldNames = Object.keys(renameCandidates);
    for (var i = 0; i < oldNames.length; i++) {
        var oldName = oldNames[i];
        if (renameCandidates[oldName].length == 1) {
            // Candidate was only assigned to 1 unique name, so we'll use that name
            renameAllInstancesOfIdentifier(ast, oldName, renameCandidates[oldName][0], { verbose: options.verbose, logTag: logTag });
            renameCount++;
        } else {
            if (options.verbose) {
                console.error(logTag + 'Multiple name candidates found for ' + oldName + ' (skipping rename): ' + renameCandidates[oldName]);
            }
        }
    }
    if (options.verbose) {
        console.error(logTag + 'Renamed ' + renameCount + ' variable' + (renameCount == 1 ? '' : 's'));
    }
    return renameCount;
}


// Renames all identifiers to be unique
//
// Accepts additional arguments in an options object; default values are as follows:
//   {
//       lengthThreshold: DEFAULT_RENAME_LENGTH_THRESHOLD,
//       namePrefix: 'i_',
//       nameSuffix: '_',
//       verbose: false,
//       lineNumber: -1,  // EXPERIMENTAL
//       lineCount: -1,  // EXPERIMENTAL
//   }
function uniquifyVariableNames(sourceCode, options) {
    if (options == null) {
        options = {};
    }
    if (options.lengthThreshold == null) {
        options.lengthThreshold = parseInt(DEFAULT_RENAME_LENGTH_THRESHOLD);
    }
    // Rename variables if names are shorter than or equal to this value
    options.lengthThreshold = parseInt(options.lengthThreshold);
    if (options.lengthThreshold < 0) {
        throw RangeError('options.lengthThreshold must be non-negative (received ' + options.lengthThreshold + ')');
    }
    if (options.namePrefix == null) {
        options.namePrefix = 'i_';
    }
    if (options.nameSuffix == null) {
        options.nameSuffix = '_';
    }
    if (options.verbose == null) {
        options.verbose = false;
    }
    // EXPERIMENTAL: Used for experimental line-by-line mode
    if (options.lineNumber == null) {
        options.lineNumber = -1;
    }
    // EXPERIMENTAL: Used for experimental line-by-line mode
    if (options.lineCount == null) {
        options.lineCount = -1;
    }

    var varCount = 0; // Number of variables that have been renamed thus far

    var i = 0;
    var startTimeMs = Date.now();
    var esrCtx = new esrefactor.Context(sourceCode);
    while (i < sourceCode.length) {
        if (options.verbose) {
            process.stderr.write('  [Refactor|Uniquify' + ((options.lineNumber<0 || options.lineCount<0) ? '' : ('|Line-by-Line ('+options.lineNumber+'/'+options.lineCount)+')') + '] ' + (i+1) + '/' + sourceCode.length + ' (~' + (Math.floor((i/sourceCode.length)*10000)/100) + '%) | Elapsed: ' + Math.floor(((Date.now()-startTimeMs)/1000)/60) + ' minutes | Renamed variables: ' + varCount + '\r');
        }
        var id = null;
        try {
            id = esrCtx.identify(i);
        } catch (err) {
            console.error('');
            console.error(err);
        }
        if (id != null) {
            // Found a variable identifier
            var idEnd = i + id.identifier.name.length;
            if (id.identifier.name.length <= options.lengthThreshold) {
                // Found a variable that will be renamed
                var newVarName = options.namePrefix + varCount + options.nameSuffix;
                varCount++;
                sourceCode = esrCtx.rename(id, newVarName);
                esrCtx = new esrefactor.Context(sourceCode);
            }
            i = idEnd;
        } else {
            i++;
        }
    }
    
    if (options.verbose) {
        // Add new line after progress message
        console.error('');
    }

    return sourceCode;
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
            'verbose': {
                type: 'boolean',
                short: 'v',
                default: false,
            },
            'rename-len': {
                type: 'string',
                short: 'r',
                default: DEFAULT_RENAME_LENGTH_THRESHOLD.toString(),
            },
            'no-rename': {
                type: 'boolean',
                short: 'R',
                default: false,
            },
            'no-format': {
                type: 'boolean',
                short: 'F',
                default: false,
            },
            // (EXPERIMENTAL) Attempt to refactor code line by line (rather than the whole file at once). Useful for some react-native deployments
            'per-line': {
                type: 'boolean',
                short: 'L',
                default: false,
            },
            // (EXPERIMENTAL) Use various heuristics to attempt to generate more informative variable names
            'smart-rename': {
                type: 'boolean',
                short: 's',
                default: false,
            },
            'overwrite': {
                type: 'boolean',
                short: 'O',
                default: false,
            },
            'out-dir': {
                type: 'string',
                short: 'o',
                default: DEFAULT_OUTDIR,
            },
            'indent': {
                type: 'string',
                short: 'I',
                default: '',
            },
            'tab': {
                type: 'boolean',
                short: 't',
                default: false,
            },
        }
    };
    const parsedArgs = parseArgs(argsConfig);
    const args = parsedArgs.values;
    const inputFiles = parsedArgs.positionals;

    if (args['help']) {
        printUsage();
    }

    args['rename-len'] = parseInt(args['rename-len']);
    if (args['rename-len'] < 0) {
        throw RangeError('-r|--rename-len must be non-negative (received ' + args['rename-len'] + ')');
    }

    if (args['tab'] && args['indent'] === '') {
        // Tabs and default indentation level
        args['indent'] = 1;
    } else if (args['indent'] === '') {
        // Spaces and default indentation level
        args['indent'] = parseInt(DEFAULT_INDENT_LEVEL);
    } else {
        // Non-default indentation level (tabs or spaces)
        args['indent'] = parseInt(args['indent']);
    }
    if (args['indent'] < 0) {
        throw RangeError('-I|--indent must be non-negative (received ' + args['indent'] + ')');
    }

    var renameVariables = !args['no-rename'];
    var doFormatCode = !args['no-format'];
    var indentChar = args['tab'] ? '\t' : ' ';
    var indentStr = indentChar.repeat(args['indent']);
    var parsedFileCount = 0;
    var inFilePath = null;
    var outFilePath = null;
    var inFileData = null;
    var outFileData = null;
    var hasHashbang = false;
    var ast = null;

    // Make output directory
    fs.mkdirSync(args['out-dir'], {recursive: true});

    if (!(renameVariables || doFormatCode)) {
        console.warn('All refactoring options are disabled; nothing to do.');
        process.exit(0);
    }

    // For each input file, extract the data
    for (var i = 0; i < inputFiles.length; i++) {
        inFilePath = inputFiles[i];
        hasHashbang = false;

        if (inFilePath.toLowerCase().startsWith('http://') || inFilePath.toLowerCase().startsWith('https://')) {
            // Remote JS file
            inFileData = httpGetSync(inFilePath, {verifyCert: !args['insecure'], curlCmd: args['curl-path']});

            // Construct output file path
            var parsedUrl = urlUtils.parse(inFilePath);
            var outFileName = path.basename(parsedUrl.pathname);
            if (!outFileName) {
                outFileName = '_.js';
                if (args['verbose']) {
                    console.warn('[WARNING] Original file has no name; defaulting to "' + outFileName + ' " (' + inFilePath + ')');
                }
            }
            outFilePath = path.join(args['out-dir'], outFileName);
        } else {
            // Local JS file
            inFileData = fs.readFileSync(inFilePath, 'utf8');

            // Construct output file path
            outFilePath = path.join(args['out-dir'], path.basename(inFilePath));
        }

        // Check whether output file already exists
        if (fs.existsSync(outFilePath)) {
            if (!args['overwrite']) {
                throw Error('File exists (use -O|--overwrite to automatically overwrite): ' + outFilePath);
            } else if (args['verbose']) {
                console.warn('[WARNING] File will be overwritten: ' + outFilePath);
            }
        }

        // If the first line of the file is a hashbang/shebang statement, comment it out before parsing
        // (otherwise esprima throws an error, as hashbangs are not valid JS)
        if (inFileData.startsWith('#!')) {
            hasHashbang = true;
            inFileData = '//' + inFileData.slice(2);
        }

        outFileData = inFileData;

        // Uniquify variable names
        if (renameVariables) {
            if (args['per-line']) {
                // EXPERIMENTAL FEATURE: Attempt to refactor the code line-by-line. Useful for some react-native deployments.
                var lines = outFileData.split('\n');
                outFileData = '';
                var startTimeMs = Date.now();
                for (var l = 0; l < lines.length; l++) {
                    if (args['verbose']) {
                        console.error('[Refactor|Line-by-Line (EXPERIMENTAL)] ' + (l+1) + '/' + lines.length + ' (~' + (Math.floor((l/lines.length)*10000)/100) + '%) | Elapsed: ' + Math.floor(((Date.now()-startTimeMs)/1000)/60) + ' minutes');
                    }
                    var line = lines[l];
                    outFileData += uniquifyVariableNames(line, { lengthThreshold: args['rename-len'], verbose: args['verbose'], namePrefix: ('i_'+l+'_'), lineNumber: (l+1), lineCount: lines.length });
                }
            } else {
                outFileData = uniquifyVariableNames(outFileData, { lengthThreshold: args['rename-len'], verbose: args['verbose'] });
            }
        }

        ast = esprima.parse(outFileData, {range: true, tokens: true, comment: true});
        ast = escodegen.attachComments(ast, ast.comments, ast.tokens);  // Preserve comments

        if (renameVariables && args['smart-rename']) {
            // (EXPERIMENTAL) Try "Smart Renaming" heuristics
            smartRename_TokenOrderHeuristic(ast, { verbose: args['verbose'] });
        } else if (args['smart-rename']) {
            console.warn('[WARNING] Variable renaming is disabled; skipping Smart Rename.');
        }

        if (doFormatCode) {
            // Parse the code and obtain the Abstract Syntax Tree (AST)
            //ast = esprima.parse(outFileData, {range: true, tokens: true, comment: true});
            //ast = escodegen.attachComments(ast, ast.comments, ast.tokens);  // Preserve comments
            outFileData = escodegen.generate(ast, {format: { indent: { style: indentStr, adjustMultilineComment: true } }, comment: true});
        }

        // Restore hashbang/shebang, if necessary
        if (hasHashbang && outFileData.startsWith('//')) {
            outFileData = '#!' + outFileData.slice(2);
        }

        // Write refactored code to file
        console.log(inFilePath + '\t->\t' + outFilePath);
        fs.writeFileSync(outFilePath, outFileData, {encoding: 'utf8'});

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
        prompt.context.escodegen = escodegen;
        prompt.context.esprima = esprima;
        prompt.context.esrefactor = esrefactor;
        prompt.context.estraverse = estraverse;
        prompt.context.urlUtils = urlUtils;
        prompt.context.parseArgs = parseArgs;
        prompt.context.DEFAULT_INDENT_LEVEL = DEFAULT_INDENT_LEVEL;
        prompt.context.DEFAULT_OUTDIR = DEFAULT_OUTDIR;
        prompt.context.main = main;
        prompt.context.printUsage = printUsage;
        prompt.context.httpGetSync = httpGetSync;
        prompt.context.parsedArgs = parsedArgs;
        prompt.context.args = args;
        prompt.context.indentChar = indentChar;
        prompt.context.indentStr = indentStr;
        prompt.context.inFilePath = inFilePath;
        prompt.context.outFilePath = outFilePath;
        prompt.context.inFileData = inFileData;
        prompt.context.outFileData = outFileData;
        prompt.context.parsedFileCount = parsedFileCount;
        prompt.context.hasHashbang = hasHashbang;
        prompt.context.ast = ast;
        prompt.context.renameVariables = renameVariables;
        prompt.context.doFormatCode = doFormatCode;
    }
}


if (require.main === module) {
    main(false);
}
