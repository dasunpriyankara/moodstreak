// Thin wrapper over $.ajax for the MoodStreak REST API.
var Api = (function ($) {
  var TOKEN_KEY = 'ms_token', USER_KEY = 'ms_user';
  var mem = {};
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }

  function request(method, path, body) {
    var d = $.Deferred();
    $.ajax({
      url: window.APP_CONFIG.API_BASE + path,
      method: method,
      contentType: 'application/json',
      dataType: 'json',
      timeout: 20000,
      data: body === undefined ? undefined : JSON.stringify(body),
      headers: get(TOKEN_KEY) ? { Authorization: 'Bearer ' + get(TOKEN_KEY) } : {}
    }).done(function (data) { d.resolve(data); })
      .fail(function (xhr, status) {
        var msg = 'Something went wrong. Please try again.';
        if (xhr.status === 0) msg = status === 'timeout' ? 'The server took too long to respond.' : 'Cannot reach the server. Check your connection.';
        else if (xhr.responseJSON && xhr.responseJSON.details && xhr.responseJSON.details.length) msg = xhr.responseJSON.details[0].message;
        else if (xhr.responseJSON && xhr.responseJSON.error) msg = xhr.responseJSON.error;
        // 204 No Content makes dataType:'json' fail parsing even though it succeeded
        if (xhr.status === 204 || (xhr.status >= 200 && xhr.status < 300 && status === 'parsererror')) return d.resolve(null);
        d.reject({ status: xhr.status, message: msg });
      });
    return d.promise();
  }

  return {
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b || {}); },
    put: function (p, b) { return request('PUT', p, b || {}); },
    del: function (p) { return request('DELETE', p); },
    token: function () { return get(TOKEN_KEY); },
    user: function () { try { return JSON.parse(get(USER_KEY)); } catch (e) { return null; } },
    saveSession: function (r) { set(TOKEN_KEY, r.token); set(USER_KEY, JSON.stringify(r.user)); },
    clearSession: function () { del(TOKEN_KEY); del(USER_KEY); }
  };
})(jQuery);
