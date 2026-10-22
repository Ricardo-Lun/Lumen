
import { login } from "../auth/auth.js";

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginFeedback = document.getElementById("loginFeedback");
const loginSubmit = document.getElementById("loginSubmit");

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Limpiar errores anteriores.
    loginFeedback.textContent = "";
    loginFeedback.classList.add("d-none");

    // Evitar envíos repetidos mientras Firebase procesa el login.
    loginSubmit.disabled = true;
    loginSubmit.innerHTML = `
        <span
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true">
        </span>
        Ingresando...
    `;

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    try {
        await login(email, password);

        // Acceso exitoso: ir al perfil.
        window.location.assign("profile.html");
    } catch (error) {
        console.error("Error al iniciar sesión:", error.code);

        const errorMessages = {
            "auth/invalid-credential":
                "Correo o contraseña incorrectos.",
            "auth/invalid-email":
                "Introduce un correo electrónico válido.",
            "auth/user-disabled":
                "Esta cuenta ha sido deshabilitada.",
            "auth/too-many-requests":
                "Demasiados intentos. Inténtalo más tarde.",
            "auth/network-request-failed":
                "Error de conexión. Comprueba tu internet."
        };

        loginFeedback.textContent =
            errorMessages[error.code] ??
            "No se pudo iniciar sesión. Inténtalo de nuevo.";

        loginFeedback.classList.remove("d-none");
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.innerHTML = `
            <i class="bi bi-box-arrow-in-right me-1"></i>
            Ingresar
        `;
    }
});
