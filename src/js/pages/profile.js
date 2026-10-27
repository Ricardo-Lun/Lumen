import { apiRequest, logout } from "../auth/auth.js";

const profileForm = document.getElementById("profileForm");
const profileFeedback = document.getElementById("profileFeedback");
const saveProfileButton = document.getElementById("saveProfileButton");
const logoutButton = document.getElementById("logoutButton");

const fields = {
    full_name: document.getElementById("profileFullName"),
    username: document.getElementById("profileUsername"),
    email: document.getElementById("profileEmail"),
    phone: document.getElementById("profilePhone")
};

function showFeedback(message, type = "danger") {
    profileFeedback.textContent = message;
    profileFeedback.classList.remove(
        "d-none",
        "alert-danger",
        "alert-success"
    );
    profileFeedback.classList.add(`alert-${type}`);
}

function fillProfile(profile) {
    fields.full_name.value = profile.full_name ?? "";
    fields.username.value = profile.username ?? "";
    fields.email.value = profile.email ?? "";
    fields.phone.value = profile.phone ?? "";
}

async function loadProfile() {
    try {
        const response = await apiRequest("/profile");
        const profile = response.profile;

        if (!profile) {
            throw new Error("The profile response was empty.");
        }

        fillProfile(profile);
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            window.location.replace("index.html");
            return;
        }

        console.error("Error al cargar el perfil:", error);

        showFeedback(
            "No se pudo cargar tu perfil. Comprueba tu conexión e inténtalo de nuevo."
        );
    } finally {
        document.body.classList.remove("auth-pending");
    }
}

profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    profileFeedback.classList.add("d-none");
    saveProfileButton.disabled = true;
    saveProfileButton.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"></span>
        Guardando...
    `;

    const profileData = {
        full_name: fields.full_name.value.trim(),
        username: fields.username.value.trim(),
        email: fields.email.value.trim(),
        phone: fields.phone.value.trim()
    };

    try {
        const response = await apiRequest("/profile", {
            method: "PATCH",
            body: JSON.stringify(profileData)
        });

        if (response.profile) {
            fillProfile(response.profile);
        }

        showFeedback(
            response.message ?? "Tus datos se actualizaron correctamente.",
            "success"
        );
    } catch (error) {
        console.error("Error al actualizar el perfil:", error);

        let message = "No se pudieron guardar los cambios. Inténtalo de nuevo.";

        if (error.status === 400) {
            message = error.data?.message
                ?? "Revisa los datos introducidos.";
        } else if (error.status === 409) {
            message = "El nombre de usuario o el correo electrónico ya está en uso.";
        } else if (error.status === 401 || error.status === 403) {
            window.location.replace("index.html");
            return;
        }

        showFeedback(message);
    } finally {
        saveProfileButton.disabled = false;
        saveProfileButton.innerHTML = `
            <i class="bi bi-floppy me-1"></i>
            Guardar cambios
        `;
    }
});

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    profileFeedback.classList.add("d-none");

    try {
        await logout();
        window.location.replace("index.html");
    } catch (error) {
        console.error("Error al cerrar sesión:", error);

        showFeedback("No se pudo cerrar la sesión. Inténtalo de nuevo.");
        logoutButton.disabled = false;
    }
});

loadProfile();
