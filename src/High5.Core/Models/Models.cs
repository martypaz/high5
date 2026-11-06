using System;
using System.Collections.Generic;

namespace High5.Core.Models
{
    public enum ContentKind { Show, Film }

    /// <summary>UK-style age ratings, ordered from least to most restrictive.</summary>
    public enum AgeRating { Universal = 0, PG = 1, Twelve = 2, Fifteen = 3, Eighteen = 4 }

    /// <summary>Lightweight card shown in rails, search results and My List.</summary>
    public sealed class ContentItem
    {
        public string Id { get; init; } = "";
        public string Title { get; init; } = "";
        public string? ImageUrl { get; init; }
        public ContentKind Kind { get; init; }
        public string Genre { get; init; } = "";
        public AgeRating Rating { get; init; }
    }

    public sealed class Episode
    {
        public string Id { get; init; } = "";
        public string ShowId { get; init; } = "";
        public string ShowTitle { get; init; } = "";
        public string Title { get; init; } = "";
        public int SeasonNumber { get; init; }
        public int EpisodeNumber { get; init; }
        public string Synopsis { get; init; } = "";
        public string? ImageUrl { get; init; }
        public TimeSpan Duration { get; init; }
        public AgeRating Rating { get; init; }
    }

    public sealed class Show
    {
        public string Id { get; init; } = "";
        public string Title { get; init; } = "";
        public string Synopsis { get; init; } = "";
        public string Genre { get; init; } = "";
        public string? ImageUrl { get; init; }
        public AgeRating Rating { get; init; }
        public IReadOnlyList<Episode> Episodes { get; init; } = Array.Empty<Episode>();
    }

    /// <summary>A horizontal row on the home / browse screens.</summary>
    public sealed class Rail
    {
        public string Id { get; init; } = "";
        public string Title { get; init; } = "";
        public IReadOnlyList<ContentItem> Items { get; init; } = Array.Empty<ContentItem>();
    }

    public sealed class Channel
    {
        public string Id { get; init; } = "";
        public string Name { get; init; } = "";
    }

    /// <summary>One programme slot on a live channel (TV guide / now-next).</summary>
    public sealed class Transmission
    {
        public string ChannelId { get; init; } = "";
        public string Title { get; init; } = "";
        public string Description { get; init; } = "";
        public DateTimeOffset Start { get; init; }
        public DateTimeOffset End { get; init; }
        public bool IsOn(DateTimeOffset now) => now >= Start && now < End;
    }

    public sealed class ResumePoint
    {
        public string EpisodeId { get; init; } = "";
        public string ShowId { get; init; } = "";
        public TimeSpan Position { get; init; }
        public TimeSpan Duration { get; init; }
        public DateTimeOffset UpdatedAt { get; init; }
        public double Progress => Duration.TotalSeconds <= 0 ? 0 : Math.Min(1, Position.TotalSeconds / Duration.TotalSeconds);
        /// <summary>Treat the last 5% as "watched" so finished episodes drop off Continue Watching.</summary>
        public bool IsFinished => Progress >= 0.95;
    }

    /// <summary>Device-code sign-in: show <see cref="Code"/> on the TV, user enters it on another device.</summary>
    public sealed class ActivationPin
    {
        public string Code { get; init; } = "";
        public DateTimeOffset ExpiresAt { get; init; }
        public TimeSpan PollInterval { get; init; } = TimeSpan.FromSeconds(3);
    }

    public sealed class UserSession
    {
        public string UserId { get; init; } = "";
        public string DisplayName { get; init; } = "";
        /// <summary>Held in memory only; never written to disk or logs.</summary>
        public string AccessToken { get; init; } = "";
    }

    public enum DrmScheme { None, PlayReady }

    public sealed class PlaybackInfo
    {
        public Uri ManifestUri { get; init; } = new Uri("about:blank");
        public DrmScheme Drm { get; init; }
        public Uri? LicenceUri { get; init; }
        public string Title { get; init; } = "";
        public bool IsLive { get; init; }
    }
}
