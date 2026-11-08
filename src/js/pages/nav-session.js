import { getCurrentUser } from "../auth/auth.js";

function replaceLoginButton(user) {
    const loginButton = document.getElementById("loginButton");

    if (!loginButton) return;

    const roleId = Number(user.role_id);
    const isClient = roleId === 4;

    const link = document.createElement("a");
    link.id = "loginButton";
    link.className = "btn btn-light rounded-pill px-4";
    link.href = isClient ? "profile.html" : "admin.html";

    const icon = document.createElement("i");
    icon.className = `bi ${isClient ? "bi-person-circle" : "bi-speedometer2"} me-1`;

    link.append(
        icon,
        document.createTextNode(isClient ? "Mi perfil" : "Panel")
    );

    // Un <a> nuevo no hereda data-bs-toggle, así que ya no abre el modal.
    loginButton.replaceWith(link);
}

async function updateNavigation() {
    try {
        const { user } = await getCurrentUser();

        if (user) {
            replaceLoginButton(user);
        }
    } catch {
        // Sin sesión: se deja el botón "Login" como está.
    }
}

updateNavigation();

// Si el cliente inicia sesión desde services.html (sin recargar),
// la barra se actualiza sola.
document.addEventListener("lumen:login", (event) => {
    replaceLoginButton(event.detail);
});