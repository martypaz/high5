using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using High5.Core.Models;
using High5.Core.Services;

namespace High5.Core.Mock
{
    /// <summary>
    /// Invented demo content (no real Channel 5 titles or artwork) so the UI can be developed offline.
    /// </summary>
    public sealed class MockCatalogue : ICatalogueService
    {
        private readonly List<Show> _shows;

        public MockCatalogue()
        {
            _shows = new List<Show>
            {
                Make("show-harbour", "Harbour Detectives", "Crime", AgeRating.Twelve, 2, 4, "Two officers police a seaside town."),
                Make("show-bake", "The Great Village Bake", "Food", AgeRating.Universal, 1, 5, "Amateur bakers compete for the golden whisk."),
                Make("show-space", "Orbit Kids", "Kids", AgeRating.Universal, 3, 3, "Pocket-sized astronauts explore the solar system."),
                Make("show-night", "Night Shift ER", "Drama", AgeRating.Fifteen, 2, 4, "A hospital's busiest hours."),
                Make("show-wild", "Wild Britain", "Documentary", AgeRating.PG, 1, 6, "Seasons across the British Isles."),
                Make("show-lates", "Late Night Laughs", "Comedy", AgeRating.Eighteen, 1, 4, "Stand-up from the capital's best clubs."),
            };
        }

        private static Show Make(string id, string title, string genre, AgeRating rating, int seasons, int perSeason, string synopsis)
        {
            var eps = new List<Episode>();
            for (var s = 1; s <= seasons; s++)
                for (var e = 1; e <= perSeason; e++)
                    eps.Add(new Episode
                    {
                        Id = $"{id}-s{s}e{e}", ShowId = id, ShowTitle = title, Title = $"Episode {e}",
                        SeasonNumber = s, EpisodeNumber = e, Synopsis = $"{title} - series {s}, episode {e}.",
                        Duration = TimeSpan.FromMinutes(45), Rating = rating
                    });
            return new Show { Id = id, Title = title, Genre = genre, Rating = rating, Synopsis = synopsis, Episodes = eps };
        }

        private static ContentItem Card(Show s) => new ContentItem { Id = s.Id, Title = s.Title, Genre = s.Genre, Rating = s.Rating, Kind = ContentKind.Show, ImageUrl = s.ImageUrl };

        public Task<IReadOnlyList<Rail>> GetHomeRailsAsync(CancellationToken ct = default)
        {
            IReadOnlyList<Rail> rails = new List<Rail>
            {
                new Rail { Id = "popular", Title = "Popular now", Items = _shows.Select(Card).ToList() },
                new Rail { Id = "new", Title = "New this week", Items = _shows.Take(3).Select(Card).ToList() },
                new Rail { Id = "kids", Title = "For the family", Items = _shows.Where(s => s.Rating <= AgeRating.PG).Select(Card).ToList() },
            };
            return Task.FromResult(rails);
        }

        public Task<IReadOnlyList<string>> GetGenresAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<string>>(_shows.Select(s => s.Genre).Distinct().OrderBy(g => g).ToList());

        public Task<IReadOnlyList<ContentItem>> GetByGenreAsync(string genre, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<ContentItem>>(_shows.Where(s => string.Equals(s.Genre, genre, StringComparison.OrdinalIgnoreCase)).Select(Card).ToList());

        public Task<Show?> GetShowAsync(string showId, CancellationToken ct = default) =>
            Task.FromResult<Show?>(_shows.FirstOrDefault(s => s.Id == showId));

        public Task<Episode?> GetEpisodeAsync(string episodeId, CancellationToken ct = default) =>
            Task.FromResult<Episode?>(_shows.SelectMany(s => s.Episodes).FirstOrDefault(e => e.Id == episodeId));

        public Task<IReadOnlyList<ContentItem>> SearchAsync(string query, CancellationToken ct = default)
        {
            query = (query ?? "").Trim();
            IReadOnlyList<ContentItem> r = query.Length == 0
                ? new List<ContentItem>()
                : _shows.Where(s => s.Title.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0
                                 || s.Genre.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0).Select(Card).ToList();
            return Task.FromResult(r);
        }
    }

    public sealed class MockLiveService : ILiveService
    {
        private static readonly string[] Titles = { "Morning Magazine", "Daytime Docs", "Harbour Detectives", "Wild Britain", "Evening Bulletin" };
        public Task<IReadOnlyList<Channel>> GetChannelsAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<Channel>>(new List<Channel>
            {
                new Channel { Id = "ch-a", Name = "Channel A" }, new Channel { Id = "ch-b", Name = "Channel B" }
            });

        public Task<IReadOnlyList<Transmission>> GetGuideAsync(string channelId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct = default)
        {
            var list = new List<Transmission>();
            var slot = TimeSpan.FromHours(1);
            var start = new DateTimeOffset(from.Year, from.Month, from.Day, from.Hour, 0, 0, from.Offset);
            for (var i = 0; start + TimeSpan.FromTicks(slot.Ticks * i) < to; i++)
            {
                var s = start + TimeSpan.FromTicks(slot.Ticks * i);
                list.Add(new Transmission { ChannelId = channelId, Title = Titles[(i + channelId.Length) % Titles.Length], Description = "Demo schedule entry.", Start = s, End = s + slot });
            }
            return Task.FromResult<IReadOnlyList<Transmission>>(list);
        }
    }

    public sealed class InMemoryKeyValueStore : IKeyValueStore
    {
        private readonly Dictionary<string, string> _d = new Dictionary<string, string>();
        public string? Get(string key) => _d.TryGetValue(key, out var v) ? v : null;
        public void Set(string key, string? value) { if (value is null) _d.Remove(key); else _d[key] = value; }
    }

    public sealed class MockMyList : IMyListService
    {
        private readonly ICatalogueService _cat;
        private readonly List<string> _ids = new List<string>();
        public MockMyList(ICatalogueService cat) { _cat = cat; }

        public async Task<IReadOnlyList<ContentItem>> GetAsync(CancellationToken ct = default)
        {
            var all = new List<ContentItem>();
            foreach (var id in _ids)
            {
                var s = await _cat.GetShowAsync(id, ct);
                if (s != null) all.Add(new ContentItem { Id = s.Id, Title = s.Title, Genre = s.Genre, Rating = s.Rating, Kind = ContentKind.Show, ImageUrl = s.ImageUrl });
            }
            return all;
        }
        public Task<bool> ContainsAsync(string showId, CancellationToken ct = default) => Task.FromResult(_ids.Contains(showId));
        public Task AddAsync(string showId, CancellationToken ct = default) { if (!_ids.Contains(showId)) _ids.Add(showId); return Task.CompletedTask; }
        public Task RemoveAsync(string showId, CancellationToken ct = default) { _ids.Remove(showId); return Task.CompletedTask; }
    }

    public sealed class MockResume : IResumeService
    {
        private readonly Dictionary<string, ResumePoint> _d = new Dictionary<string, ResumePoint>();
        public Task<IReadOnlyList<ResumePoint>> GetAllAsync(CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<ResumePoint>>(_d.Values.OrderByDescending(r => r.UpdatedAt).ToList());
        public Task<ResumePoint?> GetAsync(string episodeId, CancellationToken ct = default) =>
            Task.FromResult(_d.TryGetValue(episodeId, out var r) ? r : null);
        public Task<IReadOnlyList<ResumePoint>> GetForShowAsync(string showId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<ResumePoint>>(_d.Values.Where(r => r.ShowId == showId).OrderByDescending(r => r.UpdatedAt).ToList());
        public Task SaveAsync(ResumePoint point, CancellationToken ct = default) { _d[point.EpisodeId] = point; return Task.CompletedTask; }
    }

    /// <summary>Plays a public test stream so the player UI can be exercised without Channel 5's servers.</summary>
    public sealed class MockPlayback : IPlaybackService
    {
        private static readonly Uri Demo = new Uri("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
        public Task<PlaybackInfo> GetEpisodePlaybackAsync(string episodeId, CancellationToken ct = default) =>
            Task.FromResult(new PlaybackInfo { ManifestUri = Demo, Drm = DrmScheme.None, Title = "Demo stream" });
        public Task<PlaybackInfo> GetLivePlaybackAsync(string channelId, CancellationToken ct = default) =>
            Task.FromResult(new PlaybackInfo { ManifestUri = Demo, Drm = DrmScheme.None, Title = "Demo live", IsLive = true });
    }

    public sealed class MockAuth : IAuthService
    {
        private int _polls;
        public int PollsBeforeSuccess { get; set; } = 2;
        public UserSession? CurrentSession { get; private set; }
        public event EventHandler? SessionChanged;

        public Task<ActivationPin> StartActivationAsync(CancellationToken ct = default)
        {
            _polls = 0;
            return Task.FromResult(new ActivationPin { Code = "ABCD-1234", ExpiresAt = DateTimeOffset.Now.AddMinutes(10), PollInterval = TimeSpan.FromMilliseconds(10) });
        }

        public Task<UserSession?> PollActivationAsync(ActivationPin pin, CancellationToken ct = default)
        {
            if (++_polls < PollsBeforeSuccess) return Task.FromResult<UserSession?>(null);
            CurrentSession = new UserSession { UserId = "demo", DisplayName = "Demo viewer", AccessToken = "demo-token" };
            SessionChanged?.Invoke(this, EventArgs.Empty);
            return Task.FromResult<UserSession?>(CurrentSession);
        }

        public Task SignOutAsync(CancellationToken ct = default)
        {
            CurrentSession = null;
            SessionChanged?.Invoke(this, EventArgs.Empty);
            return Task.CompletedTask;
        }
    }
}
