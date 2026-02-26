// basic mock login, stores token in localStorage
const form = document.getElementById('loginForm');
const messageEl = document.getElementById('message');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;
  console.log('login attempt', user);

  if (user === 'test' && pass === '1234') {
    localStorage.setItem('sx_auth', JSON.stringify({ ok: true, ts: Date.now() }));
    // redirect to dashboard using relative path
    location.href = './dashboard.html';
  } else {
    messageEl.textContent = 'Invalid username or password';
  }
});
