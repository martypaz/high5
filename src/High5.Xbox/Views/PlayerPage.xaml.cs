using System;
using System.Threading.Tasks;
using High5.Core.Models;
using High5.Core.ViewModels;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Media.Protection;
using Windows.Media.Protection.PlayReady;
using Windows.Media.Streaming.Adaptive;
using Windows.UI.Core;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace High5.Xbox.Views
{
    /// <summary>Navigate with an episode id, or "live:&lt;channelId&gt;" for a live channel.</summary>
    public sealed partial class PlayerPage : Page
    {
        // PlayReady system id (well-known GUID).
        private const string PlayReadyId = "{F4637010-03C3-42CD-B932-B48ADF3A6A54}";
        private readonly PlayerViewModel _vm = new PlayerViewModel(App.Services.Playback, App.Services.Resume, App.Services.Clock);
        private readonly DispatcherTimer _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        private MediaPlayer _mp;

        public PlayerPage()
        {
            InitializeComponent();
            _timer.Tick += async (s, e) => await SaveAsync(false);
        }

        protected override async void OnNavigatedTo(NavigationEventArgs e)
        {
            var id = (string)e.Parameter;
            try
            {
                if (id.StartsWith("live:")) await _vm.LoadLiveAsync(id.Substring(5));
                else
                {
                    var ep = await App.Services.Catalogue.GetEpisodeAsync(id) ?? throw new InvalidOperationException("Episode not found.");
                    await _vm.LoadAsync(ep);
                }
                if (_vm.Error != null) { Fail(_vm.Error); return; }
                await OpenAsync(_vm.Playback);
            }
            catch (Exception ex) { Fail(ex.Message); }
        }

        protected override async void OnNavigatedFrom(NavigationEventArgs e)
        {
            _timer.Stop();
            await SaveAsync(true);                // always store the final position
            _mp?.Dispose(); _mp = null;
        }

        private async Task OpenAsync(PlaybackInfo info)
        {
            var result = await AdaptiveMediaSource.CreateFromUriAsync(info.ManifestUri);   // HLS or DASH
            if (result.Status != AdaptiveMediaSourceCreationStatus.Success) { Fail("Could not open the stream (" + result.Status + ")."); return; }

            _mp = new MediaPlayer { AutoPlay = true };
            if (info.Drm == DrmScheme.PlayReady && info.LicenceUri != null) AttachPlayReady(_mp, info.LicenceUri);

            _mp.Source = MediaSource.CreateFromAdaptiveMediaSource(result.MediaSource);
            _mp.MediaOpened += async (s, a) => await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () =>
            {
                Spinner.IsActive = false;
                if (_vm.StartAt > TimeSpan.Zero) _mp.PlaybackSession.Position = _vm.StartAt;   // resume
                _timer.Start();
            });
            _mp.MediaFailed += async (s, a) => await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () => Fail(a.ErrorMessage));
            Player.SetMediaPlayer(_mp);
        }

        /// <summary>
        /// PlayReady wiring for protected streams. The licence URL comes from the playback service; this app does
        /// not try to work around DRM, regional or device restrictions.
        /// </summary>
        private static void AttachPlayReady(MediaPlayer mp, Uri licence)
        {
            var mpm = new MediaProtectionManager();
            mpm.Properties["Windows.Media.Protection.MediaProtectionSystemId"] = PlayReadyId;
            mpm.ComponentLoadFailed += (s, e) => e.Completion.Complete(false);
            mpm.ServiceRequested += async (s, e) =>
            {
                if (e.Request is PlayReadyLicenseAcquisitionServiceRequest req)
                {
                    req.Uri = licence;
                    try { await req.BeginServiceRequest(); e.Completion.Complete(true); }
                    catch { e.Completion.Complete(false); }
                }
                else e.Completion.Complete(false);
            };
            mp.ProtectionManager = mpm;
        }

        private async Task SaveAsync(bool force)
        {
            var session = _mp?.PlaybackSession;
            if (session == null) return;
            await _vm.ReportPositionAsync(session.Position, session.NaturalDuration, force);
        }

        private void Fail(string message) { Spinner.IsActive = false; ErrorText.Text = message; }
    }
}
