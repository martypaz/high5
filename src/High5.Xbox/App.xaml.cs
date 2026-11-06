using High5.Core.Mock;
using High5.Core.Services;
using High5.Core.ViewModels;
using Windows.ApplicationModel.Activation;
using Windows.Foundation.Metadata;
using Windows.UI.Core;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace High5.Xbox
{
    sealed partial class App : Application
    {
        /// <summary>
        /// Composition root. Everything is mock data today. To go live, replace these with implementations of the
        /// same interfaces backed by RawUserServiceClient / the playback service (personal-use account only).
        /// </summary>
        public static class Services
        {
            public static readonly IClock Clock = new SystemClock();
            public static readonly IKeyValueStore Store = new AppKeyValueStore();
            public static readonly ParentalControl Parental = new ParentalControl(Store);
            public static readonly ICatalogueService Catalogue = new MockCatalogue();
            public static readonly ILiveService Live = new MockLiveService();
            public static readonly IAuthService Auth = new MockAuth();
            public static readonly IMyListService MyList = new MockMyList(Catalogue);
            public static readonly IResumeService Resume = new MockResume();
            public static readonly IPlaybackService Playback = new MockPlayback();
        }

        public App()
        {
            InitializeComponent();
            // Xbox: gamepad/remote only - never switch to the mouse-mode cursor.
            RequiresPointer = RequiresPointer.Never;
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            // Xbox: draw to the full TV and let our own layouts respect the title-safe area.
            if (ApiInformation.IsTypePresent("Windows.UI.ViewManagement.ApplicationViewScaling"))
                ApplicationViewScaling.TrySetDisableLayoutScaling(true);
            ApplicationView.GetForCurrentView().SetDesiredBoundsMode(ApplicationViewBoundsMode.UseCoreWindow);

            if (!(Window.Current.Content is Frame root))
            {
                root = new Frame();
                Window.Current.Content = root;
            }
            if (root.Content == null) root.Navigate(typeof(Views.MainPage), e.Arguments);
            Window.Current.Activate();
        }
    }
}
