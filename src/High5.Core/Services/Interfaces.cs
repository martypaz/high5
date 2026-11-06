using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using High5.Core.Models;

namespace High5.Core.Services
{
    public interface ICatalogueService
    {
        Task<IReadOnlyList<Rail>> GetHomeRailsAsync(CancellationToken ct = default);
        Task<IReadOnlyList<string>> GetGenresAsync(CancellationToken ct = default);
        Task<IReadOnlyList<ContentItem>> GetByGenreAsync(string genre, CancellationToken ct = default);
        Task<Show?> GetShowAsync(string showId, CancellationToken ct = default);
        Task<Episode?> GetEpisodeAsync(string episodeId, CancellationToken ct = default);
        Task<IReadOnlyList<ContentItem>> SearchAsync(string query, CancellationToken ct = default);
    }

    public interface ILiveService
    {
        Task<IReadOnlyList<Channel>> GetChannelsAsync(CancellationToken ct = default);
        Task<IReadOnlyList<Transmission>> GetGuideAsync(string channelId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct = default);
    }

    public interface IAuthService
    {
        UserSession? CurrentSession { get; }
        event EventHandler? SessionChanged;
        Task<ActivationPin> StartActivationAsync(CancellationToken ct = default);
        /// <returns>The session once the user has entered the code, or null while still pending.</returns>
        Task<UserSession?> PollActivationAsync(ActivationPin pin, CancellationToken ct = default);
        Task SignOutAsync(CancellationToken ct = default);
    }

    /// <summary>"My List" (favourites).</summary>
    public interface IMyListService
    {
        Task<IReadOnlyList<ContentItem>> GetAsync(CancellationToken ct = default);
        Task<bool> ContainsAsync(string showId, CancellationToken ct = default);
        Task AddAsync(string showId, CancellationToken ct = default);
        Task RemoveAsync(string showId, CancellationToken ct = default);
    }

    public interface IResumeService
    {
        Task<IReadOnlyList<ResumePoint>> GetAllAsync(CancellationToken ct = default);
        Task<ResumePoint?> GetAsync(string episodeId, CancellationToken ct = default);
        Task SaveAsync(ResumePoint point, CancellationToken ct = default);
    }

    public interface IPlaybackService
    {
        Task<PlaybackInfo> GetEpisodePlaybackAsync(string episodeId, CancellationToken ct = default);
        Task<PlaybackInfo> GetLivePlaybackAsync(string channelId, CancellationToken ct = default);
    }

    /// <summary>Small persistence seam; the UWP app backs it with ApplicationData settings.</summary>
    public interface IKeyValueStore
    {
        string? Get(string key);
        void Set(string key, string? value);
    }

    public interface IClock
    {
        DateTimeOffset Now { get; }
    }

    public sealed class SystemClock : IClock
    {
        public DateTimeOffset Now => DateTimeOffset.Now;
    }
}
