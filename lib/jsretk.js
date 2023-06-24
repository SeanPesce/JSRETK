#!/usr/bin/env node
// Author: Sean Pesce
//
// System package requirements:
//     curl
//     nodejs
//
// NodeJS package requirements:
//     esprima

const child_process = require('child_process');
const esprima = require('esprima');


// Pre-declarations (referenced in module.exports)
const ONE_MEGABYTE = 1024*1024;
const DEFAULT_MAX_BUF_SZ = ONE_MEGABYTE*50;  // 50MB


module.exports = {
    // Tool-agnostic constants/globals
    ONE_MEGABYTE: ONE_MEGABYTE,
    DEFAULT_MAX_BUF_SZ: DEFAULT_MAX_BUF_SZ,
    DEFAULT_TEXT_ENCODING: 'utf8',

    // jsretk-unminify constants/globals
    DEFAULT_INDENT_LEVEL: 4,                 // Default indentation level for spaces
    DEFAULT_INDENT_LEVEL_TAB: 1,             // Default indentation level for tabs
    DEFAULT_VAR_RENAME_LENGTH_THRESHOLD: 2,  // Rename variables if names are shorter than or equal to this value
    DEFAULT_OUTDIR: 'jsretk-out',

    // Synchronously fetches web data (function doesn't return until the full response is received).
    //
    // Accepts additional arguments in an options object; default values are as follows:
    //   {
    //       verifyCert: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    //       curlCmd: 'curl',
    //       maxBuffer: DEFAULT_MAX_BUF_SZ,
    //       verbose: false
    //   }
    httpGetSync: function (url, options) {
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
        if (options.maxBuffer == null) {
            options.maxBuffer = DEFAULT_MAX_BUF_SZ;
        }
        if (options.verbose == null) {
            options.verbose = false;
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
        subProc = child_process.spawnSync(options.curlCmd, cmdArgs, {maxBuffer:options.maxBuffer});
        if (subProc.status == null && subProc.stdout >= options.maxBuffer) {
            throw Error('Failed to obtain remote data; buffer too large (try increasing value with -B|--max-buffer)');
        } else if (subProc.status != 0) {
            throw Error('Failed to obtain remote data; subprocess returned ' + subProc.status);
        }

        return '' + subProc.stdout;
    },



    // EITHER returns the list of string literals/comments, OR prints each one, but NOT both.
    //
    // Required arguments:
    //   inFileData - A string containing valid JavaScript/ECMAScript code
    //
    // Accepts additional arguments in an options object; default values are as follows:
    //   {
    //       doPrint: false,  // Print tokens as they're found (rather than returning all discovered tokens as a list)
    //       includeStringLiterals: true,
    //       includeTemplateLiterals: true,
    //       includeComments = false,
    //       includeRegex = false,
    //       minLength = 0,
    //       maxLength = -1,
    //       matchRegex = null
    //   }
    getStringTokens: function (inFileData, options) {
        if (options == null) {
            options = {};
        }
        if (options.doPrint == null) {
            options.doPrint = false;
        }
        if (options.includeStringLiterals == null) {
            options.includeStringLiterals = true;
        }
        if (options.includeTemplateLiterals == null) {
            options.includeTemplateLiterals = true;
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
    
        tokens = esprima.tokenize(inFileData, {comment: options.includeComments, range: true});
    
        var results = options.doPrint ? null : [];
    
        for (var i = 0; i < tokens.length; i++) {
            var tok = tokens[i];
            var val = tok.value;
            var extract = false;
            if (options.includeStringLiterals && tok.type.toLowerCase().indexOf('string') >= 0) {
                // Found a string literal
                val = val.slice(1, val.length-1); // Remove quotes
                extract = true;
            } else if (options.includeTemplateLiterals && tok.type.toLowerCase().indexOf('template') >= 0) {
                // Found a template literal; build the full template as one string
                while (!(tok.type.toLowerCase().indexOf('template') >= 0 && tok.value[tok.value.length-1] == '`')) {
                    var lastTokEnd = tok.range[1];
                    i++;
                    tok = tokens[i];
                    if (lastTokEnd < tok.range[0]) {
                        // Preserve whitespace inside template expressions
                        val += inFileData.slice(lastTokEnd, tok.range[0]);
                    }
                    val += tok.value;
                }
                val = val.slice(1, val.length-1); // Remove quotes/backticks
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
    },

}
