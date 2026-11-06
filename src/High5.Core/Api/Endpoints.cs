using System;

namespace High5.Core.Api
{
    /// <summary>
    /// Relative paths found in My5 for Android 7.26.6 (see docs/analysis). The host is NOT hard-coded in the
    /// app - it is delivered by remote config - so it is supplied by the caller.
    /// Request/response bodies are not yet verified.
    /// </summary>
    public static class UserServiceEndpoints
    {
        public static string ActivationPin(string pin) => $"activationPins/{Uri.EscapeDataString(pin)}";
        public static string ActivationPinPoll(string pin) => $"activationPins/{Uri.EscapeDataString(pin)}/poll";
        public const string FavouritesSync = "favourites/sync";
        public static string Favourite(string showId) => $"favourites/{Uri.EscapeDataString(showId)}";
        public const string ResumePointsSync = "resumePoints/sync";
        public static string ResumePoint(string watchableId) => $"resumePoints/{Uri.EscapeDataString(watchableId)}";
        public static string ResumePointsForShow(string showId) => $"resumePoints/show/{Uri.EscapeDataString(showId)}";
        public static string SearchHistory(string showId) => $"searchHistory/{Uri.EscapeDataString(showId)}";
        public const string RecommendationsReset = "recommendations/reset";
    }
}
