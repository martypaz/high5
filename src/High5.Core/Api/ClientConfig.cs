using System;

namespace High5.Core.Api
{
    /// <summary>
    /// Values the live services need that are deliberately NOT in this repository: the user-service host
    /// (delivered by the official app's remote config) and the `platform` string the service expects.
    /// Load them from a local, untracked file (see docs/Martin Instructions.md) - never commit them.
    /// </summary>
    public sealed class ClientConfig
    {
        public Uri UserServiceBase { get; }
        public string Platform { get; }
        public TimeSpan PinLifetime { get; }

        public ClientConfig(Uri userServiceBase, string platform, TimeSpan? pinLifetime = null)
        {
            if (userServiceBase is null) throw new ArgumentNullException(nameof(userServiceBase));
            if (string.IsNullOrWhiteSpace(platform)) throw new ArgumentException("Platform is required.", nameof(platform));
            UserServiceBase = userServiceBase; Platform = platform;
            PinLifetime = pinLifetime ?? TimeSpan.FromMinutes(10);   // lifetime is not exposed by the API; assumed
        }

        /// <summary>Parses a small JSON document: {"userServiceBase":"https://...","platform":"..."}.</summary>
        public static ClientConfig FromJson(string json)
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            return new ClientConfig(new Uri(root.GetProperty("userServiceBase").GetString()!), root.GetProperty("platform").GetString()!);
        }
    }
}
