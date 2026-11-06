using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace High5.Core.Api
{
    // Field names are taken from the user-service model classes in My5 for Android 7.26.6.
    // Types of timestamps (`updatedAt`) are Kotlin Long - assumed epoch milliseconds (unverified).

    public sealed class ActivationPinDto
    {
        [JsonPropertyName("pin")] public string Pin { get; set; } = "";
        [JsonPropertyName("pinSecret")] public string PinSecret { get; set; } = "";
        [JsonPropertyName("qrCode")] public string? QrCode { get; set; }
    }

    public sealed class UserSessionDto
    {
        [JsonPropertyName("sessionToken")] public string SessionToken { get; set; } = "";
        [JsonPropertyName("isRegistration")] public bool IsRegistration { get; set; }
    }

    public sealed class PutFavouriteRequest
    {
        [JsonPropertyName("platform")] public string Platform { get; set; } = "";
        [JsonPropertyName("showId")] public string ShowId { get; set; } = "";
        [JsonPropertyName("showTitle")] public string ShowTitle { get; set; } = "";
    }

    public sealed class MyListResponseDto
    {
        [JsonPropertyName("content")] public List<MyListItemDto> Content { get; set; } = new List<MyListItemDto>();
        [JsonPropertyName("contentType")] public string? ContentType { get; set; }
        [JsonPropertyName("totalItems")] public int TotalItems { get; set; }
    }

    public sealed class MyListItemDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("title")] public string Title { get; set; } = "";
        [JsonPropertyName("genre")] public string? Genre { get; set; }
        [JsonPropertyName("type")] public string? Type { get; set; }
        [JsonPropertyName("channel")] public string? Channel { get; set; }
        [JsonPropertyName("shortDescription")] public string? ShortDescription { get; set; }
    }

    public sealed class ResumePointDto
    {
        [JsonPropertyName("watchableId")] public string WatchableId { get; set; } = "";
        [JsonPropertyName("resumeTimeInSeconds")] public double ResumeTimeInSeconds { get; set; }
        [JsonPropertyName("durationInSeconds")] public double DurationInSeconds { get; set; }
        [JsonPropertyName("platform")] public string? Platform { get; set; }
        [JsonPropertyName("updatedAt")] public long UpdatedAt { get; set; }
    }

    public sealed class ResumePointRequest
    {
        [JsonPropertyName("platform")] public string Platform { get; set; } = "";
        [JsonPropertyName("resumeTimeInSeconds")] public double ResumeTimeInSeconds { get; set; }
        [JsonPropertyName("durationInSeconds")] public double DurationInSeconds { get; set; }
    }

    /// <summary>Response of GET /resumePoints (field `watchables`).</summary>
    public sealed class ResumePointResponseDto
    {
        [JsonPropertyName("watchables")] public List<ResumePointDto> Watchables { get; set; } = new List<ResumePointDto>();
    }
}
