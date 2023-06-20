#!/usr/bin/env node
// Author: Sean Pesce

const child_process = require('child_process');


module.exports = {

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
    }

}
