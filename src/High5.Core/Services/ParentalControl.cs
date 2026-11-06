using System;
using System.Security.Cryptography;
using System.Text;
using High5.Core.Models;

namespace High5.Core.Services
{
    /// <summary>
    /// Local parental PIN + maximum age rating, mirroring the app's ParentalPin feature.
    /// The PIN is stored only as a salted SHA-256 hash.
    /// </summary>
    public sealed class ParentalControl
    {
        private const string HashKey = "parental.pinHash";
        private const string SaltKey = "parental.pinSalt";
        private const string MaxKey = "parental.maxRating";
        private readonly IKeyValueStore _store;

        public ParentalControl(IKeyValueStore store) { _store = store; }

        public bool HasPin => !string.IsNullOrEmpty(_store.Get(HashKey));

        public AgeRating MaxRating
        {
            get => Enum.TryParse<AgeRating>(_store.Get(MaxKey), out var r) ? r : AgeRating.Eighteen;
        }

        public void SetPin(string pin)
        {
            if (pin is null || pin.Length != 4 || !pin.All(char.IsDigit))
                throw new ArgumentException("PIN must be exactly 4 digits.", nameof(pin));
            var salt = Convert.ToBase64String(RandomBytes(16));
            _store.Set(SaltKey, salt);
            _store.Set(HashKey, Hash(pin, salt));
        }

        public bool Verify(string pin)
        {
            var salt = _store.Get(SaltKey);
            var hash = _store.Get(HashKey);
            if (salt is null || hash is null || pin is null) return false;
            return ConstantTimeEquals(Hash(pin, salt), hash);
        }

        public void ClearPin() { _store.Set(HashKey, null); _store.Set(SaltKey, null); }

        public bool SetMaxRating(AgeRating rating, string pin)
        {
            if (HasPin && !Verify(pin)) return false;
            _store.Set(MaxKey, rating.ToString());
            return true;
        }

        public bool IsAllowed(AgeRating rating) => rating <= MaxRating;

        private static string Hash(string pin, string salt)
        {
            using var sha = SHA256.Create();
            return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(salt + ":" + pin)));
        }

        private static byte[] RandomBytes(int n)
        {
            var b = new byte[n];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(b);
            return b;
        }

        private static bool ConstantTimeEquals(string a, string b)
        {
            if (a.Length != b.Length) return false;
            var diff = 0;
            for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }
    }

    internal static class StringExt
    {
        public static bool All(this string s, Func<char, bool> p) { foreach (var c in s) if (!p(c)) return false; return true; }
    }
}
