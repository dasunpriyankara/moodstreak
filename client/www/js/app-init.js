// Must load BEFORE jQuery Mobile so we can configure it.
$(document).on('mobileinit', function () {
  $.mobile.defaultPageTransition = 'fade';
  $.mobile.hashListeningEnabled = true;
  $.mobile.pushStateEnabled = false;   // required for file:// / Cordova
  $.mobile.ajaxEnabled = false;        // single-file app, no page fetching
  $.mobile.page.prototype.options.domCache = true;
});
