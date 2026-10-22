
import { logout, observeAuthState } from "../auth/auth.js";

const logoutButton = document.getElementById("logoutButton");
const logoutFeedback = document.getElementById("logoutFeedback");

// Comprobar el estado de autenticación.
observeAuthState((user) => {
    if (!user) {
        window.location.replace("index.html");
        return;
    }

    // Firebase confirmó que hay un usuario autenticado.
    document.body.classList.remove("auth-pending");
});

logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutFeedback.classList.add("d-none");

    try {
        await logout();
        // observeAuthState detectará el cierre de sesión
        // y redirigirá automáticamente al inicio.
    } catch (error) {
        console.error("Error al cerrar sesión:", error.code);

        logoutFeedback.textContent =
            "No se pudo cerrar la sesión. Inténtalo de nuevo.";

        logoutFeedback.classList.remove("d-none");
        logoutButton.disabled = false;
    }
});
