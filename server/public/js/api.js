function apiFetch(url, options) {
  options = options || {};
  var token = localStorage.getItem('jwt_token');
  if (token) {
    options.headers = options.headers || {};
    if (typeof options.headers === 'object' && !options.headers['Authorization']) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
  }
  return fetch(url, options).then(function (r) {
    if (r.status === 401) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('jwt_user');
      window.location.href = '/login.html';
      return Promise.reject(new Error('登录已过期'));
    }
    return r;
  });
}
