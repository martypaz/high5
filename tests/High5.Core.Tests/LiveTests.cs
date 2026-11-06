using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using High5.Core.Api;
using High5.Core.Models;
using High5.Core.Services;
using Xunit;

namespace High5.Core.Tests
{
    /// <summary>Scriptable fake server: queue responses per "METHOD path" and inspect what was sent.</summary>
    internal sealed class FakeServer : HttpMessageHandler
    {
        public readonly List<(HttpMethod Method, string Uri, string? Auth, string? Body)> Calls = new List<(HttpMethod, string, string?, string?)>();
        private readonly Dictionary<string, Queue<(HttpStatusCode, string)>> _routes = new Dictionary<string, Queue<(HttpStatusCode, string)>>();

        public FakeServer On(string method, string pathAndQuery, HttpStatusCode status, string body = "")
        {
            var key = method + " " + pathAndQuery;
            if (!_routes.TryGetValue(key, out var q)) _routes[key] = q = new Queue<(HttpStatusCode, string)>();
            q.Enqueue((status, body)); return this;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content == null ? null : await r.Content.ReadAsStringAsync();
            Calls.Add((r.Method, r.RequestUri!.PathAndQuery, r.Headers.Authorization?.ToString(), body));
            var key = r.Method + " " + r.RequestUri.PathAndQuery;
            if (_routes.TryGetValue(key, out var q) && q.Count > 0)
            { var (st, b) = q.Count > 1 ? q.Dequeue() : q.Peek(); return new HttpResponseMessage(st) { Content = new StringContent(b) }; }
            return new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("no route: " + key) };
        }
    }

    public class LiveServiceTests
    {
        private static readonly ClientConfig Cfg = new ClientConfig(new Uri("https://users.example.test/api"), "test-platform");
        private static (RawUserServiceClient c, FakeServer s) Make(Func<string?>? token = null)
        { var s = new FakeServer(); return (new RawUserServiceClient(new HttpClient(s), Cfg.UserServiceBase, token ?? (() => "session-tok")), s); }

        [Fact] public async Task Sign_in_creates_pin_then_polls_with_pin_secret_until_session()
        {
            var (c, s) = Make(() => null);
            s.On("POST", "/api/activationPins", HttpStatusCode.OK, "{\"pin\":\"ABC123\",\"pinSecret\":\"sekret\",\"qrCode\":\"x\"}")
             .On("GET", "/api/activationPins/ABC123/poll?longPoll=false", HttpStatusCode.NoContent)
             .On("GET", "/api/activationPins/ABC123/poll?longPoll=false", HttpStatusCode.OK, "{\"sessionToken\":\"tok-1\",\"isRegistration\":false}");
            var auth = new LiveAuthService(c, Cfg, new FakeClock());

            var pin = await auth.StartActivationAsync();
            Assert.Equal("ABC123", pin.Code);
            Assert.Null(await auth.PollActivationAsync(pin));          // still pending (204)
            var session = await auth.PollActivationAsync(pin);          // signed in
            Assert.Equal("tok-1", session!.AccessToken); Assert.Same(session, auth.CurrentSession);
            Assert.All(s.Calls.Where(x => x.Method == HttpMethod.Get), x => Assert.Equal("Bearer sekret", x.Auth));   // pin secret as bearer
            Assert.Null(s.Calls[0].Auth);                                // creating a pin is anonymous
        }

        [Fact] public async Task Sign_in_poll_treats_404_as_pending_but_500_as_error()
        {
            var (c, s) = Make(() => null);
            s.On("POST", "/api/activationPins", HttpStatusCode.OK, "{\"pin\":\"P\",\"pinSecret\":\"S\"}")
             .On("GET", "/api/activationPins/P/poll?longPoll=false", HttpStatusCode.NotFound);
            var auth = new LiveAuthService(c, Cfg); var pin = await auth.StartActivationAsync();
            Assert.Null(await auth.PollActivationAsync(pin));
            var (c2, s2) = Make(() => null);
            s2.On("POST", "/api/activationPins", HttpStatusCode.OK, "{\"pin\":\"P\",\"pinSecret\":\"S\"}")
              .On("GET", "/api/activationPins/P/poll?longPoll=false", HttpStatusCode.InternalServerError);
            var a2 = new LiveAuthService(c2, Cfg); var p2 = await a2.StartActivationAsync();
            await Assert.ThrowsAsync<HttpRequestException>(() => a2.PollActivationAsync(p2));
        }

        [Fact] public async Task Sign_in_start_rejects_bad_payload_and_http_errors()
        {
            var (c, s) = Make(() => null); s.On("POST", "/api/activationPins", HttpStatusCode.OK, "{}");
            await Assert.ThrowsAsync<InvalidOperationException>(() => new LiveAuthService(c, Cfg).StartActivationAsync());
            var (c2, s2) = Make(() => null); s2.On("POST", "/api/activationPins", HttpStatusCode.ServiceUnavailable);
            await Assert.ThrowsAsync<HttpRequestException>(() => new LiveAuthService(c2, Cfg).StartActivationAsync());
        }

        [Fact] public async Task My_list_reads_collection_and_maps_items_failing_closed_on_rating()
        {
            var (c, s) = Make();
            s.On("GET", "/collections/mylist.json?platform=test-platform&milkshake=false", HttpStatusCode.OK,
                "{\"content\":[{\"id\":\"a\",\"title\":\"Alpha\",\"genre\":\"Drama\",\"type\":\"show\"},{\"id\":\"b\",\"title\":\"Beta\",\"type\":\"film\"}],\"contentType\":\"x\",\"totalItems\":2}");
            var items = await new LiveMyList(c, Cfg).GetAsync();
            Assert.Equal(new[] { "Alpha", "Beta" }, items.Select(i => i.Title));
            Assert.Equal(ContentKind.Film, items[1].Kind);
            Assert.All(items, i => Assert.Equal(AgeRating.Eighteen, i.Rating));
            Assert.Equal("Bearer session-tok", s.Calls[0].Auth);
            // Note: the host-absolute path drops the "/api" base path, as Retrofit does for leading-slash routes.
        }

        [Fact] public async Task My_list_add_remove_contains_use_the_right_verbs()
        {
            var (c, s) = Make();
            s.On("PUT", "/api/favourites/show-1", HttpStatusCode.NoContent)
             .On("DELETE", "/api/favourites/show-1", HttpStatusCode.NoContent)
             .On("GET", "/api/favourites/show-1", HttpStatusCode.OK, "{}")
             .On("GET", "/api/favourites/missing", HttpStatusCode.NotFound);
            var list = new LiveMyList(c, Cfg, new Mock.MockCatalogue());
            await list.AddAsync("show-1");
            Assert.Contains("\"showId\":\"show-1\"", s.Calls[0].Body); Assert.Contains("\"platform\":\"test-platform\"", s.Calls[0].Body);
            Assert.True(await list.ContainsAsync("show-1")); Assert.False(await list.ContainsAsync("missing"));
            await list.RemoveAsync("show-1");
            Assert.Equal(HttpMethod.Delete, s.Calls.Last().Method);
        }

        [Fact] public async Task Add_uses_catalogue_title_when_known()
        {
            var (c, s) = Make(); s.On("PUT", "/api/favourites/show-bake", HttpStatusCode.OK);
            await new LiveMyList(c, Cfg, new Mock.MockCatalogue()).AddAsync("show-bake");
            Assert.Contains("The Great Village Bake", s.Calls[0].Body);
        }

        [Fact] public async Task Resume_points_round_trip()
        {
            var (c, s) = Make();
            s.On("GET", "/resumePoints?limit=250", HttpStatusCode.OK,
                "{\"watchables\":[{\"watchableId\":\"e1\",\"resumeTimeInSeconds\":600,\"durationInSeconds\":2700,\"updatedAt\":1700000000000},{\"watchableId\":\"e2\",\"resumeTimeInSeconds\":10,\"durationInSeconds\":100,\"updatedAt\":1800000000000}]}")
             .On("GET", "/resumePoints/missing", HttpStatusCode.NotFound)
             .On("GET", "/resumePoints/show/s9", HttpStatusCode.OK, "[{\"watchableId\":\"e3\",\"resumeTimeInSeconds\":5,\"durationInSeconds\":50,\"updatedAt\":1}]")
             .On("PUT", "/resumePoints/e1", HttpStatusCode.NoContent);
            var r = new LiveResume(c, Cfg);
            var all = await r.GetAllAsync();
            Assert.Equal("e2", all[0].EpisodeId);                       // newest first
            Assert.Equal(TimeSpan.FromMinutes(10), all[1].Position);
            Assert.Null(await r.GetAsync("missing"));
            var show = await r.GetForShowAsync("s9"); Assert.Equal("s9", show.Single().ShowId);
            await r.SaveAsync(new ResumePoint { EpisodeId = "e1", Position = TimeSpan.FromSeconds(90), Duration = TimeSpan.FromSeconds(300) });
            Assert.Contains("\"resumeTimeInSeconds\":90", s.Calls.Last().Body); Assert.Contains("\"durationInSeconds\":300", s.Calls.Last().Body);
        }

        [Fact] public void Config_requires_values_and_parses_json()
        {
            Assert.Throws<ArgumentException>(() => new ClientConfig(new Uri("https://x.test"), " "));
            var cfg = ClientConfig.FromJson("{\"userServiceBase\":\"https://x.test/u\",\"platform\":\"p\"}");
            Assert.Equal("https://x.test/u", cfg.UserServiceBase.ToString()); Assert.Equal("p", cfg.Platform);
        }
    }
}
