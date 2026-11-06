#!/usr/bin/env python3
"""Extract HTTP endpoint declarations from decompiled Java (output of Decompile.java).
  find_endpoints.py <decompiled.txt>
Retrofit-style:  @GET("path") / @POST(...)  - or obfuscated one-letter annotations like @f("path").
Obfuscated letters are NOT guessed: they are listed with their letter and a note. Infer verbs by corroboration (see SKILL.md).
"""
import re, sys, collections
RETRO = {'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'}
ANN = re.compile(r'^\s*@(\w+)\("([^"]*)"\)\s*$')
SIG = re.compile(r'^\s*(?:Object|\w[\w<>?, .]*?)\s+(\w+)\((.*)\)\s*;')
src = open(sys.argv[1], encoding='utf-8', errors='replace').read().splitlines()
cls = ''; pending = None; rows = []; letters = collections.Counter()
for line in src:
    if line.startswith('//// '): cls = line[5:].split('.')[-1]; continue
    m = ANN.match(line)
    if m and (m.group(1) in RETRO or len(m.group(1)) <= 2) and ('/' in m.group(2) or '.' in m.group(2) or m.group(2).replace('_', '').isalnum()):
        pending = (m.group(1), m.group(2)); continue
    if pending:
        s = SIG.match(line)
        if s:
            ann, path = pending; verb = ann if ann in RETRO else f'?{ann}'
            if verb.startswith('?'): letters[ann] += 1
            params = re.sub(r'Continuation<[^>]*>', '', s.group(2)).strip(', ')
            rows.append((cls, verb, path, s.group(1), params[:110])); pending = None
        elif line.strip() and not line.strip().startswith('@'): pending = None
w = max((len(r[0]) for r in rows), default=8)
for c, v, p, name, params in rows: print(f'{c:<{w}}  {v:<7} {p:<48} {name}({params})')
if letters: print(f'\nNOTE: obfuscated verb letters {dict(letters)}. On Retrofit the alphabet is b=DELETE f=GET n=PATCH o=POST p=PUT in one build; verify with a case that has several verbs on the same path.')
print(f'\n{len(rows)} endpoint declarations')
