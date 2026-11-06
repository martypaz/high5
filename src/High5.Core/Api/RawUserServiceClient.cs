using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;

namespace High5.Core.Api
{
    /// <summary>
    /// Thin authenticated HTTP wrapper over the user-service paths. It returns raw JSON text because the
    /// payload shapes have not been verified yet; typed mapping belongs on top of this once they are.
    /// </summary>
    public sealed class RawUserServiceClient
    {
        private readonly HttpClient _http;
        private readonly Func<string?> _accessToken;

        public RawUserServiceClient(HttpClient http, Uri baseUri, Func<string?> accessToken)
        {
            _http = http;
            _http.BaseAddress = baseUri.AbsoluteUri.EndsWith("/") ? baseUri : new Uri(baseUri.AbsoluteUri + "/");
            _accessToken = accessToken;
        }

        public Task<string> GetAsync(string relativePath, CancellationToken ct = default) => SendAsync(HttpMethod.Get, relativePath, null, ct);
        public Task<string> PutAsync(string relativePath, string? jsonBody, CancellationToken ct = default) => SendAsync(HttpMethod.Put, relativePath, jsonBody, ct);
        public Task<string> PostAsync(string relativePath, string? jsonBody, CancellationToken ct = default) => SendAsync(HttpMethod.Post, relativePath, jsonBody, ct);
        public Task<string> DeleteAsync(string relativePath, CancellationToken ct = default) => SendAsync(HttpMethod.Delete, relativePath, null, ct);

        public readonly struct Response
        {
            public Response(HttpStatusCode status, string body) { Status = status; Body = body; }
            public HttpStatusCode Status { get; }
            public string Body { get; }
            public bool IsSuccess => (int)Status >= 200 && (int)Status < 300;
        }

        /// <summary>Sends a request and returns the status instead of throwing (callers decide what a 404/204 means).</summary>
        public async Task<Response> SendRawAsync(HttpMethod method, string relativePath, string? jsonBody = null, string? bearerOverride = null, CancellationToken ct = default)
        {
            using var req = Build(method, relativePath, jsonBody, bearerOverride ?? _accessToken());
            using var resp = await _http.SendAsync(req, ct).ConfigureAwait(false);
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new Response(resp.StatusCode, body);
        }

        private static HttpRequestMessage Build(HttpMethod method, string path, string? json, string? token)
        {
            var req = new HttpRequestMessage(method, path);
            if (!string.IsNullOrEmpty(token)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (json != null) req.Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            return req;
        }

        private async Task<string> SendAsync(HttpMethod method, string path, string? json, CancellationToken ct)
        {
            using var req = new HttpRequestMessage(method, path);
            var token = _accessToken();
            if (!string.IsNullOrEmpty(token)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (json != null) req.Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            using var resp = await _http.SendAsync(req, ct).ConfigureAwait(false);
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode)
                throw new HttpRequestException($"{(int)resp.StatusCode} {resp.ReasonPhrase} for {method} {path}");
            return body;
        }
    }
}
