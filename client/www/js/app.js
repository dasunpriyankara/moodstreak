(function ($) {
  'use strict';

  var EMOJIS = ['✅', '💧', '🏃', '🧘', '📖', '😴', '🥗', '🚶', '✍️', '🎸', '🧹', '🦷', '💊', '☀️', '📵', '🌱'];
  var MOODS = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
  var state = { moodToday: null, selectedScore: null, selectedEmoji: EMOJIS[0], habits: [] };

  // ---------- helpers ----------
  function localDate(d) {
    d = d || new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function toast(msg) {
    var $t = $('#toast').text(msg).addClass('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { $t.removeClass('show'); }, 2400);
  }
  function buzz() { if (navigator.vibrate) navigator.vibrate(30); }
  function go(page, opts) { $.mobile.pageContainer.pagecontainer('change', '#' + page, $.extend({ transition: 'fade' }, opts)); }
  function busy(on) { $.mobile.loading(on ? 'show' : 'hide'); }
  function handleFail(err, $errEl) {
    if (err.status === 401 && Api.token()) { Api.clearSession(); toast('Session expired – please log in again'); go('login'); return; }
    if ($errEl) $errEl.text(err.message); else toast(err.message);
  }

  // ---------- auth guard ----------
  var PUBLIC_PAGES = ['login', 'signup'];
  function targetId(toPage) {
    if (typeof toPage === 'string') return toPage.split('#')[1] || '';
    return toPage && toPage.attr ? toPage.attr('id') : '';
  }
  // Runs for string targets AND for the initially-loaded page object.
  $(document).on('pagecontainerbeforechange', function (e, data) {
    var id = targetId(data.toPage);
    if (id && !Api.token() && PUBLIC_PAGES.indexOf(id) === -1) {
      e.preventDefault();
      if (data.toPage !== '#login') $.mobile.pageContainer.pagecontainer('change', '#login', { transition: 'none', changeHash: true });
    }
  });
  // Belt and braces: if a protected page ever becomes visible without a session, bounce to login.
  $(document).on('pagebeforeshow', '.app-page', function () {
    if (!Api.token()) $.mobile.pageContainer.pagecontainer('change', '#login', { transition: 'none' });
  });

  // ---------- login / signup / logout ----------
  $('#login-form').on('submit', function (e) {
    e.preventDefault();
    var $err = $('#login-error').text('');
    var email = $.trim($('#login-email').val()), pw = $('#login-password').val();
    if (!email || !pw) { $err.text('Enter your email and password.'); return; }
    busy(true);
    Api.post('/api/auth/login', { email: email, password: pw })
      .done(function (r) { Api.saveSession(r); $('#login-password').val(''); go('home'); })
      .fail(function (er) { handleFail(er, $err); })
      .always(function () { busy(false); });
  });

  $('#signup-form').on('submit', function (e) {
    e.preventDefault();
    var $err = $('#signup-error').text('');
    var name = $.trim($('#signup-name').val()), email = $.trim($('#signup-email').val()), pw = $('#signup-password').val();
    if (!name || !email || pw.length < 8) { $err.text('Fill in all fields. Password needs 8+ characters.'); return; }
    busy(true);
    Api.post('/api/auth/signup', { name: name, email: email, password: pw })
      .done(function (r) { Api.saveSession(r); $('#signup-form')[0].reset(); toast('Welcome, ' + r.user.name + '!'); go('home'); })
      .fail(function (er) { handleFail(er, $err); })
      .always(function () { busy(false); });
  });

  $('#logout-btn').on('click', function () {
    busy(true);
    Api.post('/api/auth/logout').always(function () {
      Api.clearSession(); busy(false); cancelReminder(); $.mobile.changePage('#login', { transition: 'fade' });
    });
  });

  // ---------- TODAY: mood ----------
  function paintMood() {
    $('#mood-picker button').each(function () {
      var on = Number($(this).data('score')) === state.selectedScore;
      $(this).toggleClass('on', on).attr('aria-checked', on);
    });
    $('#mood-delete').toggle(!!state.moodToday);
    $('#mood-save').text(state.moodToday ? 'Update mood' : 'Save mood');
  }
  $('#mood-picker').on('click', 'button', function () { state.selectedScore = Number($(this).data('score')); buzz(); paintMood(); });

  $('#mood-save').on('click', function () {
    if (!state.selectedScore) { toast('Pick a mood first'); return; }
    var note = $.trim($('#mood-note').val()), req;
    busy(true);
    req = state.moodToday
      ? Api.put('/api/moods/' + state.moodToday.id, { score: state.selectedScore, note: note })
      : Api.post('/api/moods', { date: localDate(), score: state.selectedScore, note: note });
    req.done(function (m) { state.moodToday = m; paintMood(); toast('Mood saved ' + MOODS[m.score]); })
       .fail(function (er) { handleFail(er); }).always(function () { busy(false); });
  });

  $('#mood-delete').on('click', function () {
    if (!state.moodToday) return;
    busy(true);
    Api.del('/api/moods/' + state.moodToday.id).done(function () {
      state.moodToday = null; state.selectedScore = null; $('#mood-note').val(''); paintMood(); toast('Mood cleared');
    }).fail(function (er) { handleFail(er); }).always(function () { busy(false); });
  });

  // ---------- TODAY: habits ----------
  function renderHabits() {
    var $ul = $('#habit-list').empty();
    $('#habit-empty').toggle(state.habits.length === 0);
    state.habits.forEach(function (h) {
      var $li = $('<li>').toggleClass('done', h.doneToday).attr('data-id', h.id);
      var $tick = $('<button type="button" class="tick">').attr('aria-label', (h.doneToday ? 'Undo ' : 'Complete ') + h.name).text(h.doneToday ? '✓' : '');
      var $main = $('<button type="button" class="habit-main">').attr('aria-label', 'Edit ' + h.name)
        .append($('<span class="h-emoji">').text(h.emoji), $('<span class="h-name">').text(h.name));
      var $streak = $('<span class="streak">').text(h.streak > 0 ? '🔥 ' + h.streak : '');
      $li.append($tick, $main, $streak).appendTo($ul);
    });
  }

  $('#habit-list').on('click', '.tick', function () {
    var id = $(this).closest('li').data('id'), h = state.habits.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    var date = localDate(), req = h.doneToday
      ? Api.del('/api/habits/' + id + '/checkins/' + date)
      : Api.post('/api/habits/' + id + '/checkins', { date: date });
    req.done(function () { buzz(); loadToday(true); }).fail(function (er) { handleFail(er); });
  });
  $('#habit-list').on('click', '.habit-main', function () {
    var id = $(this).closest('li').data('id'), h = state.habits.filter(function (x) { return x.id === id; })[0];
    openHabitForm(h); go('habit-form', { transition: 'slideup' });
  });

  function loadToday(quiet) {
    var u = Api.user(); var hr = new Date().getHours();
    $('#greeting').text((hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (u ? ', ' + u.name.split(' ')[0] : '') + ' 👋');
    $('#home-title').text(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }));
    if (!quiet) busy(true);
    var today = localDate();
    $.when(Api.get('/api/habits?today=' + today), Api.get('/api/moods?from=' + today + '&to=' + today))
      .done(function (habits, moods) {
        state.habits = habits; renderHabits();
        state.moodToday = moods[0] || null;
        state.selectedScore = state.moodToday ? state.moodToday.score : null;
        if (!quiet) $('#mood-note').val(state.moodToday ? state.moodToday.note : '');
        paintMood();
      })
      .fail(function (er) { handleFail(er); })
      .always(function () { busy(false); });
  }
  $(document).on('pagebeforeshow', '#home', function () { if (Api.token()) loadToday(); });

  // ---------- HABIT FORM ----------
  var $grid = $('#emoji-grid');
  EMOJIS.forEach(function (e) { $('<button type="button">').text(e).attr('data-e', e).appendTo($grid); });
  $grid.on('click', 'button', function () { state.selectedEmoji = $(this).data('e'); paintEmoji(); });
  function paintEmoji() { $grid.find('button').each(function () { $(this).toggleClass('on', $(this).data('e') === state.selectedEmoji); }); }

  function openHabitForm(h) {
    $('#habit-error').text('');
    $('#habit-id').val(h ? h.id : '');
    $('#habit-name').val(h ? h.name : '');
    state.selectedEmoji = h ? h.emoji : EMOJIS[0]; paintEmoji();
    $('#habit-form-title').text(h ? 'Edit habit' : 'New habit');
    $('#habit-delete').toggle(!!h);
  }
  $('#add-habit').on('click', function () { openHabitForm(null); });

  $('#habit-edit-form').on('submit', function (e) {
    e.preventDefault();
    var id = $('#habit-id').val(), name = $.trim($('#habit-name').val()), $err = $('#habit-error').text('');
    if (!name) { $err.text('Give your habit a name.'); return; }
    var body = { name: name, emoji: state.selectedEmoji };
    busy(true);
    (id ? Api.put('/api/habits/' + id, body) : Api.post('/api/habits', body))
      .done(function () { toast(id ? 'Habit updated' : 'Habit added'); go('home', { reverse: true }); })
      .fail(function (er) { handleFail(er, $err); }).always(function () { busy(false); });
  });
  $('#habit-delete').on('click', function () {
    var id = $('#habit-id').val(); if (!id) return;
    if (!window.confirm('Delete this habit and all its history?')) return;
    busy(true);
    Api.del('/api/habits/' + id).done(function () { toast('Habit deleted'); go('home', { reverse: true }); })
      .fail(function (er) { handleFail(er); }).always(function () { busy(false); });
  });

  // ---------- INSIGHTS ----------
  function drawChart(series) {
    var c = document.getElementById('mood-chart'), ctx = c.getContext('2d');
    var W = c.width, H = c.height, pl = 36, pr = 12, pt = 14, pb = 28;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '20px -apple-system, Roboto, sans-serif'; ctx.textBaseline = 'middle';
    var x = function (i) { return pl + (i * (W - pl - pr)) / (series.length - 1); };
    var y = function (s) { return pt + ((5 - s) * (H - pt - pb)) / 4; };
    ctx.strokeStyle = '#e6e9f2'; ctx.fillStyle = '#8a90a6'; ctx.lineWidth = 1;
    for (var s = 1; s <= 5; s++) { ctx.beginPath(); ctx.moveTo(pl, y(s)); ctx.lineTo(W - pr, y(s)); ctx.stroke(); ctx.fillText(s, 12, y(s)); }
    ctx.textAlign = 'center'; ctx.fillText(series[0].date.slice(5), x(0) + 10, H - 10); ctx.fillText('today', x(series.length - 1) - 14, H - 10);
    // gradient area + line (gaps where no entry)
    ctx.strokeStyle = '#6c4cf1'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); var pen = false;
    series.forEach(function (p, i) {
      if (p.score === null) { pen = false; return; }
      if (!pen) { ctx.moveTo(x(i), y(p.score)); pen = true; } else ctx.lineTo(x(i), y(p.score));
    });
    ctx.stroke();
    series.forEach(function (p, i) {
      if (p.score === null) return;
      ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(x(i), y(p.score), 7, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.fillStyle = '#6c4cf1'; ctx.arc(x(i), y(p.score), 5, 0, 7); ctx.fill();
    });
  }

  function loadInsights() {
    busy(true);
    Api.get('/api/stats/summary?today=' + localDate()).done(function (s) {
      $('#avg7').text(s.mood.avg7 === null ? '–' : s.mood.avg7.toFixed(1));
      $('#avg30').text(s.mood.avg30 === null ? '–' : s.mood.avg30.toFixed(1));
      $('#entries30').text(s.mood.entries30);
      drawChart(s.mood.series);
      var $best = $('#best-card');
      if (s.bestHabit) {
        $('#best-text').text('On days you do “' + s.bestHabit.emoji + ' ' + s.bestHabit.name + '” your mood averages ' + s.bestHabit.moodWith.toFixed(1) +
          ' vs ' + s.bestHabit.moodWithout.toFixed(1) + ' on other days (+' + s.bestHabit.moodLift.toFixed(1) + ').'); $best.show();
      } else $best.hide();
      var $l = $('#streak-list').empty(); $('#streak-empty').toggle(s.habits.length === 0);
      s.habits.forEach(function (h) {
        var $row = $('<div class="streak-row">');
        $row.append($('<div class="sr-top">').append($('<span>').text(h.emoji + ' ' + h.name), $('<b>').text('🔥 ' + h.currentStreak)));
        $row.append($('<div class="bar">').append($('<i>').css('width', Math.min(100, h.completion30) + '%')));
        $row.append($('<small class="muted">').text(h.completion30 + '% of last 30 days · best streak ' + h.longestStreak));
        $l.append($row);
      });
    }).fail(function (er) { handleFail(er); }).always(function () { busy(false); });
  }
  $(document).on('pagebeforeshow', '#insights', function () { if (Api.token()) loadInsights(); });

  // ---------- PROFILE + Cordova features ----------
  $(document).on('pagebeforeshow', '#profile', function () {
    var u = Api.user(); if (!u) return;
    $('#profile-name').text(u.name); $('#profile-email').text(u.email); $('#avatar').text(u.name.charAt(0).toUpperCase());
    try { var t = localStorage.getItem('ms_reminder'); if (t) { $('#reminder-time').val(t); $('#reminder-status').text('Reminder set for ' + t + ' daily.'); } } catch (e) {}
  });

  function hasNotifications() { return window.cordova && cordova.plugins && cordova.plugins.notification && cordova.plugins.notification.local; }
  function cancelReminder() { if (hasNotifications()) cordova.plugins.notification.local.cancel(1); try { localStorage.removeItem('ms_reminder'); } catch (e) {} }
  $('#reminder-save').on('click', function () {
    var t = $('#reminder-time').val() || '20:00', parts = t.split(':');
    if (!hasNotifications()) { toast('Reminders work in the installed app'); return; }
    var n = cordova.plugins.notification.local;
    n.requestPermission(function (granted) {
      if (!granted) { toast('Notification permission denied'); return; }
      n.cancel(1, function () {
        n.schedule({ id: 1, title: 'MoodStreak', text: 'How are you feeling today? Log your mood and habits.', trigger: { every: { hour: Number(parts[0]), minute: Number(parts[1]) } } });
        try { localStorage.setItem('ms_reminder', t); } catch (e) {}
        $('#reminder-status').text('Reminder set for ' + t + ' daily.'); toast('Reminder set');
      });
    });
  });

  // offline banner (cordova-plugin-network-information + browser events)
  function setOffline(off) { $('#offline-banner').toggleClass('show', off); }
  window.addEventListener('offline', function () { setOffline(true); });
  window.addEventListener('online', function () { setOffline(false); });

  document.addEventListener('deviceready', function () {
    if (window.StatusBar) { StatusBar.styleLightContent(); StatusBar.backgroundColorByHexString('#6c4cf1'); }
    if (navigator.splashscreen) navigator.splashscreen.hide();
    document.addEventListener('backbutton', function (e) {
      var active = $.mobile.activePage.attr('id');
      if (['home', 'login'].indexOf(active) !== -1) { if (navigator.app && navigator.app.exitApp) navigator.app.exitApp(); }
      else { e.preventDefault(); if (active === 'habit-form') go('home', { reverse: true }); else if (active === 'signup') go('login', { reverse: true }); else go('home'); }
    }, false);
  }, false);

  // ---------- boot ----------
  $(function () {
    // Returning users with a saved session skip the login screen.
    if (Api.token() && (!location.hash || location.hash === '#login' || location.hash === '#signup')) location.hash = '#home';
  });
})(jQuery);
