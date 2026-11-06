using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using High5.Core.Api;
using High5.Core.Mock;
using High5.Core.Models;
using High5.Core.Services;
using High5.Core.ViewModels;
using Xunit;

namespace High5.Core.Tests
{
    internal sealed class FakeClock : IClock { public DateTimeOffset Now { get; set; } = new DateTimeOffset(2026, 1, 1, 12, 30, 0, TimeSpan.Zero); }

    public class ParentalControlTests
    {
        [Fact] public void Pin_is_hashed_and_verified()
        {
            var store = new InMemoryKeyValueStore(); var p = new ParentalControl(store);
            Assert.False(p.HasPin);
            p.SetPin("1234");
            Assert.True(p.HasPin); Assert.True(p.Verify("1234")); Assert.False(p.Verify("4321"));
            Assert.DoesNotContain("1234", store.Get("parental.pinHash"));
        }
        [Theory] [InlineData("123")] [InlineData("12345")] [InlineData("12a4")] [InlineData("")]
        public void Invalid_pins_are_rejected(string pin) => Assert.Throws<ArgumentException>(() => new ParentalControl(new InMemoryKeyValueStore()).SetPin(pin));
        [Fact] public void Changing_max_rating_requires_pin_when_set()
        {
            var p = new ParentalControl(new InMemoryKeyValueStore()); p.SetPin("1111");
            Assert.False(p.SetMaxRating(AgeRating.PG, "0000"));
            Assert.Equal(AgeRating.Eighteen, p.MaxRating);
            Assert.True(p.SetMaxRating(AgeRating.PG, "1111"));
            Assert.True(p.IsAllowed(AgeRating.Universal)); Assert.True(p.IsAllowed(AgeRating.PG)); Assert.False(p.IsAllowed(AgeRating.Twelve));
        }
    }

    public class ResumePointTests
    {
        [Fact] public void Progress_and_finished()
        {
            var r = new ResumePoint { Position = TimeSpan.FromMinutes(43), Duration = TimeSpan.FromMinutes(45) };
            Assert.True(r.IsFinished);
            Assert.False(new ResumePoint { Position = TimeSpan.FromMinutes(10), Duration = TimeSpan.FromMinutes(45) }.IsFinished);
            Assert.Equal(0, new ResumePoint().Progress);
        }
    }

    public class HomeAndDetailTests
    {
        private static (MockCatalogue cat, MockResume res, ParentalControl par) Deps() => (new MockCatalogue(), new MockResume(), new ParentalControl(new InMemoryKeyValueStore()));

        [Fact] public async Task Home_hides_content_above_max_rating()
        {
            var (cat, res, par) = Deps(); par.SetMaxRating(AgeRating.PG, "");
            var vm = new HomeViewModel(cat, res, par); await vm.LoadAsync();
            Assert.NotEmpty(vm.Rails);
            Assert.All(vm.Rails, r => Assert.All(r.Items, i => Assert.True(i.Rating <= AgeRating.PG)));
        }

        [Fact] public async Task Continue_watching_lists_unfinished_only()
        {
            var (cat, res, par) = Deps();
            await res.SaveAsync(new ResumePoint { EpisodeId = "show-harbour-s1e1", ShowId = "show-harbour", Position = TimeSpan.FromMinutes(10), Duration = TimeSpan.FromMinutes(45), UpdatedAt = DateTimeOffset.Now });
            await res.SaveAsync(new ResumePoint { EpisodeId = "show-bake-s1e1", ShowId = "show-bake", Position = TimeSpan.FromMinutes(44), Duration = TimeSpan.FromMinutes(45), UpdatedAt = DateTimeOffset.Now });
            var vm = new HomeViewModel(cat, res, par); await vm.LoadAsync();
            var card = Assert.Single(vm.ContinueWatching);
            Assert.Equal("show-harbour-s1e1", card.Episode.Id);
        }

        [Fact] public async Task Show_detail_picks_resume_episode_and_toggles_my_list()
        {
            var (cat, res, par) = Deps(); var list = new MockMyList(cat);
            await res.SaveAsync(new ResumePoint { EpisodeId = "show-harbour-s2e3", ShowId = "show-harbour", Position = TimeSpan.FromMinutes(5), Duration = TimeSpan.FromMinutes(45), UpdatedAt = DateTimeOffset.Now });
            var vm = new ShowDetailViewModel(cat, list, res); await vm.LoadAsync("show-harbour");
            Assert.Equal("show-harbour-s2e3", vm.NextToWatch!.Id); Assert.Equal(2, vm.SelectedSeason);
            Assert.All(vm.Episodes, e => Assert.Equal(2, e.SeasonNumber));
            Assert.False(vm.InMyList);
            vm.ToggleMyList.Execute(null); await Task.Delay(50);
            Assert.True(vm.InMyList); Assert.Single(await list.GetAsync());
        }

        [Fact] public async Task Unknown_show_sets_error()
        {
            var (cat, res, _) = Deps(); var vm = new ShowDetailViewModel(cat, new MockMyList(cat), res);
            await vm.LoadAsync("nope"); Assert.NotNull(vm.Error);
        }
    }

    public class SearchTests
    {
        private sealed class SlowCatalogue : MockCatalogueBase
        {
            public override async Task<IReadOnlyList<ContentItem>> SearchAsync(string query, CancellationToken ct)
            {
                if (query == "slow") await Task.Delay(200, CancellationToken.None);
                return new List<ContentItem> { new ContentItem { Id = query, Title = query } };
            }
        }

        [Fact] public async Task Latest_query_wins()
        {
            var vm = new SearchViewModel(new SlowCatalogue(), new ParentalControl(new InMemoryKeyValueStore()));
            var first = vm.SearchAsync("slow"); await Task.Delay(20);
            await vm.SearchAsync("fast"); await first;
            Assert.Equal("fast", Assert.Single(vm.Results).Id);
        }
        [Fact] public async Task Empty_query_clears_results()
        {
            var vm = new SearchViewModel(new MockCatalogue(), new ParentalControl(new InMemoryKeyValueStore()));
            await vm.SearchAsync("bake"); Assert.NotEmpty(vm.Results);
            await vm.SearchAsync("  "); Assert.Empty(vm.Results);
        }
    }

    // Minimal catalogue base for SearchTests.
    public abstract class MockCatalogueBase : ICatalogueService
    {
        public Task<IReadOnlyList<Rail>> GetHomeRailsAsync(CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<string>> GetGenresAsync(CancellationToken ct = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<ContentItem>> GetByGenreAsync(string genre, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<Show?> GetShowAsync(string showId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<Episode?> GetEpisodeAsync(string episodeId, CancellationToken ct = default) => throw new NotSupportedException();
        public abstract Task<IReadOnlyList<ContentItem>> SearchAsync(string query, CancellationToken ct = default);
    }

    public class GuideTests
    {
        [Fact] public async Task Guide_identifies_now_and_next()
        {
            var clock = new FakeClock(); var vm = new TvGuideViewModel(new MockLiveService(), clock);
            await vm.LoadAsync(TimeSpan.FromHours(4));
            Assert.Equal(2, vm.Rows.Count);
            foreach (var row in vm.Rows)
            {
                Assert.NotNull(row.OnNow); Assert.True(row.OnNow!.IsOn(clock.Now));
                Assert.NotNull(row.Next); Assert.Equal(row.OnNow.End, row.Next!.Start);
            }
        }
    }

    public class SignInTests
    {
        [Fact] public async Task Polls_until_signed_in()
        {
            var auth = new MockAuth { PollsBeforeSuccess = 3 }; var vm = new SignInViewModel(auth);
            await vm.RunAsync(CancellationToken.None);
            Assert.Equal("ABCD-1234", vm.Code); Assert.True(vm.IsSignedIn); Assert.NotNull(auth.CurrentSession);
        }
        [Fact] public async Task Expires_when_pin_times_out()
        {
            var auth = new MockAuth { PollsBeforeSuccess = 1000 }; var vm = new SignInViewModel(auth);
            var clock = new FakeClock();
            var t = vm.RunAsync(CancellationToken.None, new ExpiringClock(clock));
            await t; Assert.True(vm.IsExpired); Assert.False(vm.IsSignedIn);
        }
        [Fact] public async Task Cancellation_stops_polling_quietly()
        {
            var auth = new MockAuth { PollsBeforeSuccess = 1000 }; var vm = new SignInViewModel(auth);
            using var cts = new CancellationTokenSource(); var t = vm.RunAsync(cts.Token);
            await Task.Delay(50); cts.Cancel(); await t;
            Assert.False(vm.IsSignedIn); Assert.Null(vm.Error);
        }
        private sealed class ExpiringClock : IClock
        {
            private int _n; private readonly FakeClock _c;
            public ExpiringClock(FakeClock c) { _c = c; }
            public DateTimeOffset Now => ++_n > 3 ? DateTimeOffset.Now.AddHours(1) : DateTimeOffset.Now;
        }
    }

    public class PlayerTests
    {
        [Fact] public async Task Resumes_and_throttles_saves()
        {
            var res = new MockResume(); var clock = new FakeClock(); var cat = new MockCatalogue();
            var ep = (await cat.GetEpisodeAsync("show-harbour-s1e1"))!;
            await res.SaveAsync(new ResumePoint { EpisodeId = ep.Id, ShowId = ep.ShowId, Position = TimeSpan.FromMinutes(12), Duration = ep.Duration, UpdatedAt = clock.Now });
            var vm = new PlayerViewModel(new MockPlayback(), res, clock, TimeSpan.FromSeconds(15));
            await vm.LoadAsync(ep);
            Assert.Equal(TimeSpan.FromMinutes(12), vm.StartAt);

            await vm.ReportPositionAsync(TimeSpan.FromMinutes(13), ep.Duration);           // saved
            clock.Now += TimeSpan.FromSeconds(5);
            await vm.ReportPositionAsync(TimeSpan.FromMinutes(14), ep.Duration);           // throttled
            Assert.Equal(TimeSpan.FromMinutes(13), (await res.GetAsync(ep.Id))!.Position);
            await vm.ReportPositionAsync(TimeSpan.FromMinutes(14), ep.Duration, force: true);
            Assert.Equal(TimeSpan.FromMinutes(14), (await res.GetAsync(ep.Id))!.Position);
        }

        [Fact] public async Task Vod_playback_saves_a_resume_point()
        {
            var res = new MockResume(); var vm = new PlayerViewModel(new MockPlayback(), res, new FakeClock());
            await vm.LoadAsync(new Episode { Id = "x", ShowId = "s" });
            await vm.ReportPositionAsync(TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(40), force: true);
            Assert.NotNull(await res.GetAsync("x"));
        }

        [Fact] public async Task Live_playback_never_saves_resume_points()
        {
            var res = new MockResume(); var vm = new PlayerViewModel(new MockPlayback(), res, new FakeClock());
            await vm.LoadLiveAsync("ch-a");
            Assert.True(vm.Playback!.IsLive); Assert.Null(vm.Episode);
            await vm.ReportPositionAsync(TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(40), force: true);
            Assert.Empty(await res.GetAllAsync());
        }
    }

    public class ApiTests
    {
        private sealed class Capture : HttpMessageHandler
        {
            public HttpRequestMessage? Last; public HttpStatusCode Status = HttpStatusCode.OK;
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
            { Last = r; return Task.FromResult(new HttpResponseMessage(Status) { Content = new StringContent("{}") }); }
        }

        [Fact] public async Task Builds_urls_and_sends_bearer_token()
        {
            var h = new Capture(); var c = new RawUserServiceClient(new HttpClient(h), new Uri("https://example.test/user"), () => "tok");
            await c.PutAsync(UserServiceEndpoints.Favourite("a b/c"), "{}");
            Assert.Equal("https://example.test/user/favourites/a%20b%2Fc", h.Last!.RequestUri!.AbsoluteUri);
            Assert.Equal(HttpMethod.Put, h.Last.Method); Assert.Equal("Bearer", h.Last.Headers.Authorization!.Scheme); Assert.Equal("tok", h.Last.Headers.Authorization.Parameter);
        }
        [Fact] public async Task No_token_means_no_auth_header_and_errors_throw()
        {
            var h = new Capture(); var c = new RawUserServiceClient(new HttpClient(h), new Uri("https://example.test/"), () => null);
            await c.GetAsync(UserServiceEndpoints.ResumePointsSync); Assert.Null(h.Last!.Headers.Authorization);
            h.Status = HttpStatusCode.Unauthorized; await Assert.ThrowsAsync<HttpRequestException>(() => c.GetAsync("x"));
        }
        [Fact] public void Known_paths_match_the_analysis()
        {
            Assert.Equal("activationPins/123/poll", UserServiceEndpoints.ActivationPinPoll("123"));
            Assert.Equal("resumePoints/show/s1", UserServiceEndpoints.ResumePointsForShow("s1"));
            Assert.Equal("favourites/sync", UserServiceEndpoints.FavouritesSync);
        }
    }
}
