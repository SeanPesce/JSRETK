#!/usr/bin/env python3
# Author: Sean Pesce
# 
# This script fixes hbc-decompiler output to be ingestible by esprima
#
# Related resources:
#     https://github.com/P1sec/hermes-dec
#     https://esprima.org/

import argparse
import re
import sys

DEFAULT_ITERATIONS_COUNT = 100
DEFAULT_APPEND_OUTPUT_EXT = '.fixed.js'


def fix_react_native_hermes_decompilation(fpath, iterations=DEFAULT_ITERATIONS_COUNT):
    data = None
    with open(fpath, 'r') as f:
        data = f.read()
    replacements = {
        r'\.(@@[a-zA-Z0-9_]+)': r'[`\1`]',
        r'(= /[^\n]*)(\\\\/)([^\n]*/)': r'\1\\/\3',  # This can occur multiple times in each line, so we perform multiple iterations
        ## Alternate technique: Wrap bad regexes in strings (not true to the original code)
        # r"= (/[^'\n]*\\\\/[^'\n]*/[^'\n]*);": r"= '\1';",
        # r'= (/[^"\n]*\\\\/[^"\n]*/[^"\n]*);': r'= "\1";',
        # r'= (/[^`\n]*\\\\/[^`\n]*/[^`\n]*);': r'= `\1`;',
    }
    for i in range(0, iterations):
        for regex in replacements:
            replace_with = replacements[regex]
            data = re.sub(regex, replace_with, data)
    return data
    


if __name__ == '__main__':
    argparser = argparse.ArgumentParser()
    argparser.add_argument('file', help='Input file (JavaScript decompiled from React Native Hermes bytecode using hbc-decompiler)')
    argparser.add_argument('-o', '--out', type=str, help=f'Output file path (default: "{DEFAULT_APPEND_OUTPUT_EXT}" appended to original file path)', default=None)
    argparser.add_argument('-n', '--iterations', type=int, help=f'Number of iterations when performing replacements (default: {DEFAULT_ITERATIONS_COUNT})', default=DEFAULT_ITERATIONS_COUNT)
    argparser.add_argument('-v', '--verbose', help='Increase output verbosity', action='store_true')
    if '-h' in sys.argv or '--help' in sys.argv:
        argparser.print_help()
        print(f'\nTool for fixing hbc-decompiler output to be ingestible by esprima', file=sys.stderr)
        sys.exit(0)
    args = argparser.parse_args()

    out_fpath = args.out
    if not out_fpath:
        out_fpath = args.file+DEFAULT_APPEND_OUTPUT_EXT

    FIXED_DATA = fix_react_native_hermes_decompilation(args.file, iterations=args.iterations)
    
    with open(out_fpath, 'w') as f:
        f.write(FIXED_DATA)
    
    # Done

