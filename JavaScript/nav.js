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

window.addEventListener('DOMContentLoaded', function() {
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
});

document.getElementById('logoutButton').addEventListener('click', function(event) {
    event.preventDefault();
    // Clear authentication tokens or user data
    localStorage.removeItem('authToken');
    // Redirect to the login page
    window.location.href = '../pages/login.html';
});