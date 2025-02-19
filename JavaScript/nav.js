function openNavBar() {
    let navBar = document.getElementById("navBar");
    let navigation = document.getElementById("navigation");
    navBar.setAttribute("style", "display:none;");
    navigation.classList.remove("hide");
}

function hideNavBar() {
    let navBar = document.getElementById("navBar");
    let navigation = document.getElementById("navigation");
    navBar.setAttribute("style", "display:block;");
    navigation.classList.add("hide");
}

function checkAuthStatus() {
    const hasToken = localStorage.getItem('authToken');
    const accountItem = document.querySelector('li.nav-item.hide a[href="account.html"]') || 
                        document.querySelector('li.nav-item.hide a[href="./pages/account.html"]');
    const loginItem = document.querySelector('li.nav-item.hide a[href="login.html"]') || 
                      document.querySelector('li.nav-item.hide a[href="./pages/login.html"]');
    const logoutItem = document.getElementById('logoutItem');

    if (hasToken) {
        if (accountItem) accountItem.parentElement.classList.remove('hide');
        if (loginItem) loginItem.parentElement.classList.add('hide');
        if (logoutItem) logoutItem.classList.remove('hide');
    } else {
        if (accountItem) accountItem.parentElement.classList.add('hide');
        if (loginItem) loginItem.parentElement.classList.remove('hide');
        if (logoutItem) logoutItem.classList.add('hide');
    }
}

// Add auth headers to fetch requests
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    const response = await fetch(url, options);
    
    // Handle unauthorized responses
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        window.location.href = '/pages/login.html';
        return null;
    }
    return response;
}

// Handle logout
document.getElementById('logoutButton')?.addEventListener('click', function(event) {
    event.preventDefault();
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    window.location.href = '/pages/login.html';
});

// Check auth status on page load
window.addEventListener('DOMContentLoaded', checkAuthStatus);