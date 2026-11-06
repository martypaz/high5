using High5.Core.Services;
using Windows.Storage;

namespace High5.Xbox
{
    /// <summary>Settings backed by ApplicationData.LocalSettings (the PIN is stored hashed by ParentalControl).</summary>
    public sealed class AppKeyValueStore : IKeyValueStore
    {
        private static ApplicationDataContainer S => ApplicationData.Current.LocalSettings;
        public string Get(string key) => S.Values.TryGetValue(key, out var v) ? v as string : null;
        public void Set(string key, string value) { if (value == null) S.Values.Remove(key); else S.Values[key] = value; }
    }
}
