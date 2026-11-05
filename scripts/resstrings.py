import sys,re
from androguard.core.apk import APK
a=APK(sys.argv[1])
res=a.get_android_resources()
pk=a.get_package()
out=[]
try:
    xml=res.get_string_resources(pk)
    for m in re.finditer(rb'<string name="([^"]+)"[^>]*>(.*?)</string>',xml,re.S):
        k,v=m.group(1).decode(),m.group(2).decode('utf8','replace')
        if re.search(r'https?://|\.com|api|url|host|endpoint|domain|pool|region|client_?id|config',k+v,re.I) and len(v)<300:
            out.append(f'{k}={v}')
except Exception as e:
    out.append('ERR '+repr(e))
print('\n'.join(out))
