using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using High5.Core.Models;
using High5.Core.Services;

namespace High5.Core.ViewModels
{
    /// <summary>Home: "Continue watching" (from resume points) followed by the catalogue rails.</summary>
    public sealed class HomeViewModel : ScreenViewModel
    {
        private readonly ICatalogueService _cat; private readonly IResumeService _resume; private readonly ParentalControl _parental;
        public ObservableCollection<Rail> Rails { get; } = new ObservableCollection<Rail>();
        public ObservableCollection<ResumeCard> ContinueWatching { get; } = new ObservableCollection<ResumeCard>();

        public HomeViewModel(ICatalogueService cat, IResumeService resume, ParentalControl parental)
        { _cat = cat; _resume = resume; _parental = parental; }

        public Task LoadAsync(CancellationToken ct = default) => RunAsync(async () =>
        {
            var rails = await _cat.GetHomeRailsAsync(ct);
            Rails.Clear();
            foreach (var r in rails)
            {
                var items = r.Items.Where(i => _parental.IsAllowed(i.Rating)).ToList();
                if (items.Count > 0) Rails.Add(new Rail { Id = r.Id, Title = r.Title, Items = items });
            }
            ContinueWatching.Clear();
            foreach (var rp in (await _resume.GetAllAsync(ct)).Where(r => !r.IsFinished))
            {
                var ep = await _cat.GetEpisodeAsync(rp.EpisodeId, ct);
                if (ep != null && _parental.IsAllowed(ep.Rating)) ContinueWatching.Add(new ResumeCard(ep, rp));
            }
        });
    }

    public sealed class ResumeCard
    {
        public ResumeCard(Episode episode, ResumePoint point) { Episode = episode; Point = point; }
        public Episode Episode { get; }
        public ResumePoint Point { get; }
        public string Caption => $"{Episode.ShowTitle} - S{Episode.SeasonNumber}:E{Episode.EpisodeNumber}";
    }

    public sealed class ShowDetailViewModel : ScreenViewModel
    {
        private readonly ICatalogueService _cat; private readonly IMyListService _list; private readonly IResumeService _resume;
        private Show? _show; private bool _inList; private int _season = 1;
        public Show? Show { get => _show; private set => Set(ref _show, value); }
        public bool InMyList { get => _inList; private set => Set(ref _inList, value); }
        public IReadOnlyList<int> Seasons => Show?.Episodes.Select(e => e.SeasonNumber).Distinct().OrderBy(x => x).ToList() ?? new List<int>();
        public int SelectedSeason { get => _season; set { if (Set(ref _season, value)) Raise(nameof(Episodes)); } }
        public IReadOnlyList<Episode> Episodes => Show?.Episodes.Where(e => e.SeasonNumber == SelectedSeason).OrderBy(e => e.EpisodeNumber).ToList() ?? new List<Episode>();
        /// <summary>Episode the primary button should play: first unfinished with progress, else the first episode.</summary>
        public Episode? NextToWatch { get; private set; }
        public AsyncCommand ToggleMyList { get; }

        public ShowDetailViewModel(ICatalogueService cat, IMyListService list, IResumeService resume)
        {
            _cat = cat; _list = list; _resume = resume;
            ToggleMyList = new AsyncCommand(async () =>
            {
                if (Show is null) return;
                if (InMyList) await _list.RemoveAsync(Show.Id); else await _list.AddAsync(Show.Id);
                InMyList = !InMyList;
            });
        }

        public Task LoadAsync(string showId, CancellationToken ct = default) => RunAsync(async () =>
        {
            Show = await _cat.GetShowAsync(showId, ct) ?? throw new InvalidOperationException("Show not found.");
            InMyList = await _list.ContainsAsync(showId, ct);
            var points = (await _resume.GetForShowAsync(showId, ct)).Where(r => !r.IsFinished).OrderByDescending(r => r.UpdatedAt).ToList();
            var resumeEp = points.Count > 0 ? Show.Episodes.FirstOrDefault(e => e.Id == points[0].EpisodeId) : null;
            NextToWatch = resumeEp ?? Show.Episodes.OrderBy(e => e.SeasonNumber).ThenBy(e => e.EpisodeNumber).FirstOrDefault();
            SelectedSeason = Seasons.FirstOrDefault(s => s == (NextToWatch?.SeasonNumber ?? 1));
            Raise(nameof(Seasons)); Raise(nameof(Episodes)); Raise(nameof(NextToWatch));
        });
    }

    /// <summary>Search with last-request-wins so slow earlier responses never overwrite newer ones.</summary>
    public sealed class SearchViewModel : ScreenViewModel
    {
        private readonly ICatalogueService _cat; private readonly ParentalControl _parental;
        private CancellationTokenSource? _cts; private string _query = "";
        public ObservableCollection<ContentItem> Results { get; } = new ObservableCollection<ContentItem>();
        public string Query { get => _query; private set => Set(ref _query, value); }
        public SearchViewModel(ICatalogueService cat, ParentalControl parental) { _cat = cat; _parental = parental; }

        public async Task SearchAsync(string query)
        {
            _cts?.Cancel();
            var cts = _cts = new CancellationTokenSource();
            Query = query ?? "";
            if (Query.Trim().Length == 0) { Results.Clear(); return; }
            await RunAsync(async () =>
            {
                var found = await _cat.SearchAsync(Query, cts.Token);
                if (cts.IsCancellationRequested) return;
                Results.Clear();
                foreach (var i in found.Where(i => _parental.IsAllowed(i.Rating))) Results.Add(i);
            });
        }
    }

    public sealed class MyListViewModel : ScreenViewModel
    {
        private readonly IMyListService _list; private readonly ParentalControl _parental;
        public ObservableCollection<ContentItem> Items { get; } = new ObservableCollection<ContentItem>();
        public MyListViewModel(IMyListService list, ParentalControl parental) { _list = list; _parental = parental; }
        public Task LoadAsync(CancellationToken ct = default) => RunAsync(async () =>
        {
            Items.Clear();
            foreach (var i in (await _list.GetAsync(ct)).Where(i => _parental.IsAllowed(i.Rating))) Items.Add(i);
        });
    }

    public sealed class GuideRow
    {
        public Channel Channel { get; set; } = new Channel();
        public IReadOnlyList<Transmission> Slots { get; set; } = new List<Transmission>();
        public Transmission? OnNow { get; set; }
        public Transmission? Next { get; set; }
    }

    public sealed class TvGuideViewModel : ScreenViewModel
    {
        private readonly ILiveService _live; private readonly IClock _clock;
        public ObservableCollection<GuideRow> Rows { get; } = new ObservableCollection<GuideRow>();
        public TvGuideViewModel(ILiveService live, IClock clock) { _live = live; _clock = clock; }

        public Task LoadAsync(TimeSpan window, CancellationToken ct = default) => RunAsync(async () =>
        {
            var now = _clock.Now;
            Rows.Clear();
            foreach (var ch in await _live.GetChannelsAsync(ct))
            {
                var slots = (await _live.GetGuideAsync(ch.Id, now, now + window, ct)).OrderBy(s => s.Start).ToList();
                var on = slots.FirstOrDefault(s => s.IsOn(now));
                Rows.Add(new GuideRow { Channel = ch, Slots = slots, OnNow = on, Next = slots.FirstOrDefault(s => s.Start > now) });
            }
        });
    }

    /// <summary>Drives the device-code sign-in screen: show a code, poll until the user enters it.</summary>
    public sealed class SignInViewModel : ScreenViewModel
    {
        private readonly IAuthService _auth;
        private string _code = ""; private bool _signedIn; private bool _expired;
        public string Code { get => _code; private set => Set(ref _code, value); }
        public bool IsSignedIn { get => _signedIn; private set => Set(ref _signedIn, value); }
        public bool IsExpired { get => _expired; private set => Set(ref _expired, value); }
        public SignInViewModel(IAuthService auth) { _auth = auth; }

        public async Task RunAsync(CancellationToken ct, IClock? clock = null)
        {
            clock ??= new SystemClock();
            IsExpired = false; IsSignedIn = false;
            ActivationPin pin;
            try { pin = await _auth.StartActivationAsync(ct); Code = pin.Code; }
            catch (Exception ex) when (!(ex is OperationCanceledException)) { Error = ex.Message; return; }
            while (!ct.IsCancellationRequested)
            {
                if (clock.Now >= pin.ExpiresAt) { IsExpired = true; return; }
                try
                {
                    var session = await _auth.PollActivationAsync(pin, ct);
                    if (session != null) { IsSignedIn = true; return; }
                    await Task.Delay(pin.PollInterval, ct);
                }
                catch (OperationCanceledException) { return; }
                catch (Exception ex) { Error = ex.Message; return; }
            }
        }
    }

    /// <summary>Resume-position bookkeeping for the player; the UI feeds it position ticks.</summary>
    public sealed class PlayerViewModel : ScreenViewModel
    {
        private readonly IPlaybackService _play; private readonly IResumeService _resume; private readonly IClock _clock;
        private readonly TimeSpan _saveEvery;
        private DateTimeOffset _lastSave = DateTimeOffset.MinValue;
        public PlaybackInfo? Playback { get; private set; }
        public Episode? Episode { get; private set; }
        public TimeSpan StartAt { get; private set; }

        public PlayerViewModel(IPlaybackService play, IResumeService resume, IClock clock, TimeSpan? saveEvery = null)
        { _play = play; _resume = resume; _clock = clock; _saveEvery = saveEvery ?? TimeSpan.FromSeconds(15); }

        public Task LoadAsync(Episode episode, CancellationToken ct = default) => RunAsync(async () =>
        {
            Episode = episode;
            Playback = await _play.GetEpisodePlaybackAsync(episode.Id, ct);
            var rp = await _resume.GetAsync(episode.Id, ct);
            StartAt = rp != null && !rp.IsFinished ? rp.Position : TimeSpan.Zero;
            Raise(nameof(Playback)); Raise(nameof(StartAt));
        });

        public Task LoadLiveAsync(string channelId, CancellationToken ct = default) => RunAsync(async () =>
        {
            Episode = null; StartAt = TimeSpan.Zero;
            Playback = await _play.GetLivePlaybackAsync(channelId, ct);
            Raise(nameof(Playback)); Raise(nameof(StartAt));
        });

        /// <summary>Call from the media position timer. Saves at most once per interval unless <paramref name="force"/>.</summary>
        public async Task ReportPositionAsync(TimeSpan position, TimeSpan duration, bool force = false, CancellationToken ct = default)
        {
            if (Episode is null || Playback is null || Playback.IsLive) return; // live streams have no resume point
            var now = _clock.Now;
            if (!force && now - _lastSave < _saveEvery) return;
            _lastSave = now;
            await _resume.SaveAsync(new ResumePoint { EpisodeId = Episode.Id, ShowId = Episode.ShowId, Position = position, Duration = duration, UpdatedAt = now }, ct);
        }
    }
}
