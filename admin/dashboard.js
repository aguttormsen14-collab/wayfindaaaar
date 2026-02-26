// protect dashboard - redirect to login if no valid session
function checkAuth() {
  const raw = localStorage.getItem('sx_auth');
  try {
    const obj = JSON.parse(raw);
    if (!obj || !obj.ok) throw new Error('bad');
    return;
  } catch (e) {
    console.log('no valid auth, redirecting');
    location.href = './login.html';
  }
}

checkAuth();

const logoutBtn = document.getElementById('logoutBtn');
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('sx_auth');
  location.href = './login.html';
});
