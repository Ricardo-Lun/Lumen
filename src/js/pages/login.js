import { login } from "../auth/auth.js";

const loginView = document.getElementById("loginView");
const registerView = document.getElementById("registerView");
const modalTitle = document.getElementById("loginModalLabel");

const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginFeedback = document.getElementById("loginFeedback");
const loginSubmit = document.getElementById("loginSubmit");

const registerForm = document.getElementById("registerForm");
const registerFullName = document.getElementById("registerFullName");
const registerEmail = document.getElementById("registerEmail");
const registerPhone = document.getElementById("registerPhone");
const registerUsername = document.getElementById("registerUsername");
const registerPassword = document.getElementById("registerPassword");
const registerFeedback = document.getElementById("registerFeedback");
const registerSubmit = document.getElementById("registerSubmit");

const showRegister = document.getElementById("showRegister");
const showLogin = document.getElementById("showLogin");

function clearFeedback(element) {
    element.textContent = "";
    element.classList.add("d-none");
}

function showFeedback(element, message, type = "danger") {
    element.textContent = message;
    element.classList.remove("d-none", "alert-danger", "alert-success");
    element.classList.add(`alert-${type}`);
}

function switchView(view) {
    const isLogin = view === "login";

    loginView.classList.toggle("d-none", !isLogin);
    registerView.classList.toggle("d-none", isLogin);

    modalTitle.innerHTML = isLogin
        ? '<i class="bi bi-person-circle me-2"></i>Iniciar sesión'
        : '<i class="bi bi-person-plus me-2"></i>Crear cuenta';

    clearFeedback(loginFeedback);
    clearFeedback(registerFeedback);
}

showRegister?.addEventListener("click", () => {
    switchView("register");
});

showLogin?.addEventListener("click", () => {
    switchView("login");
});

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearFeedback(loginFeedback);
    loginSubmit.disabled = true;
    loginSubmit.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"></span>
        Ingresando...
    `;

    try {
        const user = await login(
            loginUsername.value.trim(),
            loginPassword.value
        );

        const roleId = Number(user.role_id);

        if ([1, 2, 3].includes(roleId)) {
            window.location.assign("admin.html");
        } else if (roleId === 4) {
            window.location.assign("profile.html");
        } else {
            throw new Error("Rol de usuario no reconocido.");
        }
    } catch (error) {
        console.error("Error al iniciar sesión:", error.status);

        const message = error.status === 401
            ? "Nombre de usuario o contraseña incorrectos."
            : error.status === 429
                ? "Demasiados intentos. Inténtalo más tarde."
                : "No se pudo iniciar sesión. Comprueba tu conexión e inténtalo de nuevo.";

        showFeedback(loginFeedback, message);
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.innerHTML = `
            <i class="bi bi-box-arrow-in-right me-1"></i>
            Ingresar
        `;
    }
});

registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearFeedback(registerFeedback);
    registerSubmit.disabled = true;
    registerSubmit.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"></span>
        Creando cuenta...
    `;

    try {
        const response = await fetch("http://localhost:3000/api/auth/register", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                full_name: registerFullName.value.trim(),
                email: registerEmail.value.trim(),
                phone: registerPhone.value.trim(),
                username: registerUsername.value.trim(),
                password: registerPassword.value
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.message ?? "No se pudo crear la cuenta.");
            error.status = response.status;
            throw error;
        }

        // Keep the username for the subsequent login.
        loginUsername.value = registerUsername.value.trim();
        loginPassword.value = "";
        registerForm.reset();

        switchView("login");

        showFeedback(
            loginFeedback,
            "¡Cuenta creada correctamente! Ahora puedes iniciar sesión.",
            "success"
        );
    } catch (error) {
        console.error("Error al registrar usuario:", error.status);

        const message = error.status === 409
            ? "El nombre de usuario o el correo electrónico ya está registrado."
            : error.status === 400
                ? error.message
                : "No se pudo crear la cuenta. Comprueba tu conexión e inténtalo de nuevo.";

        showFeedback(registerFeedback, message);
    } finally {
        registerSubmit.disabled = false;
        registerSubmit.innerHTML = `
            <i class="bi bi-person-plus me-1"></i>
            Crear cuenta
        `;
    }
});
