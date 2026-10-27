
import { apiRequest, getCurrentUser, logout } from "../auth/auth.js";

const usersTableBody = document.getElementById("usersTableBody");
const userSearch = document.getElementById("userSearch");
const userCount = document.getElementById("userCount");
const adminFeedback = document.getElementById("adminFeedback");
const logoutButton = document.getElementById("logoutButton");

let users = [];

const roleNames = {
    1: "Admin",
    2: "Programmer",
    3: "User_Test",
    4: "User_General"
};

function showFeedback(message) {
    adminFeedback.textContent = message;
    adminFeedback.classList.remove("d-none");
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("es-MX");
}

function createCell(value) {
    const cell = document.createElement("td");

    // textContent prevents user-provided values from being interpreted as HTML.
    cell.textContent = value ?? "—";

    return cell;
}

function renderUsers(searchTerm = "") {
    const query = searchTerm.trim().toLocaleLowerCase("es-MX");

    const filteredUsers = users.filter((user) => {
        const searchableText = [
            user.full_name,
            user.username,
            user.email
        ].join(" ").toLocaleLowerCase("es-MX");

        return searchableText.includes(query);
    });

    usersTableBody.replaceChildren();

    userCount.textContent =
        `${filteredUsers.length} ${filteredUsers.length === 1 ? "usuario" : "usuarios"}`;

    if (filteredUsers.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 7;
        cell.className = "text-center text-muted py-4";
        cell.textContent = "No se encontraron usuarios.";

        row.appendChild(cell);
        usersTableBody.appendChild(row);
        return;
    }

    for (const user of filteredUsers) {
        const row = document.createElement("tr");

        row.appendChild(createCell(user.id));
        row.appendChild(createCell(user.full_name));
        row.appendChild(createCell(user.username));
        row.appendChild(createCell(user.email));
        row.appendChild(createCell(user.phone));
        row.appendChild(createCell(
            user.role_name ?? roleNames[user.role_id] ?? "Desconocido"
        ));
        row.appendChild(createCell(formatDate(user.created_at)));

        usersTableBody.appendChild(row);
    }
}

async function loadAdminPanel() {
    try {
        const session = await getCurrentUser();
        const currentUser = session.user;

        if (!currentUser) {
            window.location.replace("index.html");
            return;
        }

        const roleId = Number(currentUser.role_id);

        if (roleId === 4) {
            window.location.replace("profile.html");
            return;
        }

        if (![1, 2, 3].includes(roleId)) {
            window.location.replace("index.html");
            return;
        }

        const response = await apiRequest("/admin/users");

        users = response.users ?? [];
        renderUsers(userSearch.value);
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            window.location.replace("index.html");
            return;
        }

        console.error("Error al cargar usuarios:", error);

        usersTableBody.replaceChildren();
        showFeedback(
            "No se pudieron cargar los usuarios. Comprueba que el servidor esté disponible."
        );
    } finally {
        document.body.classList.remove("auth-pending");
    }
}

userSearch.addEventListener("input", () => {
    renderUsers(userSearch.value);
});

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    adminFeedback.classList.add("d-none");

    try {
        await logout();
        window.location.replace("index.html");
    } catch (error) {
        console.error("Error al cerrar sesión:", error);

        showFeedback("No se pudo cerrar la sesión. Inténtalo de nuevo.");
        logoutButton.disabled = false;
    }
});

loadAdminPanel();
