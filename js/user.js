const USER_KEY = 'trylist_user';

export function getCurrentUser() {
  return localStorage.getItem(USER_KEY);
}

export function setCurrentUser(name) {
  localStorage.setItem(USER_KEY, name);
}
