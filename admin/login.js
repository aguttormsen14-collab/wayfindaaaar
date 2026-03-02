// admin/login.js — Supabase Auth integration (replaces mock login)

const form = document.getElementById('loginForm');
const messageEl = document.getElementById('message');
const emailInput = document.getElementById('username'); // HTML still calls it 'username' but we treat it as email
const passwordInput = document.getElementById('password');
let isLoggingIn = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (isLoggingIn) return; // Prevent double-submit
  isLoggingIn = true;
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) {
    messageEl.textContent = '❌ Skriv inn e-post og passord';
    messageEl.style.color = '#dc2626';
    isLoggingIn = false;
    return;
  }

  messageEl.textContent = '⏳ Logger inn...';
  messageEl.style.color = '#666';

  try {
    // Try to sign in with existing account
    const { user, error } = await adminSignIn(email, password);

    if (error === 'Invalid login credentials') {
      // If login fails, offer to create account
      messageEl.textContent = '❓ Konto finnes ikke. Opprett ny? (tap for å lagre)';
      messageEl.style.color = '#0066cc';
      
      // Set a flag to allow signup on next submit
      form.dataset.attemptSignup = 'true';
      isLoggingIn = false;
      return;
    }

    if (error) {
      messageEl.textContent = `❌ ${error}`;
      messageEl.style.color = '#dc2626';
      isLoggingIn = false;
      return;
    }

    if (user) {
      messageEl.textContent = '✅ Innlogging vellykket!';
      messageEl.style.color = '#16a34a';
      
      // Redirect to dashboard after 1 second
      setTimeout(() => {
        location.href = './dashboard.html';
      }, 1000);
      return;
    }
  } catch (e) {
    messageEl.textContent = `❌ Feil: ${e.message}`;
    messageEl.style.color = '#dc2626';
  }

  isLoggingIn = false;
});

// Handle account creation on second submit
const originalSubmit = form.onsubmit;
form.addEventListener('submit', async (e) => {
  if (form.dataset.attemptSignup === 'true') {
    e.preventDefault();
    form.dataset.attemptSignup = 'false';
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    messageEl.textContent = '⏳ Opprett konto...';
    messageEl.style.color = '#666';
    
    try {
      // Attempt to create new account
      const client = getAdminSupabase();
      if (!client) {
        throw new Error('Supabase not initialized');
      }
      
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: null // Skip email verification for now
        }
      });

      if (error) {
        messageEl.textContent = `❌ Opprettelse feilet: ${error.message}`;
        messageEl.style.color = '#dc2626';
        return;
      }

      // After signup, automatically sign in
      const { user: signInUser, error: signInError } = await adminSignIn(email, password);
      
      if (signInError) {
        messageEl.textContent = `❌ Innlogging etter opprettelse feilet: ${signInError}`;
        messageEl.style.color = '#dc2626';
        return;
      }

      messageEl.textContent = '✅ Konto opprettet og du er logget inn!';
      messageEl.style.color = '#16a34a';
      
      setTimeout(() => {
        location.href = './dashboard.html';
      }, 1000);
    } catch (e) {
      messageEl.textContent = `❌ Feil: ${e.message}`;
      messageEl.style.color = '#dc2626';
    }
  }
});

// Update label from "Brukernavn" to "E-post" for clarity
document.addEventListener('DOMContentLoaded', () => {
  const labels = document.querySelectorAll('label');
  labels.forEach(label => {
    if (label.getAttribute('for') === 'username') {
      label.textContent = 'E-post';
    }
  });
});

