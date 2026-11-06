using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using High5.Core.Api;
using High5.Core.Models;

namespace High5.Core.Services
{
    internal static class Json
    {
        public static readonly JsonSerializerOptions Options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        public static T Read<T>(string body) where T : new() =>
            string.IsNullOrWhiteSpace(body) ? new T() : (JsonSerializer.Deserialize<T>(body, Options) ?? new T());
        public static string Write<T>(T value) => JsonSerializer.Serialize(value, Options);
    }

    /// <summary>
    /// Device-code sign-in against the user service: POST activationPins -> show `pin`; the user activates it on another
    /// device; we poll GET activationPins/{pin}/poll with the pin secret until a session token is returned.
    /// Pending detection (HTTP 202/204/404/401 = not yet) is an assumption and is covered by tests, not by the real service.
    /// </summary>
    public sealed class LiveAuthService : IAuthService
    {
        private readonly RawUserServiceClient _http; private readonly ClientConfig _cfg; private readonly IClock _clock;
        private readonly Dictionary<string, string> _secrets = new Dictionary<string, string>();
        public UserSession? CurrentSession { get; private set; }
        public event EventHandler? SessionChanged;

        public LiveAuthService(RawUserServiceClient http, ClientConfig cfg, IClock? clock = null)
        { _http = http; _cfg = cfg; _clock = clock ?? new SystemClock(); }

        public async Task<ActivationPin> StartActivationAsync(CancellationToken ct = default)
        {
            var r = await _http.SendRawAsync(HttpMethod.Post, UserServiceEndpoints.CreateActivationPin, null, null, ct).ConfigureAwait(false);
            if (!r.IsSuccess) throw new HttpRequestException($"Could not start sign-in ({(int)r.Status}).");
            var dto = Json.Read<ActivationPinDto>(r.Body);
            if (string.IsNullOrEmpty(dto.Pin) || string.IsNullOrEmpty(dto.PinSecret)) throw new InvalidOperationException("Unexpected sign-in response.");
            _secrets[dto.Pin] = dto.PinSecret;
            return new ActivationPin { Code = dto.Pin, ExpiresAt = _clock.Now + _cfg.PinLifetime, PollInterval = TimeSpan.FromSeconds(3) };
        }

        public async Task<UserSession?> PollActivationAsync(ActivationPin pin, CancellationToken ct = default)
        {
            if (!_secrets.TryGetValue(pin.Code, out var secret)) throw new InvalidOperationException("Unknown activation code.");
            var r = await _http.SendRawAsync(HttpMethod.Get, UserServiceEndpoints.ActivationPinPoll(pin.Code), null, secret, ct).ConfigureAwait(false);
            if (r.IsSuccess && r.Status != HttpStatusCode.NoContent && r.Status != HttpStatusCode.Accepted)
            {
                var dto = Json.Read<UserSessionDto>(r.Body);
                if (!string.IsNullOrEmpty(dto.SessionToken))
                {
                    _secrets.Remove(pin.Code);
                    CurrentSession = new UserSession { UserId = "", DisplayName = "My5 account", AccessToken = dto.SessionToken };
                    SessionChanged?.Invoke(this, EventArgs.Empty);
                    return CurrentSession;
                }
                return null;
            }
            if (r.Status == HttpStatusCode.Accepted || r.Status == HttpStatusCode.NoContent || r.Status == HttpStatusCode.NotFound || r.Status == HttpStatusCode.Unauthorized) return null;
            throw new HttpRequestException($"Sign-in poll failed ({(int)r.Status}).");
        }

        public Task SignOutAsync(CancellationToken ct = default)
        {
            CurrentSession = null; SessionChanged?.Invoke(this, EventArgs.Empty);
            return Task.CompletedTask;
        }
    }

    public sealed class LiveMyList : IMyListService
    {
        private readonly RawUserServiceClient _http; private readonly ClientConfig _cfg; private readonly ICatalogueService? _catalogue;
        public LiveMyList(RawUserServiceClient http, ClientConfig cfg, ICatalogueService? catalogue = null) { _http = http; _cfg = cfg; _catalogue = catalogue; }

        public async Task<IReadOnlyList<ContentItem>> GetAsync(CancellationToken ct = default)
        {
            var body = await _http.GetAsync(UserServiceEndpoints.MyListCollection(_cfg.Platform, false), ct).ConfigureAwait(false);
            return Json.Read<MyListResponseDto>(body).Content.Select(i => new ContentItem
            {
                Id = i.Id, Title = i.Title, Genre = i.Genre ?? "",
                Kind = string.Equals(i.Type, "film", StringComparison.OrdinalIgnoreCase) ? ContentKind.Film : ContentKind.Show,
                Rating = AgeRating.Eighteen   // the API gives no rating: fail closed so parental limits never leak titles
            }).ToList();
        }

        public async Task<bool> ContainsAsync(string showId, CancellationToken ct = default)
        {
            var r = await _http.SendRawAsync(HttpMethod.Get, UserServiceEndpoints.Favourite(showId), null, null, ct).ConfigureAwait(false);
            if (r.Status == HttpStatusCode.NotFound) return false;
            if (!r.IsSuccess) throw new HttpRequestException($"My List lookup failed ({(int)r.Status}).");
            return true;
        }

        public async Task AddAsync(string showId, CancellationToken ct = default)
        {
            var title = showId;
            if (_catalogue != null) title = (await _catalogue.GetShowAsync(showId, ct).ConfigureAwait(false))?.Title ?? showId;
            await _http.PutAsync(UserServiceEndpoints.Favourite(showId),
                Json.Write(new PutFavouriteRequest { Platform = _cfg.Platform, ShowId = showId, ShowTitle = title }), ct).ConfigureAwait(false);
        }

        public Task RemoveAsync(string showId, CancellationToken ct = default) => _http.DeleteAsync(UserServiceEndpoints.Favourite(showId), ct);
    }

    public sealed class LiveResume : IResumeService
    {
        private readonly RawUserServiceClient _http; private readonly ClientConfig _cfg;
        public LiveResume(RawUserServiceClient http, ClientConfig cfg) { _http = http; _cfg = cfg; }

        private static ResumePoint Map(ResumePointDto d, string showId = "") => new ResumePoint
        {
            EpisodeId = d.WatchableId, ShowId = showId,
            Position = TimeSpan.FromSeconds(d.ResumeTimeInSeconds), Duration = TimeSpan.FromSeconds(d.DurationInSeconds),
            UpdatedAt = DateTimeOffset.FromUnixTimeMilliseconds(d.UpdatedAt)
        };

        public async Task<IReadOnlyList<ResumePoint>> GetAllAsync(CancellationToken ct = default)
        {
            var body = await _http.GetAsync(UserServiceEndpoints.ResumePointsAll, ct).ConfigureAwait(false);
            return Json.Read<ResumePointResponseDto>(body).Watchables.Select(d => Map(d)).OrderByDescending(r => r.UpdatedAt).ToList();
        }

        public async Task<ResumePoint?> GetAsync(string episodeId, CancellationToken ct = default)
        {
            var r = await _http.SendRawAsync(HttpMethod.Get, UserServiceEndpoints.ResumePoint(episodeId), null, null, ct).ConfigureAwait(false);
            if (r.Status == HttpStatusCode.NotFound) return null;
            if (!r.IsSuccess) throw new HttpRequestException($"Resume lookup failed ({(int)r.Status}).");
            var dto = Json.Read<ResumePointDto>(r.Body);
            return string.IsNullOrEmpty(dto.WatchableId) ? null : Map(dto);
        }

        public async Task<IReadOnlyList<ResumePoint>> GetForShowAsync(string showId, CancellationToken ct = default)
        {
            var body = await _http.GetAsync(UserServiceEndpoints.ResumePointsForShow(showId), ct).ConfigureAwait(false);
            // The response shape for this call is not confirmed; accept either {watchables:[...]} or a bare array.
            var list = body.TrimStart().StartsWith("[")
                ? Json.Read<List<ResumePointDto>>(body)
                : Json.Read<ResumePointResponseDto>(body).Watchables;
            return list.Select(d => Map(d, showId)).OrderByDescending(r => r.UpdatedAt).ToList();
        }

        public Task SaveAsync(ResumePoint point, CancellationToken ct = default) =>
            _http.PutAsync(UserServiceEndpoints.ResumePoint(point.EpisodeId), Json.Write(new ResumePointRequest
            {
                Platform = _cfg.Platform, ResumeTimeInSeconds = point.Position.TotalSeconds, DurationInSeconds = point.Duration.TotalSeconds
            }), ct);
    }
}
