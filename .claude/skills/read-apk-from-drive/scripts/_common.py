"""Shared helpers: quiet androguard, secret redaction, SDK host/package knowledge."""
import re, zipfile
try:
    from loguru import logger
    logger.remove()
except Exception:
    pass

# Strings that look like credentials are NEVER written out. We only count them.
SECRET_PATTERNS = [
    re.compile(r'AIza[0-9A-Za-z\-_]{35}'), re.compile(r'AKIA[0-9A-Z]{16}'), re.compile(r'xox[baprs]-[0-9A-Za-z-]{10,}'),
    re.compile(r'\b[0-9a-f]{32,}\b', re.I), re.compile(r'\b[A-Za-z0-9+/=_-]{40,}\b'),
    re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'), re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}'),
]
SECRET_PARAM = re.compile(r'([?&;](?:[\w.-]*(?:key|token|secret|password|passwd|auth|signature|sig|apikey|api_key)[\w.-]*)=)[^&\s"\']+', re.I)
SECRET_NAME = re.compile(r'(key|secret|token|password|passwd|credential|client_?id|api_?id|app_?id)', re.I)

def looks_secret(s: str) -> bool:
    if len(s) < 20 or ' ' in s or s.startswith(('http://', 'https://', '/', 'com.', 'org.', 'android')): return False
    return any(p.search(s) for p in SECRET_PATTERNS)

LONG_ID = re.compile(r'[0-9a-fA-F]{32,}')

def redact_url(u: str) -> str:
    """Hide secret-looking query values AND long hex identifiers anywhere in an address (some vendors put customer keys in hostnames)."""
    return LONG_ID.sub('<id-withheld>', SECRET_PARAM.sub(r'\1<redacted>', u))

# Hosts that belong to well-known SDKs/platforms: useful to ignore when looking for the app's own back end.
SDK_HOST_HINTS = ('google', 'gstatic', 'firebase', 'crashlytics', 'android.com', 'googleapis', 'facebook', 'fb.com', 'adjust', 'appsflyer', 'branch.io',
    'braze', 'appboy', 'kochava', 'adobe', 'omtrdc', 'demdex', 'sentry', 'bugsnag', 'conviva', 'moatads', 'doubleclick', 'w3.org', 'xmlpull',
    'apache.org', 'github.com', 'kotlinlang', 'jetbrains', 'mozilla', 'schemas.', 'example.', 'amazonaws.com/doc', 'ietf.org', 'openssl', 'unity3d',
    'mapbox', 'onetrust', 'cookielaw', 'datadog', 'newrelic', 'segment.', 'mixpanel', 'amplitude', 'optimizely', 'urbanairship', 'onesignal',
    'imrworldwide', 'fwmrm', 'scorecardresearch', 'aomedia', 'dashif', 'exoplayer', 'apple.com', 'ketchcdn', '1trust', 'smart.link', 'zqtk', 'otdev', 'goo.gl',
    'app-measurement', 'localhost', 'fakehost', 'nielsen', 'comscore', 'chartbeat', 'taboola', 'outbrain', 'gigya', 'play.google', 'yahoo', 'twitter', 'linkedin')

def plausible_host(h: str) -> bool:
    """A real DNS name: has a dot, a letter-only TLD of 2+ chars, no placeholder look."""
    return bool(re.fullmatch(r'(?:[a-z0-9-]+\.)+[a-z]{2,}', h)) and not h.startswith(('x.', 'ssl-'))

SDK_PACKAGES = {
    'com.google.firebase': 'Firebase', 'com.google.android.gms': 'Google Play services', 'com.braze': 'Braze', 'com.appboy': 'Braze (legacy)',
    'com.adobe': 'Adobe', 'io.kochava': 'Kochava', 'com.facebook': 'Facebook SDK', 'com.appsflyer': 'AppsFlyer', 'com.adjust': 'Adjust',
    'io.branch': 'Branch', 'com.conviva': 'Conviva', 'com.google.android.exoplayer2': 'ExoPlayer', 'androidx.media3': 'Media3/ExoPlayer',
    'com.google.ads': 'Google Ads / IMA', 'com.google.android.libraries.ads': 'Google Ads / IMA', 'okhttp3': 'OkHttp', 'retrofit2': 'Retrofit',
    'com.squareup.moshi': 'Moshi', 'com.google.gson': 'Gson', 'kotlinx.serialization': 'kotlinx.serialization', 'com.apollographql': 'Apollo GraphQL',
    'com.amazonaws': 'AWS SDK', 'io.sentry': 'Sentry', 'com.bugsnag': 'Bugsnag', 'com.newrelic': 'New Relic', 'com.onetrust': 'OneTrust', 'org.eclipse.paho': 'MQTT (Paho)',
    'com.google.android.gms.cast': 'Google Cast', 'com.npaw': 'NPAW/YOUBORA', 'com.nielsen': 'Nielsen', 'com.kantar': 'Kantar', 'com.comscore': 'comScore',
}

def open_dex_files(apk_path):
    """Yield (name, bytes) for every classesN.dex in the APK. Reads in memory; nothing is extracted to disk."""
    with zipfile.ZipFile(apk_path) as z:
        for n in sorted(z.namelist()):
            if re.fullmatch(r'classes\d*\.dex', n): yield n, z.read(n)
