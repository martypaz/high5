using System;

namespace High5.Core.Api
{
    /// <summary>
    /// Relative paths found in My5 for Android 7.26.6 (see docs/analysis). The host is NOT hard-coded in the
    /// app - it is delivered by remote config - so it is supplied by the caller.
    /// Request/response bodies are not yet verified.
    /// </summary>
    /// <summary>
    /// Verified against the Retrofit interfaces in My5 for Android 7.26.6 (verbs inferred from the obfuscated
    /// annotation letters: b=DELETE f=GET n=PATCH o=POST p=PUT). Host is supplied by remote config.
    /// Note the app's `MyListApi` and `ResumePointsApi` use leading-slash paths (host-absolute).
    /// </summary>
    public static class UserServiceEndpoints
    {
        // Device-code sign-in
        public const string CreateActivationPin = "activationPins";                                        // POST   -> ActivationPinDto
        public static string ActivationPinPoll(string pin, bool longPoll = false) =>
            $"activationPins/{Uri.EscapeDataString(pin)}/poll?longPoll={(longPoll ? "true" : "false")}";  // GET (Bearer pinSecret) -> UserSessionDto
        public static string ActivationPin(string pin) => $"activationPins/{Uri.EscapeDataString(pin)}";   // PATCH (Bearer session) - activate from another device

        // Favourites / My List
        public const string Favourites = "favourites";                                                      // DELETE (all)
        public const string FavouritesSync = "favourites/sync";                                             // POST list<SyncFavouritesItem>
        public static string Favourite(string showId) => $"favourites/{Uri.EscapeDataString(showId)}";      // GET / PUT / DELETE
        public static string MyListCollection(string platform, bool milkshake) =>
            $"/collections/mylist.json?platform={Uri.EscapeDataString(platform)}&milkshake={(milkshake ? "true" : "false")}"; // GET -> MyListResponseDto

        // Resume points
        public const string ResumePointsAll = "/resumePoints?limit=250";                                    // GET -> ResumePointResponseDto
        public const string ResumePointsSync = "/resumePoints/sync";                                        // PUT
        public const string ResumePointsDeleteAll = "/resumePoints";                                        // DELETE
        public static string ResumePoint(string watchableId) => $"/resumePoints/{Uri.EscapeDataString(watchableId)}";   // GET / PUT
        public static string ResumePointsForShow(string showId) => $"/resumePoints/show/{Uri.EscapeDataString(showId)}"; // GET

        // Misc
        public const string ParentalPin = "parentalPin";                                                    // GET / PUT / DELETE
        public const string ValidateCognitoToken = "user/validateCognitoToken";                             // POST (sign-in with an AWS Cognito token)
        public static string SearchHistory(string showId) => $"searchHistory/{Uri.EscapeDataString(showId)}";
        public const string RecommendationsReset = "recommendations/reset";
    }
}
