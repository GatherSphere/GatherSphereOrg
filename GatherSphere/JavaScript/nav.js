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