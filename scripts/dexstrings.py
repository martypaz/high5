import sys,re,glob
from androguard.core.dex import DEX
out=set()
for f in sorted(glob.glob(sys.argv[1]+'/classes*.dex')):
    d=DEX(open(f,'rb').read())
    for s in d.get_strings():
        s=str(s)
        if re.search(r'https?://|^/?[a-z0-9\-_]+(/[{a-z0-9\-_}]+)+/?$|\.channel5\.|\.my5\.|amazonaws|cognito|widevine|playready|licen[cs]e|\.mpd|\.m3u8|corona|edna',s,re.I) and len(s)<300:
            out.add(s)
open(sys.argv[2],'w').write('\n'.join(sorted(out)))
print(len(out))
